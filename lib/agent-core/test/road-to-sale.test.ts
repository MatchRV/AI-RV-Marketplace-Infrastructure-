import { describe, expect, it } from "vitest";
import { GOLDEN_TICKET_ITEMS, ROAD_TO_SALE_STEPS, assessRoadToSale, effectiveBudgetMaxUsd, type BuyerProfile, type RoadStep } from "../src/index.js";

const ids = (qs: { id: string }[]) => qs.map((q) => q.id);
/** Every Golden Ticket question answered (cash buyer, travel trailer). */
const complete: BuyerProfile = {
  rvTypes: ["travel_trailer"], plannedUses: ["camping"], activities: ["fishing"], timeOff: "3 weeks a year",
  sleepers: 4, partyNotes: "wife and two kids", coBuyerInvolved: true, owners: "me and my wife", hasTradeIn: false,
  towVehicleUnknown: true, noLengthLimit: true, plannedTrips: "Mt. Rainier", place: "Tacoma", paymentMethod: "cash", cashBudgetUsd: 45000,
};

describe("Road to the Sale: Product Selection = the Golden Ticket", () => {
  it("asks the Golden Ticket in Jonathan's order, ONE question per turn, each with its reason", () => {
    expect(GOLDEN_TICKET_ITEMS.filter((i) => i.requiredForProducts).map((i) => i.id)).toEqual([
      "rv_type", "use", "activities", "vacation", "who_going", "buyers", "trade", "trade_details", "towing", "storage",
      "length_reason", "length_flex", "trips", "location", "pay_way", "fin_down", "fin_monthly", "fin_cash", "pay_numbers",
    ]);
    const a = assessRoadToSale({});
    expect(a.step.id).toBe("product_selection");
    expect(a.goal?.id).toBe("selection_questions");
    expect(ids(a.nextQuestions)).toEqual(["rv_type"]);
    expect(a.readyForProducts).toBe(false);
    // Every question ends with a short, honest reason ("I ask ...").
    const all = { ...complete, hasTradeIn: true, lengthMaxFt: 30 };
    for (const item of GOLDEN_TICKET_ITEMS) {
      for (const p of [{}, all, { ...all, paymentMethod: "finance" as const }, { rvTypes: ["class_a" as const] }, { lengthMaxFt: 30, lengthReason: "comfort" as const }]) {
        const q = item.question(p as BuyerProfile);
        expect(q.prompt, item.id).toMatch(/[?.]\s+I ask (?:so|because)\b[^?]*\.$/);
      }
    }
    // Jonathan's exact wording for the vacation question.
    expect(GOLDEN_TICKET_ITEMS.find((i) => i.id === "vacation")!.question({}).prompt).toBe("How much time do you get off each year? I ask so I know how much you'll actually be using it, and that helps me point you to the right kind of RV.");
  });

  it("walks the whole list without ever re-asking an answered question", () => {
    let p: BuyerProfile = {};
    const order: string[] = [];
    for (let turn = 0; turn < 30; turn++) {
      const a = assessRoadToSale(p);
      if (a.readyForProducts) break;
      expect(a.nextQuestions.length).toBe(1);
      for (const q of a.nextQuestions) { expect(order).not.toContain(q.id); order.push(q.id); }
      for (const q of a.nextQuestions) {
        const answers: Record<string, Partial<BuyerProfile>> = {
          rv_type: { rvTypes: ["fifth_wheel"] }, use: { plannedUses: ["traveling"] }, activities: { activities: ["golf"] },
          vacation: { timeOff: "retired" }, who_going: { sleepers: 2, partyNotes: "wife and dog" }, buyers: { coBuyerInvolved: false },
          trade: { hasTradeIn: true }, trade_details: { tradeDescription: "2015 Jayco", tradeReason: "wants a bigger kitchen" },
          towing: { towVehicle: "2022 Ram 3500" }, storage: { lengthMaxFt: 38, lengthReason: "storage" }, trips: { plannedTrips: "Arizona for the winter" },
          location: { place: "Spokane" }, pay_way: { paymentMethod: "finance" }, fin_down: { downPaymentUsd: 15000 },
          fin_monthly: { monthlyPaymentUsd: 700 }, fin_cash: { cashBudgetUsd: 20000 },
        };
        p = { ...p, ...answers[q.id] };
      }
    }
    // One per turn, so the trade follow-up comes right after "do you have a trade?".
    expect(order).toEqual(["rv_type", "use", "activities", "vacation", "who_going", "buyers", "trade", "trade_details", "towing", "storage", "trips", "location", "pay_way", "fin_down", "fin_monthly", "fin_cash"]);
    expect(assessRoadToSale(p).readyForProducts).toBe(true);
  });

  it("every Golden Ticket answer is required before RVs; the complete profile is ready", () => {
    expect(assessRoadToSale(complete).readyForProducts).toBe(true);
    for (const [field, id] of [["plannedUses", "use"], ["activities", "activities"], ["timeOff", "vacation"], ["sleepers", "who_going"], ["hasTradeIn", "trade"], ["plannedTrips", "trips"], ["place", "location"]] as const) {
      expect(assessRoadToSale({ ...complete, [field]: null }).missingForProducts).toEqual([id]);
    }
    expect(assessRoadToSale({ ...complete, owners: null, coBuyerInvolved: null }).missingForProducts).toEqual(["buyers"]);
    expect(assessRoadToSale({ ...complete, towVehicleUnknown: null }).missingForProducts).toEqual(["towing"]);
    expect(assessRoadToSale({ ...complete, noLengthLimit: null }).missingForProducts).toEqual(["storage"]);
    // Living in it full time answers the vacation question.
    expect(assessRoadToSale({ ...complete, timeOff: null, plannedUses: ["living"] }).readyForProducts).toBe(true);
  });

  it("a price alone isn't how they'll pay; financing asks down payment, monthly AND cash budget", () => {
    const noWay = assessRoadToSale({ ...complete, paymentMethod: null, cashBudgetUsd: null, budgetMaxUsd: 45000 });
    expect(noWay.missingForProducts).toEqual(["pay_way"]);
    expect(noWay.nextQuestions[0].prompt).toBe("Are you planning on making payments, or paying cash? I ask so we can land on a budget that actually works for you.");
    // Financing follow-ups come one at a time: down payment, then monthly, then cash budget.
    const finBase: BuyerProfile = { ...complete, paymentMethod: "finance", cashBudgetUsd: null };
    const fin = assessRoadToSale(finBase);
    expect(ids(fin.nextQuestions)).toEqual(["fin_down"]);
    expect(fin.missingForProducts).toEqual(["fin_down", "fin_monthly", "fin_cash"]);
    expect(fin.nextQuestions[0].prompt).toMatch(/putting down/);
    const fin2 = assessRoadToSale({ ...finBase, downPaymentUsd: 10000 });
    expect(ids(fin2.nextQuestions)).toEqual(["fin_monthly"]);
    expect(fin2.nextQuestions[0].prompt).toMatch(/monthly payment/);
    const fin3 = assessRoadToSale({ ...finBase, downPaymentUsd: 10000, monthlyPaymentUsd: 500 });
    expect(ids(fin3.nextQuestions)).toEqual(["fin_cash"]);
    expect(fin3.nextQuestions[0].prompt).toMatch(/out of pocket/);
    // Only what's still missing is asked (cash budget already known -> monthly is next).
    expect(ids(assessRoadToSale({ ...finBase, cashBudgetUsd: 8000 }).nextQuestions)).toEqual(["fin_down"]);
    expect(ids(assessRoadToSale({ ...finBase, cashBudgetUsd: 8000, downPaymentUsd: 5000 }).nextQuestions)).toEqual(["fin_monthly"]);
    const done: BuyerProfile = { ...complete, paymentMethod: "finance", cashBudgetUsd: 12000, downPaymentUsd: 10000, monthlyPaymentUsd: 500 };
    expect(assessRoadToSale(done).readyForProducts).toBe(true);
    expect(effectiveBudgetMaxUsd(done)).toBe(65700);
    expect(assessRoadToSale(done).searchConstraints?.priceMaxUsd).toBe(65700);
    // Cash: one budget question, asked only after how they'll pay.
    const cash = assessRoadToSale({ ...complete, cashBudgetUsd: null });
    expect(ids(cash.nextQuestions)).toEqual(["pay_numbers"]);
    expect(cash.nextQuestions[0].prompt).toMatch(/cash budget/);
    expect(ids(assessRoadToSale({ ...complete, paymentMethod: null, cashBudgetUsd: null }).nextQuestions)).toEqual(["pay_way"]);
    // "Prefer not to say" is accepted.
    expect(assessRoadToSale({ ...complete, paymentMethod: null, cashBudgetUsd: null, budgetDeclined: true }).readyForProducts).toBe(true);
  });

  it("trade: asks what and why, never values", () => {
    const a = assessRoadToSale({ ...complete, hasTradeIn: true });
    expect(ids(a.nextQuestions)).toEqual(["trade_details"]);
    expect(a.nextQuestions[0].why).toMatch(/Trade values and numbers are for the dealership/);
    expect(JSON.stringify(a.nextQuestions)).not.toMatch(/owed|payoff|worth|value of/i);
    expect(assessRoadToSale({ ...complete, hasTradeIn: true, tradeDescription: "2012 Jayco" }).nextQuestions[0].prompt).toContain("2012 Jayco");
  });

  it("towing: motorhomes are asked what they tow behind; trailers what tows them", () => {
    const mh = assessRoadToSale({ ...complete, rvTypes: ["class_a"], towVehicleUnknown: null });
    expect(ids(mh.nextQuestions)).toEqual(["towing"]);
    expect(mh.nextQuestions[0].prompt).toMatch(/towing anything behind it/);
    expect(assessRoadToSale({ ...complete, rvTypes: ["class_a"], towVehicleUnknown: null, towingBehind: "nothing" }).readyForProducts).toBe(true);
    const tt = assessRoadToSale({ ...complete, towVehicleUnknown: null });
    expect(tt.nextQuestions[0].prompt).toMatch(/What are you towing the trailer with/);
  });

  it("only the shopper's own skip bypasses the questions, then they resume", () => {
    const a = assessRoadToSale({ models: ["Allegro RED"], makes: ["Tiffin"], discoveryWaived: true });
    expect(a.readyForProducts).toBe(true);
    expect(a.waived).toBe(true);
    expect(ids(a.resumeQuestions)).toEqual(["use"]);
  });

  it("a named exact model answers question 0 only; it doesn't skip the rest", () => {
    const a = assessRoadToSale({ makes: ["Tiffin"], models: ["Allegro RED"], place: "Tacoma" });
    expect(a.readyForProducts).toBe(false);
    expect(a.missingForProducts).not.toContain("rv_type");
    expect(a.missingForProducts).toEqual(expect.arrayContaining(["use", "who_going", "buyers", "trade", "towing", "storage", "trips", "pay_way"]));
    const who = assessRoadToSale({ ...complete, rvTypes: null, makes: ["Tiffin"], models: ["Allegro RED"], sleepers: null });
    expect(who.nextQuestions[0].prompt).toContain("Allegro RED");
  });

  it("length storage/comfort clarifications still gate and are asked on their own", () => {
    const base = { ...complete, noLengthLimit: null };
    const a = assessRoadToSale({ ...base, lengthMaxFt: 35 });
    expect(ids(a.nextQuestions)).toEqual(["length_reason"]);
    expect(a.nextQuestions[0].prompt).toContain("35-foot");
    expect(ids(assessRoadToSale({ ...base, lengthMaxFt: 35, lengthReason: "comfort" }).nextQuestions)).toEqual(["length_flex"]);
    expect(assessRoadToSale({ ...base, lengthMaxFt: 35, lengthReason: "storage" }).readyForProducts).toBe(true);
    expect(assessRoadToSale({ ...base, storage: "our driveway" }).nextQuestions[0].prompt).toContain("our driveway");
  });

  it("after products are shown, the road moves to dealer contact", () => {
    expect(assessRoadToSale(complete).step.id).toBe("present_products");
    const d = assessRoadToSale({ ...complete, productsShown: true });
    expect(d.step.id).toBe("dealer_contact");
    expect(d.stepGuidance).toMatch(/prepare_dealer_inquiry[\s\S]*explicitly approve/);
  });

  it("never says 'Golden Ticket' in a question the shopper hears", () => {
    expect(JSON.stringify(GOLDEN_TICKET_ITEMS.map((i) => i.question({ ...complete, hasTradeIn: true })))).not.toMatch(/golden\s*ticket/i);
  });

  it("is extendable: a new step or goal is data, not code", () => {
    const extra: RoadStep = { id: "demo_drive", number: 5, title: "Demo / test drive", kind: "milestone", done: () => false, guidance: "Offer a walkthrough." };
    const shown = assessRoadToSale({ ...complete, productsShown: true }, { steps: [...ROAD_TO_SALE_STEPS, extra] });
    expect(shown.step.id).toBe("dealer_contact");
    const withGoal = ROAD_TO_SALE_STEPS.map((s) => s.id !== "product_selection" ? s : { ...s, goals: [...s.goals!, { id: "goal_x", title: "test", items: [{ id: "warranty", label: "warranty", known: () => false, question: () => ({ prompt: "Interested in an extended warranty?", why: "test" }) }] }] });
    expect(ids(assessRoadToSale(complete, { steps: withGoal }).nextQuestions)).toEqual(["warranty"]);
  });
});

describe("declining a question (v2.2.4)", () => {
  it("a declined question and its follow-ups are never asked; the next one comes, one at a time", () => {
    const { timeOff: _t, hasTradeIn: _h, ...rest } = complete;
    expect(ids(assessRoadToSale(rest).nextQuestions)).toEqual(["vacation"]);
    expect(ids(assessRoadToSale({ ...rest, declinedQuestions: ["vacation"] }).nextQuestions)).toEqual(["trade"]);
    const r = assessRoadToSale({ ...rest, declinedQuestions: ["vacation", "trade"] });
    expect(r.readyForProducts).toBe(true);
    expect(r.knownSummary.join(" ")).toMatch(/prefers not to answer: vacation, trade/);
    const { paymentMethod: _p, cashBudgetUsd: _c, ...noPay } = complete;
    const pay = assessRoadToSale({ ...noPay, declinedQuestions: ["pay_way"] });
    expect(pay.readyForProducts).toBe(true);
    expect(pay.missingForProducts).not.toContain("pay_numbers");
  });
});
