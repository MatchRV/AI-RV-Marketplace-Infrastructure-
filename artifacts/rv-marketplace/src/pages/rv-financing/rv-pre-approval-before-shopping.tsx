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

const PATH = "/rv-financing/rv-pre-approval-before-shopping";
const DESCRIPTION =
  "Should you get pre-approved before shopping for an RV? Pre-approval can clarify your budget, monthly payment range, and down payment needs before you contact dealers. Here's what to know.";

const HELPS_WITH: string[] = [
  "Approximate budget",
  "Monthly payment range",
  "Down payment needs",
  "Whether to shop new or used",
  "What type of RV may fit your situation",
];

const faqs: Faq[] = [
  {
    question: "Should you get pre-approved before shopping for an RV?",
    answer:
      "Pre-approval can be helpful because it gives you a clearer sense of your approximate budget, monthly payment range, and down payment needs before you contact dealers. It can make shopping more focused, though it is not required.",
  },
  {
    question: "What's the difference between pre-qualification and pre-approval?",
    answer:
      "Pre-qualification is usually a quick, informal estimate based on self-reported information and often uses a soft credit check. Pre-approval is typically a more formal review that may involve a hard inquiry. Terms and definitions vary by lender.",
  },
  {
    question: "Does getting pre-approved guarantee a loan?",
    answer:
      "No. Pre-approval is not a final loan guarantee. Final terms depend on the specific RV, verification of your information, and the lender's underwriting. MatchRV is not a lender and does not make credit decisions.",
  },
  {
    question: "Will pre-approval affect my credit score?",
    answer:
      "It depends on the lender. A soft inquiry typically does not affect your score, while a hard inquiry may. Ask the lender which type of check they use before you apply.",
  },
];

export function RvPreApproval() {
  return (
    <Layout>
      <SEO
        title="Should You Get Pre-Approved Before Shopping for an RV?"
        description={DESCRIPTION}
        canonical={PATH}
        type="article"
        breadcrumbs={breadcrumbsFor(PATH)}
        faqs={faqs}
        jsonLd={articleSchema(PATH, DESCRIPTION)}
      />
      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-display font-bold mb-6">
          Should You Get Pre-Approved Before Shopping for an RV?
        </h1>

        <DirectAnswer>
          <p>
            Often, yes — getting pre-approved before you shop can make the whole process clearer.
            Pre-approval helps you understand a realistic budget and monthly payment range before you
            walk onto a lot or contact a dealer, so you can focus on RVs that genuinely fit. It is
            not required, and it does not guarantee a final loan.
          </p>
        </DirectAnswer>

        <section>
          <h2 className="text-2xl font-display font-bold mb-4">What pre-approval may help you understand</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {HELPS_WITH.map((h) => (
              <div key={h} className="bg-card border border-border rounded-xl px-5 py-3 text-sm font-medium">
                {h}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-display font-bold mb-4">Why it can make shopping easier</h2>
          <p className="text-muted-foreground leading-relaxed">
            When you know your approximate budget, you can negotiate from a position of clarity and
            avoid falling for an RV that doesn't fit your finances. It can also speed up the buying
            process once you find the right RV, since some of the financial groundwork is already
            done.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-display font-bold mb-4">Where to seek pre-approval</h2>
          <p className="text-muted-foreground leading-relaxed">
            Buyers commonly compare credit unions, banks, and RV lenders. Each sets its own criteria
            and terms, so it can be worth getting more than one quote. Remember that MatchRV is not a
            lender — it helps you compare RVs so you arrive at a lender already knowing what you're
            shopping for.
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
