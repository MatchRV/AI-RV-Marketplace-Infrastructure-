import { Link } from "wouter";
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

const PATH = "/rv-financing/find-rvs-by-monthly-payment";
const DESCRIPTION =
  "Find RVs by monthly payment, not just sticker price. Learn how to shop around a comfortable payment, total ownership cost, and lifestyle needs — and how MatchRV helps you compare options.";

const faqs: Faq[] = [
  {
    question: "How do I find RVs by monthly payment instead of price?",
    answer:
      "Start with a monthly payment you're comfortable with, estimate the price range that supports it using the RV loan calculator, then compare RVs in that range. MatchRV helps you match listings to your budget, RV type, location, and lifestyle.",
  },
  {
    question: "Why shouldn't I shop by RV price alone?",
    answer:
      "Sticker price doesn't capture the full cost of ownership. Insurance, maintenance, storage, fuel, and campground fees all add up. Thinking in terms of a comfortable monthly payment and total cost gives a more realistic picture.",
  },
  {
    question: "Does a lower price always mean a lower payment?",
    answer:
      "Not always. Interest rate, loan term, and down payment all affect the monthly payment. A lower-priced RV with a short term could have a higher payment than a higher-priced RV with a longer term.",
  },
  {
    question: "Can MatchRV match me with RVs in my budget?",
    answer:
      "Yes. MatchRV compares RVs based on budget, monthly payment goals, RV type, location, and lifestyle so you can focus on options that realistically fit before contacting a dealer. MatchRV is not a lender.",
  },
];

export function FindRvsByMonthlyPayment() {
  return (
    <Layout>
      <SEO
        title="Find RVs by Monthly Payment"
        description={DESCRIPTION}
        canonical={PATH}
        type="article"
        breadcrumbs={breadcrumbsFor(PATH)}
        faqs={faqs}
        jsonLd={articleSchema(PATH, DESCRIPTION)}
      />
      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-display font-bold mb-6">Find RVs by Monthly Payment</h1>

        <DirectAnswer>
          <p>
            Smart RV shopping often starts with a payment, not a price tag. Decide what monthly
            payment feels comfortable for your budget, factor in the full cost of ownership, then
            shop RVs that fit that number. MatchRV helps you compare real listings against your
            budget, RV type, location, and lifestyle — so the search starts with what works for you.
          </p>
        </DirectAnswer>

        <section>
          <h2 className="text-2xl font-display font-bold mb-4">Think payment first, then price</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            Many buyers fall in love with an RV's price and only later work out the payment. Flipping
            that order keeps you in control. Use the{" "}
            <Link href="/rv-financing/rv-loan-calculator" className="text-primary font-medium hover:underline">
              RV loan calculator
            </Link>{" "}
            to see how price, down payment, rate, and term translate into a monthly number.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-display font-bold mb-4">Consider total cost of ownership</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            A realistic monthly budget looks beyond the loan payment alone:
          </p>
          <ul className="space-y-2 text-muted-foreground leading-relaxed list-disc list-inside">
            <li>Insurance</li>
            <li>Routine maintenance and repairs</li>
            <li>Storage when not in use</li>
            <li>Fuel and towing costs</li>
            <li>Campground and park fees</li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-display font-bold mb-4">Match RVs to your budget and lifestyle</h2>
          <p className="text-muted-foreground leading-relaxed">
            Once you know your comfortable payment and target price range, MatchRV helps you compare
            RVs by budget, monthly payment goals, RV type, location, and lifestyle needs. That way
            you spend time on options that fit — not ones that stretch your budget.
          </p>
        </section>

        <FinancingCta heading="Find RVs that fit your monthly budget" />
        <FaqSection faqs={faqs} />
        <RelatedFinancingLinks currentPath={PATH} />
        <FinancingDisclaimer />
      </article>
    </Layout>
  );
}
