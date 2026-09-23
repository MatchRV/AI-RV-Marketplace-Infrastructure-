import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { matchingUnits } from "./matching-fixture.js";
import {
  indexSnapshot,
  runSearch,
  compactSearchResult,
  compactUnitDetail,
  jsonSize,
  availabilitySummary,
  evaluateUnit,
  buildContext,
  type InventorySnapshot,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(
  readFileSync(resolve(here, "../data/inventory.snapshot.json"), "utf-8"),
) as InventorySnapshot;
const idx = indexSnapshot(snapshot);
afterEach(() => vi.useRealTimers());

describe("committed inventory snapshot", () => {
  it("holds a real, well-formed corpus", () => {
    expect(idx.units.length).toBeGreaterThan(900);
    expect(snapshot.stats.dealers).toBeGreaterThan(20);
    expect(snapshot.stats.units).toBe(idx.units.length);
    for (const u of idx.units) {
      expect(u.priceUsd.value).toBeGreaterThan(999);
      expect(Array.isArray(u.images)).toBe(true);
      expect(Number.isFinite(Date.parse(u.provenance.lastSeenAt))).toBe(true);
      expect(u.dealer.lat === null || (Number.isFinite(u.dealer.lat) && Math.abs(u.dealer.lat) <= 90)).toBe(true);
      expect(u.dealer.lng === null || (Number.isFinite(u.dealer.lng) && Math.abs(u.dealer.lng) <= 180)).toBe(true);
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

  it("excludes units with unresolved dealer coords when location is required (area guarantee)", () => {
    const u = structuredClone(matchingUnits[0]);
    u.dealer.lat = null;
    u.dealer.lng = null;
    u.images = [];
    const match = evaluateUnit(u, buildContext({ location: { place: "Tacoma", radiusMiles: 150 } }));
    expect(match.distanceMiles).toBeNull();
    expect(match.hardStatus).toBe("fail");
    expect(match.unknownFields).toContain("dealerLocation");
    expect(match.unit.images).toEqual([]);
  });

  it("geocodes snapshot dealers and backfills sleeps at index time", () => {
    const withCoords = idx.units.filter((u) => u.dealer.lat !== null && u.dealer.lng !== null).length;
    expect(withCoords / idx.units.length).toBeGreaterThan(0.95);
    const withSleeps = idx.units.filter((u) => u.sleeps.value !== null).length;
    expect(withSleeps / idx.units.length).toBeGreaterThan(0.95);
    const wa = idx.units.filter((u) => u.dealer.state === "WA");
    expect(wa.length).toBeGreaterThan(100);
    expect(wa.every((u) => u.dealer.lat !== null)).toBe(true);
  });

  it("Fife WA search returns only regional units with sleeps populated", () => {
    const t0 = performance.now();
    const out = runSearch(idx.units, {
      rvTypes: ["travel_trailer"],
      sleepsMin: 8,
      location: { place: "Fife", radiusMiles: 150 },
    });
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(5000);
    expect(out.locationResolution?.place).toBe("Fife");
    expect(out.coverage.noLocalMatches).toBe(false);
    expect(out.results.length).toBeGreaterThan(0);
    for (const m of out.results.slice(0, 20)) {
      expect(["WA", "OR", "ID", "MT"]).toContain(m.unit.dealer.state);
      expect(m.distanceMiles).not.toBeNull();
      expect(m.distanceMiles!).toBeLessThanOrEqual(150);
      expect(m.unit.sleeps.value).not.toBeNull();
      expect(m.unit.sleeps.value!).toBeGreaterThanOrEqual(8);
    }
  });
});

describe("matching against stable fixtures", () => {

  it("answers the flagship demo query fast with a consistent funnel", () => {
    const t0 = performance.now();
    const out = runSearch(matchingUnits, {
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
    expect(out.funnel.totalUnits).toBe(matchingUnits.length);
    expect(out.funnel.passedHard).toBe(matchingUnits.length);
    expect(out.results.map((m) => m.unit.id).sort()).toEqual(matchingUnits.map((u) => u.id).sort());
    const excluded = out.funnel.excluded.reduce((a, b) => a + b.count, 0);
    // collapsed identical twins keep the funnel math on raw units
    expect(out.funnel.passedHard + out.funnel.unverified + excluded).toBe(out.funnel.totalUnits);
    for (const m of out.results.slice(0, 10)) {
      expect(m.distanceMiles).not.toBeNull();
      expect(m.distanceMiles!).toBeLessThanOrEqual(150);
    }
  });

  it("returns empty-but-explained results for impossible searches", () => {
    const out = runSearch(matchingUnits, { priceMaxUsd: 1500, mustHave: ["bunkhouse"], sleepsMin: 12 });
    expect(out.results.length).toBe(0);
    expect(out.funnel.excluded.length).toBeGreaterThan(0);
    const compact = compactSearchResult(out, 5) as { guidance?: string };
    expect(compact.guidance).toContain("Relax");
  });

  it("keeps agent-facing payloads compact", () => {
    const out = runSearch(matchingUnits, {
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

  it("reports freshness from last verification, independent of today's date", () => {
    const u = matchingUnits[0];
    const verified = Date.parse(u.provenance.lastSeenAt);
    vi.useFakeTimers();
    vi.setSystemTime(verified + 24 * 36e5);
    expect(availabilitySummary(u, "fixture")).toMatchObject({ stale: false, hoursSinceVerified: 24 });
    vi.setSystemTime(verified + 72 * 36e5);
    expect(availabilitySummary(u, "fixture")).toMatchObject({ stale: true, hoursSinceVerified: 72 });
  });
});
