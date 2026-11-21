/**
 * /mcp/v1 — the MatchRV inventory endpoint for third-party AI agents.
 *
 * Separate from the consumer endpoint at /mcp in every way that matters:
 * its own server, tool names, instructions and version, so nothing here can
 * change what the ChatGPT app serves.
 *
 *   - Off unless AGENT_V1_ENABLED is set; answers 404 until then.
 *   - Every request needs a valid MatchRV API key (401 otherwise).
 *   - Plain search with filters and paging. No interview, no stored memory.
 *   - Same screened inventory the consumer app uses. Unit records leave out
 *     how MatchRV obtained them; they carry the listing URL and when the
 *     dealer's site last showed the unit.
 *   - Per-key request rate, daily unit quota and a paging depth cap, so the
 *     endpoint answers shopping questions and cannot be used to copy the
 *     inventory.
 */
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod/v4";
import {
  compactUnitSummary, compareUnits, evaluateMotorhomeTow, evaluatePayloadFit, evaluateTowFit, powertrainReport, publicListingId,
  resolveTowVehicle, runSearch, type CanonicalUnit, type Constraints, type UnitMatch,
} from "@workspace/agent-core";
import { agentKeyFromHeaders, checkAgentKey, DEFAULT_AGENT_LIMITS } from "./services/agent-clients";
import { attributionRows, boundClientId, currentAttribution, type AttributionContext } from "./services/attribution";
import { getInquiryStatus, prepareInquiry, sendInquiry } from "./services/dealer-inquiries";
import { mcpLeadContext } from "./services/lead-mcp";
import { inventoryFreshnessRecheckEnabled, recheckForRecommend } from "./services/inventory-state-freshness";
import { attributeMcpFetch } from "./services/mcp-attribution";
import { getScreenedInventory } from "./services/screened-inventory";

export const MCP_V1_VERSION = "1.0.0";
export const V1_PAGE_MAX = 25;
/** Deepest result a search will page to. Narrow the filters to see further. */
export const V1_DEPTH_MAX = 200;

export const v1Enabled = () => /^(1|true|yes)$/i.test(process.env.AGENT_V1_ENABLED ?? "");

const RV_TYPES = ["travel_trailer", "fifth_wheel", "toy_hauler", "class_a", "class_b", "class_c", "popup_camper", "truck_camper"] as const;
const FEATURES = ["bunkhouse", "outdoor_kitchen", "solar", "solar_prep", "lithium", "generator", "four_season", "two_entry_doors"] as const;
const unitId = z.string().min(3).max(120);

function inventory(): { units: CanonicalUnit[]; byId: Map<string, CanonicalUnit>; builtAt: string | null } {
  const inv = inventoryFreshnessRecheckEnabled() ? recheckForRecommend() : getScreenedInventory();
  return { units: inv.units, byId: inv.byId, builtAt: inv.snapshot.builtAt ?? null };
}

const listingPage = (id: string) => `https://matchrv.com/listing/${encodeURI(publicListingId(id))}`;
const dealerListingUrl = (unit: CanonicalUnit) => (/^https?:\/\/[^\s<>"']+$/i.test(unit.provenance.listingUrl ?? "") ? unit.provenance.listingUrl! : null);

/** What MatchRV last saw on the dealer's site. Never a live stock check. */
export function availabilityV1(unit: CanonicalUnit, builtAt: string | null, now = new Date()) {
  const seenMs = Date.parse(unit.provenance.lastSeenAt ?? "");
  const known = Number.isFinite(seenMs);
  const days = known ? Math.max(0, Math.floor((now.getTime() - seenMs) / 86_400_000)) : null;
  return {
    status: unit.status,
    last_seen_at: known ? unit.provenance.lastSeenAt : null,
    days_since_last_seen: days,
    inventory_built_at: builtAt,
    needs_dealer_confirmation: unit.status !== "available" || days === null || days > 2,
    note: "Status is what the dealer's website showed when MatchRV last saw the listing, not a live stock check. Only the dealership can confirm the RV is still for sale.",
  };
}

/** Names of the services MatchRV reads listings through. They never appear in a v1 response. */
const COLLECTOR = /marketcheck/i;
const NEUTRAL_NOTE = "Read from the dealer's listing; confirm with the dealership.";

function withoutCollector(text: string): string | null {
  if (!COLLECTOR.test(text)) return text;
  // A link to the collector is dropped; the dealer's own listing URL is served separately.
  if (/^https?:\/\//i.test(text)) return null;
  const reworded = text
    .replace(/MarketCheck's crawl of this dealer listing/gi, "the dealer's listing")
    .replace(/as crawled by MarketCheck/gi, "as shown on the dealer's listing");
  return COLLECTOR.test(reworded) ? NEUTRAL_NOTE : reworded;
}

/**
 * Copy of a response value with every mention of a collection service
 * reworded or removed. Fact notes written at import time name the service the
 * value was read through; partners see what the dealer's listing showed.
 */
export function scrubCollector<T>(value: T): T {
  if (typeof value === "string") return withoutCollector(value) as T;
  if (Array.isArray(value)) return value.map((item) => scrubCollector(item)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = scrubCollector(item);
    return out as T;
  }
  return value;
}

/**
 * The unit as partners see it: every spec and its fact-level source, the
 * listing URL and first/last-seen dates. How MatchRV obtained the record is
 * left out.
 */
export function publicUnit(unit: CanonicalUnit): Record<string, unknown> {
  const { provenance, ...rest } = unit;
  return scrubCollector({
    ...rest,
    listing: {
      matchrv_url: listingPage(unit.id),
      dealer_listing_url: dealerListingUrl(unit),
      dealer_website: unit.dealer.website ?? null,
      first_seen_at: provenance.firstSeenAt ?? null,
      last_seen_at: provenance.lastSeenAt ?? null,
    },
  });
}

function result(raw: Record<string, unknown>, isError = false) {
  // Every v1 answer passes through here, so nothing a tool builds can name a collection service.
  const payload = scrubCollector(raw);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    ...(isError ? { isError: true } : { structuredContent: payload }),
  };
}

// The workspace's Zod 3.25 /v4 export predates Standard JSON Schema support (same shim as the consumer server).
function mcpSchema<T extends z.ZodType>(schema: T) {
  const standard: T["~standard"] = schema["~standard"];
  return { "~standard": { ...standard, jsonSchema: { input: () => z.toJSONSchema(schema, { io: "input" }), output: () => z.toJSONSchema(schema, { io: "output" }) } } };
}

// ── Daily unit quota ───────────────────────────────────────────────────────

const UNIT_EVENTS = new Set(["impression", "detail_view", "compare"]);
const spent = new Map<string, { day: string; units: number }>();

function ledger(clientId: string, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  let entry = spent.get(clientId);
  if (!entry || entry.day !== day) {
    // Start from what the persisted counters already show for today, so a restart does not hand out a fresh quota.
    let seed = 0;
    for (const row of attributionRows(day, day)) if (row.tier === "verified_partner" && row.client === clientId && UNIT_EVENTS.has(row.event)) seed += row.count;
    entry = { day, units: seed };
    spent.set(clientId, entry);
  }
  return entry;
}

const dailyLimit = (ctx: AttributionContext) => ctx.limits?.unitsPerDay ?? DEFAULT_AGENT_LIMITS.unitsPerDay;

/** Unit records this key may still be served today. Never negative. */
function unitsLeft(ctx: AttributionContext): number {
  return Math.max(0, dailyLimit(ctx) - ledger(ctx.clientId!).units);
}

function quotaError(ctx: AttributionContext, needed = 1) {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const left = unitsLeft(ctx);
  return result({
    error: "quota_exceeded",
    detail: left === 0
      ? `This API key has used its ${dailyLimit(ctx)} unit records for today.`
      : `This call needs ${needed} unit records and this API key has ${left} left of its ${dailyLimit(ctx)} for today.`,
    units_left_today: left,
    resets_at: `${tomorrow}T00:00:00Z`,
    guidance: "Tow checks, inquiry tools and status lookups still work. Contact MatchRV to raise the limit.",
  }, true);
}

/**
 * Take `units` from today's allowance, or take nothing and return false.
 * Callers check and charge with no await in between, so two requests can
 * never both spend the same remaining units: the limit is never exceeded.
 */
function charge(ctx: AttributionContext, units: number): boolean {
  if (units > unitsLeft(ctx)) return false;
  ledger(ctx.clientId!).units += units;
  return true;
}
const usageOf = (ctx: AttributionContext) => ({ used_today: ledger(ctx.clientId!).units, daily_limit: dailyLimit(ctx) });

/** The verified caller. The HTTP layer already refused anything else; this keeps the handlers honest if it is ever bypassed. */
function caller(): AttributionContext | null {
  const ctx = currentAttribution();
  return ctx && boundClientId(ctx) ? ctx : null;
}
const NO_CALLER = () => result({ error: "unauthorized", guidance: "Send a valid MatchRV API key as 'Authorization: Bearer <key>'." }, true);

// ── Tool inputs ────────────────────────────────────────────────────────────

const searchInput = z.object({
  rv_types: z.array(z.enum(RV_TYPES)).max(8).optional().describe("RV types to include. Omit for all."),
  makes: z.array(z.string().min(1).max(60)).max(6).optional().describe("Brands to include, e.g. [\"Tiffin\"]."),
  models: z.array(z.string().min(1).max(60)).max(6).optional().describe("Models or series to include, e.g. [\"Allegro RED\"]."),
  exclude_makes: z.array(z.string().min(1).max(60)).max(6).optional(),
  exclude_models: z.array(z.string().min(1).max(60)).max(6).optional(),
  condition: z.enum(["new", "used", "any"]).optional(),
  price_min_usd: z.number().min(0).max(2_000_000).optional(),
  price_max_usd: z.number().min(0).max(2_000_000).optional(),
  length_min_ft: z.number().min(8).max(60).optional(),
  length_max_ft: z.number().min(8).max(60).optional(),
  sleeps_min: z.number().int().min(1).max(14).optional(),
  max_weight_lbs: z.number().min(500).max(60_000).optional().describe("Heaviest loaded weight (GVWR) to include, for towables."),
  fuel_type: z.enum(["gas", "diesel"]).optional().describe("Motorhomes only."),
  must_have: z.array(z.enum(FEATURES)).max(8).optional().describe("Features every result must have."),
  prefer: z.array(z.enum(FEATURES)).max(8).optional().describe("Features that raise a result's rank without excluding others."),
  tow_vehicle: z.string().max(120).optional().describe("Tow vehicle (year, make, model, engine). Limits towables to its rating range; use evaluate_tow_fit for a per-unit answer."),
  location: z.string().max(80).optional().describe("US city and state, ZIP, or a state name for state-wide results."),
  radius_miles: z.number().min(1).max(3000).optional().describe("Search radius around location. Default 150. Ignored for a state-wide search."),
  sort: z.enum(["best_match", "price_asc", "price_desc", "distance", "newest_model_year"]).optional(),
  verified_only: z.boolean().optional().describe("True: only units where every filter was confirmed from published data. Default false also returns units with an unpublished value, marked verified=false."),
  limit: z.number().int().min(1).max(V1_PAGE_MAX).optional().describe(`Page size, 1-${V1_PAGE_MAX}. Default 10.`),
  offset: z.number().int().min(0).max(V1_DEPTH_MAX).optional().describe(`Results to skip. offset + limit may not exceed ${V1_DEPTH_MAX}.`),
});

const towInput = z.object({
  unit_ids: z.array(unitId).min(1).max(6),
  vehicle: z.string().min(2).max(120).optional().describe("The tow vehicle: year, make, model, engine, and its exact tow rating if the shopper stated one."),
  truck_payload_lbs: z.number().min(500).max(10_000).optional().describe("Payload from the tow vehicle's door sticker."),
  passengers_lbs: z.number().min(0).max(3_000).optional(),
  cargo_lbs: z.number().min(0).max(5_000).optional(),
  trailer_weight_lbs: z.number().min(500).max(40_000).optional().describe("Motorhome mode: loaded weight of the trailer the motorhome would tow."),
  trailer_tongue_lbs: z.number().min(50).max(5_000).optional(),
  coach_loaded_weight_lbs: z.number().min(3_000).max(80_000).optional(),
}).refine((v) => v.vehicle || v.trailer_weight_lbs, { message: "Pass vehicle (a truck towing an RV) or trailer_weight_lbs (a motorhome towing a trailer)." });

function searchConstraints(input: z.infer<typeof searchInput>): Constraints {
  const c: Record<string, unknown> = {};
  if (input.rv_types?.length) c.rvTypes = input.rv_types;
  if (input.makes?.length) c.makes = input.makes;
  if (input.models?.length) c.models = input.models;
  if (input.exclude_makes?.length) c.excludeMakes = input.exclude_makes;
  if (input.exclude_models?.length) c.excludeModels = input.exclude_models;
  if (input.condition) c.condition = input.condition;
  if (input.price_min_usd != null) c.priceMinUsd = input.price_min_usd;
  if (input.price_max_usd != null) c.priceMaxUsd = input.price_max_usd;
  if (input.length_min_ft != null) c.lengthMinFt = input.length_min_ft;
  if (input.length_max_ft != null) c.lengthMaxFt = input.length_max_ft;
  if (input.sleeps_min != null) c.sleepsMin = input.sleeps_min;
  if (input.max_weight_lbs != null) c.maxWeightLbs = input.max_weight_lbs;
  if (input.fuel_type) c.fuelType = input.fuel_type;
  if (input.must_have?.length) c.mustHave = input.must_have;
  if (input.prefer?.length) c.prefer = input.prefer;
  if (input.tow_vehicle) c.towVehicle = input.tow_vehicle;
  if (input.location) c.location = { place: input.location.replace(/^near\s+/i, "").trim(), radiusMiles: input.radius_miles ?? 150 };
  if (input.sort) c.sort = input.sort;
  return c as Constraints;
}

function searchRow(match: UnitMatch, builtAt: string | null): Record<string, unknown> {
  const u = match.unit;
  const summary = compactUnitSummary(match);
  return {
    ...summary,
    year: u.year,
    rv_type: u.rvType,
    condition: u.condition,
    dealer_id: u.dealer.id,
    image: u.images[0] ?? null,
    matchrv_url: listingPage(u.id),
    availability: { status: u.status, last_seen_at: availabilityV1(u, builtAt).last_seen_at },
  };
}

const INSTRUCTIONS =
  "MatchRV inventory for AI agents: US dealer RV listings, normalized, with tools to search, read, compare, check tow weight fit and send a dealer inquiry. " +
  "DATA RULES. (1) null means the dealer does not publish that value: say it is not published and never estimate it. Each spec carries a source and confidence; verified=false on a search row means a filter could not be confirmed from published data. " +
  "(2) Availability is what the dealer's website showed on last_seen_at, not live stock. Say when it was last seen and that the dealership must confirm. " +
  "(3) Tow results are weight screening, not a guarantee. Never tell a shopper a combination is safe; the best result is that the limits checked are cleared, with what still needs confirming (exact vehicle configuration, door-sticker payload, hitch and axle limits). Never invent a tow rating. " +
  "(4) Prices are the dealer's listed asking price and exclude fees and taxes. " +
  "INQUIRIES. prepare_inquiry sends nothing and returns a preview. Show the whole preview to the shopper. Call send_inquiry only after that shopper explicitly approves that exact preview. An inquiry shares the shopper's contact details with the dealership. Report the returned status exactly: delivered means the dealer's mail server accepted it; queued_for_matchrv means MatchRV staff will forward it and the dealer does not have it yet; failed means the shopper should contact the dealership directly. A hold or reservation is only a request to the dealer; MatchRV cannot place or promise one. " +
  "LIMITS. Each API key has a per-minute request limit and a daily limit on unit records. Search pages to a fixed depth; narrow the filters rather than paging further.";

// ── Server ─────────────────────────────────────────────────────────────────

function buildV1Server(): McpServer {
  const server = new McpServer(
    { name: "matchrv-inventory", version: MCP_V1_VERSION, websiteUrl: "https://matchrv.com" },
    { capabilities: { tools: { listChanged: false } }, instructions: INSTRUCTIONS },
  );
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  server.registerTool(
    "search_inventory",
    {
      title: "Search RV inventory",
      description:
        `Search MatchRV's US dealer RV inventory with plain filters. Every filter is optional and each one given is a hard filter except prefer. Returns one page of matching units (up to ${V1_PAGE_MAX}) with price, key specs, dealer, distance when a location is given, and what MatchRV last saw of the listing, plus totals for the whole match set. Results are ranked with fully confirmed matches first. The search never widens the area or relaxes a filter on its own. Page with offset; offset + limit may not exceed ${V1_DEPTH_MAX}.`,
      inputSchema: mcpSchema(searchInput),
      annotations: readOnly,
    },
    async (input) => {
      const ctx = caller();
      if (!ctx) return NO_CALLER();
      const left = unitsLeft(ctx);
      if (left === 0) return quotaError(ctx);
      const asked = input.limit ?? 10;
      // A page never holds more rows than the key has left today.
      const limit = Math.min(asked, left);
      const offset = input.offset ?? 0;
      if (offset + asked > V1_DEPTH_MAX) {
        return result({ error: "paging_limit", detail: `offset + limit may not exceed ${V1_DEPTH_MAX}.`, guidance: "Narrow the search (type, price range, location, make) instead of paging further." }, true);
      }
      try {
        const inv = inventory();
        const outcome = runSearch(inv.units, searchConstraints(input), null, { skipRadiusExpand: true });
        const matches = input.verified_only ? outcome.results.filter((m) => m.hardStatus === "pass") : outcome.results;
        const page = matches.slice(offset, offset + limit);
        const reachable = Math.min(matches.length, V1_DEPTH_MAX);
        const next = offset + page.length < reachable ? offset + page.length : null;
        if (!charge(ctx, page.length)) return quotaError(ctx, page.length);
        const usage = usageOf(ctx);
        return result({
          results: page.map((m) => searchRow(m, inv.builtAt)),
          paging: {
            offset, returned: page.length, next_offset: next, depth_limit: V1_DEPTH_MAX,
            ...(limit < asked ? { shortened_by_quota: true, note: `Returned ${page.length} of the ${asked} rows asked for: that is all this API key has left today.` } : {}),
          },
          totals: {
            matched: matches.length,
            confirmed: outcome.funnel.passedHard,
            unconfirmed: input.verified_only ? 0 : outcome.funnel.unverified,
            searched: outcome.funnel.totalUnits,
            excluded_by: outcome.funnel.excluded.slice(0, 8),
          },
          area: outcome.locationResolution
            ? { place: outcome.locationResolution.place, scope: outcome.locationResolution.state ? "state" : "radius", radius_miles: outcome.locationResolution.state ? null : outcome.locationResolution.radiusMiles }
            : { scope: "nationwide" },
          ...(outcome.towResolution ? { tow_vehicle: { resolved: outcome.towResolution.matched?.label ?? outcome.towResolution.input, filter_cap_lbs: outcome.towResolution.filterCapLbs, note: outcome.towResolution.caveats[0] ?? null } } : {}),
          applied_filters: outcome.appliedConstraints,
          inventory_built_at: inv.builtAt,
          usage,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return result({
          error: "search_failed",
          detail,
          ...(detail.includes("Unknown place") ? { guidance: "Use a US city with its state, a ZIP code, or a state name. An unresolved place is not evidence that MatchRV has no inventory there." } : {}),
        }, true);
      }
    },
  );

  server.registerTool(
    "get_unit",
    {
      title: "Get one RV",
      description:
        "The full record for one unit from search_inventory: specs with their sources, features, photos, price, dealer, the listing URLs, when MatchRV first and last saw the listing, and availability as last seen. Motorhomes include powertrain and towing ratings where published. Missing values are null, never estimated.",
      inputSchema: mcpSchema(z.object({ unit_id: unitId })),
      annotations: readOnly,
    },
    async ({ unit_id }) => {
      const ctx = caller();
      if (!ctx) return NO_CALLER();
      if (unitsLeft(ctx) === 0) return quotaError(ctx);
      const inv = inventory();
      const unit = inv.byId.get(unit_id);
      if (!unit) return result({ error: "unit_not_found", guidance: "Use a unit_id returned by search_inventory. Units MatchRV is holding back for review are not served." }, true);
      const powertrain = powertrainReport(unit);
      if (!charge(ctx, 1)) return quotaError(ctx);
      const usage = usageOf(ctx);
      return result({ unit: publicUnit(unit), availability: availabilityV1(unit, inv.builtAt), ...(powertrain ? { powertrain_and_towing: powertrain } : {}), usage });
    },
  );

  server.registerTool(
    "compare_units",
    {
      title: "Compare RVs",
      description: "Compare 2-4 units side by side, spec by spec. Unpublished values stay null and are never ranked as best.",
      inputSchema: mcpSchema(z.object({ unit_ids: z.array(unitId).min(2).max(4) })),
      annotations: readOnly,
    },
    async ({ unit_ids }) => {
      const ctx = caller();
      if (!ctx) return NO_CALLER();
      // All or nothing: a comparison with a unit missing is not a comparison.
      if (unit_ids.length > unitsLeft(ctx)) return quotaError(ctx, unit_ids.length);
      const inv = inventory();
      const units = unit_ids.map((id) => inv.byId.get(id));
      const missing = unit_ids.filter((_id, i) => !units[i]);
      if (missing.length) return result({ error: "unit_not_found", unit_ids: missing }, true);
      try {
        const found = units as CanonicalUnit[];
        const comparison = compareUnits(found, {} as Constraints);
        if (!charge(ctx, found.length)) return quotaError(ctx, found.length);
        return result({ comparison, units: found.map(publicUnit), usage: usageOf(ctx) });
      } catch (error) {
        return result({ error: "compare_failed", detail: error instanceof Error ? error.message : String(error) }, true);
      }
    },
  );

  server.registerTool(
    "evaluate_tow_fit",
    {
      title: "Check tow weight fit",
      description:
        "Weight screening for 1-6 units. With vehicle: whether each towable is within that vehicle's tow rating (a model name gives a range, so the answer depends on configuration until an exact rating is stated), plus a payload check when truck_payload_lbs is given. With trailer_weight_lbs: whether each motorhome can tow that trailer, limit by limit. This is screening guidance, not a towing-safety guarantee, and it never reports a combination as safe.",
      inputSchema: mcpSchema(towInput),
      annotations: readOnly,
    },
    async (input) => {
      const ctx = caller();
      if (!ctx) return NO_CALLER();
      const inv = inventory();
      const units: CanonicalUnit[] = [];
      for (const id of input.unit_ids) {
        const unit = inv.byId.get(id);
        if (!unit) return result({ error: "unit_not_found", unit_id: id }, true);
        units.push(unit);
      }
      const resolution = input.vehicle ? resolveTowVehicle(input.vehicle) : null;
      return result({
        ...(resolution ? { vehicle: resolution, fits: units.map((u) => ({ ...evaluateTowFit(u, resolution), unit_id: u.id, title: u.title })) } : {}),
        ...(input.truck_payload_lbs != null ? {
          payload_fits: units.map((u) => ({ unit_id: u.id, title: u.title, ...evaluatePayloadFit(u, { truckPayloadLbs: input.truck_payload_lbs!, passengersLbs: input.passengers_lbs ?? null, cargoLbs: input.cargo_lbs ?? null }) })),
          payload_note: "Tongue weight is estimated at 10-15% of GVWR (loaded), not the published empty hitch weight. Payload usually runs out before tow rating.",
        } : {}),
        ...(input.trailer_weight_lbs ? { motorhome_tow: units.map((u) => ({ ...evaluateMotorhomeTow(u, input.trailer_weight_lbs!, { tongueLbs: input.trailer_tongue_lbs, coachLoadedLbs: input.coach_loaded_weight_lbs }), title: u.title })) } : {}),
        notice: "Weight screening only. Before towing, confirm the exact vehicle configuration, door-sticker payload, GVWR/GCWR, hitch and tongue limits, axle loads, passengers and cargo.",
      });
    },
  );

  server.registerTool(
    "prepare_inquiry",
    {
      title: "Preview a dealer inquiry (sends nothing)",
      description:
        "Step 1 of contacting a dealership about one unit. Validates the shopper's name, email and/or phone and message, and returns the exact preview (dealership, RV, contact details, message, how it will be delivered) with a confirmation_token valid for 30 minutes. Nothing is sent. Show the whole preview to the shopper and get their explicit approval before send_inquiry. Needs an API key with the inquiry scope.",
      inputSchema: mcpSchema(z.object({
        unit_id: unitId,
        name: z.string().min(1).max(120).describe("Shopper's name, as they gave it."),
        email: z.string().max(160).optional(),
        phone: z.string().max(40).optional(),
        message: z.string().min(1).max(1500).describe("Message to the dealership, written or approved by the shopper."),
      })),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) => {
      const ctx = caller();
      if (!ctx) return NO_CALLER();
      if (!ctx.scopes.includes("inquiry")) return result({ error: "client_not_permitted", guidance: "This API key is not allowed to send dealer inquiries. Ask MatchRV for the inquiry scope." }, true);
      const unit = inventory().byId.get(input.unit_id);
      if (!unit) return result({ error: "unit_not_found", guidance: "Use a unit_id returned by search_inventory." }, true);
      const prepared = prepareInquiry(unit, { name: input.name, email: input.email ?? null, phone: input.phone ?? null, message: input.message }, undefined, { clientId: ctx.clientId, leadAttribution: mcpLeadContext(["prepare_inquiry"], "mcp_v1_send_inquiry", ctx)?.attribution ?? null });
      if (!prepared.ok) return result({ error: "invalid_contact", errors: prepared.errors, guidance: "Ask the shopper to correct these fields. Nothing was sent." }, true);
      return result({
        status: "preview_only_nothing_sent",
        preview: prepared.preview,
        confirmation_token: prepared.confirmationToken,
        expires_at: prepared.expiresAt,
        next: "Show this full preview to the shopper, with the price exactly as preview.unit.priceLabel and preview.unit.priceDisplay (\"Last listed price: $…\" or \"Price on request\"; not a quote). Only if they approve sending it, call send_inquiry with this confirmation_token and shopper_approved=true. This token only works with the API key that prepared it.",
      });
    },
  );

  server.registerTool(
    "send_inquiry",
    {
      title: "Send the approved dealer inquiry",
      description:
        "Step 2: sends the inquiry previewed by prepare_inquiry. Consequential: it shares the shopper's name, contact details and message with the dealership. Call only after the shopper approved that exact preview, with shopper_approved=true. The content is locked to the preview. Safe to retry: repeating the call with the same token returns the same inquiry and sends nothing further. Returns inquiry_id, a private status_token and the status: delivered, queued_for_matchrv or failed.",
      inputSchema: mcpSchema(z.object({
        confirmation_token: z.string().min(10).max(4000),
        shopper_approved: z.boolean().describe("Must be true, and only after the shopper explicitly approved the preview."),
        dry_run: z.boolean().optional().describe("Integration testing: validate and record without delivering to anyone."),
      })),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (input) => {
      const ctx = caller();
      if (!ctx) return NO_CALLER();
      const sent = await sendInquiry({
        confirmationToken: input.confirmation_token,
        confirmed: input.shopper_approved,
        dryRun: input.dry_run,
        requesterKey: `client:${ctx.clientId}`,
        scope: null,
        analyticsSource: "unknown",
        attribution: ctx,
        leadContext: mcpLeadContext(["send_inquiry"], "mcp_v1_send_inquiry", ctx),
        lookupUnit: (id) => inventory().byId.get(id),
      });
      if (!sent.ok) return result({ error: sent.code, guidance: sent.guidance, sent: false, ...(sent.code === "writes_frozen" ? { retryable: true } : {}) }, true);
      return result({
        inquiry_id: sent.inquiry.inquiryId,
        ...(sent.duplicate
          ? { duplicate: true, guidance: "This shopper already has an inquiry with this dealership about this RV from the last 24 hours, so it was not sent again." }
          : { status_token: sent.statusToken }),
        ...(sent.replayed ? { already_sent: true } : {}),
        status: sent.inquiry.status,
        status_detail: sent.inquiry.statusDetail,
        delivery_channel: sent.inquiry.deliveryChannel,
        dry_run: sent.inquiry.dryRun,
      });
    },
  );

  server.registerTool(
    "get_inquiry_status",
    {
      title: "Check a dealer inquiry",
      description: "Status of an inquiry sent with send_inquiry: delivered, queued_for_matchrv, forwarded or failed, plus the dealership's reply only if MatchRV has recorded one. Needs the inquiry_id and its status_token.",
      inputSchema: mcpSchema(z.object({ inquiry_id: z.string().min(5).max(60), status_token: z.string().min(10).max(80) })),
      annotations: readOnly,
    },
    async (input) => {
      if (!caller()) return NO_CALLER();
      const inquiry = getInquiryStatus(input.inquiry_id, input.status_token);
      if (!inquiry) return result({ error: "not_found", guidance: "Unknown inquiry_id or wrong status_token." }, true);
      return result({
        inquiry_id: inquiry.inquiryId, created_at: inquiry.createdAt, status: inquiry.status, status_detail: inquiry.statusDetail,
        delivery_channel: inquiry.deliveryChannel, dry_run: inquiry.dryRun, dealer_reply: inquiry.dealerReply, dealer_reply_note: inquiry.dealerReplyNote,
      });
    },
  );

  return server;
}

// ── HTTP layer: flag, key, then attribution ────────────────────────────────

const json = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

const v1Server = createMcpHandler(() => buildV1Server());
const innerFetch = v1Server.fetch.bind(v1Server);

v1Server.fetch = (async (input: Request | string, init?: RequestInit) => {
  const request = input instanceof Request ? input : new Request(input, init);
  if (!v1Enabled()) return json(404, { error: "not_found" });
  const check = checkAgentKey(agentKeyFromHeaders(request.headers));
  if (check.status !== "ok") {
    return json(401, {
      error: "unauthorized",
      detail: check.status === "none" ? "This endpoint needs a MatchRV API key." : "That API key is not valid or has been revoked.",
      guidance: "Send the key as 'Authorization: Bearer <key>'. Keys are issued by MatchRV.",
    }, { "www-authenticate": 'Bearer realm="matchrv", error="invalid_token"' });
  }
  if (!check.client.scopes.includes("read")) return json(403, { error: "client_not_permitted", detail: "This API key does not have the read scope." });
  return attributeMcpFetch(request, innerFetch, { surface: "mcp_v1", dealerFor: (id) => getScreenedInventory().byId.get(id)?.dealer.id ?? null });
}) as typeof v1Server.fetch;

export const matchRvMcpV1Handler = v1Server;
export const matchRvMcpV1NodeHandler = toNodeHandler(matchRvMcpV1Handler);

/** Test hook. */
export function __resetV1Quota(): void { spent.clear(); }
