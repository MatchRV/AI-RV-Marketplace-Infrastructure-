import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { Input } from "@/components/ui-elements";
import { Calculator, DollarSign, MapPin, AlertTriangle, Info, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { lookupWaTax, type WaTaxInfo } from "@/lib/wa-tax-data";

const CREDIT_TIERS = [
  { label: "Excellent", range: "750+", minRate: 4.99, maxRate: 6.49 },
  { label: "Good", range: "700–749", minRate: 6.49, maxRate: 8.99 },
  { label: "Fair", range: "650–699", minRate: 8.99, maxRate: 12.99 },
  { label: "Below Avg", range: "600–649", minRate: 12.99, maxRate: 17.99 },
];

const LOAN_TERMS = [60, 84, 120, 144, 180, 240];

const LENDER_PROFILES = [
  { name: "Credit Union", tierRates: [5.49, 6.99, 9.49, 13.49] },
  { name: "Bank", tierRates: [5.99, 7.49, 10.49, 14.99] },
  { name: "RV Lender", tierRates: [6.49, 8.49, 11.99, 16.49] },
  { name: "Online Lender", tierRates: [5.74, 7.24, 9.99, 13.99] },
];

function calcPayment(principal: number, annualRate: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  if (annualRate <= 0) return principal / months;
  const r = annualRate / 100 / 12;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

export function Finance() {
  const [rvPrice, setRvPrice] = useState(85000);
  const [tradeValue, setTradeValue] = useState(0);
  const [tradeOwed, setTradeOwed] = useState(0);
  const [downPayment, setDownPayment] = useState(10000);
  const [creditTierIdx, setCreditTierIdx] = useState(0);
  const [selectedTerm, setSelectedTerm] = useState(180);
  const [zipCode, setZipCode] = useState("");
  const [showTradeIn, setShowTradeIn] = useState(false);

  const waTax: WaTaxInfo | null = useMemo(() => lookupWaTax(zipCode), [zipCode]);

  const calculations = useMemo(() => {
    const tradeEquity = Math.max(0, tradeValue - tradeOwed);
    const netPrice = Math.max(0, rvPrice - tradeEquity);

    let salesTax = 0;
    if (waTax) {
      salesTax = netPrice * (waTax.combinedRate / 100);
    }

    let luxuryTax = 0;
    if (waTax && rvPrice > 100000) {
      luxuryTax = (rvPrice - 100000) * 0.08;
    }

    let rtaFee = 0;
    if (waTax && waTax.isRta) {
      rtaFee = rvPrice * 0.011;
    }

    const totalTaxesAndFees = salesTax + luxuryTax;
    const totalBeforeDown = netPrice + totalTaxesAndFees;
    const amountToFinance = Math.max(0, totalBeforeDown - downPayment);

    const tier = CREDIT_TIERS[creditTierIdx];
    const midRate = (tier.minRate + tier.maxRate) / 2;
    const payment = calcPayment(amountToFinance, midRate, selectedTerm);
    const lowPayment = calcPayment(amountToFinance, tier.minRate, selectedTerm);
    const highPayment = calcPayment(amountToFinance, tier.maxRate, selectedTerm);

    const termComparisons = LOAN_TERMS.map((term) => {
      const pmt = calcPayment(amountToFinance, midRate, term);
      const totalCost = pmt * term;
      const totalInterest = totalCost - amountToFinance;
      return { term, payment: pmt, totalCost, totalInterest };
    });

    return {
      tradeEquity,
      netPrice,
      salesTax,
      luxuryTax,
      rtaFee,
      totalTaxesAndFees,
      amountToFinance,
      payment,
      lowPayment,
      highPayment,
      midRate,
      termComparisons,
    };
  }, [rvPrice, tradeValue, tradeOwed, downPayment, creditTierIdx, selectedTerm, waTax]);

  const downPaymentPct = rvPrice > 0 ? ((downPayment / rvPrice) * 100).toFixed(1) : "0";

  return (
    <Layout>
      <SEO
        title="RV Financing Calculator — Estimate Monthly Payments"
        description="Calculate your RV loan payment in seconds. MatchRV's free financing calculator factors credit score, trade-in value, local taxes, and loan terms for accurate estimates."
        canonical="https://matchrv.com/finance"
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Calculator className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-3">RV Financing Calculator</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Estimate your monthly payments, compare loan terms, and see WA state tax impact — all in one place.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" /> Vehicle & Financing
              </h2>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Your Zip Code
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    maxLength={5}
                    placeholder="e.g. 98101"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    className="pl-9"
                  />
                </div>
                {waTax && (
                  <p className="text-xs text-primary mt-1.5 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    {waTax.county} County — {waTax.combinedRate}% combined sales tax
                    {waTax.isRta && " · RTA district"}
                  </p>
                )}
                {zipCode.length === 5 && !waTax && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Non-WA zip code — no state-specific taxes applied.
                  </p>
                )}
              </div>

              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <label className="text-sm font-medium text-muted-foreground">RV Price</label>
                  <span className="text-sm font-semibold">{formatCurrency(rvPrice)}</span>
                </div>
                <input
                  type="range"
                  min={10000}
                  max={500000}
                  step={1000}
                  value={rvPrice}
                  onChange={(e) => setRvPrice(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                  <span>$10k</span>
                  <span>$500k</span>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowTradeIn(!showTradeIn)}
                  className="text-sm font-medium text-primary flex items-center gap-1 hover:underline"
                >
                  {showTradeIn ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  Trade-In
                </button>
                {showTradeIn && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Trade-In Value</label>
                      <Input
                        type="number"
                        min={0}
                        value={tradeValue || ""}
                        placeholder="0"
                        onChange={(e) => setTradeValue(Math.max(0, Number(e.target.value)))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Amount Owed</label>
                      <Input
                        type="number"
                        min={0}
                        value={tradeOwed || ""}
                        placeholder="0"
                        onChange={(e) => setTradeOwed(Math.max(0, Number(e.target.value)))}
                      />
                    </div>
                    {tradeValue > 0 && (
                      <p className="col-span-2 text-xs text-muted-foreground">
                        Trade equity: {formatCurrency(calculations.tradeEquity)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <label className="text-sm font-medium text-muted-foreground">Cash Down Payment</label>
                  <span className="text-sm font-semibold">
                    {formatCurrency(downPayment)} ({downPaymentPct}%)
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(rvPrice * 0.5, 1000)}
                  step={500}
                  value={downPayment}
                  onChange={(e) => setDownPayment(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                  <span>$0</span>
                  <span>{formatCurrency(rvPrice * 0.5)}</span>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Credit Tier</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CREDIT_TIERS.map((tier, idx) => (
                    <button
                      key={tier.label}
                      type="button"
                      onClick={() => setCreditTierIdx(idx)}
                      className={`rounded-lg border-2 p-2.5 text-center transition-all ${
                        creditTierIdx === idx
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <span className="text-sm font-semibold block">{tier.label}</span>
                      <span className="text-xs text-muted-foreground">{tier.range}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Loan Term</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {LOAN_TERMS.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setSelectedTerm(term)}
                      className={`rounded-lg border-2 py-2 text-center transition-all ${
                        selectedTerm === term
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <span className="text-sm font-semibold block">{term / 12}yr</span>
                      <span className="text-[10px] text-muted-foreground">{term}mo</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6">
              <h3 className="text-sm font-semibold mb-4">Term Comparison</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Term</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Monthly</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Total Interest</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculations.termComparisons.map((tc) => (
                      <tr
                        key={tc.term}
                        className={`border-b border-border/50 ${
                          tc.term === selectedTerm ? "bg-primary/5 font-semibold" : ""
                        }`}
                      >
                        <td className="py-2">{tc.term / 12} yr ({tc.term} mo)</td>
                        <td className="py-2 text-right">{formatCurrency(tc.payment)}</td>
                        <td className="py-2 text-right text-orange-600">{formatCurrency(tc.totalInterest)}</td>
                        <td className="py-2 text-right">{formatCurrency(tc.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6">
              <h3 className="text-sm font-semibold mb-4">Estimated Rates by Lender Type</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Lender</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Est. Rate</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Monthly Pmt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LENDER_PROFILES.map((lender) => {
                      const rate = lender.tierRates[creditTierIdx];
                      const pmt = calcPayment(calculations.amountToFinance, rate, selectedTerm);
                      return (
                        <tr key={lender.name} className="border-b border-border/50">
                          <td className="py-2">{lender.name}</td>
                          <td className="py-2 text-right">{rate.toFixed(2)}%</td>
                          <td className="py-2 text-right">{formatCurrency(pmt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-primary text-primary-foreground rounded-2xl p-6 text-center sticky top-24">
              <p className="text-sm opacity-80 mb-1">Estimated Monthly Payment</p>
              <p className="text-5xl font-display font-bold">{formatCurrency(calculations.payment)}</p>
              <p className="text-sm opacity-70 mt-1">
                {formatCurrency(calculations.lowPayment)} – {formatCurrency(calculations.highPayment)} range
              </p>
              <p className="text-xs opacity-60 mt-1">
                {selectedTerm / 12} years at ~{calculations.midRate.toFixed(2)}% APR
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 space-y-3">
              <h3 className="text-sm font-semibold mb-2">Deal Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sale Price</span>
                  <span className="font-medium">{formatCurrency(rvPrice)}</span>
                </div>
                {calculations.tradeEquity > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Trade-In Equity</span>
                    <span className="font-medium text-green-600">−{formatCurrency(calculations.tradeEquity)}</span>
                  </div>
                )}
                {waTax && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Sales Tax ({waTax.combinedRate}%)
                    </span>
                    <span className="font-medium">{formatCurrency(calculations.salesTax)}</span>
                  </div>
                )}
                {calculations.luxuryTax > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">WA Luxury Tax (8% over $100k)</span>
                    <span className="font-medium">{formatCurrency(calculations.luxuryTax)}</span>
                  </div>
                )}
                {waTax && waTax.isRta && calculations.rtaFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RTA Fee (yr 1, not financed)</span>
                    <span className="font-medium text-amber-600">{formatCurrency(calculations.rtaFee)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cash Down</span>
                  <span className="font-medium text-green-600">−{formatCurrency(downPayment)}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between font-semibold">
                  <span>Amount to Finance</span>
                  <span>{formatCurrency(calculations.amountToFinance)}</span>
                </div>
              </div>
            </div>

            {waTax && waTax.isRta && calculations.rtaFee > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
                <h4 className="text-sm font-semibold flex items-center gap-1.5 text-amber-800 dark:text-amber-300 mb-2">
                  <AlertTriangle className="w-4 h-4" /> RTA Licensing Fee
                </h4>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  First-year estimate:{" "}
                  <span className="font-bold">{formatCurrency(calculations.rtaFee)}</span>
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-2 leading-relaxed">
                  The Regional Transit Authority (Sound Transit) charges an annual vehicle licensing
                  fee of 1.1% of the vehicle's depreciated value for residents of King, Pierce, and
                  Snohomish counties. This fee decreases each year as the vehicle depreciates and is
                  <span className="font-semibold"> not included</span> in the financed amount.
                </p>
              </div>
            )}

            {waTax && rvPrice > 100000 && (
              <div className="bg-card border border-border rounded-2xl p-5">
                <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                  <Info className="w-4 h-4 text-primary" /> WA Luxury Tax
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Washington State imposes an 8% tax on the portion of the sale price exceeding
                  $100,000. On this {formatCurrency(rvPrice)} RV, the luxury tax applies to{" "}
                  {formatCurrency(rvPrice - 100000)} = {formatCurrency(calculations.luxuryTax)}.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-12 bg-muted/50 border border-border rounded-2xl p-6">
          <h3 className="text-sm font-semibold mb-3">Important Disclaimers</h3>
          <ul className="text-xs text-muted-foreground space-y-2 leading-relaxed list-disc list-inside">
            <li>
              Payment estimates are for informational purposes only and do not constitute a loan
              offer. Actual rates, terms, and eligibility depend on your lender and credit profile.
            </li>
            <li>
              Sales tax rates are approximate and based on county-level averages for Washington State.
              Your actual rate may vary by city or special taxing district. Confirm your exact rate
              with your local Department of Revenue office.
            </li>
            <li>
              The RTA licensing fee estimate uses first-year (100%) depreciated value. Actual
              depreciation schedules are set by the Washington Department of Licensing and the fee
              decreases annually. RTA district boundaries vary within King, Pierce, and Snohomish
              counties — not all addresses in these counties are within the Sound Transit district.
            </li>
            <li>
              The WA Luxury Tax (8% on the amount exceeding $100,000) is calculated on the vehicle
              sale price before trade-in deductions, per current WA state law.
            </li>
            <li>
              This calculator does not include documentation fees, title fees, registration, or dealer
              add-ons. Always review the full buyer's order before signing.
            </li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
