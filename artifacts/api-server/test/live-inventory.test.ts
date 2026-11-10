import { describe, expect, it } from "vitest";
import { querySnapshotListings, snapshotInventoryCounts, SNAPSHOT_COUNT_TYPES } from "../src/services/snapshot-listings";
import {
  applyInventoryCounts,
  fillLlmsInventoryCount,
  RV_COUNT_LIVE_STATUS,
  RV_COUNT_PLACEHOLDER,
  RV_COUNT_UNAVAILABLE_STATUS,
} from "../src/lib/live-inventory";
import { renderCoreSitemap } from "../src/lib/sitemap";

describe("live inventory counts", () => {
  it("matches GET /api/listings totals for the snapshot, including each type", () => {
    const counts = snapshotInventoryCounts();
    expect(counts.total).toBe(querySnapshotListings({ limit: "1" }).total);
    expect(counts.total).toBeGreaterThan(0);
    let typed = 0;
    for (const type of SNAPSHOT_COUNT_TYPES) {
      expect(counts.byType[type]).toBe(querySnapshotListings({ limit: "1", type }).total);
      typed += counts.byType[type];
    }
    expect(typed).toBeLessThanOrEqual(counts.total);
  });

  it("rewrites prerender placeholders with the supplied counts and invents none when counts are missing", () => {
    const html = [
      "<head><title>MatchRV</title></head>",
      `<body><dd data-rv-count="total">${RV_COUNT_PLACEHOLDER}</dd>`,
      `<span data-rv-count-status="total">${RV_COUNT_UNAVAILABLE_STATUS}</span>`,
      `<strong data-rv-count="travel_trailer">${RV_COUNT_PLACEHOLDER}</strong></body>`,
    ].join("");
    const blank = applyInventoryCounts(html, null);
    expect(blank).toContain(RV_COUNT_PLACEHOLDER);
    expect(blank).toContain(RV_COUNT_UNAVAILABLE_STATUS);
    expect(blank).not.toContain("matchrv-inventory-counts");
    expect(blank).not.toMatch(/\d{3,}/);

    const byType = Object.fromEntries(SNAPSHOT_COUNT_TYPES.map((type) => [type, 0])) as ReturnType<typeof snapshotInventoryCounts>["byType"];
    byType.travel_trailer = 19;
    const filled = applyInventoryCounts(html, { total: 42, byType });
    expect(filled).toContain('<script type="application/json" id="matchrv-inventory-counts">');
    expect(filled).toContain('"total":42');
    expect(filled).toContain('<dd data-rv-count="total">42</dd>');
    expect(filled).toContain(RV_COUNT_LIVE_STATUS);
    expect(filled).toContain('<strong data-rv-count="travel_trailer">19</strong>');
    expect(filled).not.toContain(RV_COUNT_UNAVAILABLE_STATUS);
    expect(filled).not.toContain("131");
  });

  it("fills llms.txt from the live total and leaves no token or fixed inventory size", () => {
    const template = "Live RV inventory: {{LIVE_RV_COUNT}}. Coverage stays dated.";
    expect(fillLlmsInventoryCount(template, null)).toBe(
      "Live RV inventory: the live total from GET /api/listings (unavailable for this response). Coverage stays dated.",
    );
    const byType = Object.fromEntries(SNAPSHOT_COUNT_TYPES.map((type) => [type, 0])) as ReturnType<typeof snapshotInventoryCounts>["byType"];
    expect(fillLlmsInventoryCount(template, { total: 1200, byType })).toBe(
      "Live RV inventory: 1,200 RVs. Coverage stays dated.",
    );
  });

  it("lists the visibility solution and not the retired /advertising URL", () => {
    const xml = renderCoreSitemap();
    expect(xml).toContain("https://matchrv.com/visibility-solution");
    expect(xml).not.toContain("/advertising");
  });
});
