import { describe, expect, it } from "vitest";
import {
  assessRoadToSale,
  budgetBandPoints,
  diversifyMatches,
  earlyProductReady,
  effectiveLengthMaxFt,
  emptyPowertrain,
  emptyTowing,
  evaluateUnit,
  buildContext,
  fact,
  isBrowseMode,
  isHeavyTowIntent,
  normalizeRecord,
  runSearch,
  shouldOfferLengthFlex,
  type CanonicalUnit,
  type MotorhomeTowing,
  type Powertrain,
} from "../src/index.js";

function coach(
  id: string,
  opts: {
    price?: number;
    rvType?: string;
    title?: string;
    make?: string;
    model?: string;
    length?: number;
    dealer?: string;
    city?: string;
    state?: string;
    lat?: number;
    lng?: number;
    pt?: Partial<Powertrain>;
    tow?: Partial<MotorhomeTowing>;
  } = {},
): CanonicalUnit {
  const r = normalizeRecord(id, {
    dealer_name: opts.dealer ?? "RV Country",
    dealer_domain: `${(opts.dealer ?? "rvcountry").toLowerCase().replace(/\s+/g, "")}.com`,
    dealer_location: opts.city ?? "Fife",
    _first_seen: "2026-10-06T00:00:00Z",
    _last_seen: "2026-10-06T00:00:00Z",
    inventory_status: "available",
    condition: "used",
    year: 2024,
    make: opts.make ?? "Thor",
    model: opts.model ?? "Model",
    title: opts.title ?? `2024 ${opts.make ?? "Thor"} ${opts.model ?? "Model"}`,
    stock_number: id,
    rv_type: opts.rvType ?? "Class A",
    price: opts.price ?? 280_000,
    length: opts.length ?? 42,
    image_urls: ["https://example.com/a.jpg"],
  });
  if ("reject" in r) throw new Error(r.reject.reason);
  const u = {
    ...r.unit,
    powertrain: { ...emptyPowertrain(), ...opts.pt },
    towing: { ...emptyTowing(), ...opts.tow },
    dealer: {
      ...r.unit.dealer,
      name: opts.dealer ?? r.unit.dealer.name,
      city: opts.city ?? r.unit.dealer.city,
      state: opts.state ?? r.unit.dealer.state,
      lat: opts.lat ?? r.unit.dealer.lat ?? 47.239,
      lng: opts.lng ?? r.unit.dealer.lng ?? -122.357,
    },
  };
  return u;
}
const listed = <T,>(v: T) => fact<T>(v, "dealer_listing", "high");
const hasId = (ids: string[], key: string) => ids.some((id) => id === key || id.endsWith(`:${key}`) || id.includes(`:${key}`));
const passIds = (out: { results: { hardStatus: string; unit: { id: string } }[] }) =>
  out.results.filter((m) => m.hardStatus === "pass").map((m) => m.unit.id);


const sequenceVan = coach("van", {
  price: 57_995,
  rvType: "Class B",
  make: "Thor",
  model: "Sequence",
  title: "2024 Thor Sequence Camper Van",
  length: 20,
  tow: { hitchTowRatingLbs: listed(0) },
});
const fr3 = coach("fr3", {
  price: 99_995,
  rvType: "Class A",
  make: "Forest River",
  model: "FR3",
  title: "2024 Forest River FR3 Gas Class A",
  length: 32,
  pt: { fuelType: listed("gas") },
  tow: { hitchTowRatingLbs: listed(0) },
});
const fourWinds = coach("fw", {
  price: 89_995,
  rvType: "Class C",
  make: "Thor",
  model: "Four Winds",
  title: "2024 Thor Four Winds Super C",
  length: 33,
  tow: { hitchTowRatingLbs: listed(0) },
});
const dieselPusher = coach("dp", {
  price: 279_995,
  rvType: "Class A",
  make: "Tiffin",
  model: "Allegro Bus",
  title: "2024 Tiffin Allegro Bus Diesel Pusher",
  length: 40,
  dealer: "Giant RV",
  city: "Puyallup",
  state: "WA",
  lat: 47.185,
  lng: -122.292,
  pt: { fuelType: listed("diesel"), horsepower: listed(450) },
  tow: { hitchTowRatingLbs: listed(15_000), gcwrLbs: listed(52_000) },
});
const frontier = coach("fr", {
  price: 249_995,
  rvType: "Class A",
  make: "Fleetwood",
  model: "Frontier",
  title: "2024 Fleetwood Frontier Diesel",
  length: 38,
  dealer: "Voyager RV",
  city: "Seattle",
  state: "WA",
  lat: 47.606,
  lng: -122.332,
  pt: { fuelType: listed("diesel") },
  tow: { hitchTowRatingLbs: listed(10_000) },
});

describe("fit ranking vs Jonathan Tacoma/Fife bug", () => {
  const constraints = {
    location: { place: "Tacoma, WA", radiusMiles: 150 },
    priceMaxUsd: 350_000,
    lengthMaxFt: 45,
    heavyTowRequired: true,
    rvTypes: ["class_a", "class_c"],
  };

  it("does not rank a ~$58k Class B van or ~$100k gas FR3 above a diesel pusher in the budget band", () => {
    const out = runSearch(
      [sequenceVan, fr3, fourWinds, dieselPusher, frontier],
      { ...constraints, rvTypes: ["class_a", "class_b", "class_c"] },
      null,
      { skipRadiusExpand: true },
    );
    const ids = passIds(out);
    expect(hasId(ids, "dp")).toBe(true);
    expect(hasId(ids, "fr")).toBe(true);
    expect(hasId(ids, "van")).toBe(false);
    expect(hasId(ids, "fr3")).toBe(false);
    expect(hasId(ids, "fw")).toBe(false);
    expect(hasId([ids[0]], "dp") || hasId([ids[0]], "fr")).toBe(true);
  });

  it("excludes zero or unpublished hitch when heavy tow is required", () => {
    const unpublished = coach("nohitch", {
      price: 260_000,
      tow: {},
      pt: { fuelType: listed("diesel") },
    });
    const ctx = buildContext({ heavyTowRequired: true, priceMaxUsd: 350_000 }, null);
    expect(evaluateUnit(fourWinds, ctx).hardStatus).toBe("fail");
    expect(evaluateUnit(unpublished, ctx).hardStatus).toBe("fail");
    expect(evaluateUnit(dieselPusher, ctx).hardStatus).toBe("pass");
    const out = runSearch([fourWinds, unpublished, dieselPusher], { heavyTowRequired: true, priceMaxUsd: 350_000 }, null, {
      skipRadiusExpand: true,
    });
    const ids = passIds(out);
    expect(ids).toHaveLength(1);
    expect(hasId(ids, "dp")).toBe(true);
  });

  it("defaults to best_match (not distance-only) when budget is set", () => {
    // Local cheap van vs farther diesel pusher — with budget, fit wins.
    const out = runSearch(
      [sequenceVan, dieselPusher],
      {
        location: { place: "Tacoma, WA", radiusMiles: 2000 },
        priceMaxUsd: 350_000,
        // no heavy tow: van would still pass hard filters, but band scoring + best_match should prefer pusher
      },
      null,
      { skipRadiusExpand: true },
    );
    const pass = out.results.filter((m) => m.hardStatus === "pass");
    expect(hasId([pass[0].unit.id], "dp")).toBe(true);
    expect(pass[0].score).toBeGreaterThan(pass.find((m) => hasId([m.unit.id], "van"))!.score);
  });
});

describe("budget band scoring", () => {
  it("gives a $58k unit almost no points against a $350k ceiling", () => {
    expect(budgetBandPoints(57_995, 350_000).points).toBeLessThanOrEqual(1);
  });
  it("rewards a unit in the mid-to-upper band", () => {
    expect(budgetBandPoints(280_000, 350_000).points).toBeGreaterThan(budgetBandPoints(57_995, 350_000).points);
    expect(budgetBandPoints(280_000, 350_000).points).toBeGreaterThanOrEqual(8);
  });
});

describe("length flex motorhome ceiling", () => {
  it("does not offer +2 ft (47) after a 45-ft motorhome cap", () => {
    expect(
      shouldOfferLengthFlex({
        lengthMaxFt: 45,
        lengthReason: "comfort",
        lengthFlexApproved: null,
        rvTypes: ["class_a"],
      }),
    ).toBe(false);
    expect(effectiveLengthMaxFt({ lengthMaxFt: 45, lengthReason: "comfort", lengthFlexApproved: true, rvTypes: ["class_a"] })).toBe(45);
  });
  it("still allows +2 on a shorter comfort cap", () => {
    expect(
      shouldOfferLengthFlex({
        lengthMaxFt: 38,
        lengthReason: "comfort",
        lengthFlexApproved: null,
        rvTypes: ["class_a"],
      }),
    ).toBe(true);
  });
});

describe("heavy tow intent", () => {
  it("detects race trailer / enclosed trailer language", () => {
    expect(isHeavyTowIntent("a race truck I have to pull behind my motorhome")).toBe(true);
    expect(isHeavyTowIntent("enclosed race trailer")).toBe(true);
    expect(isHeavyTowIntent("Jeep Wrangler")).toBe(false);
    expect(isHeavyTowIntent("nothing")).toBe(false);
  });
});

describe("browse / swipe without profile", () => {
  it("is browse mode when only location is set", () => {
    expect(isBrowseMode({ location: { place: "Tacoma, WA", radiusMiles: 100 } })).toBe(true);
    expect(isBrowseMode({ location: { place: "Tacoma, WA", radiusMiles: 100 }, priceMaxUsd: 350_000 })).toBe(false);
  });

  it("caps dealers at 2 and mixes classes without a cheap-budget bonus", () => {
    const sameLot = [
      coach("a1", { price: 40_000, rvType: "Class B", dealer: "LotA", model: "V1" }),
      coach("a2", { price: 45_000, rvType: "Class B", dealer: "LotA", model: "V2" }),
      coach("a3", { price: 50_000, rvType: "Class B", dealer: "LotA", model: "V3" }),
      coach("b1", { price: 200_000, rvType: "Class A", dealer: "LotB", model: "A1" }),
      coach("c1", { price: 90_000, rvType: "Class C", dealer: "LotC", model: "C1" }),
    ];
    const out = runSearch(
      sameLot,
      { location: { place: "Tacoma, WA", radiusMiles: 2000 } },
      null,
      { skipRadiusExpand: true },
    );
    // First shortlist cards (the diversity head) never exceed 2 per dealer.
    const shortlist = diversifyMatches(out.results, 2, 10).slice(0, 3);
    const counts = new Map<string, number>();
    for (const m of shortlist) {
      const k = m.unit.dealer.id;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(shortlist.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(0, ...counts.values())).toBeLessThanOrEqual(2);
    const types = new Set(shortlist.map((m) => m.unit.rvType));
    expect(types.size).toBeGreaterThanOrEqual(2);
    // No budget → no "under budget" / band bonus labels
    for (const m of out.results) {
      expect(m.scoreBreakdown.some((b) => /budget/i.test(b.label))).toBe(false);
    }
  });
});

describe("early shortlist readiness", () => {
  it("is ready when budget, length, and tow are known even if use/activities are not", () => {
    const p = {
      budgetMaxUsd: 350_000,
      lengthMaxFt: 45,
      towingBehind: "enclosed race trailer",
      rvTypes: ["class_a" as const],
      place: "Tacoma, WA",
      paymentMethod: "cash" as const,
    };
    expect(earlyProductReady(p)).toBe(true);
    const road = assessRoadToSale(p);
    expect(road.readyForProducts).toBe(true);
    // Rapport leftovers stay listed so the Outfitter can ask them after the shortlist.
    expect(road.missingForProducts).toEqual(expect.arrayContaining(["use", "activities"]));
    expect(road.searchConstraints).not.toBeNull();
  });
});
