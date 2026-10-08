import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { CanonicalUnit, InventoryIndex } from "@workspace/agent-core";
import { inventoryQualityIssues, screenMcpInventory } from "../src/services/mcp-inventory-quality";

const snapshotPath = new URL("../../../lib/agent-core/data/inventory.snapshot.json", import.meta.url);
const snapshot = JSON.parse(
  existsSync(snapshotPath)
    ? readFileSync(snapshotPath, "utf8")
    : gunzipSync(readFileSync(new URL(`${snapshotPath.href}.gz`))).toString("utf8"),
);
const records = snapshot.units as CanonicalUnit[];
// Two real FSX category conflicts from the snapshot, plus Cirrus / import-floor
// cases built from them (those source records were removed with the
// photo-less Washington inventory).
const fsx = ["vin:4X4TSMC20TY015593", "vin:4X4TSMC23TY016060"].map(id => records.find(unit => unit.id === id)!);
const cirrus = (id: string): CanonicalUnit => fsx[0] && ({ ...structuredClone(fsx[0]), id, make: "nuCamp", model: "Cirrus 820", title: "2025 nuCamp Cirrus 820", rvType: "travel_trailer" });
const floor: CanonicalUnit = fsx[1] && { ...structuredClone(fsx[1]), id: "stk:test:floor", rvType: "travel_trailer", condition: "new", year: 2025, priceUsd: { value: 1000, source: "dealer_listing", confidence: "high" } };
const known = [...fsx, cirrus("stk:test:cirrus"), floor];

describe("MCP inventory quality quarantine", () => {
  it("withholds actual conflicting records without rewriting source facts or provenance", () => {
    expect(known.every(Boolean)).toBe(true);
    const original = structuredClone(known);
    const index = { units: known, byId: new Map(known.map(u => [u.id, u])) } as InventoryIndex;
    const screened = screenMcpInventory(index);
    expect(screened.units).toHaveLength(0);
    expect(screened.quarantined.size).toBe(4);
    expect(screened.byId.size).toBe(0);
    expect(index.byId.size).toBe(4);
    expect(known).toEqual(original);
  });
  it("keeps supported FSX trailer and toy-hauler categories; never reclassifies a conflict", () => {
    for (const rvType of ["travel_trailer", "toy_hauler"] as const)
      expect(inventoryQualityIssues({ ...known[0], rvType })).toEqual([]);
    expect(inventoryQualityIssues({ ...known[0], rvType: "class_a" })).not.toEqual([]);
  });
  it("keeps correctly categorized Cirrus with a non-boundary source price", () => {
    expect(inventoryQualityIssues({ ...known[2], rvType: "truck_camper", priceUsd: { ...known[2].priceUsd, value: 35000 } })).toEqual([]);
  });
  it("holds recent new import-floor prices while retaining old used low-price records", () => {
    const recent = { ...known[0], rvType: "travel_trailer" as const, priceUsd: { ...known[0].priceUsd, value: 1000 } };
    expect(inventoryQualityIssues(recent)).toHaveLength(1);
    expect(inventoryQualityIssues({ ...recent, condition: "used", year: 2000 })).toEqual([]);
    expect(inventoryQualityIssues({ ...recent, priceUsd: { ...recent.priceUsd, value: 1001 } })).toEqual([]);
  });
});
