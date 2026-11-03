/**
 * Shopper-entered payment estimate (pure, unit-tested). This is arithmetic on numbers the shopper
 * typed. It is not a financing offer or a rate quote, and the credit range is never mapped to an APR.
 */
export const CREDIT_RANGES = [
  { value: "excellent_720_plus", label: "Excellent (720+)" },
  { value: "good_680_719", label: "Good (680-719)" },
  { value: "fair_620_679", label: "Fair (620-679)" },
  { value: "rebuilding_below_620", label: "Rebuilding (below 620)" },
  { value: "not_sure", label: "Not sure" },
] as const;
export type CreditRange = (typeof CREDIT_RANGES)[number]["value"];
export const isCreditRange = (v: unknown): v is CreditRange => CREDIT_RANGES.some((c) => c.value === v);
export const creditLabel = (v: CreditRange | null | undefined): string | null => CREDIT_RANGES.find((c) => c.value === v)?.label ?? null;

export interface PaymentInputs {
  priceUsd: number | null;
  downUsd: number | null;
  tradeUsd: number | null;
  aprPct: number | null;
  termMonths: number | null;
  taxPct: number | null;
}

export interface PaymentResult {
  taxUsd: number;
  financedUsd: number;
  monthlyUsd: number;
  totalOfPaymentsUsd: number;
  totalInterestUsd: number;
  /** Down + trade-in + payments: what the RV costs all-in under the shopper's numbers. */
  totalCostUsd: number;
}

export const LIMITS = { aprMax: 40, termMax: 360, taxMax: 20, moneyMax: 5_000_000 } as const;

const money = (n: number | null | undefined): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.min(n, LIMITS.moneyMax) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Parse a typed field ("$12,500", "6.9", "") → number or null. Negative or junk input → null. */
export function parseNumber(raw: string): number | null {
  const t = raw.replace(/[$,%\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Standard amortized payment. 0% APR divides evenly. Returns 0 when nothing is financed. */
export function monthlyPayment(principal: number, aprPct: number, termMonths: number): number {
  if (!(principal > 0) || !(termMonths >= 1)) return 0;
  const n = Math.round(termMonths);
  if (!(aprPct > 0)) return principal / n;
  const r = aprPct / 1200;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/**
 * Null until price, APR and term are usable (APR may be 0). Tax applies to price minus trade-in
 * (as many states do; the shopper can leave it blank). Down payment and trade-in larger than the
 * price simply finance nothing.
 */
export function estimatePayment(i: PaymentInputs): PaymentResult | null {
  const price = money(i.priceUsd);
  if (!price) return null;
  if (i.aprPct === null || !Number.isFinite(i.aprPct) || i.aprPct < 0 || i.aprPct > LIMITS.aprMax) return null;
  if (i.termMonths === null || !Number.isFinite(i.termMonths) || i.termMonths < 1 || i.termMonths > LIMITS.termMax) return null;
  const n = Math.round(i.termMonths);
  const trade = money(i.tradeUsd);
  const down = money(i.downUsd);
  const taxPct = typeof i.taxPct === "number" && Number.isFinite(i.taxPct) && i.taxPct > 0 ? Math.min(i.taxPct, LIMITS.taxMax) : 0;
  const tax = (taxPct / 100) * Math.max(0, price - trade);
  const financed = Math.max(0, price - trade + tax - down);
  const monthly = monthlyPayment(financed, i.aprPct, n);
  const totalPayments = monthly * n;
  return {
    taxUsd: round2(tax),
    financedUsd: round2(financed),
    monthlyUsd: round2(monthly),
    totalOfPaymentsUsd: round2(totalPayments),
    totalInterestUsd: round2(Math.max(0, totalPayments - financed)),
    totalCostUsd: round2(totalPayments + down + Math.min(trade, price + tax)),
  };
}

// ── Per-shopper saved numbers (this device only) ───────────────────────

export const PREFS_KEY = "matchrv_payment_prefs_v1";

/** Never includes price: that always comes from the unit being viewed. */
export interface PaymentPrefs {
  downUsd: number | null;
  tradeUsd: number | null;
  aprPct: number | null;
  termMonths: number | null;
  taxPct: number | null;
  creditRange: CreditRange | null;
}
export const emptyPaymentPrefs = (): PaymentPrefs => ({ downUsd: null, tradeUsd: null, aprPct: null, termMonths: null, taxPct: null, creditRange: null });

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const store = (): StorageLike | null => { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; } };

const num = (v: unknown, max: number): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null);

export function sanitizePrefs(raw: unknown): PaymentPrefs {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    downUsd: num(o.downUsd, LIMITS.moneyMax),
    tradeUsd: num(o.tradeUsd, LIMITS.moneyMax),
    aprPct: num(o.aprPct, LIMITS.aprMax),
    termMonths: num(o.termMonths, LIMITS.termMax),
    taxPct: num(o.taxPct, LIMITS.taxMax),
    creditRange: isCreditRange(o.creditRange) ? o.creditRange : null,
  };
}

export const hasSavedPrefs = (p: PaymentPrefs): boolean => Object.values(p).some((v) => v !== null);

export function loadPaymentPrefs(s: StorageLike | null = store()): PaymentPrefs {
  try { const raw = s?.getItem(PREFS_KEY); return raw ? sanitizePrefs(JSON.parse(raw)) : emptyPaymentPrefs(); } catch { return emptyPaymentPrefs(); }
}

export function savePaymentPrefs(p: PaymentPrefs, s: StorageLike | null = store()): void {
  try {
    const clean = sanitizePrefs(p);
    if (hasSavedPrefs(clean)) s?.setItem(PREFS_KEY, JSON.stringify(clean)); else s?.removeItem(PREFS_KEY);
  } catch { /* private mode / quota: the calculator still works, it just doesn't remember */ }
}

export function clearPaymentPrefs(s: StorageLike | null = store()): void {
  try { s?.removeItem(PREFS_KEY); } catch { /* ignore */ }
}

/** What goes to the dealer, and only when the shopper ticks the share box. */
export interface PaymentEstimatePayload {
  priceUsd: number | null;
  downUsd: number | null;
  tradeUsd: number | null;
  aprPct: number | null;
  termMonths: number | null;
  taxPct: number | null;
  estMonthlyUsd: number | null;
  creditRange: CreditRange | null;
}

export function paymentEstimatePayload(priceUsd: number | null, p: PaymentPrefs): PaymentEstimatePayload | null {
  const prefs = sanitizePrefs(p);
  const r = estimatePayment({ priceUsd, ...prefs });
  const out: PaymentEstimatePayload = { priceUsd: priceUsd && priceUsd > 0 ? priceUsd : null, ...prefs, estMonthlyUsd: r ? r.monthlyUsd : null };
  return hasSavedPrefs(prefs) ? out : null;
}
