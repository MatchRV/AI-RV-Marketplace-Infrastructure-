import { describe, expect, it } from "vitest";
import { assessRoadToSale, classifyOpening, isNoTowVehicleAnswer, isTowableSearch, mergeProfile, profileFactsFromText, shopperAskedForResultsNow, type BuyerProfile } from "../src/index.js";

const ids = (qs: { id: string }[]) => qs.map((q) => q.id);
const COUPLE_MSG = "We're a couple, just the two of us. Looking for a travel trailer around Tacoma. Cash budget is $35k out the door.";

describe("Golden Ticket gate: ask, don't assume, never re-ask (v2.2.3)", () => {
  it("reads the couple/cash message: type, area, party of 2, buyers, cash, $35k", () => {
    const f = profileFactsFromText(COUPLE_MSG);
    expect(f.rvTypes).toEqual(["travel_trailer"]);
    expect(f.place).toBe("Tacoma");
    expect(f.sleepers).toBe(2);
    expect(f.partyNotes).toMatch(/couple/);
    expect(f.coBuyerInvolved).toBe(true);
    expect(f.owners).toMatch(/couple/);
    expect(f.paymentMethod).toBe("cash");
    expect(f.cashBudgetUsd).toBe(35000);
    expect(f.outTheDoorBudgetUsd).toBe(35000);
    // …so none of those are asked again.
    const a = assessRoadToSale(f as BuyerProfile);
    expect(a.missingForProducts).toEqual(["use", "activities", "vacation", "trade", "towing", "storage", "trips"]);
    for (const answered of ["rv_type", "who_going", "buyers", "location", "pay_way", "pay_numbers"]) expect(a.missingForProducts).not.toContain(answered);
    expect(ids(a.nextQuestions)).toEqual(["use"]);
  });

  it("reads financing follow-ups, trades, towing and storage from plain words", () => {
    expect(profileFactsFromText("We'll finance it. About $5,000 down and $450 a month, and keep out of pocket around $6k.")).toMatchObject({ paymentMethod: "finance", downPaymentUsd: 5000, monthlyPaymentUsd: 450, cashBudgetUsd: 6000 });
    const t = profileFactsFromText("Trading in my 2012 Jayco because we want a bigger bathroom. We'll tow it with our 2021 Ford F-150 3.5L EcoBoost and store it in our driveway.");
    expect(t).toMatchObject({ hasTradeIn: true, tradeDescription: "2012 Jayco", tradeReason: "we want a bigger bathroom", towVehicle: "2021 Ford F-150 3.5L EcoBoost", storage: "our driveway" });
    // The trade's brand is not what they're shopping for.
    expect(t.makes).toBeUndefined();
    expect(profileFactsFromText("No trade, no length limit, and we don't have a truck yet")).toMatchObject({ hasTradeIn: false, noLengthLimit: true, towVehicleUnknown: true });
    expect(profileFactsFromText("We'll tow a Jeep behind it")).toMatchObject({ towingBehind: "Jeep" });
    expect(profileFactsFromText("I'm retired and we want to live in it full time; we love fishing and cooking outside")).toMatchObject({ timeOff: "retired", plannedUses: ["living"], activities: ["fishing", "outdoor cooking"] });
    // "Camping once a month" is not financing; "Camping World" is not camping.
    expect(profileFactsFromText("going camping once a month").paymentMethod).toBeUndefined();
    expect(profileFactsFromText("saw one at Camping World").plannedUses).toBeUndefined();
    // A family with kids is not a number.
    expect(profileFactsFromText("my wife and I and the kids").sleepers).toBeUndefined();
  });

  it("explicit answers win; text only fills gaps", () => {
    const m = mergeProfile({ sleepers: 4, paymentMethod: "finance" }, profileFactsFromText(COUPLE_MSG));
    expect(m.sleepers).toBe(4);
    expect(m.paymentMethod).toBe("finance");
    expect(m.place).toBe("Tacoma");
  });

  it("comparison questions are answered directly (education), never gated", () => {
    for (const t of ["whats better a motorhome or a 5th wheel", "What's better, a motorhome or a fifth wheel?", "Which is better for full time, a fifth wheel or a travel trailer?"]) expect(classifyOpening(t).route).toBe("education");
    expect(classifyOpening(COUPLE_MSG).route).toBe("help_choose");
  });

  it("towing applies to every towable, including a named model", () => {
    expect(isTowableSearch({ rvTypes: ["travel_trailer"], models: ["Imagine"] })).toBe(true);
    expect(isTowableSearch({ rvTypes: ["class_c"] })).toBe(false);
    expect(isTowableSearch({ rvTypes: ["toy_hauler"] })).toBe(true);
  });

  it("recognises the shopper's own 'just show me' and 'no tow vehicle yet' answers", () => {
    for (const t of ["just show me", "Just show me what you have", "skip the questions please", "can I see some options", "let me see them"]) expect(shopperAskedForResultsNow(t)).toBe(true);
    for (const t of ["I want a travel trailer for my family", "show", "", "what do you think?", "4 of us", COUPLE_MSG]) expect(shopperAskedForResultsNow(t)).toBe(false);
    for (const t of ["none yet", "not sure", "I don't have one yet", "unknown", "N/A", "don't have a truck yet"]) expect(isNoTowVehicleAnswer(t)).toBe(true);
    for (const t of ["2021 Ford F-150 3.5L EcoBoost", "Chevy Tahoe", "none of your business F-250"]) expect(isNoTowVehicleAnswer(t)).toBe(false);
  });
});
