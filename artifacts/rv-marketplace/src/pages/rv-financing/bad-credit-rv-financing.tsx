import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import {
  DirectAnswer,
  FaqSection,
  FinancingCta,
  FinancingDisclaimer,
  RelatedFinancingLinks,
  breadcrumbsFor,
  articleSchema,
  type Faq,
} from "./shared";

const PATH = "/rv-financing/bad-credit-rv-financing";
const DESCRIPTION =
  "Can you finance an RV with bad credit? It may be possible depending on income, down payment, debt-to-income ratio, RV price and age, employment history, and lender rules. No approval promises.";

const FACTORS: string[] = [
  "Income",
  "Down payment",
  "Debt-to-income ratio",
  "RV price",
  "RV age",
  "Employment history",
  "Co-signer availability",
  "Dealer or lender rules",
];

const faqs: Faq[] = [
  {
    question: "Can you finance an RV with bad credit?",
    answer:
      "It may be possible, but it depends on the full picture — income, down payment, debt-to-income ratio, the RV's price and age, employment history, whether a co-signer is available, and each lender's rules. Approval is never guaranteed.",
  },
  {
    question: "Does a bigger down payment help with bad credit?",
    answer:
      "A larger down payment reduces the amount you need to finance, which some lenders may view more favorably. It can also lower your monthly payment, though it does not guarantee approval.",
  },
  {
    question: "Can a co-signer help me finance an RV?",
    answer:
      "A creditworthy co-signer may strengthen an application with some lenders, but co-signing carries real responsibility for that person. Whether a co-signer is accepted depends on the lender.",
  },
  {
    question: "Will financing an RV with lower credit cost more?",
    answer:
      "Lower credit profiles are often associated with higher interest rates, which increases the total cost over the life of the loan. Comparing offers and using the RV loan calculator can help you understand the impact.",
  },
];

export function BadCreditRvFinancing() {
  return (
    <Layout>
      <SEO
        title="Can You Finance an RV With Bad Credit?"
        description={DESCRIPTION}
        canonical={PATH}
        type="article"
        breadcrumbs={breadcrumbsFor(PATH)}
        faqs={faqs}
        jsonLd={articleSchema(PATH, DESCRIPTION)}
      />
      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-display font-bold mb-6">
          Can You Finance an RV With Bad Credit?
        </h1>

        <DirectAnswer>
          <p>
            Possibly. Financing an RV with lower credit is not automatically off the table, but it
            depends heavily on the rest of your financial picture. Lenders look beyond the score
            alone — and stronger income, a larger down payment, or a lower-priced RV can sometimes
            offset a weaker credit history. No platform or lender can promise approval.
          </p>
        </DirectAnswer>

        <section>
          <h2 className="text-2xl font-display font-bold mb-4">What bad-credit RV financing may depend on</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Each lender weighs these factors differently, and there is no universal cutoff:
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {FACTORS.map((f) => (
              <div key={f} className="bg-card border border-border rounded-xl px-5 py-3 text-sm font-medium">
                {f}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-display font-bold mb-4">Steps that may strengthen your application</h2>
          <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
            <li>Save toward a larger down payment to reduce the amount financed</li>
            <li>Consider a lower-priced or slightly older RV</li>
            <li>Pay down existing debt to improve your debt-to-income ratio</li>
            <li>Ask whether a creditworthy co-signer is an option</li>
            <li>Compare offers from credit unions, banks, and RV lenders</li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-display font-bold mb-4">Shop with a realistic number in mind</h2>
          <p className="text-muted-foreground leading-relaxed">
            Before contacting a dealer, it helps to estimate a monthly payment you're comfortable
            with and then match RVs to that budget. That way you focus on options that realistically
            fit your situation rather than stretching for a payment that may be hard to sustain.
          </p>
        </section>

        <FinancingCta />
        <FaqSection faqs={faqs} />
        <RelatedFinancingLinks currentPath={PATH} />
        <FinancingDisclaimer />
      </article>
    </Layout>
  );
}
