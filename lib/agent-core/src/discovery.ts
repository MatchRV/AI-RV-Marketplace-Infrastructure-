/**
 * RV Outfitter "sherpa" discovery — the shared buyer-understanding layer.
 *
 * One implementation consumed by every surface (MCP for ChatGPT / Muse /
 * any LLM connector, the WebMCP tools, and the matchrv.com Outfitter), so a
 * buyer gets the same guide everywhere: understand the party and the trip
 * BEFORE showing inventory, ask one question at a time, never re-ask what is
 * already known, and never call a trailer a match until it fits how the
 * buyer will actually live in it.
 *
 * Pure and deterministic — no LLM, no I/O. The host LLM does the talking;
 * this module decides what is still unknown, what to ask next, and how a
 * unit fits the stated lifestyle.
 */

import type { CanonicalUnit, Constraints } from "./types.js";

export type FloorplanIntent = "couples" | "family_bunks" | "flexible" | "solo";
export type CampingStyle = "full_hookup" | "boondocking" | "mixed";

export interface BuyerProfile {
  /** Total people sleeping in the RV, buyer included. THE gating fact. */
  sleepers?: number | null;
  adults?: number | null;
  kids?: number | null;
  hasPets?: boolean | null;
  floorplanIntent?: FloorplanIntent | null;
  /** True only when the buyer explicitly wants bunk beds. */
  wantsBunks?: boolean | null;
  budgetMaxUsd?: number | null;
  budgetMinUsd?: number | null;
  campingStyle?: CampingStyle | null;
  rvTypes?: Constraints["rvTypes"];
  lengthMaxFt?: number | null;
  lengthMinFt?: number | null;
  /** Why the length cap exists. storage/hard_limit = never exceed, ever. */
  lengthReason?: "storage" | "comfort" | "hard_limit" | null;
  /** Buyer explicitly approved keeping the gate open +1-2 ft. Null = not asked. */
  lengthFlexApproved?: boolean | null;
  place?: string | null;
  radiusMiles?: number | null;
  /** Tow vehicle as stated, e.g. "2021 Ford F-150 3.5L EcoBoost". */
  towVehicle?: string | null;
  /** Door-sticker payload (yellow label), lbs — never inferred from model. */
  truckPayloadLbs?: number | null;
  /** Buyer-stated exact tow rating, lbs. */
  truckTowRatingLbs?: number | null;
  passengersLbs?: number | null;
  cargoLbs?: number | null;
  /** Buyer explicitly said "just show me / skip questions". */
  discoveryWaived?: boolean | null;
  /** Shopper said they don't have a tow vehicle yet / don't know it (an answer, not a guess). */
  towVehicleUnknown?: boolean | null;
  /** Shopper said there is no length or size limit (an answer, not a guess). */
  noLengthLimit?: boolean | null;

  // ── Road to the Sale (see road-to-sale.ts). All optional; never guessed. ──
  /** Brand(s) the shopper named, e.g. ["Tiffin"]. */
  makes?: string[] | null;
  /** Model / series the shopper named, e.g. ["Allegro RED"]. */
  models?: string[] | null;
  newOrUsed?: "new" | "used" | "either" | null;
  whoFor?: string | null;
  climate?: "hot" | "cold" | "mixed" | "all_seasons" | null;
  tripLength?: "weekends" | "weeks" | "months" | "full_time" | null;
  /** Free-text "how they'll use it" notes (destinations, campsite conditions …). */
  useNotes?: string | null;
  storage?: string | null;
  onOffRoad?: "on" | "off" | "both" | null;
  drivenBefore?: boolean | null;
  mustHaves?: string[] | null;
  dontWant?: string[] | null;
  hobbies?: string | null;
  hasTradeIn?: boolean | null;
  tradePayoffUsd?: number | null;
  paymentMethod?: PaymentMethod | null;
  outTheDoorBudgetUsd?: number | null;
  downPaymentUsd?: number | null;
  monthlyPaymentUsd?: number | null;
  licensingState?: string | null;
  adReference?: string | null;
  /** Shopper preferred not to share a budget — accepted, searched without a ceiling. */
  budgetDeclined?: boolean | null;
  owners?: string | null;
  coBuyerInvolved?: boolean | null;
  creditConcerns?: "none" | "some" | "prefer_not_say" | null;
  /** The host already showed this shopper RVs (moves the road to dealer contact). */
  productsShown?: boolean | null;

  // ── Golden Ticket (Product Selection question list; see road-to-sale.ts). ──
  /** Shopper said they're not sure which type yet (an answer: help them decide). */
  rvTypeUndecided?: boolean | null;
  /** Product Selection question ids the shopper chose not to answer. Declined questions are never asked again. */
  declinedQuestions?: string[] | null;
  /** Interview steps the assistant already asked and the shopper answered (rapport answers stay in the conversation). */
  coveredSteps?: string[] | null;
  /** Q1: what they plan to use it for. */
  plannedUses?: PlannedUse[] | null;
  /** Q2: activities they enjoy (used to match features, e.g. outdoor cooking -> outside kitchen). */
  activities?: string[] | null;
  /** Q3: time off per year / vacation ("3 weeks", "retired, full time"). Rapport. */
  timeOff?: string | null;
  /** Q4: who's going, in their words ("my wife and our dog", "grandkids"). Party size is `sleepers`. */
  partyNotes?: string | null;
  /** Q6: what the trade is (no values; that's for the dealership). */
  tradeDescription?: string | null;
  /** Q6: why they're trading / what they want that they don't have now. */
  tradeReason?: string | null;
  /** Q7 (motorhome): what they'll tow behind it ("Jeep Wrangler", "nothing"). */
  towingBehind?: string | null;
  /** Q9: planned trips or favorite campsites ("Yellowstone in June", "nothing planned yet"). */
  plannedTrips?: string | null;
  /** Q10: cash budget, i.e. how much they want to spend out of pocket. */
  cashBudgetUsd?: number | null;
}

/** Golden Ticket Q1: what they plan to use it for. */
export type PlannedUse = "living" | "camping" | "tailgating" | "traveling";

/** Goal Two: the six ways to pay (Randy Sobel, How to Make a Big Ticket Purchase). */
export type PaymentMethod = "cash" | "difference" | "finance" | "discount" | "ad_shopper" | "special_finance";
export const PAYMENT_METHODS: PaymentMethod[] = ["cash", "difference", "finance", "discount", "ad_shopper", "special_finance"];

/** Down + monthly → estimated buying power (same assumption the Outfitter already discloses). */
export const MONTHLY_PAYMENT_MULTIPLIER = 111.4;

/** The budget ceiling the profile implies (explicit ceiling > out-the-door > finance estimate). */
export function effectiveBudgetMaxUsd(p: BuyerProfile): number | null {
  if (p.budgetMaxUsd != null) return p.budgetMaxUsd;
  if (p.outTheDoorBudgetUsd != null) return p.outTheDoorBudgetUsd;
  const financing = p.paymentMethod === "finance" || p.paymentMethod === "special_finance";
  if (p.cashBudgetUsd != null && !financing) return p.cashBudgetUsd;
  if (p.monthlyPaymentUsd != null && (p.paymentMethod === "finance" || p.paymentMethod === "special_finance" || p.paymentMethod == null)) {
    return Math.round((p.downPaymentUsd ?? 0) + p.monthlyPaymentUsd * MONTHLY_PAYMENT_MULTIPLIER);
  }
  return null;
}

const MOTOR_TYPES = ["class_a", "class_b", "class_c"];
/** The word to use for the shopper's RV in questions ("motorhome", "trailer", "Allegro RED" …). */
export function rvWord(p: Pick<BuyerProfile, "rvTypes" | "models">): string {
  if (p.models?.length === 1) return p.models[0];
  const t = p.rvTypes ?? [];
  if (t.length && t.every((x) => MOTOR_TYPES.includes(x))) return "motorhome";
  if (t.length === 1 && t[0] === "fifth_wheel") return "fifth wheel";
  if (t.length === 1 && t[0] === "toy_hauler") return "toy hauler";
  if (t.length && t.every((x) => x === "travel_trailer" || x === "popup_camper")) return "trailer";
  return "RV";
}

export interface DiscoveryQuestion {
  id: "sleepers" | "floorplan" | "length_reason" | "length_flex" | "budget" | "camping_style" | "tow_payload";
  prompt: string;
  options: string[];
  why: string;
}

export interface DiscoveryAssessment {
  readyToSearch: boolean;
  /** Essentials that block a first recommendation. */
  missingEssentials: string[];
  /** Useful refinements that never block a search. */
  missingRefinements: string[];
  nextQuestion: DiscoveryQuestion | null;
  knownSummary: string[];
}

export const QUESTION_ORDER: DiscoveryQuestion[] = [
  {
    id: "sleepers",
    prompt: "Who's this RV for, and how many people will normally sleep in it?",
    options: ["Just me", "Two adults", "3–4 people", "5 or more"],
    why: "Sleeping count decides couples vs. bunkhouse floorplans — guessing here is how buyers get shown the wrong trailers.",
  },
  {
    id: "floorplan",
    prompt: "Got it. For sleeping, which fits you better: one main bed (couples layout), dedicated bunk beds, or are you flexible?",
    options: ["One main bed / couples layout", "Dedicated bunks", "Flexible — show me both"],
    why: "A bunkhouse wastes living space for 1–2 sleepers; a couples trailer strands a family. This keeps the shortlist honest.",
  },
  {
    id: "length_reason",
    prompt: "Is that length limit for storage — a garage, driveway, or spot it has to fit — or is it more about what you're comfortable towing and handling?",
    options: ["Storage — it physically has to fit", "Comfort — just what I'm comfortable with", "Hard limit, no exceptions"],
    why: "A storage limit can never be exceeded. A comfort limit might be hiding the perfect RV one or two feet longer, so we ask before we wall off that inventory.",
  },
  {
    id: "length_flex",
    prompt: "Is it okay if we keep it maybe 1 or 2 feet longer, just in case? I'm not going to take you up to 40 by any means — I just want to keep that gate open in case the right one is sitting right there.",
    options: ["Yes — keep the gate open (+1–2 ft)", "No — hold my limit exactly"],
    why: "Only asked when the limit is about comfort, and only with explicit permission. Approved flexibility is +2 ft maximum, never open-ended.",
  },
  {
    id: "tow_payload",
    prompt: "One safety check: what does the yellow payload sticker inside your driver's door say? It reads 'The combined weight of occupants and cargo should never exceed ___ lbs.' A photo works too (you can cover the VIN). I ask because that number, not the truck's model name, tells us what you can safely tow.",
    options: ["I'll check the sticker", "I know my exact tow rating instead", "Skip for now — show preliminary fits only"],
    why: "Tongue weight counts against payload. A model name (e.g. 'F-150') spans thousands of pounds of rating, so only the sticker gives a real fit.",
  },
  {
    id: "budget",
    prompt: "What price range should I stay inside? A ceiling is fine — I will never show you over it.",
    options: ["Under $25k", "$25k–$45k", "$45k–$70k", "No ceiling yet"],
    why: "Budget is a hard ceiling, not a target to spend up to.",
  },
  {
    id: "camping_style",
    prompt: "How do you mostly camp: full hookups, off-grid/boondocking, or a mix?",
    options: ["Full hookups", "Boondocking / off-grid", "A mix"],
    why: "Camping style changes what matters (tanks, solar, slideouts) without excluding everything else.",
  },
];

/** Infer the floorplan intent the profile implies, when not stated. */
export function impliedFloorplan(p: BuyerProfile): FloorplanIntent | null {
  if (p.floorplanIntent) return p.floorplanIntent;
  if (p.wantsBunks === true) return "family_bunks";
  const sleepers = p.sleepers ?? null;
  const kids = p.kids ?? 0;
  if (sleepers == null) return null;
  if (kids > 0 || sleepers >= 3) return "family_bunks";
  if (sleepers === 1) return "solo";
  if (sleepers === 2) return "couples";
  return null;
}

export function assessDiscovery(p: BuyerProfile): DiscoveryAssessment {
  const known: string[] = [];
  if (p.sleepers != null) known.push(`sleeps ${p.sleepers}`);
  const intent = impliedFloorplan(p);
  if (intent) known.push(`floorplan: ${intent.replace(/_/g, " ")}`);
  if (p.budgetMaxUsd != null) known.push(`budget ≤ $${p.budgetMaxUsd.toLocaleString()}`);
  if (p.campingStyle) known.push(`camping: ${p.campingStyle.replace(/_/g, " ")}`);
  if (p.towVehicle) known.push(`tow vehicle: ${p.towVehicle}`);
  if (p.truckPayloadLbs != null) known.push(`payload ${p.truckPayloadLbs.toLocaleString()} lbs (door sticker)`);
  else if (p.truckTowRatingLbs != null) known.push(`tow rating ${p.truckTowRatingLbs.toLocaleString()} lbs (buyer-stated)`);

  if (p.discoveryWaived) {
    return { readyToSearch: true, missingEssentials: [], missingRefinements: [], nextQuestion: null, knownSummary: known };
  }

  // Only sleeping party + floorplan intent gate the FIRST recommendation.
  // Budget, camping style and payload refine ranking / tow verdicts and are
  // asked after (payload before any trailer is called a tow "match").
  const missingEssentials: string[] = [];
  const declined = (id: string) => Boolean(p.declinedQuestions?.includes(id) || p.coveredSteps?.includes(id));
  if (p.sleepers == null) { if (!declined("who_going")) missingEssentials.push("sleepers"); }
  else if (!intent) missingEssentials.push("floorplan");
  // length_reason / length_flex are appended after this (Road to the Sale).

  const missingRefinements: string[] = [];
  if (p.towVehicle && p.truckPayloadLbs == null && p.truckTowRatingLbs == null) missingRefinements.push("tow_payload");
  if (p.budgetMaxUsd == null) missingRefinements.push("budget");
  if (!p.campingStyle) missingRefinements.push("camping_style");

  if (p.lengthMaxFt != null) {
    known.push(`max length ${p.lengthMaxFt} ft${p.lengthReason ? ` (${p.lengthReason})` : ""}${p.lengthFlexApproved ? " +2 ft gate open" : ""}`);
  }
  // Road to the Sale: a stated length cap is clarified, never silently
  // treated as hard (storage) or soft (comfort). Clarification gates the
  // search because the answer changes which inventory even exists for them.
  // A declined clarification keeps the stated length as a firm limit.
  if (p.lengthMaxFt != null && !p.lengthReason && p.lengthFlexApproved == null) { if (!declined("length_reason")) missingEssentials.push("length_reason"); }
  else if (p.lengthMaxFt != null && p.lengthReason === "comfort" && p.lengthFlexApproved == null) { if (!declined("length_flex")) missingEssentials.push("length_flex"); }

  const nextId = missingEssentials[0] ?? missingRefinements[0] ?? null;
  let nextQuestion = nextId ? (QUESTION_ORDER.find((q) => q.id === nextId) ?? null) : null;
  if (nextQuestion?.id === "sleepers") nextQuestion = { ...nextQuestion, prompt: nextQuestion.prompt.replace("this RV", `this ${rvWord(p)}`) };
  if (nextQuestion?.id === "length_reason" && p.lengthMaxFt != null) {
    nextQuestion = { ...nextQuestion, prompt: `Is that ${p.lengthMaxFt}-foot limit for storage — a garage, driveway, or spot it has to fit — or is it more about what you're comfortable with?` };
  }
  if (nextQuestion?.id === "length_flex" && p.lengthMaxFt != null) {
    nextQuestion = { ...nextQuestion, prompt: `Is it okay if we keep it maybe 1 or 2 feet longer than ${p.lengthMaxFt} — so up to about ${p.lengthMaxFt + 2} — just in case? I'm not going to take you way up the range by any means; I just want to keep that gate open in case the right one is sitting right there.` };
  }
  return {
    readyToSearch: missingEssentials.length === 0,
    missingEssentials,
    missingRefinements,
    // When essentials are done, the next question is advisory only.
    nextQuestion: missingEssentials.length > 0 ? nextQuestion : null,
    knownSummary: known,
  };
}

/**
 * The length cap that actually filters inventory. Storage / hard limits and
 * declined flexibility hold the stated number exactly; explicitly approved
 * comfort flexibility opens the gate by exactly 2 ft — never more.
 */
export function effectiveLengthMaxFt(p: BuyerProfile): number | null {
  if (p.lengthMaxFt == null) return null;
  return p.lengthFlexApproved === true && p.lengthReason === "comfort" ? p.lengthMaxFt + 2 : p.lengthMaxFt;
}

/** Compile a buyer profile into engine constraints (single mapping). */
export function profileToConstraints(p: BuyerProfile): Constraints {
  const intent = impliedFloorplan(p);
  const c: Constraints = {};
  if (p.sleepers != null) c.sleepsMin = p.sleepers;
  const budget = effectiveBudgetMaxUsd(p);
  if (budget != null) c.priceMaxUsd = budget;
  if (p.makes?.length) c.makes = p.makes;
  if (p.models?.length) c.models = p.models;
  if (p.newOrUsed === "new" || p.newOrUsed === "used") c.condition = p.newOrUsed;
  if (p.budgetMinUsd != null) c.priceMinUsd = p.budgetMinUsd;
  if (p.rvTypes?.length) c.rvTypes = p.rvTypes;
  if (p.lengthMaxFt != null) c.lengthMaxFt = effectiveLengthMaxFt(p);
  if (p.lengthMinFt != null) c.lengthMinFt = p.lengthMinFt;
  if (p.place) c.location = { place: p.place, radiusMiles: p.radiusMiles ?? 150 };
  if (p.towVehicle) {
    c.towVehicle = p.truckTowRatingLbs != null
      ? `${p.towVehicle} rated ${p.truckTowRatingLbs.toLocaleString()} lbs`
      : p.towVehicle;
  }
  if (p.campingStyle === "boondocking") c.boondocking = true;
  c.sherpa = {
    sleepers: p.sleepers ?? null,
    floorplanIntent: intent,
    campingStyle: p.campingStyle ?? null,
    truckPayloadLbs: p.truckPayloadLbs ?? null,
    passengersLbs: p.passengersLbs ?? null,
    cargoLbs: p.cargoLbs ?? null,
    discoveryWaived: p.discoveryWaived ?? null,
    lengthMaxStatedFt: p.lengthMaxFt ?? null,
    lengthReason: p.lengthReason ?? null,
    lengthFlexApproved: p.lengthFlexApproved ?? null,
  };
  // Bunks are a hard requirement ONLY when the buyer explicitly wants them.
  if (intent === "family_bunks" && p.wantsBunks === true) c.mustHave = ["bunkhouse"];
  return c;
}

// ── Floorplan classification + lifestyle fit ───────────────────────────────

export type FloorplanClass = "bunkhouse" | "couples" | "family_flexible" | "unknown";

export function classifyFloorplan(u: CanonicalUnit): FloorplanClass {
  if (u.bunkhouse.value === true) return "bunkhouse";
  if (u.bunkhouse.value === false) return "couples";
  return "unknown";
}

export interface LifestyleFit {
  points: number;
  label: string;
  reasons: string[];
}

/**
 * Score how a unit fits HOW the buyer lives — the correction for ranking a
 * 17-ft bunkhouse level with a couples trailer for two adults. Deterministic
 * and explained; bunk evidence that is merely inferred still counts, but is
 * labelled as such by the caller via bunkhouse provenance.
 */
export function lifestyleFit(u: CanonicalUnit, sherpa: NonNullable<Constraints["sherpa"]>): LifestyleFit {
  const intent = sherpa.floorplanIntent ?? null;
  const sleepers = sherpa.sleepers ?? null;
  const cls = classifyFloorplan(u);
  const sleeps = u.sleeps.value;
  const reasons: string[] = [];
  let points = 0;
  let label = "general fit";

  if (intent === "couples" || intent === "solo") {
    label = intent === "solo" ? "solo / couples layout" : "couples layout";
    if (cls === "bunkhouse") {
      points -= 22;
      reasons.push("bunkhouse layout — bunks eat living space for 1–2 sleepers");
    } else if (cls === "couples") {
      points += 18;
      reasons.push("couples layout — main bed, no wasted bunk space");
    }
    if (sleeps != null && sleeps >= 6) { points -= 6; reasons.push(`sleeps ${sleeps} — more beds than a party of ${sleepers ?? 2} needs`); }
    const len = u.lengthFt.value;
    if (len != null && len >= 22 && len <= 34) { points += 6; reasons.push(`${len} ft — usable living space, still easy to tow`); }
    if ((u.slideouts.value ?? 0) >= 1) { points += 4; reasons.push("slideout opens up the living area"); }
  } else if (intent === "family_bunks") {
    label = "family layout";
    if (cls === "bunkhouse") {
      points += 18;
      reasons.push("dedicated bunks for the kids");
    } else if (cls === "couples") {
      points -= 10;
      reasons.push("no dedicated bunks — kids would be on a convertible dinette/sofa");
    }
    if (sleepers != null && sleeps != null) {
      if (sleeps >= sleepers) { points += 8; reasons.push(`sleeps ${sleeps} for your ${sleepers}`); }
      else { points -= 14; reasons.push(`sleeps ${sleeps} — short of your ${sleepers}`); }
    }
  } else if (sleepers != null && sleeps != null && sleeps >= sleepers) {
    points += 5;
    reasons.push(`sleeps ${sleeps}`);
  }

  if (sherpa.campingStyle === "boondocking" && u.boondocking.score != null && u.boondocking.score >= 50) {
    points += 6;
    reasons.push("strong off-grid setup for boondocking");
  }
  return { points, label, reasons };
}

// ── Tongue weight + payload (the check a model name cannot do) ───────────

/** Loaded tongue-weight estimate: published hitch weight is the EMPTY number. */
export function estimateTongueRange(u: CanonicalUnit): { lowLbs: number; highLbs: number; basis: string } | null {
  const loaded = u.gvwrLbs.value ?? u.dryWeightLbs.value;
  if (loaded == null) return null;
  const basis = u.gvwrLbs.value != null ? "GVWR × 10–15%" : "dry weight × 10–15% (GVWR unpublished — loaded tongue will run higher)";
  return { lowLbs: Math.round(loaded * 0.10), highLbs: Math.round(loaded * 0.15), basis };
}

export interface PayloadFit {
  verdict: "fits" | "tight" | "exceeds" | "unknown";
  tongueLowLbs: number | null;
  tongueHighLbs: number | null;
  peopleAndCargoLbs: number;
  remainingAfterTongueLbs: number | null;
  detail: string;
}

export function evaluatePayloadFit(
  u: CanonicalUnit,
  sherpa: NonNullable<Constraints["sherpa"]>,
): PayloadFit {
  const peopleAndCargo = (sherpa.passengersLbs ?? 0) + (sherpa.cargoLbs ?? 0);
  const tongue = estimateTongueRange(u);
  if (sherpa.truckPayloadLbs == null || !tongue) {
    return {
      verdict: "unknown",
      tongueLowLbs: tongue?.lowLbs ?? null,
      tongueHighLbs: tongue?.highLbs ?? null,
      peopleAndCargoLbs: peopleAndCargo,
      remainingAfterTongueLbs: null,
      detail: sherpa.truckPayloadLbs == null
        ? "Payload unknown — read the yellow door sticker before calling this a tow match."
        : "Trailer loaded weight unknown — tongue weight cannot be estimated.",
    };
  }
  const worst = tongue.highLbs + peopleAndCargo;
  const remaining = sherpa.truckPayloadLbs - worst;
  if (worst <= sherpa.truckPayloadLbs * 0.9) {
    return { verdict: "fits", tongueLowLbs: tongue.lowLbs, tongueHighLbs: tongue.highLbs, peopleAndCargoLbs: peopleAndCargo, remainingAfterTongueLbs: remaining, detail: `Est. tongue ${tongue.lowLbs}–${tongue.highLbs} lbs + ${peopleAndCargo} lbs people/cargo leaves ~${remaining} lbs of your ${sherpa.truckPayloadLbs.toLocaleString()}-lb payload.` };
  }
  if (worst <= sherpa.truckPayloadLbs) {
    return { verdict: "tight", tongueLowLbs: tongue.lowLbs, tongueHighLbs: tongue.highLbs, peopleAndCargoLbs: peopleAndCargo, remainingAfterTongueLbs: remaining, detail: `Est. tongue ${tongue.lowLbs}–${tongue.highLbs} lbs + ${peopleAndCargo} lbs people/cargo is within your ${sherpa.truckPayloadLbs.toLocaleString()}-lb payload, but tight (~${remaining} lbs spare at the high end).` };
  }
  return { verdict: "exceeds", tongueLowLbs: tongue.lowLbs, tongueHighLbs: tongue.highLbs, peopleAndCargoLbs: peopleAndCargo, remainingAfterTongueLbs: remaining, detail: `Est. tongue ${tongue.lowLbs}–${tongue.highLbs} lbs + ${peopleAndCargo} lbs people/cargo exceeds your ${sherpa.truckPayloadLbs.toLocaleString()}-lb payload by ~${Math.abs(remaining)} lbs at the high end.` };
}
