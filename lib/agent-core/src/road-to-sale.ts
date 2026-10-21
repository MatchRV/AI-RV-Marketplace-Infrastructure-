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
 *   Step 2  Product Selection
 *           Goal One   What you want and how you'll use it
 *           Goal Two   How you'll pay (six ways)
 *           Goal Three Who will be the owners
 *           Goal Four  Credit challenges (financing only)
 *   Step 3  Present products that fit needs AND budget
 *   Step 4  Dealer contact (prepare → explicit approval → send)
 *
 * Approved minimum before any RV is shown: RV type or use, how many it
 * sleeps, the shopping area, and a budget with how they'll pay. Everything
 * else is asked along the way, 1–3 questions at a time — never an
 * interrogation, never pushy. "Just show me" shows results, then the road
 * resumes with the open questions.
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
const hasUse = (p: BuyerProfile) => Boolean(p.campingStyle || p.climate || p.tripLength || p.useNotes || p.onOffRoad);
const isFinance = (p: BuyerProfile) => p.paymentMethod === "finance" || p.paymentMethod === "special_finance";
const drivenWord = (p: BuyerProfile) => (rvWord(p) === "trailer" || rvWord(p) === "fifth wheel" || rvWord(p) === "toy hauler" ? "towed" : rvWord(p) === "RV" ? "driven or towed" : "driven");
const discoveryQ = (id: string) => QUESTION_ORDER.find((q) => q.id === id)!;

function payNumbersKnown(p: BuyerProfile): boolean {
  if (p.budgetDeclined) return true;
  const m = p.paymentMethod;
  if (m === "finance") return (p.downPaymentUsd != null && p.monthlyPaymentUsd != null) || p.budgetMaxUsd != null || p.outTheDoorBudgetUsd != null;
  if (m === "special_finance") return p.monthlyPaymentUsd != null || p.budgetMaxUsd != null || p.outTheDoorBudgetUsd != null;
  if (m === "ad_shopper") return Boolean(p.adReference) || p.budgetMaxUsd != null || p.outTheDoorBudgetUsd != null;
  return effectiveBudgetMaxUsd(p) != null;
}

function payNumbersQuestion(p: BuyerProfile): { prompt: string; options?: string[]; why: string } {
  const why = "Keeps every RV inside a real budget. MatchRV never shows anything over it.";
  switch (p.paymentMethod as PaymentMethod | null | undefined) {
    case "cash": return { prompt: "What out-the-door number do you want to stay inside? That's everything: price, tax, license, title, fees, freight and prep.", why };
    case "difference": return { prompt: "What's the trade (and is anything still owed on it), and what cash difference out the door works for you?", why };
    case "finance": return { prompt: "For financing, what down payment and monthly payment feel comfortable? And where will it be licensed?", why: "Down payment and monthly payment set a real range without haggling over selling price or trade value." };
    case "discount": return { prompt: "What price range would feel like a win, as long as it's still the RV you actually want?", why };
    case "ad_shopper": return { prompt: "Which ad caught your eye, the RV and the price? Ads change and units sell, so I'll check what's actually in stock.", why: "An ad is a starting point; inventory and prices move." };
    case "special_finance": return { prompt: "What monthly payment works, and is there a down payment? We'll aim to get you approved first, before you fall in love with one.", why: "Getting approved first keeps you looking at RVs you can actually get." };
    default: return { prompt: "And what out-the-door number (or comfortable monthly payment) should I stay inside?", why };
  }
}

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
    guidance: "Work out what they want and how they'll pay, a few questions at a time. Help them rule out what they don't want so they aren't overloaded. Be honest, knowledgeable and never pushy.",
    goals: [
      {
        id: "goal_1_want_and_use",
        title: "Goal One: what you want and how you'll use it",
        items: [
          {
            id: "type_or_use", label: "RV type or how they'll use it", requiredForProducts: true,
            known: (p) => Boolean(p.rvTypes?.length || p.makes?.length || p.models?.length || hasUse(p)),
            question: () => ({ prompt: "What kind of RV are you picturing: something you drive (a Class A, B or C motorhome) or something you tow (travel trailer, fifth wheel, toy hauler, tent or pop-up)? And how do you see yourself using it?", options: ["Drive it (motorhome)", "Tow it (trailer / fifth wheel)", "Not sure yet, help me decide"], why: "Type and use decide which RVs even make sense." }),
          },
          {
            id: "sleepers", label: "who it's for / how many it sleeps", requiredForProducts: true,
            known: (p) => p.sleepers != null,
            question: (p) => ({ prompt: `Who's this ${rvWord(p)} for, and how many will usually sleep in it?`, options: ["Just me", "Two adults", "3–4 people", "5 or more"], why: "Sleeping count decides couples vs. bunkhouse layouts. Guessing is how buyers get shown the wrong RVs." }),
          },
          {
            id: "length_reason", label: "length limit: storage or comfort", requiredForProducts: true, askAlone: true,
            applies: (p) => p.lengthMaxFt != null && !p.lengthReason && p.lengthFlexApproved == null,
            known: () => false,
            question: (p) => ({ prompt: `Is that ${p.lengthMaxFt}-foot limit for storage (a garage, driveway, or spot it has to fit) or is it more about what you're comfortable with?`, options: discoveryQ("length_reason").options, why: discoveryQ("length_reason").why }),
          },
          {
            id: "length_flex", label: "comfort length: keep the gate open +2 ft?", requiredForProducts: true, askAlone: true,
            applies: (p) => p.lengthMaxFt != null && p.lengthReason === "comfort" && p.lengthFlexApproved == null,
            known: () => false,
            question: (p) => ({ prompt: `Is it okay if we keep it maybe 1 or 2 feet longer than ${p.lengthMaxFt}, so up to about ${(p.lengthMaxFt ?? 0) + 2}, just in case? I'm not going to take you way up the range; I just want to keep that gate open in case the right one is sitting right there.`, options: discoveryQ("length_flex").options, why: discoveryQ("length_flex").why }),
          },
          {
            id: "location", label: "shopping area", requiredForProducts: true,
            known: (p) => Boolean(p.place),
            question: () => ({ prompt: "What area are you shopping in? A city or ZIP works, and I'll start with what's closest to you.", why: "MatchRV only calls something local when it really is." }),
          },
          {
            id: "use", label: "how they'll use it",
            applies: (p) => !hasUse(p),
            known: (p) => hasUse(p),
            question: () => ({ prompt: "How do you picture using it: weekend getaways or longer stays, hot or cold weather, full hookups or off-grid?", why: "Climate, trip length and camping style change what matters (insulation, tanks, solar, slides)." }),
          },
          {
            id: "new_used_trade", label: "new or pre-owned; trade-in",
            known: (p) => p.newOrUsed != null && p.hasTradeIn != null,
            question: () => ({ prompt: "Are you thinking new or pre-owned (or open to both), and do you have a trade-in?", why: "Learn the trade before matching, not after." }),
          },
          {
            id: "driven_before", label: "driven or towed one before",
            known: (p) => p.drivenBefore != null,
            question: (p) => ({ prompt: `Have you ${drivenWord(p)} one like this before?`, why: "First-timers get more explanation and an easier-handling shortlist." }),
          },
          {
            id: "tow_payload", label: "door-sticker payload",
            applies: (p) => Boolean(p.towVehicle) && p.truckPayloadLbs == null && p.truckTowRatingLbs == null,
            known: () => false,
            question: () => ({ prompt: discoveryQ("tow_payload").prompt, options: discoveryQ("tow_payload").options, why: discoveryQ("tow_payload").why }),
          },
          {
            id: "must_dont", label: "must-haves and deal-breakers",
            known: (p) => Boolean(p.mustHaves?.length || p.dontWant?.length),
            question: () => ({ prompt: "Any must-haves (a hitch to tow a car, an outdoor kitchen, extra storage) or anything you definitely don't want?", why: "Ruling things out keeps the shortlist short." }),
          },
          {
            id: "storage", label: "where it's stored",
            applies: (p) => p.lengthReason !== "storage",
            known: (p) => Boolean(p.storage),
            question: () => ({ prompt: "Where will it live when you're home: driveway, storage lot or garage?", why: "Storage can set a hard size limit." }),
          },
          {
            id: "campsite_hobbies", label: "favorite campsite and hobbies",
            known: (p) => Boolean(p.hobbies),
            question: () => ({ prompt: "Got a favorite campground, or hobbies it needs to carry (bikes, kayaks, ATVs)?", why: "Hobbies decide storage, cargo and sometimes toy-hauler vs. not." }),
          },
        ],
      },
      {
        id: "goal_2_how_pay",
        title: "Goal Two: how you'll pay",
        items: [
          {
            id: "pay_way", label: "how they'll pay", requiredForProducts: true,
            known: (p) => Boolean(p.paymentMethod || p.budgetDeclined),
            question: (p) => {
              const b = effectiveBudgetMaxUsd(p);
              return {
                prompt: `${b != null ? `You mentioned about ${usd(b)}. ` : ""}How are you planning to pay: cash, a trade plus a difference, financing, or are you working from an ad you saw? There's no wrong answer; it just keeps me inside a real budget.`,
                options: ["Cash", "Trade + difference", "Financing", "Looking for the best discount", "I saw an ad", "Credit is a challenge (special finance)"],
                why: "Each of the six ways to pay sets the budget differently.",
              };
            },
          },
          {
            id: "pay_numbers", label: "budget for that way of paying", requiredForProducts: true,
            known: payNumbersKnown,
            question: payNumbersQuestion,
          },
          {
            id: "trade_payoff", label: "trade condition and payoff",
            applies: (p) => p.hasTradeIn === true && p.tradePayoffUsd == null && p.paymentMethod !== "difference",
            known: () => false,
            question: () => ({ prompt: "Tell me about the trade: roughly what condition is it in, and is anything still owed on it?", why: "An honest trade and payoff make the numbers real." }),
          },
          {
            id: "licensing", label: "where it will be licensed",
            applies: (p) => isFinance(p) && !p.licensingState,
            known: () => false,
            question: () => ({ prompt: "Where will it be licensed? That sets tax and fees.", why: "Out-the-door cost depends on where it's licensed." }),
          },
        ],
      },
      {
        id: "goal_3_owners",
        title: "Goal Three: who will be the owners",
        items: [
          {
            id: "owners", label: "who the owners are",
            known: (p) => Boolean(p.owners) || p.coBuyerInvolved != null,
            question: () => ({ prompt: "Who'll be on the title? If a partner is part of the decision, it's best to look together.", why: "Shopping together avoids second-guessing later." }),
          },
        ],
      },
      {
        id: "goal_4_credit",
        title: "Goal Four: credit challenges",
        items: [
          {
            id: "credit", label: "credit concerns (financing only)",
            applies: (p) => isFinance(p),
            known: (p) => p.creditConcerns != null,
            question: () => ({ prompt: "Anything on the credit side we should plan around? It's easier to get approved first, before you fall in love with one.", options: ["Nothing to worry about", "Some challenges", "Rather not say"], why: "Credit shapes which units and terms make sense, so it's better to know up front." }),
          },
        ],
      },
    ],
  },
  {
    id: "present_products",
    number: 3,
    title: "Present products that fit needs and budget",
    kind: "milestone",
    presentsProducts: true,
    done: (p) => p.productsShown === true,
    guidance: "Call search_rvs with the compiled constraints. Briefly reflect what you heard, then present the real matches inside their budget and exact make/model/type. Explain each pick in lifestyle terms with its trade-off. Keep asking the open questions along the way, 1–3 at a time.",
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
  if (p.truckPayloadLbs != null) k.push(`payload ${p.truckPayloadLbs.toLocaleString()} lbs (door sticker)`);
  else if (p.truckTowRatingLbs != null) k.push(`tow rating ${p.truckTowRatingLbs.toLocaleString()} lbs (buyer-stated)`);
  if (p.owners) k.push(`owners: ${p.owners}`);
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
    return list.filter((f) => !f.item.askAlone).slice(0, limit);
  };

  let next: RoadQuestion[] = [];
  let resume: RoadQuestion[] = [];
  if (!readyForProducts) {
    // Up to two minimum questions; when only one is left, add one along-the-way question.
    const first = batch(blocking, 2);
    next = first.map((f) => toQuestion(f, p, true));
    if (first.length === 1 && !first[0].item.askAlone && maxQ > 1) {
      const extra = nonBlocking.find((f) => !f.item.askAlone && f.stepIndex <= first[0].stepIndex);
      if (extra) next.push(toQuestion(extra, p, false));
    }
  } else {
    // Ready: keep the road moving with at most two along-the-way questions.
    next = batch(nonBlocking, 2).map((f) => toQuestion(f, p, false));
    if (waived && blocking.length) resume = batch(blocking, 2).map((f) => toQuestion(f, p, true));
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
