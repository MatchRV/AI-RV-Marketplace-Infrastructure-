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
  type BuyerProfile,
  type Constraints,
  type CanonicalUnit,
} from "@workspace/agent-core";
import { getInventory as getOriginalInventory } from "./services/agent-inventory";
import { screenMcpInventory } from "./services/mcp-inventory-quality";
let screenedInventory: ReturnType<typeof screenMcpInventory> | undefined;
function getInventory() { return screenedInventory ??= screenMcpInventory(getOriginalInventory()); }

import { OUTFITTER_GUIDANCE, outfitterGuidance } from "./services/outfitter-guidance";
import { applyMemory, applyMemoryToUnit, getCuratedStore, newSessionKey, peekScope, recallVehicle, resolveScope, writableScope } from "./services/learned-store";
import { getInquiryStatus, prepareInquiry, sendInquiry } from "./services/dealer-inquiries";
import { SHOPPER_HTML, SHOPPER_URI } from "./ui/shopper";

const searchInput = z.object({
  // ChatGPT often passes free-form top-level fields instead of nested constraints.
  query: z.string().max(240).optional(),
  location: z.string().max(80).optional(),
  place: z.string().max(80).optional(),
  radius_miles: z.number().min(1).max(3000).optional(),
  sleeps_min: z.number().int().min(1).max(14).optional(),
  // Top-level shorthands clients send; previously stripped by zod, so a
  // "new" search silently returned used units (2016/2022 Camping World).
  condition: z.enum(["new", "used", "any"]).optional(),
  price_max_usd: z.number().min(0).max(2_000_000).optional(),
  price_min_usd: z.number().min(0).max(2_000_000).optional(),
  sort: z.enum(["best_match", "price_asc", "price_desc", "distance", "newest_model_year"]).optional(),
  constraints: z.preprocess(
    (raw) => cleanConstraints(raw as Record<string, unknown> | undefined),
    constraintsSchema,
  ).optional().default({}),
  sleepers: z.number().int().min(1).max(14).optional(),
  adults: z.number().int().min(0).max(14).optional(),
  kids: z.number().int().min(0).max(14).optional(),
  floorplan_intent: z.enum(["couples", "family_bunks", "flexible", "solo"]).optional(),
  wants_bunks: z.boolean().optional(),
  camping_style: z.enum(["full_hookup", "boondocking", "mixed"]).optional(),
  truck_payload_lbs: z.number().min(500).max(10000).optional(),
  truck_tow_rating_lbs: z.number().min(1000).max(40000).optional(),
  passengers_lbs: z.number().min(0).max(3000).optional(),
  cargo_lbs: z.number().min(0).max(5000).optional(),
  length_max_ft: z.number().min(8).max(60).optional(),
  length_reason: z.enum(["storage", "comfort", "hard_limit"]).optional(),
  length_flex_approved: z.boolean().optional(),
  discovery_waived: z.boolean().optional(),
  force_search: z.boolean().optional(),
  session_key: z.string().max(80).optional(),
  limit: z.number().int().min(1).max(10).optional().default(10),
});

const profileInput = z.object({
  sleepers: z.number().int().min(1).max(14).optional(),
  adults: z.number().int().min(0).max(14).optional(),
  kids: z.number().int().min(0).max(14).optional(),
  floorplan_intent: z.enum(["couples", "family_bunks", "flexible", "solo"]).optional(),
  wants_bunks: z.boolean().optional(),
  budget_max_usd: z.number().min(0).max(2000000).optional(),
  camping_style: z.enum(["full_hookup", "boondocking", "mixed"]).optional(),
  tow_vehicle: z.string().max(120).optional(),
  truck_payload_lbs: z.number().min(500).max(10000).optional(),
  truck_tow_rating_lbs: z.number().min(1000).max(40000).optional(),
  length_max_ft: z.number().min(8).max(60).optional(),
  length_reason: z.enum(["storage", "comfort", "hard_limit"]).optional(),
  length_flex_approved: z.boolean().optional(),
  discovery_waived: z.boolean().optional(),
});

function profileFrom(input: Record<string, unknown>, constraints: Constraints): BuyerProfile {
  const sherpa = constraints.sherpa;
  return {
    sleepers: (input.sleepers as number | undefined) ?? (input.sleeps_min as number | undefined) ?? constraints.sleepsMin ?? sherpa?.sleepers ?? null,
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
    discoveryWaived: (input.discovery_waived as boolean | undefined) ?? sherpa?.discoveryWaived ?? null,
    lengthMaxFt: (input.length_max_ft as number | undefined) ?? constraints.lengthMaxFt ?? sherpa?.lengthMaxStatedFt ?? null,
    lengthReason: (input.length_reason as BuyerProfile["lengthReason"]) ?? sherpa?.lengthReason ?? null,
    lengthFlexApproved: (input.length_flex_approved as boolean | undefined) ?? sherpa?.lengthFlexApproved ?? null,
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

/** Pull structured constraints out of a ChatGPT-style free-text query. */
function constraintsFromQuery(query: string | undefined): Partial<Constraints> {
  if (!query?.trim()) return {};
  const q = query.toLowerCase();
  const out: Record<string, unknown> = {};
  const sleeps = /sleeps?\s*:?\s*(\d{1,2})/.exec(q);
  if (sleeps) out.sleepsMin = Math.min(14, Math.max(1, parseInt(sleeps[1], 10)));
  const types: string[] = [];
  const typeMap: [RegExp, string][] = [
    [/travel\s*trailers?|\btt\b/, "travel_trailer"],
    [/fifth\s*wheels?|5th\s*wheels?/, "fifth_wheel"],
    [/toy\s*haulers?/, "toy_hauler"],
    [/class\s*a\b/, "class_a"],
    [/class\s*b\b/, "class_b"],
    [/class\s*c\b/, "class_c"],
    [/truck\s*campers?/, "truck_camper"],
    [/pop\s*-?\s*ups?|popup/, "popup_camper"],
  ];
  for (const [re, t] of typeMap) if (re.test(q)) types.push(t);
  if (types.length) out.rvTypes = types;
  const price = /under\s*\$?([\d,]+)|\$?([\d,]+)\s*(?:or\s*)?less|max(?:imum)?\s*price\s*\$?([\d,]+)/.exec(q);
  if (price) {
    const raw = price[1] || price[2] || price[3];
    const n = parseInt(raw.replace(/,/g, ""), 10);
    if (Number.isFinite(n) && n > 1000) out.priceMaxUsd = n;
  }
  const lenMax = /(?:nothing longer than|no longer than|not longer than|under|less than|up to|max(?:imum)?(?: of)?|at most)\s*(\d{1,2}(?:\.\d+)?)\s*(?:ft\.?|feet|foot)\b/.exec(q) ?? /(\d{1,2}(?:\.\d+)?)\s*(?:ft\.?|feet|foot)\s*(?:or less|max(?:imum)?|and under)\b/.exec(q);
  if (lenMax) { const n = parseFloat(lenMax[1]); if (n >= 8 && n <= 60) out.lengthMaxFt = n; }
  if (/\bdiesel\b/.test(q)) out.fuelType = "diesel";
  else if (/\bgas(oline)?\b/.test(q)) out.fuelType = "gas";
  // "450 hp" / "at least 450 horsepower" = minimum; "450 hp preferred"/"ideally" = preference.
  const hp = /(\d{3})\s*(?:hp|horsepower)\b(\s*(?:preferred|ideally|if possible))?/.exec(q);
  if (hp) out[hp[2] || /(prefer|ideally)[^.]{0,30}\d{3}\s*(?:hp|horse)/.test(q) ? "horsepowerPreferred" : "horsepowerMin"] = parseInt(hp[1], 10);
  const tq = /([\d,]{3,5})\s*(?:lb[\s.-]*ft|ft[\s.-]*lbs?|pound[\s-]*feet)/.exec(q);
  if (tq) out.torqueMinLbFt = parseInt(tq[1].replace(/,/g, ""), 10);
  const trailer = /([\d,]{4,6})\s*(?:-?\s*(?:lb|lbs|pound))?\s*(?:loaded\s+)?(?:trailer|car|toad)/.exec(q) ?? /tow(?:ing)?\s+(?:a\s+)?([\d,]{4,6})/.exec(q);
  if (trailer) {
    const n = parseInt(trailer[1].replace(/,/g, ""), 10);
    if (n >= 500 && n <= 40_000) out.trailerWeightLbs = n;
  }
  return out as Partial<Constraints>;
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

function textResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
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

export const MCP_VERSION = "2.1.0";

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
        "ROAD TO THE SALE - SHERPA RULES (RV Outfitter): The whole journey from first contact to the sale is the Road to the Sale, and you are the guide on it. LENGTH RULE: when a shopper states a max length, never treat it as hard or soft silently - ask whether it is for storage (physical fit; NEVER exceed it) or comfort. If comfort, ask permission to keep the gate open 1-2 ft longer; only approved comfort flexibility widens the cap, by exactly +2 ft. Pass length_max_ft, length_reason and length_flex_approved. " + "SHERPA RULES (RV Outfitter): You are a sherpa, not a listings feed. (1) DISCOVERY BEFORE INVENTORY: if sleepers/party is unknown, call outfitter_discovery and ask its ONE nextQuestion, then wait — do not call search_rvs yet. Never guess party size from a tow vehicle or weight limit. (2) One question at a time; never re-ask known facts. (3) 'Under 6,000 lbs my F-150 can tow' is a WEIGHT CEILING, not a request for the smallest trailer — after discovery, favour the most liveable trailer safely under the ceiling. (4) 1-2 sleepers / no kids = couples layouts first; bunkhouses only if they ask for bunks/guests. 3+ or kids = sleeping capacity first. (5) Tow fit is PRELIMINARY until payload (yellow door sticker) or an exact stated rating is known: quote GVWR (never dry weight alone), tongue = 10-15% of GVWR, and ask the payload question. (6) Explain every pick in lifestyle terms with its tradeoff; never pad to three. (7) 'Just show me' waives discovery (discovery_waived=true). " +
        "MatchRV searches a nationwide US dealer inventory snapshot. It is not restricted to the Pacific Northwest. Coverage varies by dealer, state and requested features. State-only locations (Florida or FL) search that state; city locations (Tampa, FL) use a radius. Ask a relevant Outfitter follow-up when it affects recommendations, and clarify ambiguous preferences in the conversation. Never describe external web listings as MatchRV results. ALWAYS pass location (e.g. location=\"Fife, WA\") for local searches — never present out-of-area inventory as a local match; if coverage.no_local_matches is true, say so and offer to widen radius. Cite coverage.units_in_area and funnel totals. sleepsConfirmed=false means capacity was inferred — disclose that. results.length is top matches only. Never claim towing safety from a generic vehicle model. VIN lookup is not available through this MCP server.",
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
      title: "RV Outfitter sherpa discovery",
      description:
        "Road to the Sale intake. Start here when the shopper has not yet said who sleeps in the RV, or has stated a length limit whose reason (storage vs comfort) is not yet known. Pass everything already known (sleepers, adults/kids, floorplan_intent, wants_bunks, budget, camping_style, tow_vehicle, door-sticker payload). Returns ONE next question to ask — or readyToSearch with compiled constraints for search_rvs. Stateless: pass the accumulated profile on every call. Never show inventory while readyToSearch is false unless the shopper waived discovery.",
      inputSchema: mcpSchema(profileInput),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      const profile: BuyerProfile = {
        sleepers: input.sleepers ?? null, adults: input.adults ?? null, kids: input.kids ?? null,
        floorplanIntent: input.floorplan_intent ?? null, wantsBunks: input.wants_bunks ?? null,
        budgetMaxUsd: input.budget_max_usd ?? null, campingStyle: input.camping_style ?? null,
        towVehicle: input.tow_vehicle ?? null, truckPayloadLbs: input.truck_payload_lbs ?? null,
        truckTowRatingLbs: input.truck_tow_rating_lbs ?? null, discoveryWaived: input.discovery_waived ?? null,
        lengthMaxFt: input.length_max_ft ?? null, lengthReason: input.length_reason ?? null, lengthFlexApproved: input.length_flex_approved ?? null,
      };
      const discovery = assessDiscovery(profile);
      return textResult({
        ...discovery,
        profile,
        ...(discovery.readyToSearch ? { searchConstraints: profileToConstraints(profile), guidance: "Discovery is sufficient. Briefly reflect what you heard, then call search_rvs with these constraints (plus location/price/radius). Tow verdicts stay preliminary until payload or an exact rating is supplied." } : { guidance: "Ask nextQuestion.prompt as the only question and wait. Do not describe or rank trailers yet." }),
      });
    },
  );

  server.registerTool(
    "outfitter_guide",
    {
      title: "RV Outfitter buyer guides",
      description:
        "MatchRV's buyer-education knowledge, distilled from its published guides (towing/payload basics, motorhome vs trailer, travel trailer vs fifth wheel, families, full-time living, buying used, costs, financing). Use for general 'how does this work / which is better' questions BEFORE any inventory search — teach first, sell never. Pass topic for an exact guide or query to search. Towing points defer to evaluate_tow_fit for the buyer's actual vehicle; never quote a model-level tow table.",
      inputSchema: mcpSchema(z.object({
        topic: z.enum(["tow_basics", "motorhome_vs_trailer", "trailer_vs_fifth_wheel", "families", "full_time", "used_buying", "costs", "financing"]).optional(),
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

  server.registerTool("rv_outfitter", {
    title: "RV Outfitter - clarify and confirm shopper needs",
    description: "Use this guide when a shopper starts an RV conversation or gives an ambiguous preference. Returns one useful follow-up, a confirmation summary and authoritative constraints. Ask about firm limits versus explicitly approved flexibility; never relax a limit automatically. Continue in this chat, then call search_rvs for real options. Does not contact dealers or send messages.",
    inputSchema: mcpSchema(z.object({ message: z.string().min(1).max(4000), constraints: constraintsSchema.optional().default({}), flexibility_confirmed: z.boolean().optional().default(false) })),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ message, constraints, flexibility_confirmed }) => textResult(outfitterGuidance(message, constraints, flexibility_confirmed)));

  server.registerTool(
    "search_rvs",
    {
      title: "Search and match RVs",
      description:
        "Search nationwide US MatchRV dealer inventory. Clarify ambiguous shopper needs, confirm approved flexibility, and preserve every hard constraint. State-wide location example: Florida; city-radius example: Tampa, FL. Pass location (city like \"Fife, WA\") to hard-filter by distance — never invent local matches from FL/AZ when the shopper asked for Washington. Also accept query (\"travel trailer sleeps 8\"), sleeps_min, radius_miles, and structured constraints (priceMaxUsd, rvTypes, sleepsMin, lengthMinFt/lengthMaxFt, fuelType, horsepowerMin, torqueMinLbFt, trailerWeightLbs, trailerTongueLbs, coachLoadedWeightLbs). Use horsepowerMin/torqueMinLbFt only when the shopper states a minimum; use horsepowerPreferred/torquePreferredLbFt for \"preferred\". A minimum is never relaxed: an unknown rating is 'needs verification', never a match, and a lower rating is excluded. Motorhome rows include fuel, hp, torqueLbFt, hitchTowRatingLbs and gcwrLbs (null = not published). Read coverage.units_in_area; if no_local_matches, say there is no local inventory and offer to widen radius. sleepsConfirmed tells you whether capacity is dealer-published or inferred.",
      _meta: { ui: { resourceUri: SHOPPER_URI, visibility: ["model", "app"] } },
      inputSchema: mcpSchema(searchInput),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input, ctx) => {
      try {
        const t0 = performance.now();
        const fromQuery = constraintsFromQuery(input.query);
        const topLocation = input.location || input.place;
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

        const baseConstraints = mergeConstraints(
          cleanConstraints(input.constraints as Record<string, unknown>),
          fromQuery,
          fromTop,
        );
        const profile = profileFrom(input as unknown as Record<string, unknown>, baseConstraints);
        const discovery = assessDiscovery(profile);
        if (!discovery.readyToSearch && !input.force_search) {
          return textResult({
            status: "needs_discovery",
            results: [],
            knownProfile: profile,
            knownSummary: discovery.knownSummary,
            missingEssentials: discovery.missingEssentials,
            nextQuestion: discovery.nextQuestion,
            guidance: "Ask nextQuestion.prompt (offer its options) as the ONLY question, then wait. Do not show, rank, or describe any trailer yet. When the shopper answers, call search_rvs again with sleepers/floorplan_intent filled in (or outfitter_discovery to continue). If they say 'just show me', retry with discovery_waived=true.",
          });
        }
        const constraints = mergeConstraints(profileToConstraints(profile), baseConstraints);
        constraints.sherpa = profileToConstraints(profile).sherpa;
        // Road to the Sale: the clarified length cap (storage-exact, or
        // comfort +2 only with explicit approval) overrides any raw cap.
        const effLen = profileToConstraints(profile).lengthMaxFt;
        if (effLen != null) constraints.lengthMaxFt = effLen;
        if (profile.sleepers != null && constraints.sleepsMin == null) constraints.sleepsMin = profile.sleepers;

        // READ-ONLY: recall this shopper's own (or curated) memory; never write.
        const scope = resolveScope(ctx, input.session_key);
        const learnedVehicle = profile.towVehicle ? recallVehicle(scope, profile.towVehicle) : null;
        const learnedTow = learnedVehicle?.towRatingLbs != null && profile.truckTowRatingLbs == null
          ? { towRatingLbs: learnedVehicle.towRatingLbs, confirmations: learnedVehicle.confirmations, source: learnedVehicle.source }
          : null;
        const place = constraints.location?.place;
        const corpus = applyMemory(scope, candidateUnits(place));
        const outcome = runSearch(corpus, constraints, learnedTow);
        const compact = compactSearchResult(outcome, input.limit ?? 10);
        const inventoryQuality = getInventory().inventoryQuality;
        const ms = Math.round(performance.now() - t0);
        return textResult({
          ...compact,
          inventoryQuality,
          appliedConstraints: outcome.appliedConstraints,
          timingMs: ms,
          source: "MatchRV nationwide inventory snapshot",
          sherpa: {
            knownSummary: discovery.knownSummary,
            readyToSearch: discovery.readyToSearch,
            towStatus: profile.truckPayloadLbs != null || profile.truckTowRatingLbs != null ? "payload-aware" : profile.towVehicle ? "preliminary - payload/rating not yet confirmed" : "not requested",
            memoryHint: profile.towVehicle && (profile.truckTowRatingLbs != null || profile.truckPayloadLbs != null) ? "This search used the rating/payload stated in this request but did not store it. If the shopper wants MatchRV to remember it, call teach_outfitter." : null,
            memory: learnedTow ? `Recalled a LEARNED rating for this vehicle (${learnedTow.towRatingLbs.toLocaleString()} lbs, confirmed ${learnedTow.confirmations}x). Say it is learned, and ask the shopper to confirm it matches their exact truck.` : null,
            nextQuestion: profile.towVehicle && profile.truckPayloadLbs == null && profile.truckTowRatingLbs == null
              ? "What does the yellow payload sticker inside your driver's door say ('combined weight of occupants and cargo should never exceed ___ lbs')? That turns this preliminary fit into a real one."
              : null,
          },
          outfitterGuidance: "Explain each pick in lifestyle terms (why it fits how they camp, plus its tradeoff). Tow verdicts are preliminary until payload/exact rating is known. If the shopper wants to contact the dealership about a unit, use prepare_dealer_inquiry and get their explicit approval before send_dealer_inquiry. VIN lookup is unavailable through MCP.",
          nextStep: "Explain real matches and unknowns. Ask one relevant follow-up if needed; gas versus diesel, dedicated versus convertible bunks, or a required towing load may change the recommendation. Do not claim a hitch rating verifies towing capacity. Do not widen limits without explicit permission.",
        });
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
