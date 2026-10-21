import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  indexSnapshot, runSearch, evaluateUnit, buildContext, haversineMiles,
  titleModelYear, vinModelYear, effectiveModelYear, qualifiesAsNew, reconcileYearAndCondition,
  listingLocationFromTitle, dealerCityCandidates, cityFromDealerName,
  type CanonicalUnit, type InventorySnapshot,
} from "../src/index.js";
import { resolveDealerCoords } from "../src/enrich-snapshot.js";
import { matchingUnits } from "./matching-fixture.js";

const NOW = new Date("2026-10-21T12:00:00Z");
const TACOMA = { lat: 47.2529, lng: -122.4443 };
const WA_CENTROID = { lat: 47.4009, lng: -120.5015 };

const unitLike = (o: Partial<CanonicalUnit>): CanonicalUnit => ({ ...structuredClone(matchingUnits[0]), ...o });

describe("model year evidence", () => {
  it("reads the title year and the VIN year", () => {
    expect(titleModelYear("2016 JAYCO JAY SERIES 1207UD", NOW)).toBe(2016);
    expect(titleModelYear("New 2027 Storyteller Overland GXV at General RV | Denver, CO", NOW)).toBe(2027);
    expect(titleModelYear("Keystone Cougar 2400BH", NOW)).toBeNull(); // floorplan digits are not a year
    expect(vinModelYear("1UJAJ0AF8G1B30166", NOW)).toBe(2016);
    expect(vinModelYear("4YDTCMG11NJ947055", NOW)).toBe(2022);
    expect(vinModelYear("4X4CFMU12TD323883", NOW)).toBe(2026);
  });
  it("prefers title (VIN as tiebreaker) over a drifted structured year", () => {
    // Camping World: structured 2026, title + VIN 2016
    expect(effectiveModelYear({ year: 2026, title: "2016 JAYCO JAY SERIES 1207UD", vin: "1UJAJ0AF8G1B30166" }, NOW)).toEqual({ year: 2016, source: "title" });
    // VIN agrees with the structured field → keep it
    expect(effectiveModelYear({ year: 2026, title: "2016 X", vin: "4X4CFMU12TD323883" }, NOW)).toEqual({ year: 2026, source: "vin" });
  });
});

describe("condition = new", () => {
  it("demotes old or used-titled units labelled new", () => {
    const salem = unitLike({ title: "2011 FOREST RIVER SALEM 30QBSS 30WBSS", year: 2011, condition: "new", vin: "4X4TSMF25BA301376" });
    expect(qualifiesAsNew(salem, NOW)).toBe(false);
    expect(reconcileYearAndCondition(salem, NOW)).toEqual({ yearCorrected: false, conditionCorrected: true });
    expect(salem.condition).toBe("used");

    const coleman = unitLike({ title: "2022 COLEMAN COLEMAN LANTERN LT 17B", year: 2027, condition: "new", vin: "4YDTCMG11NJ947055" });
    expect(reconcileYearAndCondition(coleman, NOW)).toEqual({ yearCorrected: true, conditionCorrected: true });
    expect(coleman.year).toBe(2022);

    const usedTitle = unitLike({ title: "Used 2024 JAYCO EAGLE 320FBOK", year: 2024, condition: "new" });
    expect(qualifiesAsNew(usedTitle, NOW)).toBe(false);

    for (const y of [2025, 2026, 2027]) expect(qualifiesAsNew(unitLike({ title: `${y} Keystone Cougar`, year: y, condition: "new" }), NOW)).toBe(true);
  });
  it("the engine's condition check enforces the model-year floor even without enrichment", () => {
    const stale = unitLike({ title: "2013 Keystone RV SPRINTER 299RET", year: 2013, condition: "new" });
    const m = evaluateUnit(stale, buildContext({ condition: "new" }));
    expect(m.hardStatus).toBe("fail");
    const used = evaluateUnit(stale, buildContext({ condition: "used" }));
    expect(used.hardChecks.find((h) => h.constraint.startsWith("condition"))?.status).toBe("pass");
  });
});

describe("listing vs dealer location", () => {
  it("parses the selling store from the title", () => {
    expect(listingLocationFromTitle("New 2027 Forest River Wildwood at General RV | Jacksonville, FL")).toEqual({ city: "Jacksonville", state: "FL" });
    expect(listingLocationFromTitle("2025 Keystone Cougar 29BHS")).toBeNull();
    expect(listingLocationFromTitle("Something | Nowhere, ZZ")).toBeNull();
  });
  it("recovers glued / state-only dealer cities and never returns a state centroid", () => {
    expect(dealerCityCandidates("Pacific Hwy EFife")).toContain("Fife");
    expect(dealerCityCandidates("E Knox AveLiberty Lake")).toContain("Liberty Lake");
    expect(dealerCityCandidates("W. Deer Valley Rd Phoenix")).toContain("Phoenix");
    expect(cityFromDealerName("Lazydays RV of Vancouver")).toBe("Vancouver");
    expect(cityFromDealerName("ClickIt RV - Union Gap")).toBe("Union Gap");
    expect(haversineMiles(resolveDealerCoords("Pacific Hwy EFife", "WA")!, TACOMA)).toBeLessThan(8);
    expect(resolveDealerCoords("WA", "WA")).toBeNull();
    expect(resolveDealerCoords("Unknown", "WA")).toBeNull();
    expect(resolveDealerCoords("Nowhereville", "WA")).toBeNull();
    expect(haversineMiles(resolveDealerCoords("Bowling Green", "KY")!, { lat: 36.99, lng: -86.44 })).toBeLessThan(10);
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const plain = resolve(here, "../data/inventory.snapshot.json");
const snapshot = JSON.parse(existsSync(plain) ? readFileSync(plain, "utf-8") : gunzipSync(readFileSync(`${plain}.gz`)).toString("utf-8")) as InventorySnapshot;
const idx = indexSnapshot(snapshot);

describe("committed snapshot after reconciliation", () => {
  it("condition=new sorted cheapest first never returns old or used units", { timeout: 30000 }, () => {
    const out = runSearch(idx.units, { condition: "new", sort: "price_asc" });
    const minYear = new Date().getFullYear() - 1;
    expect(out.results.length).toBeGreaterThan(0);
    for (const m of out.results) {
      expect(m.unit.year).toBeGreaterThanOrEqual(minYear);
      expect(m.unit.condition).toBe("new");
      expect(/\b(used|pre-?owned)\b/i.test(m.unit.title)).toBe(false);
    }
    const ids = new Set(out.results.map((m) => m.unit.id));
    for (const bad of ["vin:4X4TSMF25BA301376", "vin:4YDTCMG11NJ947055", "vin:1UJAJ0AF8G1B30166"]) expect(ids.has(bad)).toBe(false);
    const passing = idx.units.filter((u) => evaluateUnit(u, buildContext({ condition: "new" })).hardStatus !== "fail");
    expect(passing.every((u) => u.year >= minYear)).toBe(true);
  });

  it("files General RV units under the store in their own title", () => {
    const jax = idx.units.filter((u) => /General RV \| Jacksonville, FL/.test(u.title));
    expect(jax.length).toBeGreaterThan(0);
    for (const u of jax) {
      expect(u.dealer.city).toBe("Jacksonville");
      expect(u.dealer.state).toBe("FL");
      expect(haversineMiles({ lat: u.dealer.lat!, lng: u.dealer.lng! }, { lat: 30.33, lng: -81.66 })).toBeLessThan(15);
    }
  });

  it("puts no dealer on a state centroid (no fake ~92 mi WA distances)", () => {
    const onCentroid = idx.units.filter((u) => u.dealer.lat === WA_CENTROID.lat && u.dealer.lng === WA_CENTROID.lng);
    expect(onCentroid).toHaveLength(0);
    const out = runSearch(idx.units, { location: { place: "Tacoma", radiusMiles: 150 } });
    expect(out.results.some((m) => m.distanceMiles !== null && Math.abs(m.distanceMiles - 92) <= 1 && m.unit.dealer.city === "WA")).toBe(false);
  });

  it("Tacoma 50 mi: real local stores included, unresolved and out-of-state dealers excluded", () => {
    const ctx = buildContext({ location: { place: "Tacoma", radiusMiles: 50 } });
    const within = idx.units.filter((u) => evaluateUnit(u, ctx).hardStatus !== "fail");
    const stores = new Set(within.map((u) => `${u.dealer.name}|${u.dealer.city}`));
    expect([...stores].some((s) => s.startsWith("Tacoma RV Center|Fife"))).toBe(true);
    expect([...stores].some((s) => s.startsWith("Sumner RV|Sumner"))).toBe(true);
    expect(within.every((u) => u.dealer.state === "WA")).toBe(true);
    expect(within.some((u) => /windish/i.test(u.dealer.name))).toBe(false);
  });
});
