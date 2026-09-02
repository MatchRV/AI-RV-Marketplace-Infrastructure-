import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  indexSnapshot,
  runSearch,
  compactSearchResult,
  compactUnitDetail,
  jsonSize,
  type InventorySnapshot,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(
  readFileSync(resolve(here, "../data/inventory.snapshot.json"), "utf-8"),
) as InventorySnapshot;
const idx = indexSnapshot(snapshot);

describe("committed inventory snapshot", () => {
  it("holds a real, well-formed corpus", () => {
    expect(idx.units.length).toBeGreaterThan(900);
    expect(snapshot.stats.dealers).toBeGreaterThan(20);
    for (const u of idx.units.slice(0, 200)) {
      expect(u.priceUsd.value).toBeGreaterThan(999);
      expect(u.images.length).toBeGreaterThan(0);
      expect(u.provenance.lastSeenAt).toBeTruthy();
      expect(u.dealer.lat).not.toBeNull();
    }
  });

  it("has unique unit ids", () => {
    expect(new Set(idx.units.map((u) => u.id)).size).toBe(idx.units.length);
  });

  it("never fabricates: unknown rates stay visible", () => {
    const unknownGvwr = idx.units.filter((u) => u.gvwrLbs.value === null).length;
    expect(unknownGvwr / idx.units.length).toBeGreaterThan(0.5); // dealer sites genuinely omit this
    const falseSolar = idx.units.filter((u) => u.solar.value === "none").length;
    expect(falseSolar).toBe(0); // absence of evidence is never evidence of absence
  });

  it("answers the flagship demo query fast with a consistent funnel", () => {
    const t0 = performance.now();
    const out = runSearch(idx.units, {
      rvTypes: ["travel_trailer"],
      priceMaxUsd: 45000,
      lengthMaxFt: 30,
      towVehicle: "Ford F-150 rated 8,000 lbs",
      location: { place: "Tacoma", radiusMiles: 150 },
      mustHave: ["bunkhouse"],
      prefer: ["solar", "lithium"],
      sleepsMin: 6,
      boondocking: true,
    });
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(250);
    expect(out.funnel.totalUnits).toBe(idx.units.length);
    expect(out.funnel.passedHard).toBeGreaterThan(10);
    const excluded = out.funnel.excluded.reduce((a, b) => a + b.count, 0);
    // collapsed identical twins keep the funnel math on raw units
    expect(out.funnel.passedHard + out.funnel.unverified + excluded).toBe(out.funnel.totalUnits);
    for (const m of out.results.slice(0, 10)) {
      expect(m.distanceMiles).not.toBeNull();
      expect(m.distanceMiles!).toBeLessThanOrEqual(150);
    }
  });

  it("returns empty-but-explained results for impossible searches", () => {
    const out = runSearch(idx.units, { priceMaxUsd: 1500, mustHave: ["bunkhouse"], sleepsMin: 12 });
    expect(out.results.length).toBe(0);
    expect(out.funnel.excluded.length).toBeGreaterThan(0);
    const compact = compactSearchResult(out, 5) as { guidance?: string };
    expect(compact.guidance).toContain("Relax");
  });

  it("keeps agent-facing payloads compact", () => {
    const out = runSearch(idx.units, {
      rvTypes: ["travel_trailer"],
      priceMaxUsd: 45000,
      location: { place: "Tacoma", radiusMiles: 150 },
      mustHave: ["bunkhouse"],
      towVehicle: "F-150 rated 8,000 lbs",
    });
    expect(jsonSize(compactSearchResult(out, 5))).toBeLessThan(2600);
    expect(jsonSize(compactSearchResult(out, 3))).toBeLessThan(1900);
    expect(jsonSize(compactUnitDetail(out.results[0].unit))).toBeLessThan(1700);
  });

  it("handles stale data honestly", () => {
    const u = idx.units[0];
    const hours = (Date.now() - Date.parse(u.provenance.lastSeenAt)) / 36e5;
    expect(hours).toBeGreaterThan(48); // this snapshot IS stale — and the tools must say so
  });
});
