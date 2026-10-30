import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { CanonicalUnit, InventoryIndex } from "@workspace/agent-core";
import { inventoryQualityIssues, listingAgeDays, PRICE_FLOOR_REASON, priceFloorFor, screenMcpInventory, STALE_LISTING_MAX_AGE_DAYS, STALE_LISTING_REASON } from "../src/services/mcp-inventory-quality";

const snapshotPath = new URL("../../../lib/agent-core/data/inventory.snapshot.json", import.meta.url);
const snapshot = JSON.parse(
  existsSync(snapshotPath)
    ? readFileSync(snapshotPath, "utf8")
    : gunzipSync(readFileSync(new URL(`${snapshotPath.href}.gz`))).toString("utf8"),
);
const records = snapshot.units as CanonicalUnit[];
// Fixed synthetic category/price conflicts: live inventory refreshes must not
// silently remove regression fixtures or change which behavior is tested.
const fixture = records[0];
const fsx = [0, 1].map(n => ({ ...structuredClone(fixture),
  id: `test:fsx:${n}`, make: "Forest River", model: "Salem FSX", title: "2025 Forest River Salem FSX",
  rvType: "class_a" as const, condition: "new" as const, year: 2025,
  priceUsd: { value: 35000, source: "dealer_listing" as const, confidence: "high" as const },
}));
const cirrus = (id: string): CanonicalUnit => ({ ...structuredClone(fsx[0]), id, make: "nuCamp", model: "Cirrus 820", title: "2025 nuCamp Cirrus 820", rvType: "travel_trailer" });
const floor: CanonicalUnit = { ...structuredClone(fsx[1]), id: "stk:test:floor", rvType: "travel_trailer", priceUsd: { value: 1000, source: "dealer_listing", confidence: "high" } };
const known = [...fsx, cirrus("stk:test:cirrus"), floor];

describe("MCP inventory quality quarantine", () => {
  it("withholds conflicting records without rewriting source facts or provenance", () => {
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
    expect(inventoryQualityIssues({ ...recent, condition: "used", year: 2000, priceUsd: { ...recent.priceUsd, value: 3000 } })).toEqual([]);
    expect(inventoryQualityIssues({ ...recent, priceUsd: { ...recent.priceUsd, value: 9000 } })).toEqual([]);
  });
  it("quarantines class price-floor violations with a reason code, incl. near-new units labeled used", () => {
    const westbrook = { ...known[0], make: "Forest River", model: "Westbrook 27CC", title: "2026 Forest River RV Westbrook 27CC",
      rvType: "travel_trailer" as const, condition: "used" as const, year: 2026, priceUsd: { ...known[0].priceUsd, value: 1168 } };
    const issues = inventoryQualityIssues(westbrook);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain(`[${PRICE_FLOOR_REASON}]`);
    expect(inventoryQualityIssues({ ...westbrook, priceUsd: { ...westbrook.priceUsd, value: 7134 } })).toHaveLength(1);
    expect(inventoryQualityIssues({ ...westbrook, rvType: "class_b", condition: "used", year: 2015, priceUsd: { ...westbrook.priceUsd, value: 1030 } })).toHaveLength(1);
    expect(inventoryQualityIssues({ ...westbrook, rvType: "class_a", condition: "new", priceUsd: { ...westbrook.priceUsd, value: 25001 } })).toEqual([]);
    expect(priceFloorFor({ ...westbrook, year: 2018 }).bucket).toBe("used");
  });
});

describe("MCP stale-listing hold-back", () => {
  const built = "2026-10-30T09:00:00.000Z";
  const seen = (id: string, lastSeenAt: string): CanonicalUnit => ({ ...structuredClone(fixture), id, rvType: "travel_trailer", condition: "used", year: 2015,
    priceUsd: { value: 30000, source: "dealer_listing", confidence: "high" }, provenance: { ...structuredClone(fixture.provenance), lastSeenAt } });
  const fresh = seen("test:fresh", "2026-10-29T12:00:00.000Z");
  const edge = seen("test:edge", "2026-10-16T09:00:00.000Z"); // exactly 14 days: kept
  const stale = seen("test:stale", "2026-10-16T08:59:00.000Z");
  const sep17 = seen("test:sep17", "2026-09-17T12:00:00.000Z");
  const unknown = seen("test:unknown", "not-a-date");
  const index = (units: CanonicalUnit[], builtAt?: string) =>
    ({ units, byId: new Map(units.map(u => [u.id, u])), ...(builtAt ? { snapshot: { builtAt } } : {}) }) as unknown as InventoryIndex;

  it("holds back units last seen more than 14 days before the snapshot build, with a stale_listing reason", () => {
    expect(STALE_LISTING_MAX_AGE_DAYS).toBe(14);
    const screened = screenMcpInventory(index([fresh, edge, stale, sep17, unknown], built));
    expect(screened.units.map(u => u.id).sort()).toEqual(["test:edge", "test:fresh"]);
    expect(screened.byId.has("test:stale")).toBe(false); // get_rv lookups use byId
    expect(screened.quarantined.get("test:sep17")?.[0]).toContain(`[${STALE_LISTING_REASON}]`);
    expect(screened.inventoryQuality.heldBackByReason[STALE_LISTING_REASON]).toBe(3);
    expect(screened.inventoryQuality.staleListing).toEqual({ reason: STALE_LISTING_REASON, maxAgeDays: 14, measuredFrom: built, applied: true });
  });
  it("measures from the snapshot build time, not wall-clock time", () => {
    const old = screenMcpInventory(index([sep17], "2026-09-20T00:00:00.000Z"));
    expect(old.units).toHaveLength(1);
  });
  it("is configurable and never mutates source records", () => {
    const before = structuredClone(stale);
    expect(screenMcpInventory(index([stale, sep17], built), { staleAfterDays: 60 }).units).toHaveLength(2);
    expect(listingAgeDays(stale, new Date(built))).toBeGreaterThan(14);
    expect(stale).toEqual(before);
  });
  it("counts each held-back reason once per unit alongside price-floor holds", () => {
    const both = { ...sep17, id: "test:both", condition: "new" as const, year: 2026, priceUsd: { ...sep17.priceUsd, value: 1000 } };
    const q = screenMcpInventory(index([both, fresh], built)).inventoryQuality;
    expect(q.heldBackByReason).toMatchObject({ [STALE_LISTING_REASON]: 1, [PRICE_FLOOR_REASON]: 1 });
    expect(q.quarantinedUnits).toBe(1);
  });
  it("skips the stale rule only when no snapshot build time is available", () => {
    expect(screenMcpInventory(index([sep17])).units).toHaveLength(1);
    expect(inventoryQualityIssues(sep17)).toEqual([]);
  });
});
