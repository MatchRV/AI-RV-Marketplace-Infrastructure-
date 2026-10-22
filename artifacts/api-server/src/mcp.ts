import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod/v4";
import {
  buildContext,
  compactSearchResult,
  compareUnits,
  constraintsSchema,
  evaluateMotorhomeTow,
  evaluateTowFit,
  evaluateUnit,
  powertrainReport,
  resolveTowVehicle,
  runSearch,
  assessDiscovery,
  searchGuides,
  getGuide,
  GUIDE_TOPICS,
  profileToConstraints,
  evaluatePayloadFit,
  assessRoadToSale,
  brandForSeries,
  resolveWantedSeries,
  canonicalBrand,
  classifyOpening,
  knownSummary as roadKnownSummary,
  parseShopperText,
  placeFromText,
  profileFactsFromText,
  mergeProfile,
  shopperAskedForResultsNow,
  isNoTowVehicleAnswer,
  isTowableSearch,
  TOWED_RV_TYPES,
  runSearch as runEngineSearch,
  unitMakeModel,
  SHERPA_WELCOME,
  ROAD_TO_SALE_STEPS,
  INTERVIEW_STEPS,
  type BuyerProfile,
  type Constraints,
  type CanonicalUnit,
  type UnitMatch,
} from "@workspace/agent-core";
import { getInventory as getOriginalInventory } from "./services/agent-inventory";
import { screenMcpInventory } from "./services/mcp-inventory-quality";
let screenedInventory: ReturnType<typeof screenMcpInventory> | undefined;
function getInventory() { return screenedInventory ??= screenMcpInventory(getOriginalInventory()); }

import { OUTFITTER_GUIDANCE } from "./services/outfitter-guidance";
import { applyMemory, applyMemoryToUnit, getCuratedStore, newSessionKey, peekScope, recallVehicle, resolveScope, writableScope } from "./services/learned-store";
import { getInquiryStatus, prepareInquiry, sendInquiry } from "./services/dealer-inquiries";
import { SHOPPER_HTML, SHOPPER_URI } from "./ui/shopper";

const OPT = "Optional. Pass only what the shopper actually said.";
const FEATURES = ["bunkhouse", "outdoor_kitchen", "solar", "solar_prep", "lithium", "generator", "four_season", "two_entry_doors"] as const;
const STEP_LIST = "rv_type, use, activities, vacation, who_going, buyers, trade, towing, storage, trips, area, payment";

/**
 * RV-fit facts only. The interview's rapport answers (time off, who's buying,
 * the trade, trips) stay in the conversation; tools get the step name in
 * covered_steps, plus any fit fact the answer implies.
 */
const fitFields = {
  covered_steps: z.array(z.enum(INTERVIEW_STEPS)).max(12).optional().describe(`Interview steps already asked and answered in this conversation (${STEP_LIST}). Only the step name is sent, never the answer. A covered step is never asked again.`),
  declined_questions: z.array(z.enum(INTERVIEW_STEPS)).max(12).optional().describe("Interview steps the shopper chose not to answer. They are never asked again, and the shortlist doesn't filter on them."),
  rv_types: z.array(z.enum(["travel_trailer", "fifth_wheel", "toy_hauler", "class_a", "class_b", "class_c", "popup_camper", "truck_camper"])).max(8).optional().describe(`RV type(s) the shopper wants (a destination trailer counts as travel_trailer; an ATV/toy garage means toy_hauler). Decides which inventory applies. ${OPT}`),
  make: z.union([z.string().max(60), z.array(z.string().max(60)).max(6)]).optional().describe(`RV brand the shopper named, e.g. "Tiffin". Hard filter. ${OPT}`),
  model: z.union([z.string().max(60), z.array(z.string().max(60)).max(6)]).optional().describe(`RV model or series the shopper named, e.g. "Allegro RED". Hard filter. ${OPT}`),
  use_type: z.array(z.enum(["living", "camping", "tailgating", "traveling"])).max(4).optional().describe(`How the RV will be used, as a category. Picks the floorplan and build (full-time living needs residential storage and four-season features). ${OPT}`),
  desired_features: z.array(z.enum(FEATURES)).max(8).optional().describe(`RV features to favor, derived from what the shopper enjoys (e.g. outdoor_kitchen for someone who loves to grill, bunkhouse for kids). Ranks the shortlist; never excludes. ${OPT}`),
  off_grid: z.boolean().optional().describe(`True when their camping calls for off-grid readiness (solar, generator, larger tanks), e.g. dispersed or no-hookup sites. ${OPT}`),
  four_season: z.boolean().optional().describe(`True when they'll camp in cold weather or year-round (insulation, heated tanks). ${OPT}`),
  party_size: z.number().int().min(1).max(14).optional().describe(`How many people will sleep in the RV. Sets sleeping capacity and couples vs. bunk layouts. Never assume it from words like "family". ${OPT}`),
  tow_vehicle: z.string().max(120).optional().describe(`Trailers and fifth wheels: the vehicle that will tow it (year, make, model, engine), or "none yet" / "not sure". Sets the safe weight limit. Never guess a vehicle. ${OPT}`),
  towed_vehicle: z.string().max(120).optional().describe(`Motorhomes: what will be towed behind it (e.g. "Jeep Wrangler", "small trailer") or "nothing". Sets the hitch and towing-capacity need. ${OPT}`),
  truck_payload_lbs: z.number().min(500).max(10000).optional().describe(`Tow vehicle payload from its door sticker, for a safe tongue-weight check. ${OPT}`),
  truck_tow_rating_lbs: z.number().min(1000).max(40000).optional().describe(`The tow vehicle's exact rated towing capacity, for a safe weight check. ${OPT}`),
  length_max_ft: z.number().min(8).max(60).optional().describe(`Longest RV that fits where it will be stored, or that they're comfortable with, in feet. ${OPT}`),
  no_length_limit: z.boolean().optional().describe("True only when the shopper said there is no length limit."),
  length_reason: z.enum(["storage", "comfort", "hard_limit"]).optional().describe(`Whether the length limit is a firm storage fit or a comfort preference. ${OPT}`),
  length_flex_approved: z.boolean().optional().describe(`True only if the shopper OK'd looking up to 2 ft past a comfort length limit. ${OPT}`),
  location: z.string().max(80).optional().describe(`Shopping area: city, state or ZIP (no street address). Used to start with nearby inventory. ${OPT}`),
  radius_miles: z.number().min(1).max(3000).optional().describe(`How far they'd travel to see an RV. ${OPT}`),
  condition: z.enum(["new", "used", "any"]).optional().describe(`New or pre-owned, only if the shopper said. ${OPT}`),
  payment_method: z.enum(["cash", "finance"]).optional().describe(`Paying cash or making payments. Decides which budget numbers set the price range. ${OPT}`),
  budget_max_usd: z.number().min(0).max(2_000_000).optional().describe(`Cash: the most they'll spend out the door. Financing: the most they want to spend out of pocket. Keeps every pick inside budget. ${OPT}`),
  down_payment_usd: z.number().min(0).max(2_000_000).optional().describe(`If financing: planned down payment in USD; with the monthly payment it sets the price range. ${OPT}`),
  monthly_payment_usd: z.number().min(0).max(50_000).optional().describe(`If financing: target monthly payment in USD; with the down payment it sets the price range. ${OPT}`),
};

const searchInput = z.object({
  ...fitFields,
  query: z.string().max(240).optional().describe("Optional short RV search keywords (type, size, features), e.g. \"travel trailer sleeps 4\". Not the shopper's message; only RV-fit facts are read from it."),
  sleeps_min: z.number().int().min(1).max(14).optional().describe("Optional. Alias of party_size: minimum sleeping capacity the shopper stated."),
  price_max_usd: z.number().min(0).max(2_000_000).optional().describe("Optional. Highest price the shopper set, in USD (hard filter)."),
  price_min_usd: z.number().min(0).max(2_000_000).optional().describe("Optional. Lowest price the shopper set, in USD."),
  sort: z.enum(["best_match", "price_asc", "price_desc", "distance", "newest_model_year"]).optional().describe("Optional. Result order; default best_match."),
  exclude_makes: z.array(z.string().max(60)).max(6).optional().describe("Optional. Brands the shopper ruled out."),
  exclude_models: z.array(z.string().max(60)).max(6).optional().describe("Optional. Models or series the shopper ruled out."),
  fuel_type: z.enum(["gas", "diesel"]).optional().describe("Optional. ONLY when the shopper explicitly asked for gas or diesel. Never infer it."),
  passengers_lbs: z.number().min(0).max(3000).optional().describe("Optional. Approximate weight of people riding in the tow vehicle, for the payload check."),
  cargo_lbs: z.number().min(0).max(5000).optional().describe("Optional. Approximate cargo in the tow vehicle, for the payload check."),
  constraints: z.preprocess(
    (raw) => cleanConstraints(raw as Record<string, unknown> | undefined),
    constraintsSchema,
  ).optional().default({}).describe("Optional. Structured limits the shopper stated (price, type, sleeps, length, weights, ratings). Each one is a hard filter on the shortlist and is never relaxed without their OK."),
  shopper_requested_results_now: z.boolean().optional().describe("ONLY true when the shopper literally asked to skip the questions and see RVs now (e.g. \"just show me\"). Never set it on your own. Requires shopper_words; the server checks them."),
  shopper_words: z.string().max(200).optional().describe("Only with shopper_requested_results_now: the shopper's exact words asking to skip the questions (e.g. \"just show me\"). Nothing else."),
  session_key: z.string().max(80).optional().describe("Optional. Opaque key returned by teach_outfitter, to recall facts this shopper confirmed."),
  limit: z.number().int().min(1).max(10).optional().default(3).describe("Shortlist size. Default 3 best fits; use more (max 10) only when the shopper asks to see more."),
});

const profileInput = z.object({
  request_kind: z.enum(["find_rv", "general_question", "greeting"]).optional().describe("Optional. find_rv (default): they want help finding an RV. general_question: a question that isn't an RV search, like \"motorhome or fifth wheel?\" (answered directly, no interview). greeting: a hello or vague first message (returns the welcome)."),
  ...fitFields,
});

/** A "just show me" claim counts only when the shopper's own words say so. */
function verifiedWaiver(input: { shopper_requested_results_now?: boolean; shopper_words?: string; query?: string; message?: string }): { waived: boolean; rejected: string | null } {
  if (input.shopper_requested_results_now !== true) return { waived: false, rejected: null };
  const ok = shopperAskedForResultsNow(input.shopper_words) || shopperAskedForResultsNow(input.query) || shopperAskedForResultsNow(input.message);
  return ok
    ? { waived: true, rejected: null }
    : { waived: false, rejected: "shopper_requested_results_now was set, but shopper_words doesn't show the shopper asking to skip the questions. Questions stay on. Only set it when the shopper literally says something like 'just show me' or 'skip the questions', and quote their words in shopper_words." };
}

const partySize = (input: Record<string, unknown>): number | null => {
  const direct = (input.party_size as number | undefined) ?? (input.sleepers as number | undefined);
  if (direct != null) return direct;
  const a = input.adults as number | undefined, k = input.kids as number | undefined;
  return a != null || k != null ? Math.max(1, (a ?? 0) + (k ?? 0)) : null;
};
const statedLength = (input: Record<string, unknown>): number | null =>
  (input.length_max_ft as number | undefined) ?? (input.max_length_ft as number | undefined) ?? null;

function profileFrom(input: Record<string, unknown>, constraints: Constraints, extra: { waived: boolean; towVehicleUnknown: boolean }): BuyerProfile {
  const sherpa = constraints.sherpa;
  return {
    sleepers: partySize(input) ?? (input.sleeps_min as number | undefined) ?? constraints.sleepsMin ?? sherpa?.sleepers ?? null,
    adults: (input.adults as number | undefined) ?? null,
    kids: (input.kids as number | undefined) ?? null,
    floorplanIntent: (input.floorplan_intent as BuyerProfile["floorplanIntent"]) ?? sherpa?.floorplanIntent ?? null,
    wantsBunks: (input.wants_bunks as boolean | undefined) ?? (constraints.mustHave?.includes("bunkhouse") ? true : null),
    budgetMaxUsd: constraints.priceMaxUsd ?? null,
    campingStyle: (input.camping_style as BuyerProfile["campingStyle"]) ?? sherpa?.campingStyle ?? (constraints.boondocking ? "boondocking" : null),
    towVehicle: constraints.towVehicle ?? null,
    truckPayloadLbs: (input.truck_payload_lbs as number | undefined) ?? sherpa?.truckPayloadLbs ?? null,
    truckTowRatingLbs: (input.truck_tow_rating_lbs as number | undefined) ?? null,
    passengersLbs: (input.passengers_lbs as number | undefined) ?? sherpa?.passengersLbs ?? null,
    cargoLbs: (input.cargo_lbs as number | undefined) ?? sherpa?.cargoLbs ?? null,
    // Never taken from the host's say-so (constraints.sherpa / a bare flag):
    // only a waiver verified against the shopper's own words counts.
    discoveryWaived: extra.waived || null,
    towVehicleUnknown: extra.towVehicleUnknown || null,
    noLengthLimit: input.no_length_limit === true || null,
    lengthMaxFt: statedLength(input) ?? constraints.lengthMaxFt ?? sherpa?.lengthMaxStatedFt ?? null,
    lengthReason: (input.length_reason as BuyerProfile["lengthReason"]) ?? sherpa?.lengthReason ?? null,
    lengthFlexApproved: (input.length_flex_approved as boolean | undefined) ?? sherpa?.lengthFlexApproved ?? null,
    rvTypes: constraints.rvTypes ?? null,
    makes: constraints.makes ?? null,
    models: constraints.models ?? null,
    place: constraints.location?.place ?? null,
    radiusMiles: constraints.location?.radiusMiles ?? null,
    newOrUsed: constraints.condition === "new" || constraints.condition === "used" ? constraints.condition : null,
    paymentMethod: (input.payment_method as BuyerProfile["paymentMethod"]) ?? null,
    outTheDoorBudgetUsd: (input.out_the_door_budget_usd as number | undefined) ?? null,
    downPaymentUsd: (input.down_payment_usd as number | undefined) ?? null,
    monthlyPaymentUsd: (input.monthly_payment_usd as number | undefined) ?? null,
    budgetDeclined: (input.budget_declined as boolean | undefined) ?? null,
    productsShown: (input.products_shown as boolean | undefined) ?? null,
    ...fitProfile(input),
  };
}

/** RV-fit fields → BuyerProfile. Rapport steps arrive only as covered/declined step names. */
function fitProfile(input: Record<string, any>): Partial<BuyerProfile> {
  const out: Partial<BuyerProfile> = {
    coveredSteps: input.covered_steps ?? null,
    declinedQuestions: input.declined_questions ?? null,
  };
  if (input.use_type?.length) out.plannedUses = input.use_type;
  if (input.towed_vehicle) out.towingBehind = input.towed_vehicle;
  if (input.budget_max_usd != null) out.cashBudgetUsd = input.budget_max_usd;
  if (input.off_grid === true) out.campingStyle = "boondocking";
  if (input.four_season === true) out.climate = "all_seasons";
  if (input.desired_features?.includes("bunkhouse")) out.wantsBunks = true;
  return out;
}

/** desired_features / off_grid / four_season → ranking preferences (never hard filters). */
function fitPreferences(input: Record<string, any>): Partial<Constraints> {
  const prefer = new Set<string>(input.desired_features ?? []);
  if (input.four_season === true) prefer.add("four_season");
  if (input.off_grid === true) { prefer.add("solar"); prefer.add("generator"); }
  return {
    ...(prefer.size ? { prefer: [...prefer] as NonNullable<Constraints["prefer"]> } : {}),
    ...(input.off_grid === true ? { boondocking: true } : {}),
  };
}

/** Keep explicit answers, then fill any gaps from what the shopper wrote, so nothing they said is asked again. */
function withTextFacts(profile: BuyerProfile, ...texts: Array<string | undefined | null>): BuyerProfile {
  let out = profile;
  for (const t of texts) if (t) out = mergeProfile(out, profileFactsFromText(t));
  return out;
}

const asList = (v: unknown): string[] | undefined => {
  if (v == null) return undefined;
  const arr = (Array.isArray(v) ? v : String(v).split(/\s*(?:,|\bor\b|\/)\s*/)).map((x) => String(x).trim()).filter(Boolean);
  return arr.length ? arr : undefined;
};

/** Canonical brands, and the brand implied by a curated series when only a model was given. */
function normalizeMakeModel(c: Constraints): Constraints {
  const out: Constraints = { ...c };
  if (out.makes?.length) out.makes = [...new Set(out.makes.map((m) => canonicalBrand(m) ?? m))];
  if (out.excludeMakes?.length) out.excludeMakes = out.excludeMakes.map((m) => canonicalBrand(m) ?? m);
  if (out.models?.length && !out.makes?.length) {
    const brands = [...new Set(out.models.map((m) => brandForSeries(m)).filter((b): b is string => Boolean(b)))];
    if (brands.length === 1) out.makes = brands;
  }
  // Canonical series spelling ("phaeton" → "Phaeton", "allegro red" → "Allegro RED") for curated brands.
  const canonModel = (m: string) => {
    for (const b of out.makes ?? []) {
      const hit = resolveWantedSeries(b, m.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
      if (hit) return hit.name;
    }
    return m;
  };
  if (out.models?.length) out.models = [...new Set(out.models.map(canonModel))];
  if (out.excludeModels?.length) out.excludeModels = [...new Set(out.excludeModels.map(canonModel))];
  return out;
}

/** Interview-tool input (RV-fit facts + covered steps) → BuyerProfile. */
function discoveryProfile(input: Record<string, any>): BuyerProfile {
  const makes = asList(input.make)?.map((m) => canonicalBrand(m) ?? m) ?? null;
  const models = asList(input.model) ?? null;
  const norm = normalizeMakeModel({ makes: makes ?? undefined, models: models ?? undefined } as Constraints);
  return {
    sleepers: input.party_size ?? null,
    towVehicle: input.tow_vehicle && !isNoTowVehicleAnswer(input.tow_vehicle) ? input.tow_vehicle : null,
    towVehicleUnknown: input.tow_vehicle && isNoTowVehicleAnswer(input.tow_vehicle) ? true : null,
    truckPayloadLbs: input.truck_payload_lbs ?? null,
    truckTowRatingLbs: input.truck_tow_rating_lbs ?? null,
    noLengthLimit: input.no_length_limit === true || null,
    lengthMaxFt: input.length_max_ft ?? null, lengthReason: input.length_reason ?? null, lengthFlexApproved: input.length_flex_approved ?? null,
    rvTypes: input.rv_types ?? null,
    makes: norm.makes ?? null, models: norm.models ?? null,
    place: input.location ?? null, radiusMiles: input.radius_miles ?? null,
    newOrUsed: input.condition === "new" || input.condition === "used" ? input.condition : null,
    paymentMethod: input.payment_method ?? null,
    downPaymentUsd: input.down_payment_usd ?? null, monthlyPaymentUsd: input.monthly_payment_usd ?? null,
    ...fitProfile(input),
  };
}

/** How many of the named make/model exist in the area (shown before any listing). */
function makeModelCount(corpus: CanonicalUnit[], c: Constraints) {
  const scoped: Constraints = { makes: c.makes, models: c.models, excludeMakes: c.excludeMakes, excludeModels: c.excludeModels, rvTypes: c.rvTypes, ...(c.condition ? { condition: c.condition } : {}), ...(c.location ? { location: c.location } : {}) };
  const out = runEngineSearch(corpus, scoped);
  const bySeries: Record<string, number> = {};
  const byDealer: Record<string, number> = {};
  for (const m of out.results) {
    const n = 1 + (m.identicalUnitIds?.length ?? 0);
    const mm = unitMakeModel(m.unit);
    const key = mm.series ? `${mm.brand} ${mm.series}` : `${mm.brand} (series not stated)`;
    bySeries[key] = (bySeries[key] ?? 0) + n;
    const d = `${m.unit.dealer.name}, ${m.unit.dealer.city}`;
    byDealer[d] = (byDealer[d] ?? 0) + n;
  }
  // Same brand in the area whose listing never states a series: possible
  // matches the shopper can ask the dealer about, never listed as matches.
  let seriesNotStated = 0;
  if (c.models?.length && c.makes?.length) {
    const brandOnly = runEngineSearch(corpus, { makes: c.makes, rvTypes: c.rvTypes, ...(c.location ? { location: c.location } : {}) });
    for (const m of brandOnly.results) if (unitMakeModel(m.unit).series == null) seriesNotStated += 1 + (m.identicalUnitIds?.length ?? 0);
  }
  const top = (r: Record<string, number>, k: number) => Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, k).map(([name, count]) => ({ name, count }));
  return {
    make: c.makes ?? null,
    model: c.models ?? null,
    area: out.coverage.requestedArea ?? "nationwide",
    radiusMiles: out.locationResolution?.state ? null : out.coverage.radiusMiles,
    count: out.funnel.passedHard + out.funnel.unverified,
    ...(c.models?.length ? { seriesNotStated, seriesNotStatedNote: seriesNotStated ? `${seriesNotStated} more ${c.makes?.join("/") ?? ""} unit(s) in the area don't state their series; not counted or listed. Offer to ask the dealer if the shopper wants.` : undefined } : {}),
    bySeries: top(bySeries, 8),
    topDealers: top(byDealer, 5),
  };
}

const sessionKeyField = z.string().max(80).optional().describe("Opaque MatchRV memory key returned by teach_outfitter in this conversation (only needed when the host does not identify the conversation).");
const getRvInput = z.object({ unit_id: z.string().min(3).max(120), session_key: sessionKeyField });

const compareInput = z.object({
  unit_ids: z.array(z.string().min(3).max(120)).min(2).max(4),
  constraints: constraintsSchema.optional().default({}),
  session_key: sessionKeyField,
});

const towInput = z.object({
  vehicle: z.string().min(2).max(120).optional(),
  unit_ids: z.array(z.string().min(3).max(120)).min(1).max(6),
  trailer_weight_lbs: z.number().min(500).max(40_000).optional(),
  trailer_tongue_lbs: z.number().min(50).max(5_000).optional(),
  coach_loaded_weight_lbs: z.number().min(3_000).max(80_000).optional(),
  truck_payload_lbs: z.number().min(500).max(10000).optional(),
  passengers_lbs: z.number().min(0).max(3000).optional(),
  cargo_lbs: z.number().min(0).max(5000).optional(),
  session_key: sessionKeyField,
}).refine((v) => v.vehicle || v.trailer_weight_lbs, { message: "Pass vehicle (truck towing an RV) or trailer_weight_lbs (motorhome towing a trailer)." });


function cleanConstraints(value: Record<string, unknown> | undefined | null): Constraints {
  const aliases: Record<string, string> = {
    price_max: "priceMaxUsd",
    price_max_usd: "priceMaxUsd",
    max_price: "priceMaxUsd",
    priceMax: "priceMaxUsd",
    price_min: "priceMinUsd",
    price_min_usd: "priceMinUsd",
    min_price: "priceMinUsd",
    priceMin: "priceMinUsd",
    rv_types: "rvTypes",
    types: "rvTypes",
    type: "rvTypes",
    body_type: "rvTypes",
    length_max: "lengthMaxFt",
    length_max_ft: "lengthMaxFt",
    max_length: "lengthMaxFt",
    length_min: "lengthMinFt",
    length_min_ft: "lengthMinFt",
    sleeps: "sleepsMin",
    sleeps_min: "sleepsMin",
    min_sleeps: "sleepsMin",
    tow_vehicle: "towVehicle",
    vehicle: "towVehicle",
    max_weight: "maxWeightLbs",
    max_weight_lbs: "maxWeightLbs",
    fuel: "fuelType",
    fuel_type: "fuelType",
    horsepower_min: "horsepowerMin",
    min_horsepower: "horsepowerMin",
    hp_min: "horsepowerMin",
    horsepower_preferred: "horsepowerPreferred",
    torque_min: "torqueMinLbFt",
    torque_min_lb_ft: "torqueMinLbFt",
    min_torque: "torqueMinLbFt",
    torque_preferred: "torquePreferredLbFt",
    trailer_weight: "trailerWeightLbs",
    trailer_weight_lbs: "trailerWeightLbs",
    tow_trailer_lbs: "trailerWeightLbs",
    trailer_tongue_lbs: "trailerTongueLbs",
    coach_loaded_weight_lbs: "coachLoadedWeightLbs",
    make: "makes",
    brand: "makes",
    brands: "makes",
    manufacturer: "makes",
    model: "models",
    series: "models",
    model_name: "models",
    exclude_make: "excludeMakes",
    exclude_makes: "excludeMakes",
    exclude_model: "excludeModels",
    exclude_models: "excludeModels",
  };
  const rvSynonyms: Record<string, string> = {
    "travel trailer": "travel_trailer",
    traveltrailer: "travel_trailer",
    tt: "travel_trailer",
    "fifth wheel": "fifth_wheel",
    fifthwheel: "fifth_wheel",
    "5th wheel": "fifth_wheel",
    "toy hauler": "toy_hauler",
    toyhauler: "toy_hauler",
    "class a": "class_a",
    "class b": "class_b",
    "class c": "class_c",
    "truck camper": "truck_camper",
    "pop up": "popup_camper",
    popup: "popup_camper",
  };
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value ?? {})) {
    if (item === null || item === undefined) continue;
    const mapped = aliases[key] ?? key;
    let v: unknown = item;
    if (mapped === "rvTypes") {
      const arr = Array.isArray(v) ? v : [v];
      v = arr.map((x) => {
        const s = String(x).trim().toLowerCase();
        return rvSynonyms[s] ?? s.replace(/\s+/g, "_");
      });
    }
    if (mapped === "makes" || mapped === "models" || mapped === "excludeMakes" || mapped === "excludeModels") {
      v = asList(v);
      if (!v) continue;
    }
    if (mapped === "location") {
      if (typeof v === "string") {
        v = { place: v, radiusMiles: 150 };
      } else if (v && typeof v === "object") {
        const loc = v as Record<string, unknown>;
        const place = String(loc.place ?? loc.city ?? loc.name ?? "").trim();
        const radius = Number(loc.radiusMiles ?? loc.radius_miles ?? loc.radius ?? 150);
        if (place) v = { place, radiusMiles: Number.isFinite(radius) ? radius : 150 };
        else continue;
      }
    }
    if (out[mapped] === undefined) out[mapped] = v;
  }
  return out as Constraints;
}

function mergeConstraints(...parts: Array<Partial<Constraints> | Constraints | undefined>): Constraints {
  const out: Record<string, unknown> = {};
  for (const part of parts) {
    if (!part) continue;
    for (const [k, v] of Object.entries(part)) {
      if (v === null || v === undefined) continue;
      if (out[k] === undefined) out[k] = v;
    }
  }
  return out as Constraints;
}

/** All searches start with the nationwide corpus; the engine applies location filters. */
function candidateUnits(_locationPlace: string | undefined): CanonicalUnit[] { return getInventory().units; }

function textResult(payload: unknown, isError = false, meta?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    ...(meta ? { _meta: meta } : {}),
    ...(!isError && payload && typeof payload === "object" ? { structuredContent: payload as Record<string, unknown> } : {}),
    ...(isError ? { isError: true } : {}),
  };
}

// The workspace's Zod 3.25 /v4 export predates Standard JSON Schema support.
// Supply that interface for MCP v2 while retaining the shared validators.
function mcpSchema<T extends z.ZodType>(schema: T) {
  const standard: T["~standard"] = schema["~standard"];
  return {
    "~standard": {
      ...standard,
      jsonSchema: {
        input: () => z.toJSONSchema(schema, { io: "input" }),
        output: () => z.toJSONSchema(schema, { io: "output" }),
      },
    },
  };
}

/** Shortlist size when the shopper hasn't asked for more. */
export const SHORTLIST_DEFAULT = 3;

export const ASK_DONT_ASSUME =
  "ASK, DON'T ASSUME. MatchRV returned no RVs because Product Selection questions are still open. Ask nextQuestion (exactly ONE question this turn, word for word including its short reason for asking) in one short, friendly, honest message and wait for the answer. Never re-ask anything in knownSummary, and never fill a missing answer with a guess: not who's going ('family' is not a number), not the tow vehicle or what's towed behind, not a length requirement, not the budget or how they'll pay, and not new vs. used. Don't mention how many RVs might match. Only the shopper literally asking to skip the questions skips them.";

/** Internal name for Jonathan's question list. The model may use it; the shopper never hears it. */
const GOLDEN_TICKET_TEXT =
  "PRODUCT SELECTION = the Golden Ticket (internal name; never say 'Golden Ticket' to the shopper). Before any RV is shown, ask these in order, ONE question per turn, conversationally, each ending with its short, honest reason for asking (use the server's wording from nextQuestion), and never re-ask what the shopper already said: 0) what they want (travel trailer, fifth wheel, motorhome, destination trailer ...); 1) what they plan to use it for (living in it, camping, tailgating, traveling); 2) what activities they enjoy, to match features (loves grilling -> outside kitchen); 3) vacation: how much time off a year; 4) who's going and how many sleep in it; 5) who it's for: just them buying, or someone going in on it; 6) a trade: what it is and why they're trading (no trade values; that's for the dealership); 7) towing: for a motorhome, anything towed behind it; for a trailer or fifth wheel, what tows it; 8) storage and any length requirement; 9) planned trips or favorite campsites; plus the shopping area; 10) payments or cash; if financing, the down payment, the monthly payment, and a cash budget (out of pocket), one at a time. WHAT TO SEND: tools take RV-fit facts only. After each answer, add that question's step to covered_steps and pass only the fit facts it implies: use_type, desired_features (e.g. grilling -> outdoor_kitchen, kids -> bunkhouse), off_grid / four_season (from trips or weather), party_size, tow_vehicle or towed_vehicle, length_max_ft / no_length_limit / length_reason, location, payment_method, budget_max_usd, down_payment_usd, monthly_payment_usd. Keep conversation-only answers (time off, who's buying, the trade, trips) in the chat; never send them, and never send names, contact details, income or credit. If the shopper already said something in their message, pass the fact (and its step) so it's not asked again. The ONLY way to skip: the shopper literally asks to skip the questions (search_rvs with shopper_requested_results_now=true and their words in shopper_words). A named make/model answers question 0 only. Questions that aren't an RV search (\"what's better, a motorhome or a 5th wheel?\") are answered directly, with no questions first (outfitter_discovery request_kind=general_question, or outfitter_guide). The shopper may decline any question: pass its step in declined_questions and move on.";

const sleepsKnown = (m: UnitMatch) => m.unit.sleeps.value !== null && (m.unit.sleeps.source === "dealer_listing" || m.unit.sleeps.confidence === "high");

/**
 * Order the shortlist: verified matches with dealer-published sleeping
 * capacity first, then verified matches whose capacity is inferred, then
 * in-area units that still need a fact verified. Stable within each tier,
 * so the engine's own ranking (distance / best match / price) is kept.
 */
export function shortlistOrder(results: UnitMatch[]): UnitMatch[] {
  const tier = (m: UnitMatch) => (m.hardStatus === "pass" ? 0 : 2) + (sleepsKnown(m) ? 0 : 1);
  return results.map((m, i) => ({ m, i })).sort((a, b) => tier(a.m) - tier(b.m) || a.i - b.i).map((x) => x.m);
}

/** Model line of a unit, ignoring year and floorplan code ("2026 FOREST RIVER AIRELUME 255" -> "forest river airelume"). */
function modelLine(m: UnitMatch): string {
  const words = m.unit.title.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim().split(/\s+/).filter((w) => !/^(19|20)\d\d$/.test(w));
  return (words.length > 2 ? words.slice(0, -1) : words).join(" ");
}

/** Pick the shortlist so it isn't three floorplans of the same model line when other good fits exist. */
export function diversifyShortlist(ranked: UnitMatch[], size: number): UnitMatch[] {
  const picked: UnitMatch[] = [];
  const lines = new Set<string>();
  for (const m of ranked) {
    if (picked.length >= size) break;
    if (lines.has(modelLine(m))) continue;
    lines.add(modelLine(m));
    picked.push(m);
  }
  for (const m of ranked) { if (picked.length >= size) break; if (!picked.includes(m)) picked.push(m); }
  picked.sort((a, b) => ranked.indexOf(a) - ranked.indexOf(b));
  return [...picked, ...ranked.filter((m) => !picked.includes(m))];
}

/** Per-row tow flag: never imply a towable fits a vehicle nobody checked. */
function towFitFlag(m: UnitMatch | undefined, o: { towVehicleGiven: boolean; towVehicleUnknown: boolean; towable: boolean }): Record<string, string> {
  if (!m) return {};
  const t = String(m.unit.rvType ?? "");
  const isTowable = (TOWED_RV_TYPES as readonly string[]).includes(t);
  if (!isTowable) return {};
  const check = m.hardChecks.find((h) => h.constraint.startsWith("towable by"));
  if (o.towVehicleGiven && check?.status === "pass") return { towFit: "under the stated vehicle's limit (preliminary until door-sticker payload is confirmed)" };
  if (o.towVehicleGiven) return { towFit: "verify tow fit" };
  if (o.towVehicleUnknown || o.towable) return { towFit: "verify tow fit (no tow vehicle given yet)" };
  return {};
}

export const MCP_VERSION = "2.2.5";

function buildMatchRvServer(): McpServer {
  const server = new McpServer(
    {
      name: "matchrv",
      version: MCP_VERSION,
      websiteUrl: "https://matchrv.com",
    },
    {
      capabilities: { tools: { listChanged: false }, resources: {} },
      instructions:
        OUTFITTER_GUIDANCE.replace(/Offer an optional VIN lookup[\s\S]*?Never infer a tow package/, "Never infer a tow package") + "\n" +
        "MEMORY: search, detail, compare and tow tools never store anything. When a shopper confirms an exact tow rating, door-sticker payload, or a unit spec the dealer never published, and agrees to MatchRV remembering it, call teach_outfitter. Taught facts are private to this shopper/conversation (never shown to other shoppers) and labelled learned. If teach_outfitter returns a session_key, pass it as session_key on later calls in this conversation. Before asking for a rating, check outfitter_memory / sherpa.memory; ask the shopper to confirm a recalled value matches their exact vehicle. " +
        "DEALER INQUIRIES: only when the shopper asks to contact a dealership about a specific unit, collect their name, email and/or phone and message, call prepare_dealer_inquiry (sends nothing), show the full preview, and call send_dealer_inquiry with confirmed=true ONLY after the shopper explicitly approves that exact preview. Report the returned status honestly (delivered / queued_for_matchrv / failed); never claim the dealer replied unless get_dealer_inquiry_status shows a recorded dealerReply. " +
        "EDUCATION FIRST: for general questions (towing numbers, motorhome vs trailer, fifth wheel vs travel trailer, families, full-time, used buying, costs, financing), call outfitter_guide and teach from it before mentioning inventory. " +
        "ROAD TO THE SALE (MCP tools): The shared method above decides the order. outfitter_discovery (pass the fit facts and covered_steps gathered so far; request_kind=greeting for a hello or vague first message) returns the ONE next interview question to ask (nextQuestion, with its step and reason; nextQuestions holds just that one), knownSummary (never re-ask these), and readyForProducts with searchConstraints. For a greeting it returns the Sherpa welcome, and you send it. Questions that aren't an RV search (comparisons like 'what's better, a motorhome or a 5th wheel?', how-to, costs) get answered directly from outfitter_guide with no questions first (route=education, status=answer_directly). " + GOLDEN_TICKET_TEXT + " ENFORCED BY THE SERVER: search_rvs returns status=needs_discovery with results=[] until every question is answered. ASK, DON'T ASSUME: never fill an answer the shopper hasn't given. 'Family' is not a party size, a budget is not a payment method, and silence is not 'no length limit'. When you get needs_discovery, ask its nextQuestion (one question, with its reason) and wait. Skipping counts only when the shopper literally asks: pass shopper_requested_results_now=true with their exact words in shopper_words, show results, then ask resumeQuestions. SHORTLIST: search_rvs returns the 3 best fits (three different model lines) by default (more, up to 10, only if the shopper asks). Present them as a shortlist and never quote or estimate how many RVs matched or exist, including for a named model. After products, ask whether they want to contact the dealer (DEALER INQUIRIES). MAKE/MODEL: always pass make and model to search_rvs when the shopper names them (e.g. make=Tiffin, model=Allegro RED), and never substitute another brand or series without asking. FUEL: pass fuel_type only when the shopper explicitly says gas or diesel; never infer it from 'gas mileage', 'propane' or 'gas or diesel is fine', and never bring fuel up unprompted. LENGTH RULE: when a shopper states a max length, ask whether it is for storage (physical fit; NEVER exceed it) or comfort. If comfort, ask permission to keep the gate open 1-2 ft longer; only approved comfort flexibility widens the cap, by exactly +2 ft. Pass length_max_ft, length_reason and length_flex_approved. TOW: 'Under 6,000 lbs my F-150 can tow' is a WEIGHT CEILING, not a request for the smallest trailer. Tow fit is PRELIMINARY until payload (yellow door sticker) or an exact stated rating is known: quote GVWR (never dry weight alone), tongue = 10-15% of GVWR. 1-2 sleepers / no kids = couples layouts first; 3+ or kids = sleeping capacity first. Explain every pick in lifestyle terms with its tradeoff, and never pad to three. " +
        "MatchRV searches a nationwide US dealer inventory snapshot. It is not restricted to the Pacific Northwest. Coverage varies by dealer, state and requested features. State-only locations (Florida or FL) search that state; city locations (Tampa, FL) use a radius. Ask a relevant Outfitter follow-up when it affects recommendations, and clarify ambiguous preferences in the conversation. Never describe external web listings as MatchRV results. ALWAYS pass location (e.g. location=\"Fife, WA\") for local searches — never present out-of-area inventory as a local match; if coverage.no_local_matches is true, say so and offer to widen radius. Don't cite inventory totals or match counts to the shopper. sleepsConfirmed=false means capacity was inferred, so disclose that; towFit='verify tow fit' means nobody has checked it against their vehicle yet, so say so. Never claim towing safety from a generic vehicle model. VIN lookup is not available through this MCP server.",
    },
  );

  server.registerResource("matchrv-shopper", SHOPPER_URI, { title: "MatchRV shopper", mimeType: "text/html;profile=mcp-app" }, async () => ({
    contents: [{ uri: SHOPPER_URI, mimeType: "text/html;profile=mcp-app", text: SHOPPER_HTML, _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } }, "openai/ui": { availableDisplayModes: ["fullscreen"], preferredDisplayMode: "fullscreen" } } }],
  }));

  server.registerTool(
    "teach_outfitter",
    {
      title: "Teach the Outfitter (long-term memory)",
      description:
        "Remember a fact the shopper confirmed, for THIS shopper only: their vehicle's exact tow rating or door-sticker payload (vehicle + tow_rating_lbs/payload_lbs), or a confirmed spec for one unit (unit_id + field + value; fields: sleeps, gvwrLbs, dryWeightLbs, hitchWeightLbs, freshWaterGal, bunkhouse). This is the only tool that writes memory. Facts are scoped to the shopper's ChatGPT identity / MCP session (or the returned session_key) and are never shown to other shoppers; they expire after 30 days of inactivity. Only teach facts the shopper actually confirmed — never guesses.",
      inputSchema: mcpSchema(z.object({
        vehicle: z.string().max(120).optional(),
        tow_rating_lbs: z.number().min(1000).max(40000).optional(),
        payload_lbs: z.number().min(500).max(10000).optional(),
        unit_id: z.string().min(3).max(120).optional(),
        field: z.enum(["sleeps", "gvwrLbs", "dryWeightLbs", "hitchWeightLbs", "freshWaterGal", "bunkhouse"]).optional(),
        value: z.union([z.number(), z.boolean()]).optional(),
        source: z.string().max(80).optional(),
        session_key: sessionKeyField,
      })),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input, ctx) => {
      const wantsVehicle = Boolean(input.vehicle && (input.tow_rating_lbs != null || input.payload_lbs != null));
      const wantsUnit = Boolean(input.unit_id && input.field && input.value !== undefined);
      if (!wantsVehicle && !wantsUnit) return textResult({ error: "nothing_to_learn", guidance: "Pass vehicle + tow_rating_lbs/payload_lbs, or unit_id + field + value." }, true);
      let scope = resolveScope(ctx, input.session_key);
      let issuedKey: string | null = null;
      if (scope.source === "none") { issuedKey = newSessionKey(); scope = resolveScope(null, issuedKey); }
      const memory = writableScope(scope);
      const scopeInfo = { scope: scope.source, ...(issuedKey ? { session_key: issuedKey, sessionKeyGuidance: "Pass this session_key on later MatchRV calls in this conversation so the fact is recalled. Do not share it." } : {}) };
      if (wantsVehicle) {
        const rec = memory.learnVehicle(input.vehicle!, { towRatingLbs: input.tow_rating_lbs ?? null, payloadLbs: input.payload_lbs ?? null }, input.source ?? "customer-stated");
        return textResult({ learned: rec, ...scopeInfo, note: "Stored for this shopper only. Tow evaluations in this scope will recall it (labelled learned). Other shoppers never see it." });
      }
      const rec = memory.learnUnitFact(input.unit_id!, input.field!, input.value!, input.source ?? "customer-confirmed");
      return textResult({ learned: rec, ...scopeInfo, note: "Stored for this shopper only as an overlay with 'learned' provenance; it appears in this shopper's get_rv/search results for this unit." });
    },
  );

  server.registerTool(
    "outfitter_memory",
    {
      title: "What the Outfitter has learned",
      description:
        "Read what MatchRV remembers for THIS shopper (facts they taught via teach_outfitter) plus MatchRV-curated reference facts, each with confirmation counts and sources. Read-only. Use it to check for a remembered rating before asking again.",
      inputSchema: mcpSchema(z.object({ vehicle: z.string().max(120).optional(), session_key: sessionKeyField })),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input, ctx) => {
      const scope = resolveScope(ctx, input.session_key);
      const own = peekScope(scope);
      const curatedStats = getCuratedStore().stats();
      return textResult({
        scope: scope.source,
        yourMemory: own ? { vehicles: own.stats().recentVehicles, unitFacts: own.stats().recentUnitFacts } : { vehicles: [], unitFacts: [] },
        curated: { vehicles: curatedStats.vehicles, unitFacts: curatedStats.unitFacts },
        ...(input.vehicle ? { recall: recallVehicle(scope, input.vehicle) } : {}),
        note: "Shopper-taught facts are private to this shopper/conversation and expire after 30 days of inactivity. Curated facts are reviewed by MatchRV. Everything learned is labelled learned — never presented as manufacturer data.",
      });
    },
  );

  server.registerTool(
    "outfitter_discovery",
    {
      title: "RV fit interview: next question and search constraints",
      description:
        "Returns the next question in MatchRV's guided RV-fit interview and, once enough fit facts are known, the search constraints for search_rvs. It takes only RV-fit facts: RV type, make or model, use category, desired features, party size, tow vehicle (or what a motorhome will tow), length limit, shopping area and radius, and budget with payment method (plus down and monthly payment if financing). Conversation-only questions (time off, who's buying, a trade-in, planned trips) are tracked by step name in covered_steps; their answers are never sent to MatchRV. Every input is optional, and the shopper may decline any question (declined_questions); a covered or declined step is never asked again. This tool never asks for names, contact details, income or credit, stores nothing, and contacts no one. Returns: status (needs_discovery, ready_for_products, or answer_directly when request_kind is general_question); nextQuestion (exactly one, with its step and a short reason for asking, to ask close to word for word; the trade question carries a followUp for when they have one); knownSummary; and, when readyForProducts is true, searchConstraints for search_rvs. Stateless and read-only: pass the fit facts and covered_steps gathered so far on every call.",
      inputSchema: mcpSchema(profileInput),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      const profile = discoveryProfile(input as Record<string, any>);
      const nothingKnown = roadKnownSummary(profile).length === 0;
      if (input.request_kind === "greeting" && nothingKnown) {
        return textResult({
          route: "welcome",
          welcome: SHERPA_WELCOME,
          step: { id: ROAD_TO_SALE_STEPS[0].id, number: ROAD_TO_SALE_STEPS[0].number, title: ROAD_TO_SALE_STEPS[0].title },
          readyForProducts: false,
          readyToSearch: false,
          nextQuestions: [],
          nextQuestion: null,
          guidance: "Send this welcome (verbatim or very close) and wait. General questions or comparisons go to outfitter_guide; if they want help finding an RV, call outfitter_discovery again with any fit facts they gave.",
        });
      }
      const road = assessRoadToSale(profile);
      const route = input.request_kind === "general_question" ? "education" : profile.makes?.length || profile.models?.length ? "specific_rv" : "help_choose";
      if (route === "education") {
        // Not an RV search: answer it directly. No gate, no questions first.
        return textResult({
          status: "answer_directly",
          route,
          readyForProducts: road.readyForProducts,
          nextQuestions: [],
          pendingQuestions: road.nextQuestions,
          knownSummary: road.knownSummary,
          guidance: "This is a question, not an RV search. Answer it directly and honestly (outfitter_guide helps), without asking the interview questions first. Afterward you may offer to help them find one; if they want that, ask pendingQuestions then.",
        });
      }
      return textResult({
        status: road.readyForProducts ? "ready_for_products" : "needs_discovery",
        route,
        ...(road.readyForProducts ? {} : { instruction: ASK_DONT_ASSUME }),
        ...road,
        readyToSearch: road.readyForProducts,
        nextQuestion: road.nextQuestions[0] ?? null,
        missingEssentials: road.missingForProducts,
        guidance: road.readyForProducts
          ? "Every interview step is covered. Briefly reflect what you heard, then call search_rvs with the same fit facts and covered_steps (searchConstraints shows what will be applied). Present a shortlist of three, tying each to what they told you. Tow verdicts stay preliminary until payload or an exact rating is supplied."
          : `${route === "specific_rv" ? "They named a specific RV; that answers what they want, not the other questions. Don't look it up or say how many exist yet. " : ""}Ask nextQuestion (exactly one question, with its reason, close to word for word), then STOP and wait. When they answer, add nextQuestion.step to covered_steps (if step is null, it's a fit-fact follow-up: pass the field named in nextQuestion.fills instead) and pass any fit fact the answer implies (e.g. use_type, desired_features, party_size, tow_vehicle, length_max_ft, location, payment_method, budget_max_usd). Keep conversation-only answers (time off, who's buying, the trade, trips) in the chat; don't send them. If the trade question gets a yes, ask its followUp next, then mark trade covered. Never re-ask anything in knownSummary or covered_steps, and never fill an answer in yourself.`,
      });
    },
  );

  server.registerTool(
    "outfitter_guide",
    {
      title: "RV Outfitter buyer guides",
      description:
        "MatchRV's buyer education, distilled from its published guides and the Road to the Sale method. Topics: road_to_sale (how buying works, step by step), how_to_pay (the six ways: cash, difference, finance, discount, ad shopper, special finance; out-the-door math), owners_and_credit, campsite_setup, tow_basics, motorhome_vs_trailer, trailer_vs_fifth_wheel, families, full_time, used_buying, costs, financing. Use it for 'how does this work / which is better / how should I pay / how do I set up camp' questions BEFORE any inventory search: teach first, never pressure. Pass topic for an exact guide or query to search. Towing points defer to evaluate_tow_fit for the buyer's actual vehicle, so never quote a model-level tow table.",
      inputSchema: mcpSchema(z.object({
        topic: z.enum(["road_to_sale", "how_to_pay", "owners_and_credit", "campsite_setup", "tow_basics", "motorhome_vs_trailer", "trailer_vs_fifth_wheel", "families", "full_time", "used_buying", "costs", "financing"]).optional(),
        query: z.string().max(160).optional(),
      })),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      const topics = input.topic ? [getGuide(input.topic)].filter((g): g is NonNullable<typeof g> => Boolean(g)) : searchGuides(input.query ?? "");
      return textResult({
        topics: topics.slice(0, 3).map((g) => ({ id: g.id, title: g.title, source: g.source, points: g.points })),
        ...(topics.length === 0 ? { guidance: "No guide matches; answer generally and honestly, or offer to start discovery with outfitter_discovery.", availableTopics: GUIDE_TOPICS.map((g) => g.id) } : {}),
      });
    },
  );

  server.registerTool(
    "search_rvs",
    {
      title: "Search and match RVs",
      description:
        "Search nationwide US MatchRV dealer inventory (Road to the Sale step 3). Pass make (e.g. \"Tiffin\") and model (series, e.g. \"Allegro RED\", \"Phaeton\", \"Allegro Bus\", \"Allegro Open Road\", \"Wayfarer\") whenever the shopper names them. They are hard filters, and the brand is reconciled from the listing title, so mislabelled dealer records are handled. model accepts several values; exclude_makes/exclude_models drop what they ruled out. Pass fuel_type ONLY when the shopper explicitly asks for gas or diesel. \"Motorhome\" means Class A, B or C. Inputs are RV-fit facts only (type, make/model, use category, desired features, party size, tow vehicle or towed vehicle, length limit, area and radius, budget with payment method), plus covered_steps / declined_questions: the interview steps already asked or declined, by name only. Conversation-only answers (time off, who's buying, a trade-in, planned trips) are never sent. Every input is optional. This tool never asks for names, contact details, income or credit, stores nothing, and contacts no one; contacting a dealer is a separate step that needs the shopper's explicit approval. ASK, DON'T ASSUME: pass only answers the shopper actually gave, and pass every one you have on each call. Until every interview step is covered (or declined), it returns status=needs_discovery with results=[] and exactly one nextQuestion (with its step and reason for asking); ask that one question and wait. A named make/model does not skip the questions. Skip only when the shopper literally asks: pass shopper_requested_results_now=true with their words in shopper_words; it shows results and returns resumeQuestions. Results are a shortlist of the 3 best fits from different model lines (limit up to 10 only when the shopper asks for more); never quote a total match count or how many of a model exist. Clarify ambiguous shopper needs, confirm approved flexibility, and preserve every hard constraint. State-wide location example: Florida; city-radius example: Tampa, FL. Pass location (city like \"Fife, WA\") to hard-filter by distance — never invent local matches from FL/AZ when the shopper asked for Washington. Also accept query (short search keywords like \"travel trailer sleeps 8\", not the shopper's message), sleeps_min, radius_miles, and structured constraints (priceMaxUsd, rvTypes, sleepsMin, lengthMinFt/lengthMaxFt, fuelType, horsepowerMin, torqueMinLbFt, trailerWeightLbs, trailerTongueLbs, coachLoadedWeightLbs). Use horsepowerMin/torqueMinLbFt only when the shopper states a minimum; use horsepowerPreferred/torquePreferredLbFt for \"preferred\". A minimum is never relaxed: an unknown rating is 'needs verification', never a match, and a lower rating is excluded. Motorhome rows include fuel, hp, torqueLbFt, hitchTowRatingLbs and gcwrLbs (null = not published). If coverage.no_local_matches, say there is no local inventory and offer to widen radius. sleepsConfirmed tells you whether capacity is dealer-published or inferred.",
      _meta: { ui: { resourceUri: SHOPPER_URI, visibility: ["model", "app"] } },
      inputSchema: mcpSchema(searchInput),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input, ctx) => {
      try {
        const t0 = performance.now();
        const parsedQuery = parseShopperText(input.query);
        const fromQuery = parsedQuery.constraints;
        const topLocation = input.location || (!input.constraints?.location?.place ? placeFromText(input.query) ?? undefined : undefined);
        const fromTop: Partial<Constraints> = {};
        if (topLocation) {
          fromTop.location = {
            place: topLocation.replace(/^near\s+/i, "").trim(),
            radiusMiles: input.radius_miles ?? 150,
          };
        } else if (input.radius_miles != null && input.constraints?.location?.place) {
          fromTop.location = {
            place: input.constraints.location.place,
            radiusMiles: input.radius_miles,
          };
        }
        if (input.sleeps_min != null) fromTop.sleepsMin = input.sleeps_min;
        if (input.condition != null) fromTop.condition = input.condition;
        if (input.price_max_usd != null) fromTop.priceMaxUsd = input.price_max_usd;
        if (input.price_min_usd != null) fromTop.priceMinUsd = input.price_min_usd;
        if (input.sort != null) fromTop.sort = input.sort;
        if (input.make != null) fromTop.makes = asList(input.make);
        if (input.model != null) fromTop.models = asList(input.model);
        if (input.exclude_makes?.length) fromTop.excludeMakes = input.exclude_makes;
        if (input.exclude_models?.length) fromTop.excludeModels = input.exclude_models;
        if (input.fuel_type != null) fromTop.fuelType = input.fuel_type;
        if (input.rv_types?.length) fromTop.rvTypes = input.rv_types;
        if (input.tow_vehicle) fromTop.towVehicle = input.tow_vehicle;
        Object.assign(fromTop, fitPreferences(input as Record<string, unknown>));

        const baseConstraints = normalizeMakeModel(mergeConstraints(
          cleanConstraints(input.constraints as Record<string, unknown>),
          fromTop,
          fromQuery,
        ));
        // "None yet" / "not sure" is the shopper's answer about the tow
        // vehicle, not a vehicle: record it, and never tow-filter on it.
        const towVehicleUnknown = Boolean(baseConstraints.towVehicle && isNoTowVehicleAnswer(baseConstraints.towVehicle));
        if (towVehicleUnknown) delete baseConstraints.towVehicle;
        const waiver = verifiedWaiver(input);
        const profile = withTextFacts(profileFrom(input as unknown as Record<string, unknown>, baseConstraints, { waived: waiver.waived, towVehicleUnknown }), input.query);
        const discovery = assessDiscovery(profile);
        const road = assessRoadToSale(profile);
        const scope = resolveScope(ctx, input.session_key);
        const wantsMakeModel = Boolean(baseConstraints.makes?.length || baseConstraints.models?.length);
        // Server-side discovery gate. No host flag bypasses it: only the
        // facts themselves, or a "just show me" verified in the shopper's words.
        const gated = !road.readyForProducts || !discovery.readyToSearch;
        if (gated) {
          const questions = road.nextQuestions.length ? road.nextQuestions : discovery.nextQuestion ? [{ ...discovery.nextQuestion, goal: "goal_1_want_and_use", blocking: true }] : [];
          const modelCount = wantsMakeModel ? makeModelCount(applyMemory(scope, candidateUnits(baseConstraints.location?.place)), baseConstraints) : null;
          return textResult({
            status: "needs_discovery",
            results: [],
            instruction: ASK_DONT_ASSUME,
            step: road.step,
            goal: road.goal,
            knownProfile: profile,
            knownSummary: road.knownSummary,
            missingForProducts: road.missingForProducts,
            missingEssentials: road.missingForProducts,
            nextQuestions: questions,
            nextQuestion: questions[0] ?? null,
            ...(waiver.rejected ? { waiverRejected: waiver.rejected } : {}),
            ...(parsedQuery.fuelMentionUnclear ? { fuelNote: "The shopper mentioned gas/diesel without a clear request. No fuel filter was applied; ask only if it matters to them." } : {}),
            guidance: "No RVs were returned on purpose. Ask nextQuestion (exactly one question, with its short reason for asking, close to word for word) in one friendly message, then STOP and wait for the shopper's answer. Don't re-ask anything in knownSummary. Do not show, rank, describe or count any RV yet (not even how many of a named model exist), and do not fill these answers in yourself. When the shopper answers, call search_rvs again with everything known so far plus their new answers. Only if the shopper literally asks to skip the questions, retry with shopper_requested_results_now=true and their words in shopper_words.",
          }, false, modelCount ? { "matchrv/internal": { modelCount, note: "Internal diagnostics. Never quote these counts to the shopper." } } : undefined);
        }
        const constraints = mergeConstraints(profileToConstraints(profile), baseConstraints);
        constraints.sherpa = profileToConstraints(profile).sherpa;
        // Road to the Sale: the clarified length cap (storage-exact, or
        // comfort +2 only with explicit approval) overrides any raw cap.
        const effLen = profileToConstraints(profile).lengthMaxFt;
        if (effLen != null) constraints.lengthMaxFt = effLen;
        if (profile.sleepers != null && constraints.sleepsMin == null) constraints.sleepsMin = profile.sleepers;

        // READ-ONLY: recall this shopper's own (or curated) memory; never write.
        const learnedVehicle = profile.towVehicle ? recallVehicle(scope, profile.towVehicle) : null;
        const learnedTow = learnedVehicle?.towRatingLbs != null && profile.truckTowRatingLbs == null
          ? { towRatingLbs: learnedVehicle.towRatingLbs, confirmations: learnedVehicle.confirmations, source: learnedVehicle.source }
          : null;
        const place = constraints.location?.place;
        const corpus = applyMemory(scope, candidateUnits(place));
        const outcome = runSearch(corpus, constraints, learnedTow);
        const shortlistSize = Math.min(10, Math.max(1, input.limit ?? SHORTLIST_DEFAULT));
        const ranked = diversifyShortlist(shortlistOrder(outcome.results), shortlistSize);
        const compact = compactSearchResult({ ...outcome, results: ranked }, shortlistSize);
        const towable = isTowableSearch(profile) || Boolean(profile.rvTypes?.some((t) => (TOWED_RV_TYPES as readonly string[]).includes(t)));
        const shortlist = (compact.results as Record<string, unknown>[]).map((row, i) => ({ ...row, ...towFitFlag(ranked[i], { towVehicleGiven: Boolean(constraints.towVehicle), towVehicleUnknown, towable }) }));
        const { funnel, coverage, note: _note, results: _r, ...rest } = compact as Record<string, any>;
        const makeModelSummary = wantsMakeModel ? makeModelCount(corpus, constraints) : null;
        const inventoryQuality = getInventory().inventoryQuality;
        const ms = Math.round(performance.now() - t0);
        // Totals stay out of the shopper-facing payload (the model sees
        // content + structuredContent). They ride in _meta for the widget/logs.
        const internal = { "matchrv/internal": { funnel, unitsInArea: coverage?.units_in_area ?? null, nationwideTotal: coverage?.nationwide_total ?? null, ...(makeModelSummary ? { makeModelSummary } : {}), note: "Internal diagnostics. Never quote these counts to the shopper." } };
        return textResult({
          status: "shortlist",
          ...rest,
          coverage: { requested_area: coverage?.requested_area ?? null, radius_miles: coverage?.radius_miles ?? null, scope: coverage?.scope ?? "nationwide", no_local_matches: coverage?.no_local_matches ?? false },
          results: shortlist,
          shortlist: { size: shortlist.length, requested: shortlistSize, note: `These are the ${shortlist.length || "no"} best fits, not a sample. Present them as a shortlist. Don't quote or estimate how many total matches exist.` },
          ...(shortlist.length === 0 ? { guidance: compact.guidance } : {}),
          inventoryQuality,
          appliedConstraints: outcome.appliedConstraints,
          timingMs: ms,
          source: "MatchRV nationwide inventory snapshot",
          ...(parsedQuery.fuelMentionUnclear ? { fuelNote: "The shopper mentioned gas/diesel without a clear request. No fuel filter was applied; ask only if it matters to them." } : {}),
          roadToSale: {
            step: road.waived && !road.readyForProducts ? { id: "present_products", number: 3, title: "Present products that fit needs and budget" } : road.step,
            waived: road.waived,
            nextQuestions: road.nextQuestions,
            resumeQuestions: road.waived ? road.resumeQuestions.length ? road.resumeQuestions : road.nextQuestions : [],
            missingForProducts: road.missingForProducts,
          },
          sherpa: {
            knownSummary: road.knownSummary,
            readyToSearch: true,
            towStatus: profile.truckPayloadLbs != null || profile.truckTowRatingLbs != null ? "payload-aware" : profile.towVehicle ? "preliminary - payload/rating not yet confirmed" : towVehicleUnknown ? "no tow vehicle yet - every towable needs a tow-fit check" : "not requested",
            memoryHint: profile.towVehicle && (profile.truckTowRatingLbs != null || profile.truckPayloadLbs != null) ? "This search used the rating/payload stated in this request but did not store it. If the shopper wants MatchRV to remember it, call teach_outfitter." : null,
            memory: learnedTow ? `Recalled a LEARNED rating for this vehicle (${learnedTow.towRatingLbs.toLocaleString()} lbs, confirmed ${learnedTow.confirmations}x). Say it is learned, and ask the shopper to confirm it matches their exact truck.` : null,
            nextQuestion: profile.towVehicle && profile.truckPayloadLbs == null && profile.truckTowRatingLbs == null
              ? "What does the yellow payload sticker inside your driver's door say ('combined weight of occupants and cargo should never exceed ___ lbs')? That turns this preliminary fit into a real one."
              : null,
          },
          outfitterGuidance: "Briefly confirm what the shopper told you, then present this shortlist (up to three best fits). Explain each pick in lifestyle terms: why it fits how they camp, plus its tradeoff. Flag every unknown (sleepsConfirmed=false, towFit='verify tow fit', unknown fields) instead of filling it in. Never pad the list, and never mention a total match count. Tow verdicts are preliminary until payload/exact rating is known. Road to the Sale step 4: once they like a unit, ask whether they'd like to contact the dealership; if yes, use prepare_dealer_inquiry and get their explicit approval before send_dealer_inquiry. VIN lookup is unavailable through MCP.",
          nextStep: `Present the shortlist and its unknowns honestly. ${makeModelSummary ? "They named a make/model: never pad the list with other brands or series. " : ""}Don't say how many RVs matched in total. ${road.waived && (road.resumeQuestions.length || road.nextQuestions.length) ? "They asked to skip the questions, so after the results, come back to roadToSale.resumeQuestions, one question per turn. " : road.nextQuestions.length ? "Then ask roadToSale.nextQuestions, one per turn, never an interrogation. " : ""}Do not claim a hitch rating verifies towing capacity. Do not widen limits without explicit permission.`,
        }, false, internal);
      } catch (error) {
        return textResult(
          {
            error: "search_failed",
            detail: error instanceof Error ? error.message : String(error),
            guidance:
              error instanceof Error && error.message.includes("Unknown place")
                ? "Ask for a nearby supported US city and state, or use the state name for state-wide inventory. An unresolved city is not evidence that MatchRV lacks inventory in that state."
                : undefined,
          },
          true,
        );
      }
    },
  );

  server.registerTool(
    "get_rv",
    {
      title: "Get RV details",
      description:
        "Get the full canonical MatchRV record for one unit returned by search_rvs, including dealer, specs, price, features, source/provenance, freshness, and explicit unknowns. Motorhomes include a powertrainAndTowing section (what powers it / what it can carry / what it can tow), each value with its status. Never invent missing specifications or assign an engine family's top rating to a unit.",
      _meta: { ui: { resourceUri: SHOPPER_URI, visibility: ["model", "app"] } },
      inputSchema: mcpSchema(getRvInput),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ unit_id, session_key }, ctx) => {
      const inv = getInventory();
      const raw = inv.byId.get(unit_id);
      const unit = raw ? applyMemoryToUnit(resolveScope(ctx, session_key), raw) : raw;
      if (!unit) return textResult({ error: inv.quarantined.has(unit_id) ? "unit_quarantined" : "unit_not_found", issues: inv.quarantined.get(unit_id), guidance: "Use an eligible unit_id returned by search_rvs. Withheld records need source review." }, true);
      const powertrainAndTowing = powertrainReport(unit);
      return textResult({ unit, ...(powertrainAndTowing ? { powertrainAndTowing } : {}), dataset: { builtAt: inv.snapshot.builtAt, note: inv.snapshot.datasetNote } });
    },
  );

  server.registerTool(
    "compare_rvs",
    {
      title: "Compare RVs",
      description:
        "Compare 2-4 MatchRV units side by side against the buyer's constraints. Keeps unknown values explicit and returns deterministic comparison evidence rather than guessed specifications.",
      _meta: { ui: { resourceUri: SHOPPER_URI, visibility: ["model", "app"] } },
      inputSchema: mcpSchema(compareInput),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ unit_ids, constraints, session_key }, ctx) => {
      const inv = getInventory();
      const scope = resolveScope(ctx, session_key);
      const units = unit_ids.map((id) => { const u = inv.byId.get(id); return u ? applyMemoryToUnit(scope, u) : u; });
      const missing = unit_ids.filter((_id, index) => !units[index]);
      if (missing.length) return textResult({ error: "unit_not_found", unit_ids: missing }, true);
      try {
        const typedUnits = units.filter((u): u is NonNullable<typeof u> => Boolean(u));
        return textResult({ comparison: compareUnits(typedUnits, cleanConstraints(constraints)), units: typedUnits });
      } catch (error) {
        return textResult({ error: "compare_failed", detail: error instanceof Error ? error.message : String(error) }, true);
      }
    },
  );

  server.registerTool(
    "evaluate_tow_fit",
    {
      title: "Evaluate tow fit",
      description:
        "Evaluate weight fit between a shopper-stated tow vehicle and 1-6 RVs, or (with trailer_weight_lbs) whether 1-6 motorhomes can tow a loaded trailer. Motorhome mode checks each limit separately — loaded coach vs GVWR first, then hitch tow rating, GCWR, tongue limit and axle loads — and never reports 'safe'; the best result is 'not yet confirmed' with the ratings that clear. This is screening guidance, not a towing-safety guarantee.",
      _meta: { ui: { resourceUri: SHOPPER_URI, visibility: ["model", "app"] } },
      inputSchema: mcpSchema(towInput),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ vehicle, unit_ids, trailer_weight_lbs, trailer_tongue_lbs, coach_loaded_weight_lbs, truck_payload_lbs, passengers_lbs, cargo_lbs, session_key }, ctx) => {
      const inv = getInventory();
      // READ-ONLY: a rating stated here is used for this answer only, never stored.
      const scope = resolveScope(ctx, session_key);
      const explicitResolution = vehicle ? resolveTowVehicle(vehicle) : null;
      const learnedVehicle = vehicle ? recallVehicle(scope, vehicle) : null;
      const resolution = vehicle
        ? resolveTowVehicle(vehicle, learnedVehicle?.towRatingLbs != null && explicitResolution?.statedRatingLbs == null ? { towRatingLbs: learnedVehicle.towRatingLbs, confirmations: learnedVehicle.confirmations, source: learnedVehicle.source } : null)
        : null;
      const fits = [];
      const motorhomeTow = [];
      for (const id of unit_ids) {
        const unit = inv.byId.get(id);
        if (!unit) return textResult({ error: "unit_not_found", unit_id: id }, true);
        if (resolution) fits.push({ ...evaluateTowFit(unit, resolution), unit_id: id, title: unit.title });
        if (trailer_weight_lbs) motorhomeTow.push({ ...evaluateMotorhomeTow(unit, trailer_weight_lbs, { tongueLbs: trailer_tongue_lbs, coachLoadedLbs: coach_loaded_weight_lbs }), title: unit.title });
      }
      const payloadFits = truck_payload_lbs != null
        ? unit_ids.map((id) => {
            const unit = inv.byId.get(id)!;
            return { unit_id: id, title: unit.title, ...evaluatePayloadFit(unit, { truckPayloadLbs: truck_payload_lbs, passengersLbs: passengers_lbs ?? null, cargoLbs: cargo_lbs ?? null }) };
          })
        : [];
      return textResult({
        ...(payloadFits.length ? { payloadFits, payloadNote: "Tongue estimated at 10-15% of GVWR (loaded), not the published empty hitch weight. Payload usually runs out before tow rating." } : {}),
        ...(resolution ? { resolution, fits } : {}),
        ...(motorhomeTow.length ? { motorhomeTow } : {}),
        safetyNotice: "Verify the exact vehicle configuration, weighed coach and axle loads, GVWR/GCWR, hitch and tongue limits, passengers and cargo before towing. Engine horsepower and torque do not override any weight limit.",
      });
    },
  );

  server.registerTool(
    "prepare_dealer_inquiry",
    {
      title: "Preview a dealer inquiry (sends nothing)",
      description:
        "Step 1 of contacting a dealership about one RV. Use only when the shopper asks to contact the dealer. Takes unit_id (from search_rvs/get_rv), the shopper's name, email and/or phone, and their message. Validates them and returns the exact preview — dealership name and location, RV title, VIN, stock number, price, the shopper's contact details, the message, and how MatchRV will deliver it — plus a confirmation_token valid for 30 minutes. NOTHING IS SENT. Show the whole preview to the shopper and ask them to approve it before calling send_dealer_inquiry.",
      inputSchema: mcpSchema(z.object({
        unit_id: z.string().min(3).max(120),
        name: z.string().min(1).max(120).describe("Shopper's name, as they provided it"),
        email: z.string().max(160).optional().describe("Shopper's email, as they provided it"),
        phone: z.string().max(40).optional().describe("Shopper's phone, as they provided it"),
        message: z.string().min(1).max(1500).describe("Message to the dealership, written or approved by the shopper"),
      })),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) => {
      const unit = getInventory().byId.get(input.unit_id);
      if (!unit) return textResult({ error: "unit_not_found", guidance: "Use a unit_id returned by search_rvs." }, true);
      const prepared = prepareInquiry(unit, { name: input.name, email: input.email ?? null, phone: input.phone ?? null, message: input.message });
      if (!prepared.ok) return textResult({ error: "invalid_contact", errors: prepared.errors, guidance: "Ask the shopper to correct these fields. Nothing was sent." }, true);
      return textResult({
        status: "preview_only_nothing_sent",
        preview: prepared.preview,
        confirmation_token: prepared.confirmationToken,
        expiresAt: prepared.expiresAt,
        next: "Show this full preview to the shopper. Only if they explicitly approve sending it, call send_dealer_inquiry with this confirmation_token and confirmed=true. If they want changes, call prepare_dealer_inquiry again.",
      });
    },
  );

  server.registerTool(
    "send_dealer_inquiry",
    {
      title: "Send the approved dealer inquiry",
      description:
        "Step 2: sends the inquiry previewed by prepare_dealer_inquiry. Consequential — it shares the shopper's name, contact details and message outside MatchRV. Call only after the shopper explicitly approved the exact preview, with confirmed=true. The content is locked to the preview (it cannot be changed here). Returns an inquiry_id, a private status_token and an honest status: delivered (emailed to a dealership that accepts MatchRV inquiries), queued_for_matchrv (MatchRV staff were alerted and will forward it; not yet at the dealer), or failed (tell the shopper to contact the dealership directly). Never retry automatically and never claim the dealer has replied.",
      inputSchema: mcpSchema(z.object({
        confirmation_token: z.string().min(10).max(4000),
        confirmed: z.boolean().describe("Must be true, and only after the shopper explicitly approved the preview"),
        dry_run: z.boolean().optional().describe("Testing only: validate and record without delivering to anyone"),
      })),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (input, ctx) => {
      const scope = resolveScope(ctx, null);
      const result = await sendInquiry({
        confirmationToken: input.confirmation_token,
        confirmed: input.confirmed,
        dryRun: input.dry_run,
        requesterKey: scope.id ? `scope:${scope.id}` : `ip:${(ctx as { http?: { req?: Request } }).http?.req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous"}`,
        scope: scope.id,
        lookupUnit: (id) => getInventory().byId.get(id),
      });
      if (!result.ok) return textResult({ error: result.code, guidance: result.guidance, sent: false }, true);
      return textResult({
        inquiry_id: result.inquiry.inquiryId,
        ...(result.duplicate ? { duplicate: true, guidance: "The shopper already sent this RV's dealership an inquiry in the last 24 hours, so it was not sent again." } : { status_token: result.statusToken }),
        status: result.inquiry.status,
        statusDetail: result.inquiry.statusDetail,
        inquiry: result.inquiry,
        next: "Tell the shopper exactly what the status means. They can ask for an update later; call get_dealer_inquiry_status with inquiry_id and status_token.",
      });
    },
  );

  server.registerTool(
    "get_dealer_inquiry_status",
    {
      title: "Check a dealer inquiry",
      description:
        "Read-only status of an inquiry this shopper sent: delivered / queued_for_matchrv / failed / dry_run, plus the dealership's reply only if MatchRV has recorded one. Requires the inquiry_id and private status_token returned by send_dealer_inquiry; other shoppers' inquiries are never visible.",
      inputSchema: mcpSchema(z.object({ inquiry_id: z.string().min(5).max(60), status_token: z.string().min(10).max(80) })),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      const inquiry = getInquiryStatus(input.inquiry_id, input.status_token);
      if (!inquiry) return textResult({ error: "not_found", guidance: "Unknown inquiry_id or wrong status_token." }, true);
      return textResult({ inquiry });
    },
  );

  return server;
}

export const matchRvMcpHandler = createMcpHandler(() => buildMatchRvServer());
export const matchRvMcpNodeHandler = toNodeHandler(matchRvMcpHandler);
