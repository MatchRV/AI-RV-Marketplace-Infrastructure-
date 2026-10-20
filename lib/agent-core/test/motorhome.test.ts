import { describe, expect, it } from "vitest";
import {
  compareUnits,
  emptyPowertrain,
  emptyTowing,
  evaluateMotorhomeTow,
  fact,
  normalizeRecord,
  powertrainReport,
  runSearch,
  type CanonicalUnit,
  type MotorhomeTowing,
  type Powertrain,
} from "../src/index.js";

function coach(id: string, pt: Partial<Powertrain> = {}, tow: Partial<MotorhomeTowing> = {}, gvwr: number | null = 33_400): CanonicalUnit {
  const r = normalizeRecord(id, {
    dealer_domain: "example.com", _first_seen: "2026-10-06T00:00:00Z", _last_seen: "2026-10-06T00:00:00Z",
    inventory_status: "available", condition: "used", year: 2024, make: "Tiffin", model: "Allegro Bus",
    title: `2024 Tiffin Allegro Bus ${id}`, stock_number: id, rv_type: "Class A", price: 300_000, gvwr,
    image_urls: ["https://example.com/a.jpg"],
  });
  if ("reject" in r) throw new Error(r.reject.reason);
  return { ...r.unit, powertrain: { ...emptyPowertrain(), ...pt }, towing: { ...emptyTowing(), ...tow } };
}
const listed = <T,>(v: T) => fact<T>(v, "dealer_listing", "high");

const hp450 = coach("A", { fuelType: listed("diesel"), horsepower: listed(450), torqueLbFt: listed(1250) }, { hitchTowRatingLbs: listed(10_000), gcwrLbs: listed(45_400) });
const hp360 = coach("B", { fuelType: listed("diesel"), horsepower: listed(360), torqueLbFt: listed(1050) });
const unknownHp = coach("C", { fuelType: listed("diesel"), engine: listed("Cummins L9") });

describe("horsepower / torque requirements", () => {
  it("minimum: lower stated rating fails, unknown never passes, never substitutes a 360-hp coach", () => {
    const out = runSearch([hp450, hp360, unknownHp], { horsepowerMin: 450 });
    expect(out.funnel.passedHard).toBe(1);
    expect(out.results[0].unit.id).toBe(hp450.id);
    const ids = out.results.map(m => m.unit.id);
    expect(ids).not.toContain(hp360.id);
    const c = out.results.find(m => m.unit.id === unknownHp.id)!;
    expect(c.hardStatus).toBe("unverified");
    expect(c.hardChecks.find(h => h.constraint.startsWith("horsepower"))?.status).toBe("unknown");
  });

  it("engine family alone never implies a rating", () => {
    const out = runSearch([unknownHp], { horsepowerMin: 330 });
    expect(out.funnel.passedHard).toBe(0);
    expect(out.funnel.unverified).toBe(1);
  });

  it("torque minimum uses the unit's own rating", () => {
    const out = runSearch([hp450, hp360], { torqueMinLbFt: 1250 });
    expect(out.results.map(m => m.unit.id)).toEqual([hp450.id]);
  });

  it("preferred horsepower ranks but never excludes", () => {
    const out = runSearch([hp360, hp450], { horsepowerPreferred: 450 });
    expect(out.funnel.passedHard).toBe(2);
    expect(out.results[0].unit.id).toBe(hp450.id);
  });

  it("fuel requirement: towables fail, unknown fuel is unverified", () => {
    const noFuel = coach("D");
    const out = runSearch([hp450, noFuel], { fuelType: "diesel" });
    expect(out.funnel.passedHard).toBe(1);
    expect(out.funnel.unverified).toBe(1);
  });
});

describe("motorhome towing", () => {
  it("flags an overloaded coach first, never as towing allowance", () => {
    const r = evaluateMotorhomeTow(hp450, 9_000, { coachLoadedLbs: 34_500 });
    expect(r.verdict).toBe("coach_overloaded");
    expect(r.summary).toMatch(/exceeds GVWR 33,400 lb by 1,100 lb/);
  });

  it("ratings that clear are shown, but fit stays not-yet-confirmed", () => {
    const r = evaluateMotorhomeTow(hp450, 9_000);
    expect(r.verdict).toBe("not_yet_confirmed");
    expect(r.checks.find(c => c.limit.includes("hitch"))?.status).toBe("pass");
    expect(r.checks.find(c => c.limit.includes("GCWR"))?.status).toBe("pass");
    expect(r.checks.find(c => c.limit.includes("axle"))?.status).toBe("needs_verification");
    expect(r.summary).not.toMatch(/safe|great/i);
  });

  it("trailer above the hitch rating fails", () => {
    expect(evaluateMotorhomeTow(hp450, 12_000).verdict).toBe("exceeds_a_limit");
  });

  it("search: trailer requirement is at best unverified; over-limit coaches excluded", () => {
    const out = runSearch([hp450, coach("E", {}, { hitchTowRatingLbs: listed(5_000) })], { trailerWeightLbs: 9_000 });
    expect(out.funnel.passedHard).toBe(0);
    expect(out.results.map(m => m.unit.id)).toEqual([hp450.id]);
  });
});

describe("Powertrain & Towing report", () => {
  it("separates power, carrying and towing, each with a status", () => {
    const rep = powertrainReport(hp450) as any;
    expect(rep.whatPowersIt.horsepower).toMatchObject({ value: 450, status: "listed_by_dealer" });
    expect(rep.whatPowersIt.transmission.status).toBe("needs_verification");
    expect(rep.whatItCanCarry.gvwrLbs.value).toBe(33_400);
    expect(rep.whatItCanTow.hitchTowRatingLbs.value).toBe(10_000);
  });

  it("compare includes powertrain rows for motorhomes", () => {
    const c = compareUnits([hp450, hp360], {});
    expect(c.rows.find(r => r.spec === "horsepower")?.values).toEqual([450, 360]);
  });
});
