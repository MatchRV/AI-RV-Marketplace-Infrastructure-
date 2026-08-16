import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { Input } from "@/components/ui-elements";
import { Calculator, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  FaqSection,
  FinancingCta,
  FinancingDisclaimer,
  RelatedFinancingLinks,
  breadcrumbsFor,
  articleSchema,
  type Faq,
} from "./shared";

const PATH = "/rv-financing/rv-loan-calculator";
const DESCRIPTION =
  "Free RV loan calculator. Estimate your monthly RV payment from the RV price, down payment, interest rate, and loan term. Educational estimate only — not a loan offer or approval.";

function calcPayment(principal: number, annualRate: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  if (annualRate <= 0) return principal / months;
  const r = annualRate / 100 / 12;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

const faqs: Faq[] = [
  {
    question: "How does the RV loan calculator work?",
    answer:
      "Enter the RV price, your down payment, an estimated interest rate, and the loan term in years. The calculator subtracts your down payment, then estimates a monthly payment using a standard amortization formula. The result is an educational estimate, not a loan offer.",
  },
  {
    question: "Is the estimated payment a loan offer or approval?",
    answer:
      "No. The calculator is for educational purposes only. It is not a loan offer, approval, or financing quote. Actual rates, terms, and eligibility are determined by lenders based on your full profile.",
  },
  {
    question: "What interest rate should I enter?",
    answer:
      "Use a rate you've been quoted, or an estimate based on your credit profile. Rates vary widely by lender, credit, RV age, and loan term, so try a range of rates to see how your payment changes.",
  },
  {
    question: "Does a longer RV loan term lower my payment?",
    answer:
      "A longer term usually lowers the monthly payment but increases the total interest paid over the life of the loan. A shorter term raises the monthly payment but typically reduces total interest.",
  },
];

export function RvLoanCalculator() {
  const [price, setPrice] = useState(65000);
  const [down, setDown] = useState(8000);
  const [rate, setRate] = useState(8.5);
  const [years, setYears] = useState(15);

  const result = useMemo(() => {
    const amountFinanced = Math.max(0, price - down);
    const months = Math.round(years * 12);
    const payment = calcPayment(amountFinanced, rate, months);
    const totalCost = payment * months;
    const totalInterest = Math.max(0, totalCost - amountFinanced);
    return { amountFinanced, months, payment, totalCost, totalInterest };
  }, [price, down, rate, years]);

  const num = (v: string) => Math.max(0, Number(v.replace(/[^0-9.]/g, "")) || 0);

  return (
    <Layout>
      <SEO
        title="RV Loan Calculator: Estimate Your Monthly Payment"
        description={DESCRIPTION}
        canonical={PATH}
        type="article"
        breadcrumbs={breadcrumbsFor(PATH)}
        faqs={faqs}
        jsonLd={articleSchema(PATH, DESCRIPTION)}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Calculator className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-3">
            RV Loan Calculator: Estimate Your Monthly Payment
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Enter a few details to estimate your monthly RV payment. It's a quick, educational
            starting point — not a loan offer.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3">
            <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" /> Loan Details
              </h2>

              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <label className="text-sm font-medium text-muted-foreground">RV Price</label>
                  <span className="text-sm font-semibold">{formatCurrency(price)}</span>
                </div>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={price ? price.toLocaleString() : ""}
                  onChange={(e) => setPrice(num(e.target.value))}
                  placeholder="65,000"
                />
                <input
                  type="range"
                  min={5000}
                  max={300000}
                  step={1000}
                  value={Math.min(price, 300000)}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="w-full accent-primary mt-3"
                  aria-label="RV price slider"
                />
              </div>

              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <label className="text-sm font-medium text-muted-foreground">Down Payment</label>
                  <span className="text-sm font-semibold">{formatCurrency(down)}</span>
                </div>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={down ? down.toLocaleString() : ""}
                  onChange={(e) => setDown(num(e.target.value))}
                  placeholder="8,000"
                />
                <input
                  type="range"
                  min={0}
                  max={Math.max(price, 1000)}
                  step={500}
                  value={Math.min(down, price)}
                  onChange={(e) => setDown(Number(e.target.value))}
                  className="w-full accent-primary mt-3"
                  aria-label="Down payment slider"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="text-sm font-medium text-muted-foreground">Interest Rate</label>
                    <span className="text-sm font-semibold">{rate.toFixed(2)}%</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={0.25}
                    value={rate}
                    onChange={(e) => setRate(Number(e.target.value))}
                    className="w-full accent-primary"
                    aria-label="Interest rate slider"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-baseline mb-1">
                    <label className="text-sm font-medium text-muted-foreground">Loan Term</label>
                    <span className="text-sm font-semibold">{years} yr</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={1}
                    value={years}
                    onChange={(e) => setYears(Number(e.target.value))}
                    className="w-full accent-primary"
                    aria-label="Loan term slider"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-primary text-primary-foreground rounded-2xl p-6 text-center">
              <p className="text-sm opacity-80 mb-1">Estimated Monthly Payment</p>
              <p className="text-5xl font-display font-bold text-primary-foreground">
                {formatCurrency(result.payment)}
              </p>
              <p className="text-sm opacity-70 mt-1">
                {years} years at {rate.toFixed(2)}% APR
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Financed</span>
                <span className="font-medium">{formatCurrency(result.amountFinanced)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Interest</span>
                <span className="font-medium text-orange-600">{formatCurrency(result.totalInterest)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-3 font-semibold">
                <span>Total of Payments</span>
                <span>{formatCurrency(result.totalCost)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-muted/50 border border-border rounded-2xl p-6">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">This calculator is an estimate only.</strong> It is
            not a loan offer, approval, or financing quote. It does not include taxes, title,
            registration, documentation fees, or dealer add-ons. Want a more detailed estimate with
            Washington State taxes and lender comparisons? Try the{" "}
            <Link href="/finance" className="text-primary font-medium hover:underline">
              full RV Financing Calculator
            </Link>
            .
          </p>
        </div>

        <FinancingCta />
        <FaqSection faqs={faqs} />
        <RelatedFinancingLinks currentPath={PATH} />
        <FinancingDisclaimer />
      </div>
    </Layout>
  );
}
