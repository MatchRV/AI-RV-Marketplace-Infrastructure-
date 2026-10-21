import { describe, expect, it } from "vitest";
import { ROAD_TO_SALE_STEPS, assessRoadToSale, effectiveBudgetMaxUsd, type BuyerProfile, type RoadStep } from "../src/index.js";

const ids = (qs: { id: string }[]) => qs.map((q) => q.id);
const minimum: BuyerProfile = { rvTypes: ["travel_trailer"], sleepers: 4, place: "Tacoma", paymentMethod: "cash", outTheDoorBudgetUsd: 45000 };

describe("Road to the Sale", () => {
  it("opens with Product Selection Goal One — no meet-and-greet questions", () => {
    const a = assessRoadToSale({});
    expect(a.step.id).toBe("product_selection");
    expect(a.goal?.id).toBe("goal_1_want_and_use");
    expect(ids(a.nextQuestions)).toEqual(["type_or_use", "sleepers"]);
    expect(a.readyForProducts).toBe(false);
  });

  it("asks 1–3 at a time and never re-asks what is known", () => {
    let p: BuyerProfile = {};
    const asked = new Set<string>();
    for (let turn = 0; turn < 10; turn++) {
      const a = assessRoadToSale(p);
      expect(a.nextQuestions.length).toBeLessThanOrEqual(3);
      for (const q of a.nextQuestions) { expect(asked.has(q.id)).toBe(false); asked.add(q.id); }
      if (a.readyForProducts) break;
      // Simulate the shopper answering what was asked.
      for (const q of a.nextQuestions) {
        if (q.id === "type_or_use") p = { ...p, rvTypes: ["class_c"] };
        if (q.id === "sleepers") p = { ...p, sleepers: 2 };
        if (q.id === "location") p = { ...p, place: "Tacoma" };
        if (q.id === "pay_way") p = { ...p, paymentMethod: "finance" };
        if (q.id === "pay_numbers") p = { ...p, downPaymentUsd: 10000, monthlyPaymentUsd: 600 };
        if (q.id === "use") p = { ...p, campingStyle: "mixed" };
        if (q.id === "new_used_trade") p = { ...p, newOrUsed: "used", hasTradeIn: false };
      }
    }
    expect(assessRoadToSale(p).readyForProducts).toBe(true);
  });

  it("approved minimum: type or use, sleeps, area, and budget WITH how they'll pay", () => {
    expect(assessRoadToSale(minimum).readyForProducts).toBe(true);
    expect(assessRoadToSale({ ...minimum, rvTypes: null, campingStyle: "boondocking" }).readyForProducts).toBe(true); // use instead of type
    expect(assessRoadToSale({ ...minimum, place: null }).missingForProducts).toEqual(["location"]);
    expect(assessRoadToSale({ ...minimum, sleepers: null }).missingForProducts).toEqual(["sleepers"]);
    // A price ceiling alone isn't enough: ask how they'll pay.
    const noWay = assessRoadToSale({ ...minimum, paymentMethod: null, outTheDoorBudgetUsd: null, budgetMaxUsd: 45000 });
    expect(noWay.missingForProducts).toEqual(["pay_way"]);
    expect(noWay.nextQuestions[0].prompt).toContain("$45,000");
    // "Prefer not to say" is accepted.
    expect(assessRoadToSale({ ...minimum, paymentMethod: null, outTheDoorBudgetUsd: null, budgetDeclined: true }).readyForProducts).toBe(true);
  });

  it("each of the six ways to pay asks for its own numbers", () => {
    const q = (paymentMethod: BuyerProfile["paymentMethod"]) => assessRoadToSale({ ...minimum, paymentMethod, outTheDoorBudgetUsd: null }).nextQuestions.find((x) => x.id === "pay_numbers")!.prompt;
    expect(q("cash")).toMatch(/out-the-door/);
    expect(q("difference")).toMatch(/trade/);
    expect(q("finance")).toMatch(/down payment and monthly payment/);
    expect(q("discount")).toMatch(/price range/);
    expect(q("ad_shopper")).toMatch(/ad/);
    expect(q("special_finance")).toMatch(/approved first/);
    // Finance minimum = down + monthly; budget estimated and labelled.
    const fin: BuyerProfile = { ...minimum, paymentMethod: "finance", outTheDoorBudgetUsd: null, downPaymentUsd: 10000, monthlyPaymentUsd: 500 };
    expect(assessRoadToSale(fin).readyForProducts).toBe(true);
    expect(effectiveBudgetMaxUsd(fin)).toBe(65700);
    expect(assessRoadToSale(fin).searchConstraints?.priceMaxUsd).toBe(65700);
  });

  it("Goal Three (owners) is asked along the way, never blocking; Goal Four only when financing", () => {
    const cash = assessRoadToSale({ ...minimum, campingStyle: "mixed", newOrUsed: "new", hasTradeIn: false, drivenBefore: true, mustHaves: ["outdoor kitchen"], storage: "driveway", hobbies: "kayaks" });
    expect(cash.readyForProducts).toBe(true);
    expect(ids(cash.nextQuestions)).toEqual(["owners"]);
    expect(cash.openGoals.some((g) => g.id === "goal_4_credit")).toBe(false);
    const fin = assessRoadToSale({ ...minimum, paymentMethod: "finance", outTheDoorBudgetUsd: 60000, owners: "me and my wife", licensingState: "WA", campingStyle: "mixed", newOrUsed: "new", hasTradeIn: false, drivenBefore: true, mustHaves: ["x"], storage: "lot", hobbies: "golf" });
    expect(ids(fin.nextQuestions)).toEqual(["credit"]);
  });

  it("'just show me' shows results, then resumes the open questions", () => {
    const a = assessRoadToSale({ models: ["Allegro RED"], makes: ["Tiffin"], discoveryWaived: true });
    expect(a.readyForProducts).toBe(true);
    expect(a.waived).toBe(true);
    expect(ids(a.resumeQuestions)).toEqual(["sleepers", "location"]);
  });

  it("an exact model counts as Goal One's type; questions use the model's name, never 'trailer'", () => {
    const a = assessRoadToSale({ makes: ["Tiffin"], models: ["Allegro RED"], place: "Tacoma" });
    expect(a.missingForProducts).toEqual(["sleepers", "pay_way", "pay_numbers"]);
    expect(a.nextQuestions[0].prompt).toBe("Who's this Allegro RED for, and how many will usually sleep in it?");
    const mh = assessRoadToSale({ rvTypes: ["class_a", "class_b", "class_c"] });
    expect(mh.nextQuestions[0].prompt).toContain("motorhome");
    expect(JSON.stringify(mh.nextQuestions)).not.toMatch(/trailers?\b(?! \()/i);
  });

  it("length storage/comfort clarifications still gate and are asked on their own", () => {
    const a = assessRoadToSale({ ...minimum, lengthMaxFt: 35 });
    expect(ids(a.nextQuestions)).toEqual(["length_reason"]);
    expect(a.nextQuestions[0].prompt).toContain("35-foot");
    expect(ids(assessRoadToSale({ ...minimum, lengthMaxFt: 35, lengthReason: "comfort" }).nextQuestions)).toEqual(["length_flex"]);
    expect(assessRoadToSale({ ...minimum, lengthMaxFt: 35, lengthReason: "storage" }).readyForProducts).toBe(true);
  });

  it("after products are shown, the road moves to dealer contact", () => {
    expect(assessRoadToSale(minimum).step.id).toBe("present_products");
    const d = assessRoadToSale({ ...minimum, productsShown: true });
    expect(d.step.id).toBe("dealer_contact");
    expect(d.stepGuidance).toMatch(/prepare_dealer_inquiry[\s\S]*explicitly approve/);
  });

  it("is extendable: a new step or goal is data, not code", () => {
    const extra: RoadStep = { id: "demo_drive", number: 5, title: "Demo / test drive", kind: "milestone", done: () => false, guidance: "Offer a walkthrough." };
    const steps = [...ROAD_TO_SALE_STEPS, extra];
    const shown = assessRoadToSale({ ...minimum, productsShown: true }, { steps });
    expect(shown.step.id).toBe("dealer_contact");
    // Insert a new goal into Product Selection: it's asked along the way automatically.
    const withGoal = ROAD_TO_SALE_STEPS.map((s) => s.id !== "product_selection" ? s : { ...s, goals: [...s.goals!, { id: "goal_5_test", title: "Goal Five: test", items: [{ id: "warranty", label: "warranty", known: () => false, question: () => ({ prompt: "Interested in an extended warranty?", why: "test" }) }] }] });
    const a = assessRoadToSale({ ...minimum, campingStyle: "mixed", newOrUsed: "new", hasTradeIn: false, drivenBefore: true, mustHaves: ["x"], storage: "lot", hobbies: "golf", owners: "me" }, { steps: withGoal });
    expect(ids(a.nextQuestions)).toEqual(["warranty"]);
  });
});
