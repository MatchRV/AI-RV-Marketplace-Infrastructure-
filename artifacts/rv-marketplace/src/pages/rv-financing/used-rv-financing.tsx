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

const PATH = "/rv-financing/used-rv-financing";
const DESCRIPTION =
  "Can you finance a used RV? Yes, it's common — but terms may depend on model year, mileage, condition, book value, loan amount, dealer vs private-party purchase, and lender rules.";

const FACTORS: string[] = [
  "Model year",
  "Mileage",
  "Condition",
  "Book value",
  "Loan amount",
  "Dealer vs private-party purchase",
  "Lender rules",
];

const faqs: Faq[] = [
  {
    question: "Can you finance a used RV?",
    answer:
      "Yes, financing a used RV is common. However, terms may depend on the model year, mileage, condition, book value, loan amount, whether you buy from a dealer or private party, and each lender's rules.",
  },
  {
    question: "Is it harder to finance an older RV?",
    answer:
      "Some lenders set limits on the age or mileage of RVs they will finance, and terms for older units may differ. Whether financing is available — and on what terms — depends on the specific lender and the RV.",
  },
  {
    question: "Does buying from a private party affect financing?",
    answer:
      "It can. Some lenders handle dealer purchases and private-party purchases differently, and the available terms may vary. It's worth confirming a lender's policy before committing to a private-party sale.",
  },
  {
    question: "Do used RV loans have different rates than new RV loans?",
    answer:
      "Rates can differ between new and used RVs and vary by lender, credit profile, term, and the RV itself. Comparing offers and estimating payments with the RV loan calculator can help you understand the difference.",
  },
];

export function UsedRvFinancing() {
  return (
    <Layout>
      <SEO
        title="Can You Finance a Used RV?"
        description={DESCRIPTION}
        canonical={PATH}
        type="article"
        breadcrumbs={breadcrumbsFor(PATH)}
        faqs={faqs}
        jsonLd={articleSchema(PATH, DESCRIPTION)}
      />
      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-display font-bold mb-6">Can You Finance a Used RV?</h1>

        <DirectAnswer>
          <p>
            Yes — financing a used RV is common, and it can be a great way to get more RV for your
            budget. That said, the terms a lender offers on a used RV may depend on factors like the
            model year, mileage, condition, and book value, as well as whether you're buying from a
            dealer or a private party. Policies vary from lender to lender.
          </p>
        </DirectAnswer>

        <section>
          <h2 className="text-2xl font-display font-bold mb-4">What used RV financing may depend on</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {FACTORS.map((f) => (
              <div key={f} className="bg-card border border-border rounded-xl px-5 py-3 text-sm font-medium">
                {f}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-display font-bold mb-4">Dealer vs private-party purchases</h2>
          <p className="text-muted-foreground leading-relaxed">
            Buying a used RV from a dealer and buying from a private seller can be treated differently
            by lenders. Dealer purchases are sometimes more straightforward to finance, while
            private-party sales may have different requirements. Confirm a lender's policy before you
            commit either way.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-display font-bold mb-4">Smart steps for buying a used RV</h2>
          <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
            <li>Check the RV's book value to understand a fair price range</li>
            <li>Have the unit inspected for condition and major systems</li>
            <li>Estimate your payment before negotiating</li>
            <li>Compare lender options for used and older RVs</li>
          </ul>
        </section>

        <FinancingCta />
        <FaqSection faqs={faqs} />
        <RelatedFinancingLinks currentPath={PATH} />
        <FinancingDisclaimer />
      </article>
    </Layout>
  );
}
