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

const PATH = "/rv-financing/what-credit-score-do-you-need-to-buy-an-rv";
const DESCRIPTION =
  "What credit score do you need to buy an RV? Many lenders prefer fair to good credit (often mid-600s or higher), but requirements vary. See general credit ranges and what else lenders weigh.";

const RANGES: { range: string; label: string; note: string }[] = [
  { range: "750+", label: "Strong position", note: "May be a strong position with a wider range of lender options." },
  { range: "700–749", label: "Good position", note: "May be a good position for competitive terms with many lenders." },
  { range: "660–699", label: "Often workable", note: "May still have financing options depending on income, debt, RV price, and down payment." },
  { range: "600–659", label: "Possible, with strengths", note: "May still be possible but may require stronger income, a larger down payment, or a lower-priced RV." },
  { range: "Below 600", label: "More difficult", note: "May be more difficult but not always impossible, depending on lender rules and the buyer's full profile." },
];

const faqs: Faq[] = [
  {
    question: "What credit score do you need to buy an RV?",
    answer:
      "Many RV lenders prefer fair to good credit, often around the mid-600s or higher, but exact requirements vary by lender. Income, existing debt, RV price, and down payment all play a role alongside the score itself.",
  },
  {
    question: "Can you get an RV loan with a 600 credit score?",
    answer:
      "It may be possible. A score in the 600–659 range may still qualify with some lenders, though it may require stronger income, a larger down payment, or a lower-priced RV. Approval is never guaranteed and depends on lender rules.",
  },
  {
    question: "Does a higher credit score lower your RV interest rate?",
    answer:
      "Generally, higher credit scores are associated with more favorable rate offers, while lower scores may see higher rates. Actual rates are set by each lender based on your full profile.",
  },
  {
    question: "Does checking RV financing options hurt my credit?",
    answer:
      "A pre-qualification or soft inquiry typically does not affect your score, while a formal application with a hard inquiry may. Ask each lender whether their check is soft or hard before applying.",
  },
];

export function CreditScoreToBuyRv() {
  return (
    <Layout>
      <SEO
        title="What Credit Score Do You Need to Buy an RV?"
        description={DESCRIPTION}
        canonical={PATH}
        type="article"
        breadcrumbs={breadcrumbsFor(PATH)}
        faqs={faqs}
        jsonLd={articleSchema(PATH, DESCRIPTION)}
      />
      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-display font-bold mb-6">
          What Credit Score Do You Need to Buy an RV?
        </h1>

        <DirectAnswer>
          <p>
            There is no single required credit score to buy an RV. Many RV lenders prefer fair to
            good credit — often around the mid-600s or higher — but exact requirements vary by
            lender. Your score is only part of the picture: income, existing debt, the RV's price and
            age, and your down payment all influence the terms a lender may offer.
          </p>
        </DirectAnswer>

        <section>
          <h2 className="text-2xl font-display font-bold mb-4">General credit score ranges</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            These ranges are general guidance only — not approval promises. Lenders set their own
            rules, and two buyers with the same score can receive different offers based on the rest
            of their profile.
          </p>
          <div className="space-y-3">
            {RANGES.map((r) => (
              <div
                key={r.range}
                className="bg-card border border-border rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5"
              >
                <div className="sm:w-32 shrink-0">
                  <span className="text-lg font-display font-bold text-primary">{r.range}</span>
                  <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {r.label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{r.note}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-display font-bold mb-4">What lenders look at besides your score</h2>
          <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
            <li>Income and employment history</li>
            <li>Debt-to-income ratio</li>
            <li>Down payment amount</li>
            <li>RV price, age, and type</li>
            <li>Loan term length</li>
            <li>Whether the purchase is from a dealer or private party</li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-display font-bold mb-4">How to improve your position before applying</h2>
          <p className="text-muted-foreground leading-relaxed">
            If your score is below where you'd like it, a larger down payment, a lower-priced RV, or
            reducing existing debt may strengthen your application. Estimating your monthly payment
            first also helps you target RVs that comfortably fit your budget.
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
