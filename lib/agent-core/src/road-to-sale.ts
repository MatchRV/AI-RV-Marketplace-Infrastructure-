/**
 * The Road to the Sale — MatchRV's RV Outfitter method, adapted from Randy
 * Sobel's "How to Make a Big Ticket Purchase".
 *
 * The road runs one step at a time from the shopper's first message to the
 * purchase, and no step is skipped. Steps live in ONE data table
 * (ROAD_TO_SALE_STEPS) so later chapters can be appended as new steps or
 * goals without rewriting the logic or the tool descriptions.
 *
 *   Step 1  Sherpa welcome   short; only when the first message is vague.
 *   Step 2  Product Selection: the Golden Ticket questions (Jonathan's list;
 *           "Golden Ticket" is the internal name, never said to the shopper)
 *           0  RV type            6  trade-in (what + why; no values)
 *           1  what it's for      7  towing (tow vehicle, or what's towed behind)
 *           2  activities         8  storage / length requirement
 *           3  vacation time      9  planned trips / favorite campsites
 *           4  who's going        +  shopping area (needed to search)
 *           5  who it's for       10 payments or cash (+ down, monthly, cash budget)
 *   Step 3  Present a shortlist of three that fit needs AND budget
 *   Step 4  Dealer contact (prepare → explicit approval → send)
 *
 * Every Golden Ticket question is answered before any RV is shown, asked a
 * few at a time in that order, never re-asking what the shopper already
 * said. The ONLY way past them is the shopper literally asking to skip the
 * questions ("just show me", verified against their words); then results are
 * shown and the road resumes. A named make/model answers question 0 only.
 * Non-search questions ("what's better, a motorhome or a 5th wheel?") are
 * answered directly and never gated (see classifyOpening).
 *
 * Pure and deterministic; the host LLM does the talking.
 */

import type { Constraints } from "./types.js";
import {
  QUESTION_ORDER,
  effectiveBudgetMaxUsd,
  impliedFloorplan,
  profileToConstraints,
  rvWord,
  type BuyerProfile,
  type PaymentMethod,
} from "./discovery.js";

export interface RoadQuestion {
  id: string;
  goal: string;
  prompt: string;
  options?: string[];
  why: string;
  /** True when this must be answered before RVs are shown. */
  blocking: boolean;
}

export interface RoadItem {
  id: string;
  label: string;
  /** Part of the approved minimum before RVs are shown. */
  requiredForProducts?: boolean;
  /** A follow-up on something just said — ask it on its own. */
  askAlone?: boolean;
  /** Only ask after this item is answered (e.g. the budget numbers depend on how they'll pay). */
  dependsOn?: string;
  applies?: (p: BuyerProfile) => boolean;
  known: (p: BuyerProfile) => boolean;
  question: (p: BuyerProfile) => { prompt: string; options?: string[]; why: string };
}

export interface RoadGoal {
  id: string;
  title: string;
  items: RoadItem[];
}

export interface RoadStep {
  id: string;
  number: number;
  title: string;
  /** welcome = routing only; goals = question items; milestone = done when `done(p)`. */
  kind: "welcome" | "goals" | "milestone";
  goals?: RoadGoal[];
  done?: (p: BuyerProfile) => boolean;
  /** Marks the step where RVs are presented; requiredForProducts items before it gate it. */
  presentsProducts?: boolean;
  guidance: string;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
const isFinance = (p: BuyerProfile) => p.paymentMethod === "finance" || p.paymentMethod === "special_finance";
const discoveryQ = (id: string) => QUESTION_ORDER.find((q) => q.id === id)!;

/** RV types the shopper tows (and so needs a tow vehicle and a size check). */
export const TOWED_RV_TYPES = ["travel_trailer", "fifth_wheel", "toy_hauler", "popup_camper"] as const;
/** True when every type the shopper is considering is towed (a named model doesn't change that). */
export function isTowableSearch(p: Pick<BuyerProfile, "rvTypes" | "models">): boolean {
  const t = p.rvTypes ?? [];
  return t.length > 0 && t.every((x) => (TOWED_RV_TYPES as readonly string[]).includes(x));
}
/** True when every type the shopper is considering is driven (Class A, B, C). */
export function isMotorizedSearch(p: Pick<BuyerProfile, "rvTypes">): boolean {
  const t = p.rvTypes ?? [];
  return t.length > 0 && t.every((x) => ["class_a", "class_b", "class_c"].includes(x));
}
const towWord = (p: BuyerProfile) => (rvWord(p) === "RV" ? "it" : `the ${rvWord(p)}`);

function payNumbersKnown(p: BuyerProfile): boolean {
  if (p.budgetDeclined) return true;
  if (p.paymentMethod === "ad_shopper") return Boolean(p.adReference) || effectiveBudgetMaxUsd(p) != null;
  return effectiveBudgetMaxUsd(p) != null;
}

function payNumbersQuestion(p: BuyerProfile): { prompt: string; options?: string[]; why: string } {
  const why = "Keeps every RV inside a real budget. MatchRV never shows anything over it.";
  switch (p.paymentMethod as PaymentMethod | null | undefined) {
    case "cash": return { prompt: "What's your cash budget: the most you want to spend out of pocket, out the door (price, tax, license and fees)?", why };
    case "difference": return { prompt: "On top of the trade, what cash difference out of pocket works for you? (The trade's value is something the dealership works out with you.)", why };
    case "discount": return { prompt: "What price range would feel like a win, as long as it's still the RV you actually want?", why };
    case "ad_shopper": return { prompt: "Which ad caught your eye, the RV and the price? Ads change and units sell, so I'll check what's actually in stock.", why: "An ad is a starting point; inventory and prices move." };
    default: return { prompt: "And what budget should I stay inside, out of pocket and out the door?", why };
  }
}

const hasTowAnswer = (p: BuyerProfile) => Boolean(p.towVehicle) || p.towVehicleUnknown === true || p.truckTowRatingLbs != null;
const towingKnown = (p: BuyerProfile) => isTowableSearch(p) ? hasTowAnswer(p) : isMotorizedSearch(p) ? p.towingBehind != null : hasTowAnswer(p) || p.towingBehind != null;
const finQ = (id: string, label: string, known: (p: BuyerProfile) => boolean, prompt: string, why: string): RoadItem => ({
  id, label, requiredForProducts: true, dependsOn: "pay_way",
  applies: (p) => isFinance(p) && !p.budgetDeclined,
  known, question: () => ({ prompt, why }),
});

/** The Golden Ticket (internal name): Jonathan's Product Selection questions, in his order. */
export const GOLDEN_TICKET_ITEMS: RoadItem[] = [
  {
    id: "rv_type", label: "0. what they want (RV type)", requiredForProducts: true,
    known: (p) => Boolean(p.rvTypes?.length || p.makes?.length || p.models?.length || p.rvTypeUndecided),
    question: () => ({ prompt: "What are you looking for: a travel trailer, a fifth wheel, a motorhome, a destination trailer, or something like that? Not sure yet is fine too.", options: ["Travel trailer", "Fifth wheel", "Motorhome", "Destination trailer", "Not sure yet"], why: "The type decides which RVs even make sense." }),
  },
  {
    id: "use", label: "1. what they plan to use it for", requiredForProducts: true,
    known: (p) => Boolean(p.plannedUses?.length || p.useNotes || p.tripLength === "full_time"),
    question: () => ({ prompt: "What do you plan on using it for: living in it, camping, tailgating, traveling, or a mix?", options: ["Living in it", "Camping", "Tailgating", "Traveling", "A mix"], why: "Full-time living, weekend camping and tailgating call for very different RVs." }),
  },
  {
    id: "activities", label: "2. activities (to match features)", requiredForProducts: true,
    known: (p) => Boolean(p.activities?.length || p.hobbies),
    question: () => ({ prompt: "What kinds of activities do you see yourself doing? Fishing, hiking, grilling outside, riding ATVs, that sort of thing.", why: "Activities point to features: love to barbecue? An outside kitchen might be a great fit. Hauling toys? Maybe a toy hauler." }),
  },
  {
    id: "vacation", label: "3. vacation / time off per year", requiredForProducts: true,
    applies: (p) => !p.plannedUses?.includes("living"),
    known: (p) => Boolean(p.timeOff || p.tripLength),
    question: () => ({ prompt: "How much time do you get off each year to get out and use it? If you're retired or can use it full time, even better.", why: "Rapport, and it shows how much they'll really use it." }),
  },
  {
    id: "who_going", label: "4. who's going (party size)", requiredForProducts: true,
    known: (p) => p.sleepers != null,
    question: (p) => ({ prompt: `Who's all going to be going with you: a spouse, kids, grandkids, the dog? How many will be sleeping in the ${rvWord(p) === "RV" ? "RV" : rvWord(p)}?`, options: ["Just me", "Two of us", "3–4 people", "5 or more"], why: "Who's coming decides couples vs. bunkhouse layouts. Guessing is how buyers get shown the wrong RVs." }),
  },
  {
    id: "buyers", label: "5. who it's for (sole buyer or co-buyer)", requiredForProducts: true,
    known: (p) => Boolean(p.owners) || p.coBuyerInvolved != null,
    question: (p) => ({ prompt: `Who's the ${rvWord(p)} for: is it only going to be you making the purchase, or is somebody else going in on it with you?`, options: ["Just me", "Me and my spouse/partner", "Someone else is going in on it"], why: "Everyone who's part of the decision should be part of the shopping." }),
  },
  {
    id: "trade", label: "6. trade-in", requiredForProducts: true,
    known: (p) => p.hasTradeIn != null,
    question: () => ({ prompt: "Do you have a trade?", options: ["Yes", "No"], why: "Knowing the trade, and why they're trading, shows what they want that they don't have now." }),
  },
  {
    id: "trade_details", label: "6. trade: what it is and why", requiredForProducts: true, dependsOn: "trade",
    applies: (p) => p.hasTradeIn === true,
    known: (p) => Boolean(p.tradeDescription && p.tradeReason),
    question: (p) => ({ prompt: p.tradeDescription ? `What's making you want to trade the ${p.tradeDescription}? What are you hoping to get that it doesn't have?` : "What are you trading in, and why? What are you hoping to get, as far as features and options, that you don't have now?", why: "Note the trade and the reason only. Trade values and numbers are for the dealership." }),
  },
  {
    id: "towing", label: "7. towing (tow vehicle, or what's towed behind)", requiredForProducts: true,
    known: towingKnown,
    question: (p) => isMotorizedSearch(p)
      ? { prompt: "Do you plan on towing anything behind it, like a car, a Jeep or a trailer?", options: ["Yes (I'll say what)", "Nothing"], why: "What's towed behind sets the hitch rating and combined weight the motorhome needs." }
      : isTowableSearch(p)
        ? { prompt: `What are you towing ${towWord(p)} with? Year, make and model (and the engine, if you know it). If you don't have a tow vehicle yet, that's fine, just say so.`, options: ["I'll tell you my truck/SUV", "I don't have a tow vehicle yet", "Not sure what I have"], why: "The tow vehicle sets the real weight ceiling. MatchRV never guesses it." }
        : { prompt: "If it's a trailer or fifth wheel, what would you tow it with? If it's a motorhome, do you plan on towing anything behind it?", why: "Towing sets the weight limits either way." },
  },
  {
    id: "storage", label: "8. storage / length requirement", requiredForProducts: true,
    known: (p) => p.lengthMaxFt != null || p.noLengthLimit === true,
    question: (p) => ({ prompt: p.storage ? `Is there a length it has to fit where you'll store it (${p.storage})? "No limit" is a fine answer.` : "Do you have somewhere you need to store it, and is there a length requirement? \"No limit\" is a fine answer.", options: ["It has to fit a spot (I'll give the length)", "I'd prefer around a certain size", "No limit"], why: "A storage limit is never exceeded, so the length has to be known before anything is shown." }),
  },
  {
    id: "length_reason", label: "8. length limit: storage or comfort", requiredForProducts: true, askAlone: true,
    applies: (p) => p.lengthMaxFt != null && !p.lengthReason && p.lengthFlexApproved == null,
    known: () => false,
    question: (p) => ({ prompt: `Is that ${p.lengthMaxFt}-foot limit for storage (a garage, driveway, or spot it has to fit) or is it more about what you're comfortable with?`, options: discoveryQ("length_reason").options, why: discoveryQ("length_reason").why }),
  },
  {
    id: "length_flex", label: "8. comfort length: keep the gate open +2 ft?", requiredForProducts: true, askAlone: true,
    applies: (p) => p.lengthMaxFt != null && p.lengthReason === "comfort" && p.lengthFlexApproved == null,
    known: () => false,
    question: (p) => ({ prompt: `Is it okay if we keep it maybe 1 or 2 feet longer than ${p.lengthMaxFt}, so up to about ${(p.lengthMaxFt ?? 0) + 2}, just in case? I'm not going to take you way up the range; I just want to keep that gate open in case the right one is sitting right there.`, options: discoveryQ("length_flex").options, why: discoveryQ("length_flex").why }),
  },
  {
    id: "trips", label: "9. planned trips / favorite campsites", requiredForProducts: true,
    known: (p) => Boolean(p.plannedTrips),
    question: () => ({ prompt: "Are any trips planned, or do you have a favorite campsite? Anywhere you're already planning to go?", why: "Destinations and campsites can set size, off-grid and weather needs." }),
  },
  {
    id: "location", label: "shopping area", requiredForProducts: true,
    known: (p) => Boolean(p.place),
    question: () => ({ prompt: "And what area are you shopping in? A city or ZIP works, and I'll start with what's closest to you.", why: "MatchRV only calls something local when it really is." }),
  },
  {
    id: "pay_way", label: "10. payments or cash", requiredForProducts: true,
    known: (p) => Boolean(p.paymentMethod || p.budgetDeclined),
    question: () => ({ prompt: "Are you planning on making payments, or paying cash?", options: ["Making payments (financing)", "Paying cash", "Trade plus a cash difference", "Rather not say yet"], why: "How they'll pay is how we get to a real budget." }),
  },
  finQ("fin_down", "10. financing: down payment", (p) => p.downPaymentUsd != null, "About how much are you thinking of putting down?", "Down payment and monthly payment set a real range without haggling over selling price."),
  finQ("fin_monthly", "10. financing: monthly payment", (p) => p.monthlyPaymentUsd != null, "What monthly payment would you like to be around?", "Down payment and monthly payment set a real range without haggling over selling price."),
  finQ("fin_cash", "10. financing: cash budget (out of pocket)", (p) => p.cashBudgetUsd != null || p.outTheDoorBudgetUsd != null || p.budgetMaxUsd != null, "And what's your cash budget: how much do you want to spend out of pocket on the RV?", "Keeps the out-of-pocket side real, too."),
  {
    id: "pay_numbers", label: "10. budget for that way of paying", requiredForProducts: true, dependsOn: "pay_way",
    applies: (p) => !isFinance(p),
    known: payNumbersKnown,
    question: payNumbersQuestion,
  },
  {
    id: "tow_payload", label: "door-sticker payload (after the shortlist)",
    applies: (p) => Boolean(p.towVehicle) && p.truckPayloadLbs == null && p.truckTowRatingLbs == null,
    known: () => false,
    question: () => ({ prompt: discoveryQ("tow_payload").prompt, options: discoveryQ("tow_payload").options, why: discoveryQ("tow_payload").why }),
  },
];

/** The Road to the Sale. Append steps or goals here; logic and tool text use ids. */
export const ROAD_TO_SALE_STEPS: RoadStep[] = [
  {
    id: "sherpa_welcome",
    number: 1,
    title: "Sherpa welcome",
    kind: "welcome",
    guidance: "Only when the first message is a greeting or vague: send the Sherpa welcome and find out what kind of help they want. If they already said what they want, skip it and dive in.",
  },
  {
    id: "product_selection",
    number: 2,
    title: "Product Selection",
    kind: "goals",
    guidance: "Ask the Product Selection questions in order, a few at a time, conversationally and honestly. Never re-ask anything the shopper already told you, and never fill an answer in yourself. \"Golden Ticket\" is MatchRV's internal name for this list; never say it to the shopper. No RVs until every question is answered, unless the shopper literally asks to skip the questions.",
    goals: [
      { id: "selection_questions", title: "Product Selection questions", items: GOLDEN_TICKET_ITEMS },
    ],
  },
  {
    id: "present_products",
    number: 3,
    title: "Present products that fit needs and budget",
    kind: "milestone",
    presentsProducts: true,
    done: (p) => p.productsShown === true,
    guidance: "Call search_rvs with the compiled constraints. Briefly reflect what you heard, then present a shortlist of three real matches (three different model lines) inside their budget and exact make/model/type. Explain each pick in lifestyle terms (tie features to their activities and trips) with its trade-off. Never quote how many RVs matched.",
  },
  {
    id: "dealer_contact",
    number: 4,
    title: "Dealer contact",
    kind: "milestone",
    done: () => false,
    guidance: "Once they like a unit, ask whether they'd like to contact the dealership. If yes, collect name and email/phone and their message, call prepare_dealer_inquiry, show the full preview, and call send_dealer_inquiry with confirmed=true only after they explicitly approve that exact preview.",
  },
  // Steps 5+ (Ch. 2 step 3 onward, Ch. 3) are appended here as the remaining book pages arrive.
];

export interface RoadAssessment {
  step: { id: string; number: number; title: string };
  goal: { id: string; title: string } | null;
  readyForProducts: boolean;
  waived: boolean;
  /** Minimum items still open before RVs can be shown. */
  missingForProducts: string[];
  /** Ask these together (1–3), then wait. */
  nextQuestions: RoadQuestion[];
  /** When the shopper waived questions: what to come back to after they've seen results. */
  resumeQuestions: RoadQuestion[];
  openGoals: { id: string; title: string; open: string[] }[];
  knownSummary: string[];
  stepGuidance: string;
  searchConstraints: Constraints | null;
}

interface FlatItem { item: RoadItem; goal: RoadGoal; step: RoadStep; stepIndex: number }

function flatten(steps: RoadStep[]): FlatItem[] {
  const out: FlatItem[] = [];
  steps.forEach((step, stepIndex) => {
    for (const goal of step.goals ?? []) for (const item of goal.items) out.push({ item, goal, step, stepIndex });
  });
  return out;
}

const toQuestion = (f: FlatItem, p: BuyerProfile, blocking: boolean): RoadQuestion => ({ id: f.item.id, goal: f.goal.id, blocking, ...f.item.question(p) });

export function knownSummary(p: BuyerProfile): string[] {
  const k: string[] = [];
  if (p.makes?.length) k.push(`make: ${p.makes.join(" / ")}`);
  if (p.models?.length) k.push(`model: ${p.models.join(" / ")}`);
  if (p.rvTypes?.length) k.push(`type: ${p.rvTypes.join(", ").replace(/_/g, " ")}`);
  if (p.whoFor) k.push(`for: ${p.whoFor}`);
  if (p.sleepers != null) k.push(`sleeps ${p.sleepers}`);
  const intent = impliedFloorplan(p);
  if (intent) k.push(`floorplan: ${intent.replace(/_/g, " ")}`);
  if (p.place) k.push(`area: ${p.place}${p.radiusMiles ? ` (${p.radiusMiles} mi)` : ""}`);
  if (p.campingStyle) k.push(`camping: ${p.campingStyle.replace(/_/g, " ")}`);
  if (p.climate) k.push(`climate: ${p.climate.replace(/_/g, " ")}`);
  if (p.tripLength) k.push(`trips: ${p.tripLength.replace(/_/g, " ")}`);
  if (p.newOrUsed) k.push(p.newOrUsed === "either" ? "new or pre-owned" : p.newOrUsed);
  if (p.hasTradeIn != null) k.push(p.hasTradeIn ? "has a trade-in" : "no trade-in");
  if (p.paymentMethod) k.push(`paying: ${p.paymentMethod.replace(/_/g, " ")}`);
  const b = effectiveBudgetMaxUsd(p);
  if (b != null) k.push(`budget ≤ ${usd(b)}${p.budgetMaxUsd == null && p.outTheDoorBudgetUsd == null ? " (estimated from down + monthly; not a financing approval)" : ""}`);
  if (p.budgetDeclined) k.push("budget: prefers not to say (searching without a ceiling)");
  if (p.lengthMaxFt != null) k.push(`max length ${p.lengthMaxFt} ft${p.lengthReason ? ` (${p.lengthReason})` : ""}${p.lengthFlexApproved ? " +2 ft gate open" : ""}`);
  if (p.towVehicle) k.push(`tow vehicle: ${p.towVehicle}`);
  else if (p.towVehicleUnknown) k.push("tow vehicle: none yet / not sure (tow fit must be verified)");
  if (p.noLengthLimit && p.lengthMaxFt == null) k.push("no length limit");
  if (p.truckPayloadLbs != null) k.push(`payload ${p.truckPayloadLbs.toLocaleString()} lbs (door sticker)`);
  else if (p.truckTowRatingLbs != null) k.push(`tow rating ${p.truckTowRatingLbs.toLocaleString()} lbs (buyer-stated)`);
  if (p.rvTypeUndecided && !p.rvTypes?.length) k.push("type: not sure yet (help them decide)");
  if (p.plannedUses?.length) k.push(`use: ${p.plannedUses.join(", ")}`);
  if (p.activities?.length) k.push(`activities: ${p.activities.join(", ")}`);
  if (p.timeOff) k.push(`time off: ${p.timeOff}`);
  if (p.partyNotes) k.push(`going: ${p.partyNotes}`);
  if (p.owners) k.push(`buyers: ${p.owners}`);
  else if (p.coBuyerInvolved != null) k.push(p.coBuyerInvolved ? "buyers: someone is going in on it" : "buyers: sole buyer");
  if (p.tradeDescription) k.push(`trade: ${p.tradeDescription}${p.tradeReason ? ` (why: ${p.tradeReason})` : ""}`);
  if (p.towingBehind) k.push(`towing behind: ${p.towingBehind}`);
  if (p.storage) k.push(`storage: ${p.storage}`);
  if (p.plannedTrips) k.push(`trips: ${p.plannedTrips}`);
  if (p.downPaymentUsd != null) k.push(`down payment ${usd(p.downPaymentUsd)}`);
  if (p.monthlyPaymentUsd != null) k.push(`monthly ~${usd(p.monthlyPaymentUsd)}`);
  if (p.cashBudgetUsd != null) k.push(`cash budget (out of pocket) ${usd(p.cashBudgetUsd)}`);
  if (p.creditConcerns) k.push(`credit: ${p.creditConcerns.replace(/_/g, " ")}`);
  return k;
}

/**
 * Where is this shopper on the Road to the Sale, and what should be asked
 * next? Stateless: pass the accumulated profile every time.
 */
export function assessRoadToSale(p: BuyerProfile, opts: { steps?: RoadStep[]; maxQuestions?: number } = {}): RoadAssessment {
  const steps = opts.steps ?? ROAD_TO_SALE_STEPS;
  const maxQ = Math.min(3, Math.max(1, opts.maxQuestions ?? 3));
  const presentIdx = steps.findIndex((s) => s.presentsProducts);
  const flat = flatten(steps);
  const open = flat.filter((f) => (f.item.applies?.(p) ?? true) && !f.item.known(p));
  const blocking = open.filter((f) => f.item.requiredForProducts && (presentIdx < 0 || f.stepIndex < presentIdx));
  const nonBlocking = open.filter((f) => !blocking.includes(f));
  const waived = p.discoveryWaived === true;
  const readyForProducts = blocking.length === 0 || waived;

  const openGoals: RoadAssessment["openGoals"] = [];
  for (const f of open) {
    let g = openGoals.find((x) => x.id === f.goal.id);
    if (!g) { g = { id: f.goal.id, title: f.goal.title, open: [] }; openGoals.push(g); }
    g.open.push(f.item.id);
  }

  const batch = (list: FlatItem[], limit: number): FlatItem[] => {
    if (!list.length) return [];
    if (list[0].item.askAlone) return [list[0]];
    const out: FlatItem[] = [];
    for (const f of list) {
      if (out.length >= limit) break;
      if (f.item.askAlone) continue;
      // Never ask a follow-up in the same breath as the question it depends on.
      if (f.item.dependsOn && (out.some((o) => o.item.id === f.item.dependsOn) || open.some((o) => o.item.id === f.item.dependsOn))) continue;
      out.push(f);
    }
    return out;
  };

  let next: RoadQuestion[] = [];
  let resume: RoadQuestion[] = [];
  if (!readyForProducts) {
    // Up to three Golden Ticket questions, in order. Nothing else is mixed in
    // before RVs are shown (along-the-way refinements wait for the shortlist).
    next = batch(blocking, maxQ).map((f) => toQuestion(f, p, true));
  } else {
    // Ready: keep the road moving with at most two along-the-way questions.
    next = batch(nonBlocking, 2).map((f) => toQuestion(f, p, false));
    if (waived && blocking.length) resume = batch(blocking, maxQ).map((f) => toQuestion(f, p, true));
  }
  next = next.slice(0, maxQ);

  // Current step: first non-welcome step that is not complete.
  let current: RoadStep | undefined;
  let currentGoal: RoadGoal | null = null;
  for (const [i, s] of steps.entries()) {
    if (s.kind === "welcome") continue;
    if (s.kind === "goals") {
      const firstBlocking = blocking.find((f) => f.stepIndex === i);
      if (firstBlocking && !readyForProducts) { current = s; currentGoal = firstBlocking.goal; break; }
      continue;
    }
    if (s.presentsProducts && !readyForProducts) continue;
    if (!(s.done?.(p) ?? false)) { current = s; break; }
  }
  current ??= steps[steps.length - 1];

  return {
    step: { id: current.id, number: current.number, title: current.title },
    goal: currentGoal ? { id: currentGoal.id, title: currentGoal.title } : null,
    readyForProducts,
    waived,
    missingForProducts: blocking.map((f) => f.item.id),
    nextQuestions: next,
    resumeQuestions: resume,
    openGoals,
    knownSummary: knownSummary(p),
    stepGuidance: current.guidance,
    searchConstraints: readyForProducts ? profileToConstraints(p) : null,
  };
}
