import { describe, expect, it } from "vitest";
import {
  brandFromTitle,
  canonicalBrand,
  modelMatches,
  normalizeRecord,
  parseMakeModel,
  runSearch,
  unitMakeModel,
  type CanonicalUnit,
  type RawScrapeRecord,
} from "../src/index.js";

const base: RawScrapeRecord = {
  dealer_name: "Test RV", dealer_domain: "test-rv.com", dealer_location: "Fife",
  _first_seen: "2026-10-01T00:00:00Z", _last_seen: "2026-10-15T00:00:00Z",
  inventory_status: "available", condition: "used", year: 2022, make: "Tiffin", model: "Allegro RED 33AA",
  title: "2022 Tiffin Allegro RED 33AA", stock_number: "T1", vin: "TIFFIN000001", rv_type: "Class A",
  price: 189_000, image_urls: ["https://example.com/a.jpg"],
};
let n = 0;
function unit(o: Partial<RawScrapeRecord>): CanonicalUnit {
  n += 1;
  const r = normalizeRecord(`vin:T${n}`, { ...base, stock_number: `S${n}`, vin: `TESTVIN${String(n).padStart(6, "0")}`, ...o });
  if ("reject" in r) throw new Error(r.reject.reason);
  return r.unit;
}

const red = () => unit({});
const redModelOnlyInTitle = () => unit({ make: "TIFFIN", model: "33 AA", title: "2021 TIFFIN ALLEGRO RED 33AA" });
const bus = () => unit({ model: "Allegro Bus", title: "2020 Tiffin Motorhomes Allegro Bus 45OPP" });
const openRoad = () => unit({ make: "tiffin motorhomes", model: "Open Road Allegro", title: "2023 Tiffin Motorhomes Open Road Allegro 34PA" });
const bareAllegro = () => unit({ make: "Tiffin", model: "TIFFIN ALLEGRO 34PA", title: "2017 TIFFIN ALLEGRO 34PA" });
const phaeton = () => unit({ make: "Tiffin Motor Homes", model: "Phaeton 40IH", title: "2019 Tiffin Phaeton 40IH" });
// Camping World scrape bugs: wrong brand in the make field, both directions.
const thorLabelledTiffin = () => unit({ make: "tiffin", model: "32sa ford 22k", title: "2024 THOR RESONATE 30C" });
const tiffinLabelledThor = () => unit({ make: "thor", model: "TIFFIN ALLEGRO OPEN ROAD 34PA", title: "2022 TIFFIN ALLEGRO OPEN ROAD 34PA" });
const tiffinNoSeries = () => unit({ make: "Tiffin", model: "40 IH", title: "2019 Tiffin Motorhomes 40 IH" });
const jayco = () => unit({ make: "Jayco", model: "Jay Flight 264BH", title: "2024 Jayco Jay Flight 264BH", rv_type: "Travel Trailer" });

describe("brand resolution", () => {
  it("collapses every Tiffin spelling to one brand", () => {
    for (const s of ["Tiffin", "tiffin", "TIFFIN", "Tiffin Motorhomes", "tiffin motorhomes", "Tiffin Motor Homes", "TIFFIN MOTOR COACH", "Allegro Red"]) {
      expect(canonicalBrand(s)).toBe("Tiffin");
    }
    expect(canonicalBrand("forest river rv")).toBe("Forest River");
    expect(canonicalBrand("k-z rv")).toBe("KZ");
  });

  it("the brand at the start of the title wins over a mislabelled make field", () => {
    expect(brandFromTitle("New 2026 Thor Motor Coach Geneva 24VS")).toBe("Thor Motor Coach");
    expect(unitMakeModel(thorLabelledTiffin()).brand).toBe("Thor Motor Coach");
    const t = unitMakeModel(tiffinLabelledThor());
    expect(t.brand).toBe("Tiffin");
    expect(t.series).toBe("Allegro Open Road");
  });

  it("resolves Tiffin series from model + title, most specific first", () => {
    expect(unitMakeModel(red()).series).toBe("Allegro RED");
    expect(unitMakeModel(redModelOnlyInTitle()).series).toBe("Allegro RED");
    expect(unitMakeModel(bus()).series).toBe("Allegro Bus");
    expect(unitMakeModel(openRoad()).series).toBe("Allegro Open Road");
    expect(unitMakeModel(bareAllegro()).series).toBe("Allegro Open Road");
    expect(unitMakeModel(phaeton()).series).toBe("Phaeton");
    expect(unitMakeModel(tiffinNoSeries()).series).toBeNull();
  });

  it("approved Tiffin fuel map", () => {
    expect(unitMakeModel(red()).impliedFuel).toBe("diesel");
    expect(unitMakeModel(bus()).impliedFuel).toBe("diesel");
    expect(unitMakeModel(phaeton()).impliedFuel).toBe("diesel");
    expect(unitMakeModel(unit({ model: "Wayfarer 25RW", title: "2022 Tiffin Wayfarer 25RW", rv_type: "Class C" })).impliedFuel).toBe("diesel");
    expect(unitMakeModel(unit({ model: "Allegro Breeze 32BR", title: "2021 Tiffin Allegro Breeze 32BR" })).impliedFuel).toBe("diesel");
    expect(unitMakeModel(unit({ model: "Zephyr 45FL", title: "2021 Tiffin Zephyr 45FL" })).impliedFuel).toBe("diesel");
    expect(unitMakeModel(openRoad()).impliedFuel).toBe("gas");
    expect(unitMakeModel(unit({ model: "Allegro Bay 32CA", title: "2012 Tiffin Allegro Bay 32CA" })).impliedFuel).toBe("gas");
  });

  it("model matching: series, families, and plain-word matches for other brands", () => {
    expect(modelMatches(red(), "Allegro Red")).toBe("pass");
    expect(modelMatches(bus(), "Allegro RED")).toBe("fail");
    expect(modelMatches(bus(), "Allegro")).toBe("pass");
    expect(modelMatches(phaeton(), "Allegro")).toBe("fail");
    expect(modelMatches(tiffinNoSeries(), "Phaeton")).toBe("unknown");
    expect(modelMatches(jayco(), "Jay Flight")).toBe("pass");
    expect(modelMatches(jayco(), "Eagle")).toBe("fail");
  });
});

describe("make/model are first-class hard filters", () => {
  const corpus = () => [red(), redModelOnlyInTitle(), bus(), openRoad(), bareAllegro(), phaeton(), thorLabelledTiffin(), tiffinLabelledThor(), tiffinNoSeries(), jayco()];

  it("Tiffin Allegro RED returns only Allegro REDs", () => {
    const out = runSearch(corpus(), { makes: ["Tiffin"], models: ["Allegro RED"] });
    expect(out.results.length).toBe(2);
    for (const m of out.results) expect(unitMakeModel(m.unit).series).toBe("Allegro RED");
    // A Tiffin listing that never states its series is never listed as a match.
    expect(out.results.map((m) => m.unit.title)).not.toContain("2019 Tiffin Motorhomes 40 IH");
    expect(out.funnel.excluded[0].reason).toMatch(/^make = Tiffin|^model = Allegro RED/);
  });

  it("Tiffin returns only Tiffins, including the one mislabelled as Thor, and never the Thor mislabelled as Tiffin", () => {
    const out = runSearch(corpus(), { makes: ["Tiffin"] });
    const titles = out.results.map((m) => m.unit.title);
    expect(titles).toContain("2022 TIFFIN ALLEGRO OPEN ROAD 34PA");
    expect(titles).not.toContain("2024 THOR RESONATE 30C");
    for (const m of out.results) expect(unitMakeModel(m.unit).brand).toBe("Tiffin");
    expect(out.results.length).toBe(8);
  });

  it("several models, and exclusions", () => {
    expect(runSearch(corpus(), { makes: ["Tiffin"], models: ["Phaeton", "Allegro Bus"] }).results.length).toBe(2);
    const noBus = runSearch(corpus(), { makes: ["Tiffin"], excludeModels: ["Allegro Bus"] });
    expect(noBus.results.some((m) => unitMakeModel(m.unit).series === "Allegro Bus")).toBe(false);
    const noTiffin = runSearch(corpus(), { excludeMakes: ["Tiffin"] });
    expect(noTiffin.results.every((m) => unitMakeModel(m.unit).brand !== "Tiffin")).toBe(true);
  });

  it("no make/model constraint means no make/model check at all", () => {
    const out = runSearch(corpus(), {});
    expect(out.results[0].hardChecks.some((h) => h.constraint.startsWith("make") || h.constraint.startsWith("model"))).toBe(false);
  });
});

describe("parseMakeModel (shopper text)", () => {
  it("brand + series", () => {
    expect(parseMakeModel("Tiffin Allegro Red")).toEqual({ makes: ["Tiffin"], models: ["Allegro RED"] });
    expect(parseMakeModel("looking for a tiffin phaeton or an allegro bus")).toEqual({ makes: ["Tiffin"], models: ["Allegro Bus", "Phaeton"] });
    expect(parseMakeModel("Tiffin motorhomes")).toEqual({ makes: ["Tiffin"], models: [] });
    expect(parseMakeModel("a Phaeton near Tacoma").makes).toEqual(["Tiffin"]);
    expect(parseMakeModel("Tiffin Allegro").models).toEqual(["Allegro"]);
    expect(parseMakeModel("Allegro Open Road 34PA").models).toEqual(["Allegro Open Road"]);
  });
  it("other brands: next word is the model unless it is a filler word", () => {
    expect(parseMakeModel("Grand Design Imagine 2500RL")).toEqual({ makes: ["Grand Design"], models: ["Imagine"] });
    expect(parseMakeModel("jayco travel trailer")).toEqual({ makes: ["Jayco"], models: [] });
  });
  it("ignores brand-like words that are not RV brands in free text", () => {
    expect(parseMakeModel("we want to hit the open road with a grand old time near Mount Shasta").makes).toEqual([]);
  });
});
