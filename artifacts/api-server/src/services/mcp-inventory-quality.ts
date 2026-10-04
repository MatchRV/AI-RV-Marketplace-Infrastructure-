import type { CanonicalUnit, InventoryIndex } from "@workspace/agent-core";

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
  // $1,000 is the import acceptance floor. A recent new RV at that floor is
  // held for source-price review, not declared fraudulent or assigned a price.
  if (unit.condition === "new" && unit.year >= 2020 && unit.priceUsd.value !== null
      && unit.priceUsd.value <= 1000) {
    issues.push("Recent new RV price is at or below the $1,000 import floor; asking price is unsupported pending source review.");
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
      notice: "Records with identified category conflicts or suspicious import-floor prices are withheld pending source review. Screening is limited; remaining records are not independently verified dealer facts.",
    },
  };
}
