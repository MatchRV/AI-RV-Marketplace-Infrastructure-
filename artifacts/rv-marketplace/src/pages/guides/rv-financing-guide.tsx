import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { ArrowRight, Clock } from "lucide-react";

export function RvFinancingGuide() {
  return (
    <Layout>
      <SEO
        title="RV Financing Guide: How to Get the Best Loan Rate | MatchRV"
        description="How RV loans work, what interest rates to expect by credit score, how loan terms affect total cost, and strategies to get the best financing deal on your next RV."
        canonical="/guides/rv-financing-guide"
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Buyer Guides", href: "/guides" },
          { name: "RV Financing Guide", href: "/guides/rv-financing-guide" },
        ]}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <nav className="text-[#3b4949] text-sm mb-6 flex items-center gap-2">
          <Link href="/" className="hover:text-[#0B1117] transition-colors">Home</Link>
          <span>/</span>
          <Link href="/guides" className="hover:text-[#0B1117] transition-colors">Buyer Guides</Link>
          <span>/</span>
          <span className="text-[#161d1d]">RV Financing Guide</span>
        </nav>

        <div className="flex items-center gap-3 mb-4">
          <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded">Finance</span>
          <div className="flex items-center gap-1 text-[#3b4949] text-sm">
            <Clock className="w-4 h-4" />
            <span>7 min read</span>
          </div>
        </div>

        <h1 className="font-display font-black text-3xl md:text-4xl text-[#161d1d] mb-4 leading-tight">
          RV Financing Guide: How to Get the Best Loan Rate
        </h1>
        <p className="text-[#3b4949] text-lg leading-relaxed mb-10">
          Most RV buyers finance their purchase. A 1% difference in your interest rate on a $75,000 RV loan over 15 years is about $6,500 in total interest paid. Getting your financing right before you step into a dealership is one of the highest-ROI steps in the buying process.
        </p>

        <div className="space-y-10 text-[#3b4949]">
          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">How RV Loans Work</h2>
            <p className="text-base leading-relaxed mb-3">
              RV loans are classified as recreational vehicle loans, not auto loans. Lenders treat them similarly to boat loans — they're secured loans with the RV as collateral, but they carry higher interest rates than home mortgages and slightly higher rates than auto loans because RVs depreciate faster and lenders consider them a discretionary purchase.
            </p>
            <p className="text-base leading-relaxed mb-3">
              Loan terms for RVs typically range from 10 to 20 years, depending on the loan amount and the lender. Some lenders offer up to 20-year terms for loans above $100,000. Longer terms lower your monthly payment but increase total interest paid significantly.
            </p>
            <p className="text-base leading-relaxed">
              You can finance an RV through a dealer (who works with a network of lenders), your personal bank or credit union, or an online lender specializing in recreational vehicles. Pre-approval from a credit union or online lender before visiting a dealer gives you a benchmark rate to compare against the dealer's financing offer.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">What Interest Rates to Expect</h2>
            <p className="text-base leading-relaxed mb-3">
              RV loan rates vary significantly by credit score, down payment, loan term, and the age of the unit. As a general reference for borrowers in 2025–2026:
            </p>
            <div className="bg-[#eef5f4] rounded-2xl p-5 mb-4">
              <div className="grid grid-cols-2 gap-3 text-sm font-medium">
                <div className="text-[#3b4949]">Credit Score</div>
                <div className="text-[#3b4949]">Approximate Rate Range</div>
                <div className="font-bold text-[#161d1d] border-t border-[#E2E8F0] pt-2">760+ (Excellent)</div>
                <div className="text-[#0B1117] font-bold border-t border-[#E2E8F0] pt-2">6.5% – 8.5%</div>
                <div className="font-bold text-[#161d1d]">720–759 (Very Good)</div>
                <div className="text-[#3b4949] font-semibold">8.5% – 10.5%</div>
                <div className="font-bold text-[#161d1d]">680–719 (Good)</div>
                <div className="text-[#3b4949] font-semibold">10.5% – 13%</div>
                <div className="font-bold text-[#161d1d]">640–679 (Fair)</div>
                <div className="text-[#3b4949] font-semibold">13% – 17%</div>
                <div className="font-bold text-[#161d1d]">Below 640</div>
                <div className="text-[#8d4f00] font-semibold">17%+ or declined</div>
              </div>
            </div>
            <p className="text-base leading-relaxed">
              These are approximate ranges — actual rates depend on the lender, the specific RV (new vs. used, age), loan term, and how much you put down. Credit unions generally offer the most competitive rates; LightStream, Good Sam Finance Center, and Bank of the West are frequently cited as competitive online lenders for RV loans.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Down Payment Strategy</h2>
            <p className="text-base leading-relaxed mb-3">
              Most lenders require a minimum 10–20% down payment for RV loans. Putting down more has two benefits: it reduces your loan amount (and therefore total interest paid), and it may qualify you for a lower rate. Lenders view a borrower with more skin in the game as lower risk.
            </p>
            <p className="text-base leading-relaxed mb-3">
              For a $60,000 used RV with 15% down ($9,000), your loan amount is $51,000. At 8% over 12 years, your payment is approximately $548/month and total interest paid is about $27,900. At 10% down, you'd borrow $54,000 and pay about $29,500 in total interest — a $1,600 difference from one additional percentage point of down payment.
            </p>
            <p className="text-base leading-relaxed">
              Don't drain your emergency fund for a larger down payment. Aim for 10–20% down while maintaining 3–6 months of living expenses plus a dedicated RV repair fund of at least $3,000–$5,000.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Loan Term: How It Affects What You Pay</h2>
            <p className="text-base leading-relaxed mb-3">
              RV loan terms of 15–20 years seem appealing because of the low monthly payments, but the long-term cost is substantial. Consider a $75,000 RV loan at 8.5% interest:
            </p>
            <div className="bg-[#eef5f4] rounded-2xl p-5 mb-4">
              <div className="grid grid-cols-3 gap-3 text-sm font-medium">
                <div className="text-[#3b4949]">Term</div>
                <div className="text-[#3b4949]">Monthly Payment</div>
                <div className="text-[#3b4949]">Total Interest</div>
                <div className="font-bold text-[#161d1d] border-t border-[#E2E8F0] pt-2">10 years</div>
                <div className="text-[#0B1117] font-bold border-t border-[#E2E8F0] pt-2">$930</div>
                <div className="text-[#0B1117] font-bold border-t border-[#E2E8F0] pt-2">$36,600</div>
                <div className="font-bold text-[#161d1d]">15 years</div>
                <div className="text-[#3b4949] font-semibold">$740</div>
                <div className="text-[#3b4949] font-semibold">$58,200</div>
                <div className="font-bold text-[#161d1d]">20 years</div>
                <div className="text-[#8d4f00] font-semibold">$656</div>
                <div className="text-[#8d4f00] font-semibold">$82,400</div>
              </div>
            </div>
            <p className="text-base leading-relaxed">
              The 20-year loan costs $45,800 more in interest than the 10-year loan — for the same RV. Choose the shortest term you can afford. Even paying an extra $100–$200/month toward principal on a longer-term loan significantly reduces total interest paid.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Financing Used vs. New RVs</h2>
            <p className="text-base leading-relaxed mb-3">
              Most lenders have restrictions on financing older RVs. Common cutoffs are 10–15 years for secured RV loans. A 2010 travel trailer may be difficult to finance through a traditional lender, pushing you toward an unsecured personal loan — which carries higher rates.
            </p>
            <p className="text-base leading-relaxed mb-3">
              New RVs often come with manufacturer-subsidized financing rates (similar to 0% APR deals in the car market). These promotional rates are genuine value if your credit qualifies, but be cautious: dealers sometimes increase the purchase price slightly when offering subsidized financing. Compare the total out-of-pocket cost, not just the monthly payment.
            </p>
            <p className="text-base leading-relaxed">
              For used RVs in the 2–8 year range, credit unions consistently offer the most competitive rates. Navy Federal, PenFed, and many regional credit unions have RV loan programs worth checking before visiting a dealer.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Steps to Get the Best Financing</h2>
            <ol className="list-decimal pl-6 space-y-3 text-base leading-relaxed">
              <li>Check your credit score before applying. If it's below 720, spending 3–6 months paying down revolving debt could meaningfully improve your rate.</li>
              <li>Get pre-approved from at least two sources before shopping — your bank or credit union and one online lender.</li>
              <li>Shop with your pre-approval rate in hand. Tell the dealer you're pre-approved and ask if they can beat it.</li>
              <li>Read the financing contract carefully. Look for prepayment penalties, which some lenders include to prevent early payoff.</li>
              <li>Consider RV-specific insurance requirements — lenders require comprehensive coverage, so get quotes before finalizing your budget.</li>
            </ol>
          </section>
        </div>

        <div className="mt-12 bg-gradient-to-r from-[#0B1117] to-[#002829] rounded-[2rem] p-8 text-white">
          <h2 className="font-display font-black text-2xl mb-3">Find an RV worth financing</h2>
          <p className="text-white/80 mb-6">Use MatchRV's AI deal scoring to find listings priced below market value — so you're financing the right amount from the start.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/browse">
              <button className="bg-white text-[#0B1117] px-7 py-3.5 rounded-2xl font-black text-sm hover:bg-[#eef5f4] transition-colors inline-flex items-center gap-2">
                Browse All RVs <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <Link href="/finance">
              <button className="border-2 border-white/50 text-white px-7 py-3.5 rounded-2xl font-bold text-sm hover:border-white hover:bg-white/10 transition-colors">
                Finance Calculator
              </button>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
