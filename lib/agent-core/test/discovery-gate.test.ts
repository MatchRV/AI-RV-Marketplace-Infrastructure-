import { describe, expect, it } from "vitest";
import { assessRoadToSale, isNoTowVehicleAnswer, isTowableSearch, shopperAskedForResultsNow, type BuyerProfile } from "../src/index.js";

const ids = (qs: { id: string }[]) => qs.map((q) => q.id);

describe("Road to the Sale gate: ask, don't assume (v2.2.2)", () => {
  it("'travel trailer for my family near Tacoma' asks party size, tow vehicle and size limit first", () => {
    const a = assessRoadToSale({ rvTypes: ["travel_trailer"], place: "Tacoma" });
    expect(a.readyForProducts).toBe(false);
    expect(ids(a.nextQuestions)).toEqual(["sleepers", "tow_vehicle", "size_limit"]);
    expect(a.missingForProducts).toEqual(["sleepers", "tow_vehicle", "size_limit", "pay_way", "pay_numbers"]);
    expect(a.nextQuestions[1].prompt).toMatch(/towing the trailer with/);
    expect(a.nextQuestions[2].prompt).toMatch(/length or size limit/);
  });

  it("then asks how they'll pay, and never asks the budget numbers in the same breath", () => {
    const a = assessRoadToSale({ rvTypes: ["travel_trailer"], place: "Tacoma", sleepers: 4, towVehicle: "2020 Toyota Tundra", lengthMaxFt: 28, lengthReason: "storage" });
    expect(a.missingForProducts).toEqual(["pay_way", "pay_numbers"]);
    expect(ids(a.nextQuestions)).toContain("pay_way");
    expect(ids(a.nextQuestions)).not.toContain("pay_numbers");
  });

  it("'none yet' and 'no limit' are answers; a budget alone is not", () => {
    const base: BuyerProfile = { rvTypes: ["fifth_wheel"], place: "Spokane", sleepers: 2, paymentMethod: "cash", outTheDoorBudgetUsd: 70000 };
    expect(assessRoadToSale(base).missingForProducts).toEqual(["tow_vehicle", "size_limit"]);
    expect(assessRoadToSale({ ...base, towVehicleUnknown: true, noLengthLimit: true }).readyForProducts).toBe(true);
    expect(assessRoadToSale({ ...base, towVehicle: "2022 Ram 2500", lengthMaxFt: 35, lengthReason: "storage" }).readyForProducts).toBe(true);
  });

  it("motorhomes and named exact models don't get the towable questions", () => {
    expect(isTowableSearch({ rvTypes: ["class_c"] })).toBe(false);
    expect(isTowableSearch({ rvTypes: ["travel_trailer"], models: ["Imagine"] })).toBe(false);
    expect(isTowableSearch({ rvTypes: ["travel_trailer", "class_c"] })).toBe(false);
    expect(isTowableSearch({ rvTypes: ["toy_hauler"] })).toBe(true);
    const mh = assessRoadToSale({ rvTypes: ["class_c"], place: "Tacoma", sleepers: 2, paymentMethod: "cash", outTheDoorBudgetUsd: 90000 });
    expect(mh.readyForProducts).toBe(true);
  });

  it("recognises the shopper's own 'just show me' and 'no tow vehicle yet' answers", () => {
    for (const t of ["just show me", "Just show me what you have", "skip the questions please", "can I see some options", "let me see them"]) expect(shopperAskedForResultsNow(t)).toBe(true);
    for (const t of ["I want a travel trailer for my family", "show", "", "what do you think?", "4 of us"]) expect(shopperAskedForResultsNow(t)).toBe(false);
    for (const t of ["none yet", "not sure", "I don't have one yet", "unknown", "N/A", "don't have a truck yet"]) expect(isNoTowVehicleAnswer(t)).toBe(true);
    for (const t of ["2021 Ford F-150 3.5L EcoBoost", "Chevy Tahoe", "none of your business F-250"]) expect(isNoTowVehicleAnswer(t)).toBe(false);
  });
});
