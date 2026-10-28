import { describe, expect, it } from "vitest";
import {
  applyManufacturerSpecs, applyManufacturerSpecsToAll, buildSpecIndex, findSpecRecord, enforceFactsOnly, isServableFact, seriesThenCode,
  isManufacturerSource, parseSpecTableText, MANUFACTURER_SPEC_RECORDS, provenanceLabel, powertrainReport,
  type CanonicalUnit, type ManufacturerSpecRecord,
} from "../src/index.js";
import { matchingUnits } from "./matching-fixture.js";

const seed = { records: MANUFACTURER_SPEC_RECORDS };

const U = { value: null, source: null, confidence: null } as const;
const blank = (o: Partial<CanonicalUnit>): CanonicalUnit => ({
  ...structuredClone(matchingUnits[0]),
  lengthFt: U, sleeps: U, dryWeightLbs: U, gvwrLbs: U, hitchWeightLbs: U, slideouts: U,
  freshWaterGal: U, greyWaterGal: U, blackWaterGal: U,
  ...o,
});

const COLEMAN: ManufacturerSpecRecord = seed.records.find((r) => r.floorplanCode === "17B")!;
const JAYFLIGHT: ManufacturerSpecRecord = seed.records.find((r) => r.floorplanCode === "270BHSW")!;
const idx = buildSpecIndex(seed.records);

describe("provenance vocabulary", () => {
  it("maps every source to the public label and null to unknown", () => {
    expect(provenanceLabel({ value: 30, source: "dealer_listing" })).toBe("dealer_listing");
    expect(provenanceLabel({ value: 30, source: "derived_text" })).toBe("parsed_dealer_text");
    expect(provenanceLabel({ value: true, source: "derived_model_code" })).toBe("decoded_floorplan_code");
    expect(provenanceLabel({ value: 30, source: "manufacturer_spec" })).toBe("computed_from_brochure");
    expect(provenanceLabel({ value: 6, source: "computed" })).toBe("computed_estimate");
    expect(provenanceLabel({ value: null, source: null })).toBe("unknown");
  });
});

describe("spec records are source-backed or rejected", () => {
  it("accepts the committed seed records (first-party manufacturer pages)", () => {
    expect(idx.accepted).toBe(seed.records.length);
    expect(idx.rejected).toEqual([]);
  });
  it("rejects third-party, non-https or look-alike domains", () => {
    expect(isManufacturerSource({ make: "Jayco", sourceUrl: "https://www.jayco.com/rvs/x" })).toBe(true);
    expect(isManufacturerSource({ make: "Jayco", sourceUrl: "http://www.jayco.com/rvs/x" })).toBe(false);
    expect(isManufacturerSource({ make: "Jayco", sourceUrl: "https://campertrailers.com/jayflight-270bhsw.html" })).toBe(false);
    expect(isManufacturerSource({ make: "Jayco", sourceUrl: "https://jayco.com.evil.example/x" })).toBe(false);
    expect(isManufacturerSource({ make: "Unknown Brand", sourceUrl: "https://unknownbrand.com/x" })).toBe(false);
    const bad = buildSpecIndex([
      { ...JAYFLIGHT, sourceUrl: "https://rvguide.com/specs/x" },
      { ...JAYFLIGHT, specs: { sleeps: 40 } },
      { ...JAYFLIGHT, retrievedAt: "" },
      { ...JAYFLIGHT, specs: {} },
    ]);
    expect(bad.accepted).toBe(0);
    expect(bad.rejected.map((r) => r.reason)).toEqual(["source_not_manufacturer_https", "out_of_range_sleeps", "missing_retrieved_at", "no_specs"]);
  });
});

describe("exact-configuration matching", () => {
  it("matches year + series + floorplan code from the title", () => {
    const u = blank({ title: "2027 KEYSTONE COLEMAN 17B", make: "KEYSTONE", model: "COLEMAN 17B", year: 2027 });
    const hit = findSpecRecord(u, idx);
    expect("record" in hit && hit.record.floorplanCode).toBe("17B");
  });
  it("never borrows a neighbouring year", () => {
    const u = blank({ title: "2026 KEYSTONE COLEMAN 17B", make: "keystone", model: "COLEMAN 17B", year: 2026 });
    expect(findSpecRecord(u, idx)).toEqual({ failure: "no_record_for_year_and_code" });
  });
  it("refuses when the model field names a different unit than the title (feed bug)", () => {
    const u = blank({ title: "2027 Forest River RV IBEX 16MKS", make: "Forest River RV", model: "Jay Flight 270BHSW", year: 2027 });
    expect(findSpecRecord(u, idx)).toEqual({ failure: "model_field_names_other_floorplan" });
  });
  it("requires the series in the title (same code, different line)", () => {
    const u = blank({ title: "2027 Jayco Eagle 270BHSW", make: "Jayco", model: "Eagle 270BHSW", year: 2027 });
    expect(findSpecRecord(u, idx)).toEqual({ failure: "series_not_in_title" });
  });
  it("refuses a series-level match when the title names a longer series (Jay Flight Sport ≠ Jay Flight)", () => {
    const u = blank({ title: "2027 JAYCO JAY FLIGHT SPORT 270BHSW", make: "JAYCO", model: "JAY FLIGHT SPORT 270BHSW", year: 2027 });
    expect(findSpecRecord(u, idx)).toEqual({ failure: "series_not_in_title" });
    expect(seriesThenCode("2027 Keystone Coleman Lantern 17B", "Coleman", "17B")).toBe(false);
    expect(seriesThenCode("2027 KEYSTONE COLEMAN 17B", "Coleman", "17B")).toBe(true);
    expect(seriesThenCode("2027 Jayco Jay Flight 270-BHSW", "Jay Flight", "270BHSW")).toBe(true);
  });
  it("refuses when the brand contradicts the record", () => {
    const u = blank({ title: "2027 Grand Design Jay Flight 270BHSW", make: "Grand Design", model: "Jay Flight 270BHSW", year: 2027 });
    expect(findSpecRecord(u, idx)).toEqual({ failure: "brand_conflict" });
  });
  it("fills nothing when two records for the same configuration disagree", () => {
    const twin = buildSpecIndex([JAYFLIGHT, { ...JAYFLIGHT, specs: { ...JAYFLIGHT.specs, sleeps: 8 } }]);
    const u = blank({ title: "2027 Jayco Jay Flight 270BHSW", make: "Jayco", model: "Jay Flight 270BHSW", year: 2027 });
    const r = applyManufacturerSpecs(u, twin);
    expect(r.failure).toBe("ambiguous");
    expect(u.sleeps.value).toBeNull();
  });
});

describe("fill, never overwrite; unknown stays unknown", () => {
  it("fills missing fields with manufacturer_spec + sourceUrl and leaves unpublished fields unknown", () => {
    const u = blank({ title: "2027 KEYSTONE COLEMAN 17B", make: "KEYSTONE", model: "COLEMAN 17B", year: 2027 });
    const r = applyManufacturerSpecs(u, idx);
    expect(r.filled).toEqual(expect.arrayContaining(["lengthFt", "sleeps", "dryWeightLbs", "hitchWeightLbs", "freshWaterGal"]));
    expect(u.lengthFt).toMatchObject({ value: 20.17, source: "manufacturer_spec", confidence: "high", sourceUrl: COLEMAN.sourceUrl, observedAt: "2026-10-26" });
    expect(u.dryWeightLbs).toMatchObject({ value: 3071, source: "manufacturer_spec", confidence: "medium" });
    expect(u.dryWeightLbs.note).toMatch(/Shipping Weight/);
    // Keystone does not publish GVWR or slide count on this page: never derived (no UVW + CCC math).
    expect(u.gvwrLbs.value).toBeNull();
    expect(u.slideouts.value).toBeNull();
    expect(provenanceLabel(u.sleeps)).toBe("computed_from_brochure");
  });
  it("keeps dealer values and reports large disagreements for review", () => {
    const u = blank({
      title: "2027 Jayco Jay Flight 270BHSW", make: "Jayco", model: "Jay Flight 270BHSW", year: 2027,
      sleeps: { value: 8, source: "dealer_listing", confidence: "high" },
      dryWeightLbs: { value: 5590, source: "dealer_listing", confidence: "high" },
      freshWaterGal: { value: 52, source: "dealer_listing", confidence: "high" },
    });
    const r = applyManufacturerSpecs(u, idx);
    expect(u.sleeps).toMatchObject({ value: 8, source: "dealer_listing" });
    expect(u.dryWeightLbs).toMatchObject({ value: 5590, source: "dealer_listing" }); // 4% off: within tolerance, no conflict
    expect(r.conflicts.map((c) => c.field)).toEqual(["sleeps"]);
    expect(u.freshWaterGal).toMatchObject({ value: 52, source: "dealer_listing" }); // build-plant dependent: not in the record
    expect(u.gvwrLbs).toMatchObject({ value: 7000, source: "manufacturer_spec" });
    expect(u.lengthFt.value).toBe(31.83);
  });
  it("replaces an estimate (computed / floorplan-decoded) with the published figure", () => {
    const u = blank({
      title: "2027 Jayco Jay Flight 270BHSW", make: "Jayco", model: "Jay Flight 270BHSW", year: 2027,
      sleeps: { value: 8, source: "computed", confidence: "low", note: "Inferred" },
    });
    applyManufacturerSpecs(u, idx);
    expect(u.sleeps).toMatchObject({ value: 10, source: "manufacturer_spec" });
  });
  it("batch stats count fills and skip reasons", () => {
    const units = [
      blank({ id: "a", title: "2027 KEYSTONE COLEMAN 17B", make: "KEYSTONE", model: "COLEMAN 17B", year: 2027 }),
      blank({ id: "b", title: "2027 Forest River RV IBEX 16MKS", make: "Forest River RV", model: "Jay Flight 270BHSW", year: 2027 }),
      blank({ id: "c", title: "2024 Keystone Cougar 2400BH", make: "Keystone", model: "Cougar 2400BH", year: 2024 }),
    ];
    const s = applyManufacturerSpecsToAll(units, idx);
    expect(s.matched).toBe(1);
    expect(s.fieldsFilled.lengthFt).toBe(1);
    expect(s.failures).toEqual({ model_field_names_other_floorplan: 1 });
  });
  it("labels manufacturer facts in motorhome receipts", () => {
    const mh = blank({ rvType: "class_a", gvwrLbs: { value: 26000, source: "manufacturer_spec", confidence: "medium", sourceUrl: "https://www.tiffinmotorhomes.com/x" } });
    const rep = powertrainReport(mh) as { whatItCanCarry: { gvwrLbs: { status: string; sourceUrl?: string } } };
    expect(rep.whatItCanCarry.gvwrLbs).toMatchObject({ status: "published_by_manufacturer", sourceUrl: "https://www.tiffinmotorhomes.com/x" });
  });
});

describe("spec table parser (labeled values only)", () => {
  it("reads a Jayco-style table, preferring overall length over box length", () => {
    const text = [
      "| Dry Hitch Weight (lbs) | 760 |", "| Unloaded Vehicle Weight (lbs) | 5,380 |", "| Cargo Carrying Capacity (lbs) | 1,620 |",
      "| Gross Vehicle Weight Rating (lbs) | 7,000 |", "| Length | 28' 6\" |", "| Exterior Length (overall) | 31' 10\" |",
      "| Fresh Water Capacity (gals) | 76.0 |", "| Gray Water Capacity (gals) | 40.0 |", "| Black Tank Capacity (gals) | 40.0 |",
      "| Sleeps | up to 10 |",
    ].join("\n");
    const { specs } = parseSpecTableText(text);
    expect(specs).toEqual({ hitchWeightLbs: 760, dryWeightLbs: 5380, gvwrLbs: 7000, lengthFt: 31.83, freshWaterGal: 76, greyWaterGal: 40, blackWaterGal: 40, sleeps: 10 });
  });
  it("reads a Keystone-style table and leaves unpublished fields out", () => {
    const text = [
      "| Shipping Weight | 3,071 lb. |", "| Carrying Capacity | 1,229 lb. |", "| Hitch | 398 lb. |", "| Length | 20 ft 2 in |",
      "| Height | 9 ft 5 in |", "| Fresh Water | 21 gal |", "| Gray Water | 34 gal |", "| Waste Water | 34 gal |", "| Sleeping Capacity | 5 |",
    ].join("\n");
    const { specs } = parseSpecTableText(text);
    expect(specs).toEqual({ dryWeightLbs: 3071, hitchWeightLbs: 398, lengthFt: 20.17, freshWaterGal: 21, greyWaterGal: 34, blackWaterGal: 34, sleeps: 5 });
    expect(specs.gvwrLbs).toBeUndefined();
  });
  it("ignores unlabeled numbers and implausible values", () => {
    expect(parseSpecTableText("Great family camper, 3,088 lbs\nSleeps 40").specs).toEqual({});
  });
});

describe("facts-only serving rule", () => {
  it("serves only dealer- or manufacturer-published values and nulls every estimate", () => {
    const u = blank({
      sleeps: { value: 8, source: "computed", confidence: "low", note: "Inferred" },
      lengthFt: { value: 26, source: "derived_model_code", confidence: "medium" },
      dryWeightLbs: { value: 5000, source: "dealer_listing", confidence: "high" },
      gvwrLbs: { value: 7000, source: "manufacturer_spec", confidence: "medium" }, // no sourceUrl: not servable
      hitchWeightLbs: { value: 700, source: "manufacturer_spec", confidence: "medium", sourceUrl: "https://www.jayco.com/x" },
      freshWaterGal: { value: 40, source: "derived_text", confidence: "medium" },
      slideouts: { value: 1, source: "reference_table", confidence: "medium" },
    });
    const stats = enforceFactsOnly([u]);
    expect(u.sleeps.value).toBeNull();
    expect(u.lengthFt.value).toBeNull();
    expect(u.gvwrLbs.value).toBeNull();
    expect(u.slideouts.value).toBeNull();
    expect(u.dryWeightLbs.value).toBe(5000);
    expect(u.hitchWeightLbs.value).toBe(700);
    expect(u.freshWaterGal.value).toBe(40);
    expect(stats).toEqual({ sleeps: { computed: 1 }, lengthFt: { derived_model_code: 1 }, gvwrLbs: { manufacturer_spec: 1 }, slideouts: { reference_table: 1 } });
    expect(isServableFact(u.sleeps)).toBe(false);
  });
});
