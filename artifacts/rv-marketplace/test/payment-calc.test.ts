import { describe, expect, it } from "vitest";
import {
  CREDIT_RANGES, PREFS_KEY, clearPaymentPrefs, creditLabel, emptyPaymentPrefs, estimatePayment, loadPaymentPrefs, monthlyPayment,
  parseNumber, paymentEstimatePayload, sanitizePrefs, savePaymentPrefs,
} from "@/lib/payment-calc";
import { inquiryPayload } from "@/lib/swipe-deck";
import { sendDealerInquiry } from "@/lib/dealer-inquiry";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}
const base = { priceUsd: 40000, downUsd: null, tradeUsd: null, aprPct: 7.5, termMonths: 180, taxPct: null };

describe("amortization math", () => {
  it("matches the standard formula (40k, 7.5%, 180 mo ≈ $370.80)", () => {
    expect(monthlyPayment(40000, 7.5, 180)).toBeCloseTo(370.80, 2);
    expect(monthlyPayment(25000, 5, 60)).toBeCloseTo(471.78, 2);
  });
  it("0% APR divides evenly with no interest", () => {
    const r = estimatePayment({ ...base, aprPct: 0, termMonths: 120 })!;
    expect(r.monthlyUsd).toBeCloseTo(333.33, 2);
    expect(r.totalInterestUsd).toBe(0);
  });
  it("down + trade + tax: tax applies to price minus trade-in", () => {
    const r = estimatePayment({ priceUsd: 50000, downUsd: 5000, tradeUsd: 10000, aprPct: 6, termMonths: 144, taxPct: 10 })!;
    expect(r.taxUsd).toBe(4000);
    expect(r.financedUsd).toBe(39000);
    expect(r.monthlyUsd).toBeCloseTo(monthlyPayment(39000, 6, 144), 2);
    expect(r.totalOfPaymentsUsd).toBeCloseTo(r.monthlyUsd * 144, 0);
    expect(r.totalCostUsd).toBeCloseTo(r.totalOfPaymentsUsd + 5000 + 10000, 0);
  });
  it("down + trade at or over the price finance nothing (no negative payments)", () => {
    const r = estimatePayment({ ...base, downUsd: 30000, tradeUsd: 20000 })!;
    expect(r.financedUsd).toBe(0);
    expect(r.monthlyUsd).toBe(0);
    expect(r.totalInterestUsd).toBe(0);
  });
  it("no estimate until price, APR and term are usable; APR is never filled in for the shopper", () => {
    expect(estimatePayment({ ...base, aprPct: null })).toBeNull();
    expect(estimatePayment({ ...base, termMonths: null })).toBeNull();
    expect(estimatePayment({ ...base, termMonths: 0 })).toBeNull();
    expect(estimatePayment({ ...base, termMonths: 400 })).toBeNull();
    expect(estimatePayment({ ...base, aprPct: 45 })).toBeNull();
    expect(estimatePayment({ ...base, aprPct: -1 })).toBeNull();
    expect(estimatePayment({ ...base, priceUsd: 0 })).toBeNull();
    expect(estimatePayment({ ...base, priceUsd: Number.NaN })).toBeNull();
    expect(emptyPaymentPrefs().aprPct).toBeNull();
  });
  it("fractional terms round; tiny loans don't blow up", () => {
    expect(estimatePayment({ ...base, termMonths: 59.6 })!.monthlyUsd).toBeCloseTo(monthlyPayment(40000, 7.5, 60), 2);
    expect(estimatePayment({ ...base, priceUsd: 1, termMonths: 1 })!.monthlyUsd).toBeCloseTo(1.01, 2);
  });
  it("parses typed input and rejects junk/negatives", () => {
    expect(parseNumber("$12,500")).toBe(12500);
    expect(parseNumber(" 6.9 %")).toBe(6.9);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("-5")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
  });
});

describe("per-shopper saved numbers (this device)", () => {
  it("round-trips down/trade/APR/term/tax/credit and never stores price", () => {
    const s = memStore();
    savePaymentPrefs({ downUsd: 5000, tradeUsd: 8000, aprPct: 7.5, termMonths: 180, taxPct: 9.1, creditRange: "fair_620_679", priceUsd: 1 } as never, s);
    const raw = JSON.parse(s.m.get(PREFS_KEY)!);
    expect(raw).not.toHaveProperty("priceUsd");
    expect(loadPaymentPrefs(s)).toEqual({ downUsd: 5000, tradeUsd: 8000, aprPct: 7.5, termMonths: 180, taxPct: 9.1, creditRange: "fair_620_679" });
  });
  it("tolerates corrupt or tampered storage; clearing removes it", () => {
    const s = memStore();
    s.setItem(PREFS_KEY, "{not json");
    expect(loadPaymentPrefs(s)).toEqual(emptyPaymentPrefs());
    expect(sanitizePrefs({ aprPct: 99, creditRange: "platinum", termMonths: -3 })).toEqual(emptyPaymentPrefs());
    savePaymentPrefs({ ...emptyPaymentPrefs(), downUsd: 1 }, s);
    clearPaymentPrefs(s);
    expect(s.m.has(PREFS_KEY)).toBe(false);
    savePaymentPrefs(emptyPaymentPrefs(), s);
    expect(s.m.has(PREFS_KEY)).toBe(false);
  });
});

describe("credit range (self-reported)", () => {
  it("offers exactly the five ranges", () => {
    expect(CREDIT_RANGES.map((c) => c.label)).toEqual(["Excellent (720+)", "Good (680-719)", "Fair (620-679)", "Rebuilding (below 620)", "Not sure"]);
    expect(creditLabel("rebuilding_below_620")).toBe("Rebuilding (below 620)");
  });
  it("never changes the APR or the payment (no range → rate mapping)", () => {
    const results = CREDIT_RANGES.map((c) => paymentEstimatePayload(40000, { ...emptyPaymentPrefs(), aprPct: 7.5, termMonths: 180, creditRange: c.value }));
    for (const r of results) { expect(r!.aprPct).toBe(7.5); expect(r!.estMonthlyUsd).toBe(results[0]!.estMonthlyUsd); }
    expect(paymentEstimatePayload(40000, { ...emptyPaymentPrefs(), creditRange: "excellent_720_plus" })).toMatchObject({ aprPct: null, estMonthlyUsd: null });
    const src = readFileSync(resolve(__dirname, "../src/lib/payment-calc.ts"), "utf8") + readFileSync(resolve(__dirname, "../src/components/swipe/payment-calculator.tsx"), "utf8");
    expect(src).toContain("Your estimate - no credit check");
    expect(src).not.toMatch(/creditRange\s*===?\s*["'][a-z_0-9]+["']\s*\?\s*\d/);
  });
});

describe("share box (off by default)", () => {
  const form = { name: "Pat", email: "pat@example.com", phone: "", message: "Hi" };
  const prefs = { ...emptyPaymentPrefs(), downUsd: 5000, aprPct: 7.5, termMonths: 180, creditRange: "good_680_719" as const };
  it("payment numbers and credit range go out only when the box is ticked", () => {
    const est = paymentEstimatePayload(40000, prefs);
    expect(inquiryPayload("u1", form)).not.toHaveProperty("paymentEstimate");
    expect(inquiryPayload("u1", form, { sharePayment: false, estimate: est })).not.toHaveProperty("paymentEstimate");
    expect(inquiryPayload("u1", form, { sharePayment: true, estimate: est }).paymentEstimate).toMatchObject({ priceUsd: 40000, downUsd: 5000, creditRange: "good_680_719", estMonthlyUsd: 324.45 });
    expect(inquiryPayload("u1", form, { sharePayment: true, estimate: null })).not.toHaveProperty("paymentEstimate");
  });
  it("sendDealerInquiry posts payment_estimate only when present", async () => {
    const bodies: Record<string, unknown>[] = [];
    const f = async (_u: string, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body)); bodies.push(b);
      return new Response(JSON.stringify(b.confirmation_token ? { inquiry: { inquiryId: "inq_1", status: "dry_run", statusDetail: "" } } : { confirmationToken: "dic_x" }), { status: 200 });
    };
    await sendDealerInquiry(inquiryPayload("u1", form), "/", f);
    expect(bodies[0]).not.toHaveProperty("payment_estimate");
    await sendDealerInquiry(inquiryPayload("u1", form, { sharePayment: true, estimate: paymentEstimatePayload(40000, prefs) }), "/", f);
    expect(bodies[2].payment_estimate).toMatchObject({ creditRange: "good_680_719", aprPct: 7.5 });
    expect(bodies[3]).not.toHaveProperty("payment_estimate");
  });
});
