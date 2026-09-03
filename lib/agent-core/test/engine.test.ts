import { describe, expect, it } from "vitest";
import {
  evaluateTowFit,
  evaluateUnit,
  buildContext,
  ConstraintError,
  mergeConstraints,
  normalizeRecord,
  resolvePlace,
  resolveTowVehicle,
  runSearch,
  scanForCity,
  haversineMiles,
  type CanonicalUnit,
  type Constraints,
  type RawScrapeRecord,
} from "../src/index.js";

// ── Fixtures ───────────────────────────────────────────────────────────────

const baseRecord: RawScrapeRecord = {
  dealer_name: "Poulsbo RV",
  dealer_domain: "poulsborv.com",
  dealer_location: "Sumner",
  _first_seen: "2026-04-21T01:53:12.167Z",
  _last_seen: "2026-05-12T18:45:52.378Z",
  _removed_at: null,
  inventory_status: "available",
  condition: "new",
  year: 2025,
  make: "Keystone",
  model: "Springdale 262BH",
  title: "2025 Keystone Springdale 262BH Travel Trailer",
  stock_number: "T1234",
  vin: "TESTVIN0001",
  rv_type: "Travel Trailer",
  price: 39995,
  sale_price: 34995,
  length: "29.9",
  dry_weight: 5800,
  sleeps: 8,
  slideouts: 1,
  bunkhouse: true,
  description: "Two entry doors and a 200W solar panel make this a great off-grid rig. Fresh water capacity: 52 gal.",
  features: ["Power Awning", "View More »", "+31", "--Sale Price--: $34,995"],
  image_urls: ["https://example.com/a.jpg"],
};

function unit(overrides: Partial<RawScrapeRecord> = {}): CanonicalUnit {
  const result = normalizeRecord("vin:TESTVIN0001", { ...baseRecord, ...overrides });
  if ("reject" in result) throw new Error(`fixture rejected: ${result.reject.reason}`);
  return result.unit;
}

// ── Normalization ──────────────────────────────────────────────────────────

describe("normalizeRecord", () => {
  it("prefers a plausible sale price and records provenance", () => {
    const u = unit();
    expect(u.priceUsd.value).toBe(34995);
    expect(u.priceUsd.source).toBe("dealer_listing");
  });

  it("keeps unknown unknown — no fabricated fields", () => {
    const u = unit({ dry_weight: null, description: null, features: [] });
    expect(u.gvwrLbs.value).toBeNull();
    expect(u.gvwrLbs.source).toBeNull();
    expect(u.solar.value).toBeNull();
    expect(u.lithiumBattery.value).toBeNull();
    expect(u.entryDoors.value).toBeNull();
  });

  it("derives solar/entry doors/fresh water from dealer text with derived provenance", () => {
    const u = unit();
    expect(u.solar.value).toBe("installed");
    expect(u.solar.source).toBe("derived_text");
    expect(u.entryDoors.value).toBe(2);
    expect(u.freshWaterGal.value).toBe(52);
    expect(u.freshWaterGal.source).toBe("derived_text");
  });

  it("distinguishes solar prep from installed solar", () => {
    const u = unit({ description: "Solar prep included for future panels." });
    expect(u.solar.value).toBe("prep");
  });

  it("decodes bunk floorplan codes when the dealer says nothing", () => {
    const u = unit({ bunkhouse: null, description: "A lovely trailer.", model: "Cruiser 26BHX", title: "2025 Keystone Cruiser 26BHX" });
    expect(u.floorplanCode).toBe("26BHX");
    expect(u.bunkhouse.value).toBe(true);
    expect(u.bunkhouse.source).toBe("derived_model_code");
  });

  it("filters junk feature strings", () => {
    const u = unit();
    expect(u.features).toContain("Power Awning");
    expect(u.features.some((f) => f.includes("Sale Price") || f === "+31" || f.includes("View More"))).toBe(false);
  });

  it("rejects removed, typeless, and implausible records with reasons", () => {
    const removed = normalizeRecord("k", { ...baseRecord, _removed_at: "2026-05-01" });
    expect("reject" in removed && removed.reject.reason).toBe("removed_from_dealer_site");
    const typeless = normalizeRecord("k", { ...baseRecord, rv_type: null, title: "Selkirk RV" });
    expect("reject" in typeless && typeless.reject.reason).toBe("unresolvable_rv_type");
    const badPrice = normalizeRecord("k", { ...baseRecord, price: 500, sale_price: null });
    expect("reject" in badPrice && badPrice.reject.reason).toBe("missing_or_implausible_price");
  });

  it("computes the boondocking score deterministically with receipts", () => {
    const u = unit();
    expect(u.boondocking.score).toBeGreaterThan(0);
    expect(u.boondocking.knownInputs.join(" ")).toContain("solar");
    expect(u.boondocking.missingInputs.length).toBeGreaterThan(0);
  });
});

// ── Geo ────────────────────────────────────────────────────────────────────

describe("geo", () => {
  it("resolves aliases like Mt. Vernon", () => {
    expect(resolvePlace("Mt. Vernon")?.canonical).toBe("Mount Vernon");
    expect(resolvePlace("Tacoma, WA")?.canonical).toBe("Tacoma");
  });
  it("scans messy dealer location strings for a known city", () => {
    expect(scanForCity("4309 East Valley Highway | Sumner")?.canonical).toBe("Sumner");
    expect(scanForCity("13000 Highway 99 • Everett")?.canonical).toBe("Everett");
    expect(scanForCity("Map & Hours")).toBeNull();
  });
  it("computes sane distances", () => {
    const tacoma = resolvePlace("Tacoma")!;
    const seattle = resolvePlace("Seattle")!;
    const d = haversineMiles(tacoma, seattle);
    expect(d).toBeGreaterThan(20);
    expect(d).toBeLessThan(35);
  });
});

// ── Tow ────────────────────────────────────────────────────────────────────

describe("tow", () => {
  it("uses an explicitly stated rating with a safety margin", () => {
    const r = resolveTowVehicle("F-150 rated 8,000 lbs");
    expect(r.statedRatingLbs).toBe(8000);
    expect(r.filterCapLbs).toBe(8000);
    expect(r.comfortCapLbs).toBe(6400);
  });

  it("reports configuration ranges honestly for a bare model", () => {
    const r = resolveTowVehicle("2023 Ford F-150");
    expect(r.statedRatingLbs).toBeNull();
    expect(r.rangeLbs).toEqual({ min: 5000, max: 13500 });
    const heavy = unit({ dry_weight: 9000 });
    expect(evaluateTowFit(heavy, r).verdict).toBe("depends_on_config");
  });

  it("downgrades a green verdict when only dry weight is known", () => {
    const r = resolveTowVehicle("rated 12,000 lbs");
    const u = unit({ dry_weight: 5800, gvwr: null });
    const fit = evaluateTowFit(u, r);
    expect(fit.verdict).toBe("marginal");
    expect(fit.detail).toContain("dry weight");
  });

  it("narrows a bare F-150 to the stated engine's band", () => {
    const r = resolveTowVehicle("2024 Ford F-150 5.0L V8");
    expect(r.rangeLbs).toEqual({ min: 8700, max: 13000 });
    expect(r.resolvedLabel).toBe("Ford F-150 5.0L V8");
    expect(r.configuration).toEqual({ modelYear: 2024, engine: "5.0L V8", towPackage: null });
    expect(r.askShopper.map((q) => q.id)).toEqual(["package", "rating"]);
    expect(evaluateTowFit(unit({ gvwr: 8500, dry_weight: 6900 }), r).verdict).toBe("marginal");
  });

  it("asks engine, tow-package and sticker follow-ups for a bare model", () => {
    const r = resolveTowVehicle("2024 Ford F-150");
    expect(r.askShopper.map((q) => q.id)).toEqual(["engine", "package", "rating"]);
    expect(r.askShopper[0].options).toContain("5.0L V8");
    expect(r.askShopper[0].options).toContain("3.5L EcoBoost V6");
    expect(r.askShopper[0].options).not.toContain("EcoBoost (2.7L or 3.5L?)");
    expect(r.askShopper[1].question).toContain("Max Trailer Tow package");
    expect(r.exactRatingSources.join(" ")).toMatch(/towing guide/i);
    expect(r.caveats[0]).toMatch(/ask which engine/i);
  });

  it("keeps a bare 'EcoBoost' ambiguous between 2.7L and 3.5L", () => {
    const r = resolveTowVehicle("F-150 EcoBoost");
    expect(r.rangeLbs).toEqual({ min: 7600, max: 13500 });
    expect(r.askShopper[0].id).toBe("engine");
    expect(r.askShopper[0].options).toEqual(["2.7L EcoBoost V6", "3.5L EcoBoost V6"]);
  });

  it("lets a confirmed Max Tow package lift the bottom of the band", () => {
    const r = resolveTowVehicle("F-150 5.0 V8 with the Max Trailer Tow package");
    expect(r.configuration.towPackage).toBe(true);
    expect(r.rangeLbs).toEqual({ min: 11000, max: 13000 });
    expect(r.askShopper.map((q) => q.id)).toEqual(["rating"]);
    expect(resolveTowVehicle("F-150 5.0 V8, no tow package").rangeLbs).toEqual({ min: 8700, max: 11000 });
  });

  it("does not misread displacement or hybrid tokens", () => {
    expect(resolveTowVehicle("F-150 3.5 PowerBoost hybrid").configuration.engine).toBe("3.5L PowerBoost hybrid");
    expect(resolveTowVehicle("F-150 3.5-liter EcoBoost").configuration.engine).toBe("3.5L EcoBoost V6");
    expect(resolveTowVehicle("F-150 5.0 with 3.55 axle").configuration.engine).toBe("5.0L V8");
    expect(resolveTowVehicle("Silverado 1500 V8").askShopper[0].options).toEqual(["5.3L V8", "6.2L V8"]);
  });

  it("asks nothing once a rating is stated", () => {
    const r = resolveTowVehicle("F-150 5.0 V8 rated 11,300 lbs");
    expect(r.statedRatingLbs).toBe(11300);
    expect(r.resolvedLabel).toBe("Ford F-150 5.0L V8");
    expect(r.askShopper).toEqual([]);
  });

  it("marks drivables not_towable and unknown weights unknown", () => {
    const r = resolveTowVehicle("rated 10,000 lbs");
    const rv = unit({ rv_type: "Class C", title: "2025 Coachmen Cross Trail Class C" });
    expect(evaluateTowFit(rv, r).verdict).toBe("not_towable");
    const mystery = unit({ dry_weight: null });
    expect(evaluateTowFit(mystery, r).verdict).toBe("unknown");
  });
});

// ── Matching ───────────────────────────────────────────────────────────────

const corpus: CanonicalUnit[] = [
  unit(),
  unit({ vin: "TESTVIN0002", price: 52000, sale_price: null, title: "2025 Keystone Cougar 29BHS", model: "Cougar 29BHS" }),
  unit({ vin: "TESTVIN0003", dry_weight: null, description: "No specs published.", features: [], title: "2024 Jayco Mystery 26BH", model: "Mystery 26BH", year: 2024 }),
  unit({ vin: "TESTVIN0004", bunkhouse: false, description: "Rear living layout.", model: "Cougar 27RL", title: "2025 Keystone Cougar 27RL" }),
];

describe("runSearch", () => {
  it("separates pass / unverified / fail with consistent funnel math", () => {
    const out = runSearch(corpus, {
      priceMaxUsd: 45000,
      mustHave: ["bunkhouse"],
      maxWeightLbs: 7000,
    });
    const excluded = out.funnel.excluded.reduce((a, b) => a + b.count, 0);
    expect(out.funnel.totalUnits).toBe(4);
    expect(out.funnel.passedHard + out.funnel.unverified + excluded).toBe(4);
    // The unit with unknown weight must be unverified, not excluded.
    const unverified = out.results.filter((m) => m.hardStatus === "unverified");
    expect(unverified.some((m) => m.unit.id.includes("TESTVIN0003"))).toBe(true);
  });

  it("never excludes on unknown, always excludes on verified fail", () => {
    const out = runSearch(corpus, { priceMaxUsd: 45000 });
    expect(out.results.some((m) => m.unit.id.includes("TESTVIN0002"))).toBe(false);
    expect(out.funnel.excluded.find((e) => e.reason.includes("price"))?.count).toBe(1);
  });

  it("throws a self-correctable error for unknown places", () => {
    expect(() => runSearch(corpus, { location: { place: "Narnia", radiusMiles: 50 } })).toThrowError(ConstraintError);
    try {
      runSearch(corpus, { location: { place: "Narnia", radiusMiles: 50 } });
    } catch (err) {
      expect((err as ConstraintError).hint).toContain("Tacoma");
    }
  });

  it("applies radius filtering with real coordinates", () => {
    const near = runSearch(corpus, { location: { place: "Tacoma", radiusMiles: 25 } });
    expect(near.funnel.passedHard).toBeGreaterThan(0);
    const far = runSearch(corpus, { location: { place: "Spokane", radiusMiles: 25 } });
    expect(far.funnel.passedHard).toBe(0);
  });

  it("supports sort overrides", () => {
    const out = runSearch(corpus, { sort: "price_asc" });
    const prices = out.results.filter((m) => m.hardStatus === "pass").map((m) => m.unit.priceUsd.value ?? 0);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("keeps scores bounded and explains them", () => {
    const out = runSearch(corpus, { prefer: ["solar"], boondocking: true, priceMaxUsd: 60000 });
    for (const m of out.results) {
      expect(m.score).toBeGreaterThanOrEqual(5);
      expect(m.score).toBeLessThanOrEqual(99);
      const sum = m.scoreBreakdown.reduce((a, b) => a + b.points, 0);
      expect(Math.max(5, Math.min(99, sum))).toBe(m.score);
    }
  });

  it("reports soft-preference unknowns instead of assuming no", () => {
    const ctx = buildContext({ prefer: ["lithium"] });
    const m = evaluateUnit(unit({ description: "No battery info." }), ctx);
    const soft = m.softChecks.find((s) => s.preference.includes("lithium"));
    expect(soft?.satisfied).toBeNull();
  });
});

// ── Constraint merging ─────────────────────────────────────────────────────

describe("mergeConstraints", () => {
  const current: Constraints = { priceMaxUsd: 45000, mustHave: ["bunkhouse"], towVehicle: "F-150" };

  it("refine keeps unmentioned keys and overrides mentioned ones", () => {
    const next = mergeConstraints(current, { priceMaxUsd: 50000 }, "refine");
    expect(next.priceMaxUsd).toBe(50000);
    expect(next.mustHave).toEqual(["bunkhouse"]);
    expect(next.towVehicle).toBe("F-150");
  });

  it("null clears a key in refine mode", () => {
    const next = mergeConstraints(current, { towVehicle: null }, "refine");
    expect(next.towVehicle).toBeUndefined();
  });

  it("replace starts over", () => {
    const next = mergeConstraints(current, { priceMaxUsd: 30000 }, "replace");
    expect(next).toEqual({ priceMaxUsd: 30000 });
  });
});
