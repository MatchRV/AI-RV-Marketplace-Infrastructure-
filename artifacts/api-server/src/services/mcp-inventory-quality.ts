import type { CanonicalUnit, InventoryIndex } from "@workspace/agent-core";

export const PRICE_FLOOR_REASON = "price_below_class_floor";
export const STALE_LISTING_REASON = "stale_listing";
export const CATEGORY_CONFLICT_REASON = "category_conflict";

/**
 * A unit whose dealer listing was last seen more than this many days before the
 * snapshot was built is held back from MCP search, get_rv and eligibility: it
 * may have sold. Measured against the snapshot build time (not wall-clock), so
 * the rule is deterministic per snapshot and a fresh pull re-admits the unit.
 * Configurable with env STALE_LISTING_MAX_AGE_DAYS (positive number of days).
 */
export const DEFAULT_STALE_LISTING_MAX_AGE_DAYS = 30;

/** Parse STALE_LISTING_MAX_AGE_DAYS; anything missing or not a positive finite number falls back to the default. */
export function resolveStaleListingMaxAgeDays(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_STALE_LISTING_MAX_AGE_DAYS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STALE_LISTING_MAX_AGE_DAYS;
}

export const STALE_LISTING_MAX_AGE_DAYS = resolveStaleListingMaxAgeDays(process.env.STALE_LISTING_MAX_AGE_DAYS);

/** Days between the unit's last-seen time and the reference time; null when unknown/unparseable. */
export function listingAgeDays(unit: CanonicalUnit, referenceTime: Date): number | null {
  const seen = Date.parse(unit.provenance?.lastSeenAt ?? "");
  const ref = referenceTime.getTime();
  if (!Number.isFinite(seen) || !Number.isFinite(ref)) return null;
  return (ref - seen) / 864e5;
}

export interface QualityOptions {
  /** Snapshot build time. Without it the stale-listing rule is not applied. */
  referenceTime?: Date;
  staleAfterDays?: number;
}

/**
 * Minimum plausible asking price by RV class, for new / near-new (model year
 * within one year of the current year, whatever the dealer's condition label)
 * vs older used units. Derived from the 56k-unit Oct 2026 snapshot: each new
 * floor sits well under that class's 0.5th percentile (new TT p0.5 $10,999,
 * FW $34,900, TH $18,298, Class A/B ~$22-25k, C $18,995, truck camper $11,995,
 * popup $7,590) so only obvious payment/deposit/scrape values trip it. Used
 * floors target the sub-$2-5k cluster (e.g. used Class B: 95 units under $3k,
 * then nothing until ~$10k) that are monthly payments, not prices.
 */
const NEW_FLOORS: Record<string, number> = {
  travel_trailer: 8000, fifth_wheel: 15000, toy_hauler: 12000, popup_camper: 5000,
  truck_camper: 5000, class_a: 15000, class_b: 15000, class_c: 15000,
};
const USED_FLOORS: Record<string, number> = {
  travel_trailer: 2500, fifth_wheel: 3000, toy_hauler: 3000, popup_camper: 1500,
  truck_camper: 1500, class_a: 5000, class_b: 5000, class_c: 5000,
};

export function priceFloorFor(unit: CanonicalUnit, now = new Date()): { minUsd: number; bucket: "new" | "used" } | null {
  const nearNew = unit.condition === "new" || (unit.year ?? 0) >= now.getFullYear() - 1;
  const table = nearNew ? NEW_FLOORS : USED_FLOORS;
  const minUsd = table[unit.rvType] ?? (nearNew ? 5000 : 1500);
  return { minUsd, bucket: nearNew ? "new" : "used" };
}

/** Narrow evidence-backed conflicts, not an inferred replacement taxonomy. */
export function inventoryQualityIssues(unit: CanonicalUnit, opts: QualityOptions = {}): string[] {
  const issues: string[] = [];
  if (opts.referenceTime) {
    const maxAge = opts.staleAfterDays ?? STALE_LISTING_MAX_AGE_DAYS;
    const age = listingAgeDays(unit, opts.referenceTime);
    // Unknown last-seen counts as stale: freshness can't be shown.
    if (age === null || age > maxAge) {
      const seen = age === null ? "unknown" : unit.provenance.lastSeenAt.slice(0, 10);
      issues.push(`[${STALE_LISTING_REASON}] Dealer listing last seen ${seen}, more than ${maxAge} days before this inventory snapshot was built (${opts.referenceTime.toISOString().slice(0, 10)}); it may have sold. Withheld until a fresh inventory pull sees it again.`);
    }
  }
  const name = `${unit.title} ${unit.model} ${unit.trim ?? ""}`;
  if (/forest\s*river/i.test(unit.make) && /\b(?:salem|wildwood)\s+fsx\b/i.test(name)
      && !["travel_trailer", "toy_hauler"].includes(unit.rvType)) {
    issues.push(`[${CATEGORY_CONFLICT_REASON}] RV category conflicts with manufacturer FSX towable family; original category retained, correction requires review.`);
  }
  if (/nu\s*camp/i.test(unit.make) && /\bcirrus\s+(?:620|820)\b/i.test(name)
      && unit.rvType !== "truck_camper") {
    issues.push(`[${CATEGORY_CONFLICT_REASON}] RV category conflicts with manufacturer Cirrus 620/820 truck-camper family; original category retained, correction requires review.`);
  }
  const floor = priceFloorFor(unit);
  if (floor && unit.priceUsd.value !== null && unit.priceUsd.value < floor.minUsd) {
    issues.push(`[${PRICE_FLOOR_REASON}] Asking price $${unit.priceUsd.value.toLocaleString("en-US")} is below the $${floor.minUsd.toLocaleString("en-US")} plausibility floor for a ${floor.bucket} ${unit.rvType.replace(/_/g, " ")}; likely a payment, deposit, or scrape error. Withheld pending source review.`);
  }
  return issues;
}

/** MCP-only view. Never mutates the original snapshot or website index. */
export function screenMcpInventory(original: InventoryIndex, opts: { staleAfterDays?: number } = {}) {
  const quarantined = new Map<string, string[]>();
  const builtAt = Date.parse(original.snapshot?.builtAt ?? "");
  const referenceTime = Number.isFinite(builtAt) ? new Date(builtAt) : undefined;
  const staleAfterDays = opts.staleAfterDays ?? STALE_LISTING_MAX_AGE_DAYS;
  const heldBackByReason: Record<string, number> = { [STALE_LISTING_REASON]: 0, [PRICE_FLOOR_REASON]: 0, [CATEGORY_CONFLICT_REASON]: 0 };
  const units = original.units.filter(unit => {
    const issues = inventoryQualityIssues(unit, { referenceTime, staleAfterDays });
    if (issues.length) {
      quarantined.set(unit.id, issues);
      for (const reason of new Set(issues.map(i => /^\[([a-z_]+)\]/.exec(i)?.[1] ?? "other"))) heldBackByReason[reason] = (heldBackByReason[reason] ?? 0) + 1;
    }
    return issues.length === 0;
  });
  return {
    ...original,
    units,
    byId: new Map(units.map(unit => [unit.id, unit])),
    quarantined,
    inventoryQuality: {
      originalUnits: original.units.length,
      eligibleUnits: units.length,
      quarantinedUnits: quarantined.size,
      heldBackByReason,
      staleListing: { reason: STALE_LISTING_REASON, maxAgeDays: staleAfterDays, measuredFrom: referenceTime?.toISOString() ?? null, applied: Boolean(referenceTime) },
      notice: `Records with identified category conflicts, prices below class plausibility floors, or dealer listings not seen within ${staleAfterDays} days of the snapshot build are withheld pending source review. Screening is limited; remaining records are not independently verified dealer facts.`,
    },
  };
}
