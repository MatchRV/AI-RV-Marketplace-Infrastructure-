import { useEffect, useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { CREDIT_RANGES, clearPaymentPrefs, emptyPaymentPrefs, estimatePayment, hasSavedPrefs, loadPaymentPrefs, parseNumber, savePaymentPrefs, type CreditRange, type PaymentPrefs } from "@/lib/payment-calc";
import { NAVY, TEAL_DARK, LINE } from "./tokens";

const fmt = (n: number, cents = false) => `$${n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
const show = (n: number | null) => (n === null ? "" : String(n));

type Field = "price" | "down" | "trade" | "apr" | "term" | "tax";

/**
 * The shopper's own payment math. Price starts at the dealer's listed price; everything else is
 * what the shopper types. APR starts blank on purpose: we don't know anyone's rate.
 * Down / trade / APR / term / tax / credit range are remembered on this device (never the price).
 */
export function PaymentCalculator({ listedPriceUsd, prefs, onPrefs, onPrice }: {
  listedPriceUsd: number;
  prefs: PaymentPrefs;
  onPrefs: (p: PaymentPrefs) => void;
  onPrice: (usd: number | null) => void;
}) {
  const [text, setText] = useState<Record<Field, string>>(() => ({
    price: String(listedPriceUsd), down: show(prefs.downUsd), trade: show(prefs.tradeUsd), apr: show(prefs.aprPct), term: show(prefs.termMonths), tax: show(prefs.taxPct),
  }));
  const price = parseNumber(text.price);
  useEffect(() => { onPrice(price); }, [price, onPrice]);

  const set = (f: Field, v: string) => {
    setText((t) => ({ ...t, [f]: v }));
    if (f === "price") return;
    const key = ({ down: "downUsd", trade: "tradeUsd", apr: "aprPct", term: "termMonths", tax: "taxPct" } as const)[f];
    const next = { ...prefs, [key]: parseNumber(v) };
    onPrefs(next); savePaymentPrefs(next);
  };
  const setCredit = (v: string) => {
    const next = { ...prefs, creditRange: (v || null) as CreditRange | null };
    onPrefs(next); savePaymentPrefs(next);
  };
  const clear = () => {
    clearPaymentPrefs(); onPrefs(emptyPaymentPrefs());
    setText({ price: String(listedPriceUsd), down: "", trade: "", apr: "", term: "", tax: "" });
  };

  const r = useMemo(() => estimatePayment({ priceUsd: price, ...prefs }), [price, prefs]);
  const box = "w-full rounded-xl px-3 py-2.5 text-base bg-white";
  const lab = "block text-xs font-bold mb-1";
  const fieldEl = (f: Field, label: string, opts: { prefix?: string; suffix?: string; placeholder?: string; hint?: string } = {}) => (
    <div>
      <label className={lab} style={{ color: NAVY }} htmlFor={`pc-${f}`}>{label}</label>
      <div className="relative">
        {opts.prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{opts.prefix}</span>}
        <input id={`pc-${f}`} inputMode="decimal" className={box} style={{ border: `1px solid ${LINE}`, paddingLeft: opts.prefix ? 22 : undefined, paddingRight: opts.suffix ? 30 : undefined }}
          placeholder={opts.placeholder} value={text[f]} onChange={(e) => set(f, e.target.value)} />
        {opts.suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">{opts.suffix}</span>}
      </div>
      {opts.hint && <p className="mt-1 text-[0.7rem] text-slate-500">{opts.hint}</p>}
    </div>
  );

  return (
    <section className="mt-5 rounded-2xl p-4" style={{ border: `1px solid ${LINE}` }} aria-label="Payment calculator" data-testid="payment-calculator">
      <h3 className="flex items-center gap-2 text-base font-extrabold" style={{ color: NAVY }}><Calculator size={18} color={TEAL_DARK} /> Estimate your payment</h3>
      <p className="mt-1 text-xs text-slate-600">Your own numbers and your own math. This is not a financing offer or a rate quote; the dealer or a lender sets actual terms.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="col-span-2">{fieldEl("price", "Price", { prefix: "$", hint: price === listedPriceUsd ? "Dealer's listed price. You can change it." : undefined })}</div>
        {fieldEl("down", "Down payment", { prefix: "$", placeholder: "0" })}
        {fieldEl("trade", "Trade-in value", { prefix: "$", placeholder: "0" })}
        {fieldEl("apr", "APR you expect", { suffix: "%", placeholder: "e.g. 7.5 (example)" })}
        {fieldEl("term", "Term", { suffix: "mo", placeholder: "e.g. 180" })}
        <div className="col-span-2">{fieldEl("tax", "Sales tax (optional)", { suffix: "%", placeholder: "0", hint: "Applied to price minus trade-in." })}</div>
        <div className="col-span-2">
          <label className={lab} style={{ color: NAVY }} htmlFor="pc-credit">Credit range</label>
          <select id="pc-credit" className={box} style={{ border: `1px solid ${LINE}`, color: NAVY }} value={prefs.creditRange ?? ""} onChange={(e) => setCredit(e.target.value)}>
            <option value="">Prefer not to say</option>
            {CREDIT_RANGES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <p className="mt-1 text-[0.7rem] text-slate-500">Your estimate - no credit check. Rates vary by credit and lender; we don't pick an APR for you.</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl p-3" style={{ background: "#F2F6FA" }} data-testid="payment-result" aria-live="polite">
        {r ? (
          <>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Estimated monthly payment</p>
            <p className="text-2xl font-black" style={{ color: TEAL_DARK }}>{fmt(r.monthlyUsd, true)}<span className="text-sm font-bold text-slate-500"> /mo</span></p>
            <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm" style={{ color: NAVY }}>
              <dt>Amount financed</dt><dd className="text-right font-semibold">{fmt(r.financedUsd)}</dd>
              {r.taxUsd > 0 && <><dt>Sales tax</dt><dd className="text-right font-semibold">{fmt(r.taxUsd)}</dd></>}
              <dt>Total of payments</dt><dd className="text-right font-semibold">{fmt(r.totalOfPaymentsUsd)}</dd>
              <dt>Interest</dt><dd className="text-right font-semibold">{fmt(r.totalInterestUsd)}</dd>
              <dt>Total cost (incl. down + trade)</dt><dd className="text-right font-semibold">{fmt(r.totalCostUsd)}</dd>
            </dl>
          </>
        ) : (
          <p className="text-sm text-slate-600">Enter an APR and a term to see an estimate. Use 0 for a cash-like 0% APR.</p>
        )}
      </div>
      <p className="mt-2 text-[0.7rem] text-slate-500" data-testid="prefs-status">
        {hasSavedPrefs(prefs) ? <>Saved on this device for every RV you look at · <button type="button" className="underline" onClick={clear}>Clear</button></> : "Your numbers are saved on this device only, never sent unless you choose to share them."}
      </p>
    </section>
  );
}

