/**
 * InventoryState freshness. Off unless INVENTORY_STATE_FRESHNESS is enabled.
 *
 * `stale` is computed here and never stored. `retrieved_at` is a per-request
 * projection and is never written back onto a unit. Recheck reads the inventory
 * index only: no dealer-page fetches.
 *
 * The 30-day clock stays snapshot `builtAt` unless INVENTORY_FRESHNESS_WALL_CLOCK
 * is also on. That second flag does nothing while recheck itself is off, so the
 * process-start screen in screened-inventory.ts keeps today's builtAt behavior.
 */
import type { CanonicalUnit, InventoryIndex, InventoryVerifiedVia } from "@workspace/agent-core";
import {
  screenMcpInventory,
  STALE_LISTING_MAX_AGE_DAYS,
  STALE_LISTING_REASON,
} from "./mcp-inventory-quality";
import { readInventoryIndex } from "./inventory-index-source";

export type DealerInventoryState = "available" | "pending" | "sold" | "unknown";
export type Freshness = "current" | "stale";

const ON = new Set(["1", "true"]);

function flagOn(raw: string | undefined): boolean {
  return ON.has((raw ?? "").trim().toLowerCase());
}

/** Request-time recheck and the additive inventory_state projection. Default off. */
export function inventoryFreshnessRecheckEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return flagOn(env.INVENTORY_STATE_FRESHNESS);
}

/**
 * Measure the 30-day window against wall-clock now() instead of snapshot builtAt.
 * Default off. Only the request-time recheck consults this. The memoized
 * process-start screen does not.
 */
export function inventoryFreshnessWallClockEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return flagOn(env.INVENTORY_FRESHNESS_WALL_CLOCK);
}

export interface InventoryStateProjection {
  state: DealerInventoryState;
  freshness: Freshness;
  verified_at: string | null;
  retrieved_at: string;
  verified_via: InventoryVerifiedVia;
  first_seen: string | null;
  last_seen: string | null;
  days_on_lot: number | null;
  /** Listing freshness, not a live walk of the lot. */
  note: string;
}

export interface WithheldListing {
  reason: "stale" | "sold" | "unknown" | "left_active_set" | "quality";
  guidance: string;
  issues?: string[];
  inventory_state?: InventoryStateProjection;
  retrieved_at: string;
}

export interface RecheckedInventory {
  units: CanonicalUnit[];
  byId: Map<string, CanonicalUnit>;
  withheld: Map<string, WithheldListing>;
  snapshot: InventoryIndex["snapshot"];
  inventoryQuality: ReturnType<typeof screenMcpInventory>["inventoryQuality"];
  retrievedAt: string;
  project(unit: CanonicalUnit): InventoryStateProjection | null;
}

/** Explicit verifiedAt wins. Unparseable explicit values do not fall back. Otherwise lastSeenAt. */
export function verifiedAtFor(unit: CanonicalUnit): string | null {
  const explicit = unit.provenance?.verifiedAt;
  if (explicit != null && explicit !== "") {
    return Number.isFinite(Date.parse(explicit)) ? explicit : null;
  }
  const seen = unit.provenance?.lastSeenAt;
  return seen && Number.isFinite(Date.parse(seen)) ? seen : null;
}

/** Project verified_via. Does not read Fact.source or a lead source. */
export function verifiedViaFor(unit: CanonicalUnit): InventoryVerifiedVia {
  const explicit = unit.provenance?.verifiedVia;
  if (explicit === "listing_page" || explicit === "recheck" || explicit === "marketcheck") return explicit;
  const blob = `${unit.provenance?.harvestMethod ?? ""} ${unit.provenance?.lastSeenBasis ?? ""}`.toLowerCase();
  if (blob.includes("recheck")) return "recheck";
  if (blob.includes("marketcheck")) return "marketcheck";
  return "listing_page";
}

export function dealerStateOf(unit: CanonicalUnit): DealerInventoryState | "left_active_set" {
  switch (unit.status) {
    case "removed":
      return "left_active_set";
    case "sold":
      return "sold";
    case "pending":
      return "pending";
    case "available":
      return "available";
    default:
      return "unknown";
  }
}

function daysOnLot(unit: CanonicalUnit): number | null {
  const first = Date.parse(unit.provenance?.firstSeenAt ?? "");
  const last = Date.parse(unit.provenance?.lastSeenAt ?? "");
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  return Math.max(0, Math.floor((last - first) / 864e5));
}

function listingNote(unit: CanonicalUnit): string {
  const base = "This is listing freshness from MatchRV's inventory index, not a live walk of the lot. The dealership confirms the price and whether the RV can still be bought.";
  const blob = `${unit.dealer?.name ?? ""} ${unit.dealer?.id ?? ""} ${unit.provenance?.dealerDomain ?? ""}`.toLowerCase();
  if (blob.includes("discount")) {
    return `${base} Discount RV listings were recovered from public ads and are not a live feed.`;
  }
  return base;
}

export function projectInventoryState(
  unit: CanonicalUnit,
  opts: { now: Date; referenceTime: Date | undefined; maxAgeDays?: number },
): InventoryStateProjection | null {
  const state = dealerStateOf(unit);
  if (state === "left_active_set") return null;
  const verified_at = verifiedAtFor(unit);
  const maxAge = opts.maxAgeDays ?? STALE_LISTING_MAX_AGE_DAYS;
  let freshness: Freshness = "current";
  if (verified_at == null) freshness = "stale";
  else if (opts.referenceTime) {
    const age = (opts.referenceTime.getTime() - Date.parse(verified_at)) / 864e5;
    if (age > maxAge) freshness = "stale";
  }
  return {
    state,
    freshness,
    verified_at,
    retrieved_at: opts.now.toISOString(),
    verified_via: verifiedViaFor(unit),
    first_seen: unit.provenance?.firstSeenAt ?? null,
    last_seen: unit.provenance?.lastSeenAt ?? null,
    days_on_lot: daysOnLot(unit),
    note: listingNote(unit),
  };
}

function dateLabel(iso: string | null): string {
  if (!iso) return "an unknown date";
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? iso.slice(0, 10) : "an unknown date";
}

function guidanceFor(reason: WithheldListing["reason"], projection: InventoryStateProjection | null, maxAge: number): string {
  if (reason === "sold") {
    return `Listed as sold as of ${dateLabel(projection?.verified_at ?? null)}. Do not present it for sale. Offer a fresh search.`;
  }
  if (reason === "stale") {
    return `Last verified ${dateLabel(projection?.verified_at ?? null)}, outside the ${maxAge}-day window. This listing is stale and may have sold. Offer a dealer confirm or a fresh search. Do not recommend it.`;
  }
  if (reason === "left_active_set") {
    return "This RV has left the active inventory set. That is not a sold label. Offer a fresh search.";
  }
  if (reason === "unknown") {
    return "The dealer listing does not say whether this RV can be bought. MatchRV will not recommend it. Offer a dealer confirm or a fresh search.";
  }
  return "This listing is withheld pending source review. Do not recommend it. Offer a fresh search.";
}

function referenceTimeFor(index: InventoryIndex, now: Date, wallClock: boolean): Date | undefined {
  if (wallClock) return now;
  const builtAt = Date.parse(index.snapshot?.builtAt ?? "");
  return Number.isFinite(builtAt) ? new Date(builtAt) : undefined;
}

/**
 * Re-read the installed index and decide what may be recommended.
 * Safe to call on every request. Does not mutate units or the index.
 */
export function recheckForRecommend(now = new Date()): RecheckedInventory {
  return recheckIndex(readInventoryIndex(), now);
}

export function recheckIndex(index: InventoryIndex, now = new Date()): RecheckedInventory {
  const wallClock = inventoryFreshnessWallClockEnabled();
  const referenceTime = referenceTimeFor(index, now, wallClock);
  const maxAgeDays = STALE_LISTING_MAX_AGE_DAYS;
  const project = (unit: CanonicalUnit) => projectInventoryState(unit, { now, referenceTime, maxAgeDays });
  const screened = screenMcpInventory(index, {
    ...(wallClock && referenceTime ? { referenceTime, clock: "wall" as const } : {}),
    anchor: (unit) => verifiedAtFor(unit),
  });
  const withheld = new Map<string, WithheldListing>();
  const hold = (unit: CanonicalUnit, reason: WithheldListing["reason"], issues?: string[]) => {
    const projection = project(unit);
    withheld.set(unit.id, {
      reason,
      guidance: guidanceFor(reason, projection, maxAgeDays),
      ...(issues?.length ? { issues } : {}),
      ...(projection ? { inventory_state: projection } : {}),
      retrieved_at: now.toISOString(),
    });
  };
  for (const [id, issues] of screened.quarantined) {
    const unit = index.byId.get(id);
    if (!unit) continue;
    const state = dealerStateOf(unit);
    if (state === "left_active_set") hold(unit, "left_active_set", issues);
    else if (state === "sold") hold(unit, "sold", issues);
    else if (issues.some((issue) => issue.includes(`[${STALE_LISTING_REASON}]`)) || project(unit)?.freshness === "stale") hold(unit, "stale", issues);
    else hold(unit, "quality", issues);
  }
  const units: CanonicalUnit[] = [];
  for (const unit of screened.units) {
    const state = dealerStateOf(unit);
    if (state === "left_active_set") hold(unit, "left_active_set");
    else if (state === "sold") hold(unit, "sold");
    else if (state === "unknown") hold(unit, "unknown");
    else if (project(unit)?.freshness === "stale") hold(unit, "stale");
    else units.push(unit);
  }
  return {
    units,
    byId: new Map(units.map((unit) => [unit.id, unit])),
    withheld,
    snapshot: index.snapshot,
    inventoryQuality: {
      ...screened.inventoryQuality,
      eligibleUnits: units.length,
      quarantinedUnits: index.units.length - units.length,
    },
    retrievedAt: now.toISOString(),
    project,
  };
}

export function withheldToolPayload(held: WithheldListing): Record<string, unknown> {
  const error = held.reason === "stale" || held.reason === "quality"
    ? "unit_quarantined"
    : held.reason === "sold"
      ? "unit_sold"
      : "unit_not_current";
  return {
    error,
    reason: held.reason,
    ...(held.issues ? { issues: held.issues } : {}),
    ...(held.inventory_state ? { inventory_state: held.inventory_state } : {}),
    retrieved_at: held.retrieved_at,
    guidance: held.guidance,
  };
}

export interface ListingDelta {
  price: boolean;
  lot: boolean;
  status: boolean;
  guidance: string;
}

/** Difference between the unit searched earlier in this request and the pre-return re-read. */
export function listingDelta(before: CanonicalUnit, after: CanonicalUnit): ListingDelta | null {
  const price = before.priceUsd?.value !== after.priceUsd?.value;
  const lot = before.dealer?.id !== after.dealer?.id
    || before.dealer?.name !== after.dealer?.name
    || before.dealer?.city !== after.dealer?.city
    || before.dealer?.state !== after.dealer?.state;
  const status = before.status !== after.status;
  if (!price && !lot && !status) return null;
  const parts: string[] = [];
  if (price) parts.push("The listed price changed. Use the price in this result. Listed prices remain listed prices; the dealership confirms.");
  if (lot) parts.push("The dealer lot or location changed. Use the dealer in this result.");
  if (status) parts.push("The dealer listing status changed. Use inventory_state in this result.");
  return { price, lot, status, guidance: parts.join(" ") };
}
