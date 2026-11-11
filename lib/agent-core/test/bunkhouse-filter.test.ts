import { describe, expect, it } from "vitest";
import { normalizeRecord, runSearch, type CanonicalUnit, type RawScrapeRecord } from "../src/index.js";

const base: RawScrapeRecord = {
  dealer_name: "Poulsbo RV",
  dealer_domain: "poulsborv.com",
  dealer_location: "Sumner",
  _first_seen: "2026-04-21T01:53:12.167Z",
  _last_seen: "2026-05-12T18:45:52.378Z",
  _removed_at: null,
  inventory_status: "available",
  condition: "new",
  year: 2026,
  make: "Keystone",
  model: "Hideout 263BH",
  title: "2026 Keystone Hideout 263BH Travel Trailer",
  stock_number: "T1",
  vin: "BUNKVIN0001",
  rv_type: "Travel Trailer",
  price: 32995,
  sale_price: 29995,
  length: "29",
  dry_weight: 5400,
  sleeps: 8,
  slideouts: 1,
  bunkhouse: null,
  description: "A family travel trailer.",
  features: ["Power Awning"],
  image_urls: ["https://example.com/a.jpg"],
};

function unit(overrides: Partial<RawScrapeRecord>): CanonicalUnit {
  const result = normalizeRecord(`vin:${overrides.vin ?? base.vin}`, { ...base, ...overrides });
  if ("reject" in result) throw new Error(result.reject.reason);
  return result.unit;
}

describe("Tacoma-style bunkhouse filter", () => {
  const corpus = [
    unit({ vin: "BH263", model: "Hideout 263BH", title: "2026 Keystone Hideout 263BH", description: "Rear kitchen and a dinette." }),
    unit({ vin: "QB273", model: "Hideout 273QB", title: "2026 Keystone Hideout 273QB", description: "Queen bed, rear bath." }),
    unit({ vin: "DB28", model: "Springdale 28DB", title: "2026 Keystone Springdale 28DB", description: "Front bedroom." }),
    unit({ vin: "C13B", model: "Coleman 13B", title: "2027 Keystone Coleman 13B", description: "Lightweight camping trailer." }),
    unit({
      vin: "P180",
      model: "Passport 180RBCWE",
      title: "2026 Keystone Passport 180RBCWE",
      description: "This Passport model does not include a bunkhouse, making it a couples layout with a queen bed.",
    }),
    unit({ vin: "BEDS", model: "Salem 22RB", title: "2026 Forest River Salem 22RB", description: "Rear bunk beds for the kids and a queen up front." }),
  ];

  const out = runSearch(corpus, {
    location: { place: "Tacoma, WA", radiusMiles: 50 },
    rvTypes: ["travel_trailer"],
    mustHave: ["bunkhouse"],
  });

  it("returns the BH-code unit as a verified match", () => {
    const verified = out.results.filter((m) => m.hardStatus === "pass");
    expect(verified.map((m) => m.unit.floorplanCode)).toEqual(expect.arrayContaining(["263BH"]));
    expect(verified[0]?.unit.floorplanCode).toBe("263BH");
    expect(out.funnel.passedHard).toBeGreaterThanOrEqual(2);
  });

  it("keeps Coleman 13B, Passport 180RBCWE, and QB-only units out of the verified bunkhouse matches", () => {
    const verified = out.results.filter((m) => m.hardStatus === "pass");
    const titles = verified.map((m) => `${m.unit.title} ${m.unit.floorplanCode}`).join(" | ");
    expect(titles).not.toMatch(/13B/);
    expect(titles).not.toMatch(/180RBCWE/);
    expect(titles).not.toMatch(/273QB/);
    expect(titles).not.toMatch(/28DB/);
    expect(out.results.some((m) => /180RBCWE/.test(m.unit.title))).toBe(false);
  });

  it("still returns a listing that says bunk beds", () => {
    expect(out.results.filter((m) => m.hardStatus === "pass").some((m) => m.unit.floorplanCode === "22RB")).toBe(true);
  });
});
