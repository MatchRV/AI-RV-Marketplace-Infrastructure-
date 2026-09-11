/**
 * WebMCP tool contracts — the single source of truth.
 *
 * Each tool's input schema is defined once in Zod and used twice:
 *   1. compiled to JSON Schema for `document.modelContext.registerTool()`
 *      (what the agent sees), and
 *   2. parsed server-side on every request (what actually gets enforced).
 * An agent can therefore never reach the engine with arguments the schema
 * it was shown doesn't allow — "validate strictly in code, loosely in
 * schema" per the WebMCP best-practices guidance.
 */

import { z } from "zod/v4";

// ── Shared vocab ───────────────────────────────────────────────────────────

export const rvTypeEnum = z.enum([
  "travel_trailer",
  "fifth_wheel",
  "toy_hauler",
  "class_a",
  "class_b",
  "class_c",
  "popup_camper",
  "truck_camper",
]);

export const featureEnum = z.enum([
  "bunkhouse",
  "solar",
  "solar_prep",
  "lithium",
  "generator",
  "four_season",
  "outdoor_kitchen",
  "two_entry_doors",
]);

export const sortEnum = z.enum([
  "best_match",
  "price_asc",
  "price_desc",
  "distance",
  "newest_model_year",
]);

const unitId = z.string().min(3).max(120).describe("MatchRV unit id from search results (e.g. vin:4X4T...)");

// ── Tool input schemas ─────────────────────────────────────────────────────

export const searchInventoryInput = z.object({
  intent_summary: z.string().max(200).optional()
    .describe("One human-readable line of what the shopper asked for; shown in the page's activity feed"),
  mode: z.enum(["refine", "replace"]).optional()
    .describe("refine (default) merges into the current shared constraints; replace starts over"),
  clear: z.array(z.enum([
    "location", "price_max", "price_min", "rv_types", "condition", "length_max_ft",
    "length_min_ft", "max_weight_lbs", "tow_vehicle", "sleeps_min", "must_have",
    "prefer", "fresh_water_min_gal", "boondocking", "sort",
  ])).optional().describe("Constraint keys to remove while refining"),
  place: z.string().max(80).optional().describe("Shopper location, city name (e.g. 'Tacoma')"),
  radius_miles: z.number().min(1).max(3000).optional().describe("Search radius from place; default 150"),
  price_max: z.number().min(0).max(2_000_000).optional().describe("Hard price ceiling, USD"),
  price_min: z.number().min(0).max(2_000_000).optional(),
  rv_types: z.array(rvTypeEnum).max(8).optional().describe("Acceptable RV types; omit for all"),
  condition: z.enum(["new", "used", "any"]).optional(),
  length_max_ft: z.number().min(8).max(60).optional().describe("Hard max overall length, feet"),
  length_min_ft: z.number().min(8).max(60).optional(),
  max_weight_lbs: z.number().min(500).max(60_000).optional()
    .describe("Hard cap on unit weight (checked against GVWR when known, else dry weight, flagged)"),
  tow_vehicle: z.string().max(120).optional()
    .describe("Tow vehicle as stated, incl. engine/package if known: '2024 F-150 5.0L V8 Max Tow' or 'F-150 rated 8,000 lbs'. Pass raw; ask any askShopper follow-ups returned"),
  sleeps_min: z.number().int().min(1).max(14).optional(),
  must_have: z.array(featureEnum).max(8).optional().describe("Hard requirements — excludes units that verifiably lack them; units where a dealer doesn't publish the fact are flagged 'unverified', not excluded"),
  prefer: z.array(featureEnum).max(8).optional().describe("Soft preferences — affect ranking only"),
  fresh_water_min_gal: z.number().min(5).max(300).optional(),
  boondocking: z.boolean().optional().describe("Weight off-grid readiness (tanks, solar, generator, insulation) heavily in ranking"),
  sort: sortEnum.optional(),
  limit: z.number().int().min(1).max(10).optional().describe("Results to return (default 5); the page shows the full list"),
});
export type SearchInventoryInput = z.infer<typeof searchInventoryInput>;

export const getUnitDetailsInput = z.object({ unit_id: unitId });
export const explainMatchInput = z.object({ unit_id: unitId });
export const checkAvailabilityInput = z.object({ unit_id: unitId });

export const compareUnitsInput = z.object({
  unit_ids: z.array(unitId).min(2).max(4).describe("2-4 unit ids to compare"),
});

export const evaluateTowFitInput = z.object({
  vehicle: z.string().min(2).max(120)
    .describe("Tow vehicle as the shopper stated it, incl. engine/package when known: '2022 Tundra', 'F-150 5.0 V8 Max Tow', 'F-150 rated 8,000 lbs'"),
  unit_ids: z.array(unitId).max(6).optional()
    .describe("Units to evaluate; defaults to the current top results/shortlist"),
});

export const getShoppingSessionInput = z.object({});

export const updateShortlistInput = z.object({
  add: z.array(unitId).max(10).optional(),
  remove: z.array(unitId).max(10).optional(),
});

export const prepareDealerContactInput = z.object({
  unit_id: unitId,
  name: z.string().min(2).max(80).describe("Shopper's name, as they provided it"),
  email: z.string().email().max(120).describe("Shopper's email, as they provided it"),
  phone: z.string().max(25).optional(),
  message: z.string().max(1200).optional()
    .describe("Message to the dealership; MatchRV drafts one from the session constraints if omitted"),
});

export const submitDealerContactInput = z.object({
  preview_id: z.string().min(6).max(60)
    .describe("The preview id returned by prepare_dealer_contact"),
});

/**
 * Engine-level constraints schema — what the client session actually holds
 * and what the server validates on /api/agent/search. (Tool-level input is
 * `searchInventoryInput`; the client merges it into this shape.)
 */
export const constraintsSchema = z.object({
  location: z.object({ place: z.string().min(1).max(80), radiusMiles: z.number().min(1).max(3000) }).nullish(),
  priceMaxUsd: z.number().min(0).max(2_000_000).nullish(),
  priceMinUsd: z.number().min(0).max(2_000_000).nullish(),
  rvTypes: z.array(rvTypeEnum).max(8).nullish(),
  condition: z.enum(["new", "used", "any"]).nullish(),
  lengthMaxFt: z.number().min(8).max(60).nullish(),
  lengthMinFt: z.number().min(8).max(60).nullish(),
  maxWeightLbs: z.number().min(500).max(60_000).nullish(),
  towVehicle: z.string().max(120).nullish(),
  sleepsMin: z.number().int().min(1).max(14).nullish(),
  mustHave: z.array(featureEnum).max(8).nullish(),
  prefer: z.array(featureEnum).max(8).nullish(),
  freshWaterMinGal: z.number().min(5).max(300).nullish(),
  boondocking: z.boolean().nullish(),
  sort: sortEnum.nullish(),
});

// ── Tool descriptors ───────────────────────────────────────────────────────

export interface ToolContract {
  name: string;
  title: string;
  description: string;
  schema: z.ZodType;
  annotations: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
}

export const TOOL_CONTRACTS: ToolContract[] = [
  {
    name: "search_inventory",
    title: "Search RV inventory",
    description:
      "Search MatchRV's normalized multi-dealer RV inventory with structured constraints (price, type, length, weight/tow vehicle, sleeps, features, location radius). Updates the shared shopping session the human sees on the page. Returns a match funnel, top results with match scores, and per-unit unknowns. Default mode 'refine' merges with existing constraints, so pass only what changed.",
    schema: searchInventoryInput,
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_unit_details",
    title: "Get RV unit details",
    description:
      "Full normalized record for one unit: specs, features, dealer, price, weights, tanks — every critical fact carries a source (dealer listing vs parsed text vs computed) and null means the dealer doesn't publish it. Also focuses this unit on the page.",
    schema: getUnitDetailsInput,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "compare_units",
    title: "Compare RV units",
    description:
      "Structured side-by-side comparison of 2-4 units: true spec values with unknowns intact, best-in-row markers, and each unit's status against the current session constraints. Opens the comparison view on the page. Use real values from this result for reasoning — never fill unknowns with guesses.",
    schema: compareUnitsInput,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: "explain_match",
    title: "Explain why a unit matches",
    description:
      "Deterministic explanation of one unit against the current session constraints: hard checks passed/failed, soft preferences satisfied, unknown fields, and the exact match-score arithmetic. Use it to justify recommendations with receipts.",
    schema: explainMatchInput,
    annotations: { readOnlyHint: true },
  },
  {
    name: "check_availability",
    title: "Check listing freshness",
    description:
      "Availability status and when MatchRV last verified this unit on the dealer's site, with a staleness flag. Honest about snapshot age — use before suggesting a dealer visit.",
    schema: checkAvailabilityInput,
    annotations: { readOnlyHint: true },
  },
  {
    name: "evaluate_tow_fit",
    title: "Evaluate tow fit",
    description:
      "Weight-fit guidance for a tow vehicle against specific units, from MatchRV's manufacturer-rating reference table. Handles configuration ranges honestly (fits-with-margin / marginal / depends-on-config / exceeds / unknown) and never guarantees safety. A bare model returns a wide range plus askShopper follow-ups (engine, tow package, door-sticker rating): ask them, never assume a configuration; answers narrow the band. Also pins the tow vehicle to the shared session.",
    schema: evaluateTowFitInput,
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_shopping_session",
    title: "Read the shared shopping session",
    description:
      "Current shared state of this page: active constraints (including changes the human made in the UI), shortlist, last search funnel, focused unit, and any pending dealer-contact preview. Call it when joining mid-session or after the human says they changed something.",
    schema: getShoppingSessionInput,
    annotations: { readOnlyHint: true },
  },
  {
    name: "update_shortlist",
    title: "Update the shortlist",
    description:
      "Add or remove units on the shared shortlist the human sees and can edit. Use after the shopper picks favorites in conversation.",
    schema: updateShortlistInput,
    annotations: { readOnlyHint: false },
  },
  {
    name: "prepare_dealer_contact",
    title: "Prepare a dealer contact (preview only)",
    description:
      "Stage a contact request to the dealership for one unit. NOTHING IS SENT: this creates a preview (dealer, unit, shopper info, exact message) that the human must review and approve in the page UI. Returns a preview_id and status awaiting_human_approval.",
    schema: prepareDealerContactInput,
    annotations: { readOnlyHint: false },
  },
  {
    name: "submit_dealer_contact",
    title: "Submit an approved dealer contact",
    description:
      "Submit a dealer contact request that the human has ALREADY approved in the page UI. Consequential action: it records the lead with the dealership. Fails with awaiting_human_approval until the human clicks Approve — do not retry in a loop; ask the human to review the preview on the page.",
    schema: submitDealerContactInput,
    annotations: { readOnlyHint: false },
  },
];

/** JSON Schema for WebMCP registration (strip the $schema meta key). */
export function toInputSchema(contract: ToolContract): Record<string, unknown> {
  const js = z.toJSONSchema(contract.schema) as Record<string, unknown>;
  delete js["$schema"];
  return js;
}

export function getContract(name: string): ToolContract | null {
  return TOOL_CONTRACTS.find((t) => t.name === name) ?? null;
}

/** Convert validated search input to engine Constraints (+ session ops). */
export function searchInputToConstraints(input: SearchInventoryInput): {
  incoming: import("./types.js").Constraints;
  mode: "refine" | "replace";
  clear: string[];
  limit: number;
  intentSummary: string | null;
} {
  const incoming: Record<string, unknown> = {};
  if (input.place !== undefined) {
    incoming.location = { place: input.place, radiusMiles: input.radius_miles ?? 150 };
  } else if (input.radius_miles !== undefined) {
    incoming.location = { place: "", radiusMiles: input.radius_miles }; // patched against current in caller
  }
  if (input.price_max !== undefined) incoming.priceMaxUsd = input.price_max;
  if (input.price_min !== undefined) incoming.priceMinUsd = input.price_min;
  if (input.rv_types !== undefined) incoming.rvTypes = input.rv_types;
  if (input.condition !== undefined) incoming.condition = input.condition;
  if (input.length_max_ft !== undefined) incoming.lengthMaxFt = input.length_max_ft;
  if (input.length_min_ft !== undefined) incoming.lengthMinFt = input.length_min_ft;
  if (input.max_weight_lbs !== undefined) incoming.maxWeightLbs = input.max_weight_lbs;
  if (input.tow_vehicle !== undefined) incoming.towVehicle = input.tow_vehicle;
  if (input.sleeps_min !== undefined) incoming.sleepsMin = input.sleeps_min;
  if (input.must_have !== undefined) incoming.mustHave = input.must_have;
  if (input.prefer !== undefined) incoming.prefer = input.prefer;
  if (input.fresh_water_min_gal !== undefined) incoming.freshWaterMinGal = input.fresh_water_min_gal;
  if (input.boondocking !== undefined) incoming.boondocking = input.boondocking;
  if (input.sort !== undefined) incoming.sort = input.sort;

  const clearMap: Record<string, string> = {
    location: "location",
    price_max: "priceMaxUsd",
    price_min: "priceMinUsd",
    rv_types: "rvTypes",
    condition: "condition",
    length_max_ft: "lengthMaxFt",
    length_min_ft: "lengthMinFt",
    max_weight_lbs: "maxWeightLbs",
    tow_vehicle: "towVehicle",
    sleeps_min: "sleepsMin",
    must_have: "mustHave",
    prefer: "prefer",
    fresh_water_min_gal: "freshWaterMinGal",
    boondocking: "boondocking",
    sort: "sort",
  };

  return {
    incoming: incoming as import("./types.js").Constraints,
    mode: input.mode ?? "refine",
    clear: (input.clear ?? []).map((k) => clearMap[k]).filter(Boolean),
    limit: input.limit ?? 5,
    intentSummary: input.intent_summary ?? null,
  };
}
