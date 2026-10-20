import type { CanonicalUnit, InventoryIndex } from "@workspace/agent-core";

export const PRICE_FLOOR_REASON = "price_below_class_floor";

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
export function inventoryQualityIssues(unit: CanonicalUnit): string[] {
  const issues: string[] = [];
  const name = `${unit.title} ${unit.model} ${unit.trim ?? ""}`;
  if (/forest\s*river/i.test(unit.make) && /\b(?:salem|wildwood)\s+fsx\b/i.test(name)
      && !["travel_trailer", "toy_hauler"].includes(unit.rvType)) {
    issues.push("RV category conflicts with manufacturer FSX towable family; original category retained, correction requires review.");
  }
  if (/nu\s*camp/i.test(unit.make) && /\bcirrus\s+(?:620|820)\b/i.test(name)
      && unit.rvType !== "truck_camper") {
    issues.push("RV category conflicts with manufacturer Cirrus 620/820 truck-camper family; original category retained, correction requires review.");
  }
  const floor = priceFloorFor(unit);
  if (floor && unit.priceUsd.value !== null && unit.priceUsd.value < floor.minUsd) {
    issues.push(`[${PRICE_FLOOR_REASON}] Asking price $${unit.priceUsd.value.toLocaleString("en-US")} is below the $${floor.minUsd.toLocaleString("en-US")} plausibility floor for a ${floor.bucket} ${unit.rvType.replace(/_/g, " ")}; likely a payment, deposit, or scrape error. Withheld pending source review.`);
  }
  return issues;
}

/** MCP-only view. Never mutates the original snapshot or website index. */
export function screenMcpInventory(original: InventoryIndex) {
  const quarantined = new Map<string, string[]>();
  const units = original.units.filter(unit => {
    const issues = inventoryQualityIssues(unit);
    if (issues.length) quarantined.set(unit.id, issues);
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
      notice: "Records with identified category conflicts or prices below class plausibility floors are withheld pending source review. Screening is limited; remaining records are not independently verified dealer facts.",
    },
  };
}
