import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod/v4";
import {
  buildContext,
  compactSearchResult,
  compareUnits,
  constraintsSchema,
  evaluateTowFit,
  evaluateUnit,
  resolveTowVehicle,
  runSearch,
  type Constraints,
  type CanonicalUnit,
} from "@workspace/agent-core";
import { getInventory as getOriginalInventory } from "./services/agent-inventory";
import { screenMcpInventory } from "./services/mcp-inventory-quality";
let screenedInventory: ReturnType<typeof screenMcpInventory> | undefined;
function getInventory() { return screenedInventory ??= screenMcpInventory(getOriginalInventory()); }

import { OUTFITTER_GUIDANCE } from "./services/outfitter-guidance";
import { SHOPPER_HTML, SHOPPER_URI } from "./ui/shopper";

const searchInput = z.object({
  // ChatGPT often passes free-form top-level fields instead of nested constraints.
  query: z.string().max(240).optional(),
  location: z.string().max(80).optional(),
  place: z.string().max(80).optional(),
  radius_miles: z.number().min(1).max(3000).optional(),
  sleeps_min: z.number().int().min(1).max(14).optional(),
  constraints: z.preprocess(
    (raw) => cleanConstraints(raw as Record<string, unknown> | undefined),
    constraintsSchema,
  ).optional().default({}),
  limit: z.number().int().min(1).max(10).optional().default(10),
});

const getRvInput = z.object({ unit_id: z.string().min(3).max(120) });

const compareInput = z.object({
  unit_ids: z.array(z.string().min(3).max(120)).min(2).max(4),
  constraints: constraintsSchema.optional().default({}),
});

const towInput = z.object({
  vehicle: z.string().min(2).max(120),
  unit_ids: z.array(z.string().min(3).max(120)).min(1).max(6),
});


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

function buildMatchRvServer(): McpServer {
  const server = new McpServer(
    {
      name: "matchrv",
      version: "0.2.1",
      websiteUrl: "https://matchrv.com",
    },
    {
      capabilities: { tools: { listChanged: false }, resources: {} },
      instructions:
        OUTFITTER_GUIDANCE.replace(/Offer an optional VIN lookup[\s\S]*?Never infer a tow package/, "Never infer a tow package").replace("Dealer contact requires a preview and explicit human approval.", "Dealer contact is unavailable in this initial release.") + "\n" +
        "MatchRV searches a nationwide US dealer inventory snapshot. It is not restricted to the Pacific Northwest. Coverage varies by dealer, state and requested features. State-only locations (Florida or FL) search that state; city locations (Tampa, FL) use a radius. Ask a relevant Outfitter follow-up when it affects recommendations, and clarify ambiguous preferences in the conversation. Never describe external web listings as MatchRV results. ALWAYS pass location (e.g. location=\"Fife, WA\") for local searches ΓÇö never present out-of-area inventory as a local match; if coverage.no_local_matches is true, say so and offer to widen radius. Cite coverage.units_in_area and funnel totals. sleepsConfirmed=false means capacity was inferred ΓÇö disclose that. results.length is top matches only. Never claim towing safety from a generic vehicle model. Dealer contact and VIN lookup are unavailable in this initial release.",
    },
  );

  server.registerResource("matchrv-shopper", SHOPPER_URI, { title: "MatchRV shopper", mimeType: "text/html;profile=mcp-app" }, async () => ({
    contents: [{ uri: SHOPPER_URI, mimeType: "text/html;profile=mcp-app", text: SHOPPER_HTML, _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } }, "openai/ui": { availableDisplayModes: ["fullscreen"], preferredDisplayMode: "fullscreen" } } }],
  }));

  server.registerTool(
    "search_rvs",
    {
      title: "Search and match RVs",
      description:
        "Search nationwide US MatchRV dealer inventory. Clarify ambiguous shopper needs, confirm approved flexibility, and preserve every hard constraint. State-wide location example: Florida; city-radius example: Tampa, FL. Pass location (city like \"Fife, WA\") to hard-filter by distance ΓÇö never invent local matches from FL/AZ when the shopper asked for Washington. Also accept query (\"travel trailer sleeps 8\"), sleeps_min, radius_miles, and structured constraints (priceMaxUsd, rvTypes, sleepsMin). Read coverage.units_in_area; if no_local_matches, say there is no local inventory and offer to widen radius. sleepsConfirmed tells you whether capacity is dealer-published or inferred.",
      _meta: { ui: { resourceUri: SHOPPER_URI, visibility: ["model", "app"] } },
      inputSchema: mcpSchema(searchInput),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
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

        const constraints = mergeConstraints(
          cleanConstraints(input.constraints as Record<string, unknown>),
          fromQuery,
          fromTop,
        );

        const place = constraints.location?.place;
        const corpus = candidateUnits(place);
        const outcome = runSearch(corpus, constraints);
        const compact = compactSearchResult(outcome, input.limit ?? 10);
        const inventoryQuality = getInventory().inventoryQuality;
        const ms = Math.round(performance.now() - t0);
        return textResult({
          ...compact,
          inventoryQuality,
          appliedConstraints: outcome.appliedConstraints,
          timingMs: ms,
          source: "MatchRV nationwide inventory snapshot",
          outfitterGuidance: "Clarify needs one question at a time, preserve hard constraints, and ask for exact vehicle ratings. Dealer contact and VIN lookup are unavailable in this release.",
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
        "Get the full canonical MatchRV record for one unit returned by search_rvs, including dealer, specs, price, features, source/provenance, freshness, and explicit unknowns. Never invent missing specifications.",
      _meta: { ui: { resourceUri: SHOPPER_URI, visibility: ["model", "app"] } },
      inputSchema: mcpSchema(getRvInput),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ unit_id }) => {
      const inv = getInventory();
      const unit = inv.byId.get(unit_id);
      if (!unit) return textResult({ error: inv.quarantined.has(unit_id) ? "unit_quarantined" : "unit_not_found", issues: inv.quarantined.get(unit_id), guidance: "Use an eligible unit_id returned by search_rvs. Withheld records need source review." }, true);
      return textResult({ unit, dataset: { builtAt: inv.snapshot.builtAt, note: inv.snapshot.datasetNote } });
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
    async ({ unit_ids, constraints }) => {
      const inv = getInventory();
      const units = unit_ids.map((id) => inv.byId.get(id));
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
        "Evaluate weight fit between a shopper-stated tow vehicle and 1-6 RVs. This is screening guidance, not a towing-safety guarantee. Configuration-specific payload, GVWR/GCWR, hitch ratings, passengers and cargo can change the result.",
      _meta: { ui: { resourceUri: SHOPPER_URI, visibility: ["model", "app"] } },
      inputSchema: mcpSchema(towInput),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ vehicle, unit_ids }) => {
      const inv = getInventory();
      const resolution = resolveTowVehicle(vehicle);
      const fits = [];
      for (const id of unit_ids) {
        const unit = inv.byId.get(id);
        if (!unit) return textResult({ error: "unit_not_found", unit_id: id }, true);
        fits.push({ ...evaluateTowFit(unit, resolution), unit_id: id, title: unit.title });
      }
      return textResult({ resolution, fits, safetyNotice: "Verify the exact tow-vehicle configuration, payload sticker, GVWR/GCWR, hitch limits, passengers and cargo before towing." });
    },
  );

  return server;
}

export const matchRvMcpHandler = createMcpHandler(() => buildMatchRvServer());
export const matchRvMcpNodeHandler = toNodeHandler(matchRvMcpHandler);
