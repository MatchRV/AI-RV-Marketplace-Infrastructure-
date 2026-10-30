import { describe, expect, it } from "vitest";
import { parseJaycoPage } from "../scripts/brochure-crawl/jayco.js";
import { parseGrandDesignPage } from "../scripts/brochure-crawl/grand-design.js";
import { parseKeystonePage, seriesFromSlug } from "../scripts/brochure-crawl/keystone.js";
import { parseRobots, looksLikeChallenge } from "../scripts/brochure-crawl/common.js";
import { applyManufacturerSpecs, buildSpecIndex, findSpecRecord, titleFloorplanCodes, type CanonicalUnit, type ManufacturerSpecRecord } from "../src/index.js";
import { matchingUnits } from "./matching-fixture.js";

const U = { value: null, source: null, confidence: null } as const;
const blank = (o: Partial<CanonicalUnit>): CanonicalUnit => ({
  ...structuredClone(matchingUnits[0]),
  lengthFt: U, sleeps: U, dryWeightLbs: U, gvwrLbs: U, hitchWeightLbs: U, slideouts: U,
  freshWaterGal: U, greyWaterGal: U, blackWaterGal: U, bunkhouse: U,
  ...o,
});

const row = (k: string, v: string) => `<tr><td>${k}</td><td class="text-right">${v}</td></tr>`;
const jaycoHtml = (title: string, extra = "") => `<html><head><title>${title}</title></head><body>
<h3>Specifications</h3><h5>Weights</h5><table>${row("Dry Hitch Weight (lbs)", "405")}${row("Unloaded Vehicle Weight (lbs)", "3,270")}${row("Gross Vehicle Weight Rating (lbs)", "3,995")}</table>
<h5>Measurements</h5><table>${row("Exterior Length (overall)", "22' 5\"")}${row("Length", "19' 1\"")}</table>
<h5>Tank Capacities</h5><table>${row("Fresh Water Capacity (gals)", "52.0")}${row("Gray Water Capacity (gals)", "39.0")}${row("Black Tank Capacity (gals)", "39.0")}</table>
<h5>Miscellaneous</h5><table>${row("Sleeps", "up to 6")}</table>
Interior Designs <p>Other floorplan card: Sleeps up to 10 | Length 31' 10"</p> ${extra}</body></html>`;

describe("Jayco floorplan page parser", () => {
  const url = "https://www.jayco.com/rvs/travel-trailers/2027-jay-flight/172db/";
  it("reads only the Specifications tables, with labels", () => {
    const r = parseJaycoPage(jaycoHtml("2027 Jay Flight - 172DB Sport Edition | Jayco RV"), url) as ManufacturerSpecRecord;
    expect(r).toMatchObject({ year: 2027, make: "Jayco", series: "Jay Flight", floorplanCode: "172DB", floorplanName: "172DB Sport Edition" });
    expect(r.specs).toEqual({ hitchWeightLbs: 405, dryWeightLbs: 3270, gvwrLbs: 3995, lengthFt: 22.42, freshWaterGal: 52, greyWaterGal: 39, blackWaterGal: 39, sleeps: 6 });
    expect(r.labels?.sleeps).toBe("Sleeps (up to)");
    expect(r.bunkhouse).toBeUndefined(); // Jayco pages publish no bunkhouse statement
  });
  it("omits fresh water when Jayco says Western- and Eastern-built tanks differ", () => {
    const r = parseJaycoPage(jaycoHtml("2027 Jay Flight - 172DB | Jayco RV", "Western-built models go even further with 76 or 80 gal."), url) as ManufacturerSpecRecord;
    expect(r.specs.freshWaterGal).toBeUndefined();
    expect(r.note).toMatch(/Western- and Eastern-built/);
  });
  it("refuses a page whose title year or code disagrees with its URL", () => {
    expect(parseJaycoPage(jaycoHtml("2026 Jay Flight - 172DB | Jayco RV"), url)).toEqual({ skip: "year_mismatch_title_vs_url" });
    expect("skip" in parseJaycoPage(jaycoHtml("2027 Jay Flight - 264BH | Jayco RV"), url)).toBe(true);
  });
});

const gdMeta = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `<meta name="cludo:${k}" content="${v}"/>`).join("\n");
describe("Grand Design spec-sheet parser", () => {
  const base = { FloorplanName: "2027 Imagine Lightweight Travel Trailer 2470BH", TrueName: "2470BH", Brand: "Imagine", field_sleep_capacity: "6", field_uvw: "6,689", field_gvwr: "7,850", field_pin_weight_formatted: "749 lbs.", field_length_inches: "348&#34;", field_fresh_wc: "45", field_grey_wc: "82", field_waste_wc: "45", field_num_slides: "1", field_std_bunk_dim: "(2) 47x76&#34; Bunks", IsDealerStock: "false", field_spec_notes: "N/A" };
  const url = "https://www.granddesignrv.com/travel-trailers/imagine/2470bh";
  it("reads the structured spec sheet and confirms bunks from Standard Bunk Dimensions", () => {
    const r = parseGrandDesignPage(gdMeta(base), url) as ManufacturerSpecRecord;
    expect(r).toMatchObject({ year: 2027, make: "Grand Design", series: "Imagine", floorplanCode: "2470BH", bunkhouse: true });
    expect(r.specs).toEqual({ sleeps: 6, dryWeightLbs: 6689, gvwrLbs: 7850, hitchWeightLbs: 749, lengthFt: 29, freshWaterGal: 45, greyWaterGal: 82, blackWaterGal: 45, slideouts: 1 });
    expect(r.bunkhouseEvidence).toContain('47x76" Bunks');
  });
  it("N/A bunk dimensions is not a denial; motorized pages get no hitch weight; type suffix is not part of the series", () => {
    const r = parseGrandDesignPage(gdMeta({ ...base, field_std_bunk_dim: "N/A", Brand: "Reflection Travel Trailer", TrueName: "342BHTS", FloorplanName: "2027 Reflection Travel Trailer 342BHTS" }), "https://www.granddesignrv.com/travel-trailers/reflection/342bhts") as ManufacturerSpecRecord;
    expect(r.bunkhouse).toBeUndefined();
    expect(r.series).toBe("Reflection");
    const mh = parseGrandDesignPage(gdMeta({ ...base, TrueName: "30DC", Brand: "Lineage Series E", FloorplanName: "2027 Lineage Series E 30DC", field_pin_weight_formatted: "7,500 lbs." }), "https://www.granddesignrv.com/motorized/lineage-series-e/30dc") as ManufacturerSpecRecord;
    expect(mh.specs.hitchWeightLbs).toBeUndefined();
  });
});

describe("Keystone floorplan parser", () => {
  const html = (img: string) => `<img src="https://keystonerv-prod.zaneray.com/cms/images/x_${img}.png"><p>17B - Comfort Travel Trailers</p><p>Single axle, non-slide, single bunks</p>
<p>Specification Name</p><p>Specification Value</p><p>Shipping Weight</p><p>3,071 lb.</p><p>Hitch</p><p>398 lb.</p><p>Length</p><p>20 ft 2 in</p><p>Sleeping Capacity</p><p>5</p><p>Standards &amp; Options*</p>`;
  const url = "https://www.keystonerv.com/product/coleman-travel-trailers/comfort-travel-trailers/floorplans/17B";
  it("reads specs + floorplan description, year from Keystone's own floorplan drawing", () => {
    const r = parseKeystonePage(html("CM_17B_2027"), url) as ManufacturerSpecRecord;
    expect(r).toMatchObject({ year: 2027, series: "Coleman", floorplanCode: "17B", bunkhouse: true, bunkhouseEvidence: "Single axle, non-slide, single bunks" });
    expect(r.specs).toEqual({ dryWeightLbs: 3071, hitchWeightLbs: 398, lengthFt: 20.17, sleeps: 5 });
  });
  it("skips when the year is missing or ambiguous", () => {
    expect("skip" in parseKeystonePage(html("CM_17B"), url)).toBe(true);
    expect("skip" in parseKeystonePage(html("CM_17B_2026") + html("CM_17B_2027"), url)).toBe(true);
  });
  it("maps slugs to title series names", () => {
    expect(seriesFromSlug("cougar-half-ton")).toBe("Cougar Half-Ton");
    expect(seriesFromSlug("passport-sl")).toBe("Passport SL");
    expect(seriesFromSlug("springdale-mini")).toBe("Springdale Mini");
  });
});

describe("crawler etiquette", () => {
  it("parses the User-agent * group of robots.txt", () => {
    const r = parseRobots("User-agent: *\nContent-Signal: search=yes,ai-train=no\nDisallow: /search\nDisallow: /downloads/\n\nUser-agent: Amazonbot\nDisallow: /\n");
    expect(r.disallow).toEqual(["/search", "/downloads/"]);
    expect(r.contentSignal).toBe("search=yes,ai-train=no");
  });
  it("recognises a bot challenge page (crawler stops instead of retrying)", () => {
    expect(looksLikeChallenge("<html><head><title>Just a moment...</title>")).toBe(true);
    expect(looksLikeChallenge("<html><head><title>2027 Jay Flight</title>")).toBe(false);
  });
});

describe("matching crawled records", () => {
  const gd: ManufacturerSpecRecord = { year: 2027, make: "Grand Design", series: "Imagine", floorplanCode: "2470BH", sourceUrl: "https://www.granddesignrv.com/travel-trailers/imagine/2470bh", retrievedAt: "2026-10-29", specs: { sleeps: 6 }, bunkhouse: true, bunkhouseEvidence: "Standard Bunk Dimensions: (2) 47x76\" Bunks" };
  const jf: ManufacturerSpecRecord = { year: 2027, make: "Jayco", series: "Jay Flight", floorplanCode: "172DB", sourceUrl: "https://www.jayco.com/rvs/travel-trailers/2027-jay-flight/172db/", retrievedAt: "2026-10-29", specs: { sleeps: 6 } };
  const idx = buildSpecIndex([gd, jf]);
  it("reads 4-digit floorplan codes but never a year as a code", () => {
    expect(titleFloorplanCodes("2027 GRAND DESIGN IMAGINE 2470BH")).toContain("2470BH");
    expect(titleFloorplanCodes("2027 GRAND DESIGN IMAGINE 2470BH")).not.toContain("2027GRAND");
  });
  it("fills sleeps and confirms bunkhouse with the source link; never overwrites the dealer", () => {
    const u = blank({ title: "2027 Grand Design Imagine 2470BH", make: "Grand Design", model: "Imagine 2470BH", year: 2027, rvType: "travel_trailer" });
    const r = applyManufacturerSpecs(u, idx);
    expect(r.filled).toEqual(["sleeps", "bunkhouse"]);
    expect(u.bunkhouse).toMatchObject({ value: true, source: "manufacturer_spec", sourceUrl: gd.sourceUrl });
    const d = blank({ title: "2027 Grand Design Imagine 2470BH", make: "Grand Design", model: "Imagine 2470BH", year: 2027, sleeps: { value: 8, source: "dealer_listing", confidence: "high" }, bunkhouse: { value: false, source: "dealer_listing", confidence: "medium" } });
    const r2 = applyManufacturerSpecs(d, idx);
    expect(d.sleeps.value).toBe(8);
    expect(d.bunkhouse.value).toBe(false);
    expect(r2.conflicts.map((c) => c.field).sort()).toEqual(["bunkhouse", "sleeps"]);
  });
  it("replaces a BH-code bunkhouse reading with the brochure statement", () => {
    const u = blank({ title: "2027 Grand Design Imagine 2470BH", make: "Grand Design", model: "Imagine 2470BH", year: 2027, bunkhouse: { value: true, source: "derived_model_code", confidence: "medium" } });
    applyManufacturerSpecs(u, idx);
    expect(u.bunkhouse.source).toBe("manufacturer_spec");
  });
  it("exact series only: 'Jay Flight Sport 172DB' and other years are refused", () => {
    expect(findSpecRecord(blank({ title: "2027 Jayco Jay Flight Sport 172DB", make: "Jayco", model: "Jay Flight Sport 172DB", year: 2027 }), idx)).toEqual({ failure: "series_not_in_title" });
    expect(findSpecRecord(blank({ title: "2026 Jayco Jay Flight 172DB", make: "Jayco", model: "Jay Flight 172DB", year: 2026 }), idx)).toEqual({ failure: "no_record_for_year_and_code" });
    expect("record" in findSpecRecord(blank({ title: "2027 Jayco Jay Flight 172DB", make: "Jayco", model: "Jay Flight 172DB", year: 2027 }), idx)).toBe(true);
  });
});
