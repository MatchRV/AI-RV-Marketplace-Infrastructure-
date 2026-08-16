import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { Wallet, ArrowRight } from "lucide-react";
import {
  DirectAnswer,
  FaqSection,
  FinancingCta,
  FinancingDisclaimer,
  financingPages,
  breadcrumbsFor,
  ORGANIZATION_SCHEMA,
  WEBSITE_SCHEMA,
  type Faq,
} from "./shared";

const DESCRIPTION =
  "RV financing made simple. Learn what credit score you need, how down payments work, how much RV you can afford, and whether to get pre-approved — plus a free RV loan calculator.";

const TOPICS: { q: string; a: string; href: string }[] = [
  {
    q: "What credit score do you need to buy an RV?",
    a: "Many RV lenders prefer fair to good credit, often around the mid-600s or higher, but exact requirements vary by lender, income, and the RV itself.",
    href: "/rv-financing/what-credit-score-do-you-need-to-buy-an-rv",
  },
  {
    q: "Can you finance an RV with bad credit?",
    a: "It may be possible depending on income, down payment, debt-to-income ratio, the RV price and age, and individual lender rules. Approval is never guaranteed.",
    href: "/rv-financing/bad-credit-rv-financing",
  },
  {
    q: "How much down payment do you need for an RV?",
    a: "Down payment expectations vary by lender and buyer profile. A larger down payment generally lowers the financed amount and the monthly payment.",
    href: "/rv-financing/rv-loan-calculator",
  },
  {
    q: "How much RV can you afford?",
    a: "A useful starting point is a comfortable monthly payment, then working backward to a price range — not the other way around.",
    href: "/rv-financing/find-rvs-by-monthly-payment",
  },
  {
    q: "Should you get pre-approved before shopping?",
    a: "Pre-approval can help you understand a realistic budget, monthly payment range, and down payment needs before you contact dealers.",
    href: "/rv-financing/rv-pre-approval-before-shopping",
  },
  {
    q: "Can you finance a used RV?",
    a: "Used RV financing is common, though terms may depend on model year, mileage, condition, book value, and whether you buy from a dealer or private party.",
    href: "/rv-financing/used-rv-financing",
  },
  {
    q: "Can you finance an RV for full-time living?",
    a: "Some lenders treat full-time or primary-residence RV use differently than recreational use, which can affect available terms. Policies vary by lender.",
    href: "/rv-financing/bad-credit-rv-financing",
  },
  {
    q: "How does MatchRV help buyers shop smarter?",
    a: "MatchRV matches shoppers with RVs based on budget, monthly payment goals, location, RV type, and lifestyle — so you can compare options before contacting a dealer.",
    href: "/match",
  },
];

const faqs: Faq[] = [
  {
    question: "Does MatchRV provide RV loans or approve financing?",
    answer:
      "No. MatchRV is not a lender and does not make credit decisions. Financing terms are determined by lenders, dealers, banks, credit unions, or other financial institutions. MatchRV helps you compare RVs based on budget and needs before you apply.",
  },
  {
    question: "What credit score is usually needed to finance an RV?",
    answer:
      "Many RV lenders prefer fair to good credit, often around the mid-600s or higher, but exact requirements vary by lender and also depend on income, debt, RV price, and down payment.",
  },
  {
    question: "Is it better to finance a new or used RV?",
    answer:
      "Both can be financed. New RVs may offer longer terms, while used RVs may have lower prices but terms can depend on model year, mileage, condition, and book value. The right choice depends on your budget and how you plan to use the RV.",
  },
  {
    question: "How can I estimate my RV monthly payment?",
    answer:
      "You can use the MatchRV RV Loan Calculator to estimate a monthly payment from the RV price, down payment, interest rate, and loan term. The result is an educational estimate, not a loan offer.",
  },
];

export function RvFinancing() {
  return (
    <Layout>
      <SEO
        title="RV Financing Made Simple"
        description={DESCRIPTION}
        canonical="/rv-financing"
        breadcrumbs={breadcrumbsFor("/rv-financing")}
        faqs={faqs}
        jsonLd={[ORGANIZATION_SCHEMA, WEBSITE_SCHEMA]}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Wallet className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-3">RV Financing Made Simple</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Clear, honest answers to the RV financing questions buyers ask most — so you can shop
            with confidence and a realistic budget in mind.
          </p>
        </div>

        <DirectAnswer>
          <p>
            RV financing works much like financing a vehicle: a lender finances most of the purchase
            price, you make a down payment, and you repay the balance over a set term with interest.
            Your rate and terms depend on your credit profile, income, down payment, and the RV
            itself. A good first step is to estimate a comfortable monthly payment, then shop RVs that
            fit that number.
          </p>
        </DirectAnswer>

        <section className="prose-financing">
          <h2 className="text-2xl font-display font-bold mb-4">Start with these RV financing questions</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Each topic below links to a detailed guide. If you only do one thing first, estimate your
            monthly payment with the{" "}
            <Link href="/rv-financing/rv-loan-calculator" className="text-primary font-medium hover:underline">
              RV loan calculator
            </Link>{" "}
            so you know your real budget before contacting a dealer.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {TOPICS.map((t) => (
              <Link
                key={t.q}
                href={t.href}
                className="group bg-card border border-border rounded-2xl p-5 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {t.q}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{t.a}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-display font-bold mb-4">How MatchRV helps buyers shop smarter</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            MatchRV is an RV marketplace that helps buyers find the right RV faster by matching
            shoppers with RVs based on budget, location, RV type, lifestyle needs, travel plans,
            buying readiness, and financing awareness.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Instead of guessing, you can compare real listings against a monthly payment goal and a
            price range — then approach a dealer or lender already knowing what fits your situation.
          </p>
        </section>

        <FinancingCta />
        <FaqSection faqs={faqs} />

        <section className="mt-14">
          <h2 className="text-2xl font-display font-bold mb-6">All RV financing guides</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {financingPages
              .filter((p) => p.path !== "/rv-financing")
              .map((p) => (
                <Link
                  key={p.path}
                  href={p.path}
                  className="group bg-card border border-border rounded-2xl p-5 hover:border-primary/40 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {p.short}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{p.blurb}</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-0.5" />
                  </div>
                </Link>
              ))}
          </div>
        </section>

        <FinancingDisclaimer />
      </div>
    </Layout>
  );
}
