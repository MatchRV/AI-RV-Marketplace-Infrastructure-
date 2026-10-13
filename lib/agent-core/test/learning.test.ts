import { describe, expect, it } from "vitest";
import { LearnedStore, normalizeRecord, resolveTowVehicle, runSearch, vehicleKey, type CanonicalUnit, type RawScrapeRecord } from "../src/index.js";

const base: RawScrapeRecord = {
  dealer_name: "Poulsbo RV", dealer_domain: "poulsborv.com", dealer_location: "Sumner",
  _first_seen: "2026-04-21T00:00:00Z", _last_seen: "2026-05-12T00:00:00Z",
  inventory_status: "available", condition: "new", year: 2026, make: "Keystone",
  model: "Couples 25RL", title: "2026 Keystone Couples 25RL Travel Trailer",
  stock_number: "C1", vin: "LEARN000001", rv_type: "Travel Trailer", price: 32000,
  length: "28", dry_weight: 5200, gvwr: 6500, sleeps: 4, slideouts: 1, bunkhouse: false,
  description: "Couples layout.", features: [], image_urls: ["https://example.com/a.jpg"],
};
function unit(overrides: Partial<RawScrapeRecord> = {}): CanonicalUnit {
  const r = normalizeRecord("vin:L1", { ...base, ...overrides });
  if ("reject" in r) throw new Error(r.reject.reason);
  return r.unit;
}

describe("outfitter learning (Hermes-style memory)", () => {
  it("learns a tow rating once and recalls it for a differently-worded ask", () => {
    const s = new LearnedStore();
    s.learnVehicle("2021 Ford F-150 3.5L EcoBoost SuperCrew", { towRatingLbs: 9200, payloadLbs: 1480 });
    const recalled = s.recallVehicle("my F-150 3.5L EcoBoost SuperCrew");
    // Keys are descriptor-based; exact descriptor recalls, and resolution uses it.
    const exact = s.recallVehicle("2021 Ford F-150 3.5L EcoBoost SuperCrew");
    expect(exact?.towRatingLbs).toBe(9200);
    expect(exact?.payloadLbs).toBe(1480);
    expect(recalled).toBeNull(); // no fuzzy guessing — a different descriptor is a different memory
    const res = resolveTowVehicle("2021 Ford F-150", exact ? { towRatingLbs: exact.towRatingLbs, confirmations: exact.confirmations, source: exact.source } : null);
    expect(res.filterCapLbs).toBe(9200);
    expect(res.learned?.confirmations).toBe(1);
    expect(res.caveats[0]).toContain("LEARNED");
  });

  it("counts confirmations and flags conflicts instead of silently overwriting", () => {
    const s = new LearnedStore();
    s.learnVehicle("Ram 1500", { towRatingLbs: 8800 });
    const again = s.learnVehicle("Ram 1500", { towRatingLbs: 8900 });
    expect(again?.confirmations).toBe(2);
    expect(again?.conflicts).toBe(0); // within tolerance
    const clash = s.learnVehicle("Ram 1500", { towRatingLbs: 6500 });
    expect(clash?.conflicts).toBe(1);
    expect(clash?.towRatingLbs).toBe(6500); // latest wins, but the conflict is on record
  });

  it("overlays a learned unit fact with learned provenance and uses it in search", () => {
    const s = new LearnedStore();
    const u = unit({ gvwr: null, dry_weight: 5200 });
    expect(u.gvwrLbs.value).toBeNull();
    s.learnUnitFact(u.id, "gvwrLbs", 7200, "dealer-confirmed");
    const overlaid = s.applyToUnit(u);
    expect(overlaid.gvwrLbs.value).toBe(7200);
    expect(overlaid.gvwrLbs.source).toBe("learned");
    const out = runSearch(s.applyToCorpus([u]), { maxWeightLbs: 7000 });
    expect(out.funnel.passedHard).toBe(0); // learned GVWR 7,200 now correctly fails a 7,000 cap
  });

  it("survives a serialize/restore round-trip (forever = persisted)", () => {
    const s = new LearnedStore();
    s.learnVehicle("Toyota Tundra", { towRatingLbs: 10200 });
    s.learnUnitFact("vin:X", "sleeps", 6);
    s.count("discovery", "sleepers=4");
    const restored = new LearnedStore();
    restored.restore(JSON.parse(JSON.stringify(s.serialize())));
    expect(restored.recallVehicle("Toyota Tundra")?.towRatingLbs).toBe(10200);
    expect(restored.recallUnitFacts("vin:X")[0]?.value).toBe(6);
    expect(restored.stats().counters["discovery:sleepers=4"]).toBe(1);
    expect(vehicleKey("F-150 rated 8,000 lbs")).toBe("f 150");
  });

  it("search uses a learned rating as the tow cap, labelled learned", () => {
    const heavy = unit({ gvwr: 9800, dry_weight: 8000 });
    const learned = { towRatingLbs: 9200, confirmations: 3, source: "customer-stated" };
    const out = runSearch([heavy], { towVehicle: "2021 Ford F-150", sherpa: { sleepers: 2, floorplanIntent: "couples" } }, learned);
    expect(out.funnel.passedHard).toBe(0); // 9,800 GVWR exceeds the learned 9,200 cap
    expect(out.towResolution?.learned?.confirmations).toBe(3);
  });
});
