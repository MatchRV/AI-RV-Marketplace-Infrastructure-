import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { Clock, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const ARTICLE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "How Much Does an RV Cost in 2025? Complete Price Guide by Type",
  description:
    "Full breakdown of 2025 RV prices for travel trailers, fifth wheels, Class A, B, and C motorhomes. Includes new vs. used comparison, ownership costs, and budget tips.",
  datePublished: "2026-05-16",
  dateModified: "2026-05-16",
  author: { "@type": "Organization", name: "MatchRV", url: "https://matchrv.com" },
  publisher: {
    "@type": "Organization",
    name: "MatchRV",
    logo: { "@type": "ImageObject", url: "https://matchrv.com/logo.png" },
  },
  mainEntityOfPage: { "@type": "WebPage", "@id": "https://matchrv.com/guides/rv-cost-guide" },
};

const FAQS = [
  {
    question: "What is the cheapest type of RV to buy?",
    answer:
      "Pop-up campers and small travel trailers (under 20 feet) are the most affordable, starting around $8,000–$14,000 new. Used pop-ups can be found under $5,000.",
  },
  {
    question: "Is it worth buying a new RV or should I go used?",
    answer:
      "For most buyers, used (2–5 years old) offers the best value. You avoid the steepest depreciation curve while getting an RV with most of its useful life ahead of it.",
  },
  {
    question: "Do RVs hold their value?",
    answer:
      "Better than most vehicles, but they still depreciate. Towable RVs (travel trailers, fifth wheels) hold value better than motorized RVs because they have a longer usable lifespan and no engine or transmission to fail.",
  },
  {
    question: "What's a realistic budget for a first-time RV buyer?",
    answer:
      "For a family of 4, a quality used travel trailer in the $20,000–$30,000 range with a used tow vehicle in the $25,000–$40,000 range gives you a solid setup for $45,000–$70,000 total. Many buyers find great deals under $50,000 for the complete rig.",
  },
  {
    question: "Are older RVs (10+ years) worth buying?",
    answer:
      "They can be — if you're handy or have a trusted mechanic inspect it. Older RVs from quality manufacturers often outlast newer budget models. Look for solid roof construction, no soft spots in the floor, and working appliances. Budget $2,000–$5,000 for repairs in the first year.",
  },
  {
    question: "Should I buy at an RV show or from a dealer?",
    answer:
      "RV shows offer the broadest selection to walk through in one place and some dealers offer show-only discounts. But you can often negotiate better prices at a local dealer when buying off their lot because they have more flexibility to close a deal face-to-face.",
  },
];

function FAQAccordion({ faqs }: { faqs: { question: string; answer: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {faqs.map((faq, i) => (
        <div key={i} className="border border-[#E2E8F0] rounded-2xl overflow-hidden">
          <button
            className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 font-semibold text-[#161d1d] hover:bg-[#eef5f4] transition-colors"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
          >
            <span>{faq.question}</span>
            {open === i ? <ChevronUp className="w-4 h-4 shrink-0 text-[#0B1117]" /> : <ChevronDown className="w-4 h-4 shrink-0 text-[#3b4949]" />}
          </button>
          {open === i && (
            <div className="px-5 pb-4 text-[#3b4949] text-sm leading-relaxed border-t border-[#E2E8F0] pt-3">
              {faq.answer}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function InlineCTA() {
  return (
    <div className="my-10 bg-[#eef5f4] border border-[#E2E8F0] rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <div className="flex-1">
        <p className="font-semibold text-[#161d1d] mb-1">Not sure which RV type fits your budget?</p>
        <p className="text-[#3b4949] text-sm">Get a personalized Match Report that shows which RVs fit your vehicle, budget, and lifestyle — for free.</p>
      </div>
      <Link href="/match">
        <button className="shrink-0 bg-[#0B1117] text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#002829] transition-colors inline-flex items-center gap-2 whitespace-nowrap">
          Get Your Free Match Report <ArrowRight className="w-4 h-4" />
        </button>
      </Link>
    </div>
  );
}

export function RvCostGuide() {
  return (
    <Layout>
      <SEO
        title="How Much Does an RV Cost in 2025? Complete Price Guide by Type"
        description="Full breakdown of 2025 RV prices for travel trailers, fifth wheels, Class A, B, and C motorhomes. Includes new vs. used comparison, ownership costs, and budget tips."
        canonical="/guides/rv-cost-guide"
        type="article"
        jsonLd={ARTICLE_SCHEMA}
        faqs={FAQS}
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "RV Guides", href: "/guides" },
          { name: "RV Cost Guide", href: "/guides/rv-cost-guide" },
        ]}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <nav className="text-[#3b4949] text-sm mb-6 flex items-center gap-2">
          <Link href="/" className="hover:text-[#0B1117] transition-colors">Home</Link>
          <span>/</span>
          <Link href="/guides" className="hover:text-[#0B1117] transition-colors">RV Guides</Link>
          <span>/</span>
          <span className="text-[#161d1d]">RV Cost Guide</span>
        </nav>

        <div className="flex items-center gap-3 mb-4">
          <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded">Finance</span>
          <div className="flex items-center gap-1 text-[#3b4949] text-sm">
            <Clock className="w-4 h-4" />
            <span>8 min read</span>
          </div>
          <span className="text-[#3b4949] text-sm">Updated May 2026</span>
        </div>

        <h1 className="font-display font-black text-3xl md:text-4xl text-[#161d1d] mb-4 leading-tight">
          How Much Does an RV Cost in 2025? Your Complete Price Guide
        </h1>
        <p className="text-[#3b4949] text-lg leading-relaxed mb-10">
          RV prices in 2025 span from under $12,000 to over $500,000. Whether you're a first-time buyer or upgrading from an older rig, understanding what RVs actually cost — not just the MSRP, but the full picture — is the single most important step in your buying journey.
        </p>

        <div className="space-y-10 text-[#3b4949]">
          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">New RV Prices by Type (2025)</h2>
            <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0B1117] text-white">
                    <th className="text-left px-4 py-3 font-bold">RV Type</th>
                    <th className="text-left px-4 py-3 font-bold">Entry-Level</th>
                    <th className="text-left px-4 py-3 font-bold">Mid-Range</th>
                    <th className="text-left px-4 py-3 font-bold">High-End / Luxury</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Pop-up Camper", "$8,000–$14,000", "$14,000–$18,000", "$18,000+"],
                    ["Teardrop Trailer", "$12,000–$20,000", "$20,000–$28,000", "$28,000+"],
                    ["Travel Trailer", "$14,000–$25,000", "$25,000–$45,000", "$45,000–$80,000"],
                    ["Fifth Wheel", "$32,000–$55,000", "$55,000–$85,000", "$85,000–$150,000"],
                    ["Class B Camper Van", "$70,000–$110,000", "$110,000–$150,000", "$150,000+"],
                    ["Class C Motorhome", "$70,000–$120,000", "$120,000–$180,000", "$180,000–$300,000"],
                    ["Class A Motorhome", "$100,000–$200,000", "$200,000–$400,000", "$400,000–$1,000,000+"],
                  ].map(([type, entry, mid, high], i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#eef5f4]"}>
                      <td className="px-4 py-3 font-medium text-[#161d1d]">{type}</td>
                      <td className="px-4 py-3 text-[#3b4949]">{entry}</td>
                      <td className="px-4 py-3 text-[#3b4949]">{mid}</td>
                      <td className="px-4 py-3 text-[#3b4949]">{high}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[#3b4949] mt-3">Prices are MSRP for 2025 models and do not include destination charges, dealer prep, or optional features.</p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">What Drives the Price Difference?</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-lg text-[#161d1d] mb-2">1. Construction quality</h3>
                <p className="text-base leading-relaxed">
                  Stick-and-tin (aluminum frame, fiberglass or metal skin) is the most affordable build. Laminated walls (foam core, fiberglass skins) cost more but are better insulated and lighter. Full-composite construction (no wood in the walls) is the most expensive and most durable.
                </p>
              </div>
              <div>
                <h3 className="font-bold text-lg text-[#161d1d] mb-2">2. Floor plan and livable space</h3>
                <p className="text-base leading-relaxed">
                  More slide-outs = more living space = more cost. Each slide-out adds $3,000–$8,000 to the MSRP. Bunkhouse layouts, rear kitchens, and island kitchens are the most expensive configurations.
                </p>
              </div>
              <div>
                <h3 className="font-bold text-lg text-[#161d1d] mb-2">3. Brand reputation</h3>
                <p className="text-base leading-relaxed">
                  Brands like Airstream, Grand Design, and Alliance command premium prices. Budget brands are more affordable but typically use thinner walls and less robust components. Mid-market brands (Keystone, Jayco, Heartland) offer the best balance of price and quality for most buyers.
                </p>
              </div>
            </div>
          </section>

          <InlineCTA />

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">New vs. Used: Where's the Real Value?</h2>
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 mb-5">
              <p className="font-semibold text-[#161d1d] mb-2">For most buyers, a 2–5 year old used RV is the smarter financial move.</p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-[#3b4949] leading-relaxed">
                <li>RVs depreciate fastest in the first 3–5 years — a $50,000 travel trailer purchased new may be worth $28,000–$32,000 after three years</li>
                <li>By buying used, you let the first owner absorb that depreciation</li>
                <li>At 2–5 years old, most manufacturing defects have been discovered and fixed, and systems are still modern and roadworthy</li>
              </ul>
            </div>
            <h3 className="font-bold text-lg text-[#161d1d] mb-3">Average used RV prices (2025):</h3>
            <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0B1117] text-white">
                    <th className="text-left px-4 py-3 font-bold">RV Type</th>
                    <th className="text-left px-4 py-3 font-bold">Used Price Range</th>
                    <th className="text-left px-4 py-3 font-bold">Average</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Travel Trailer", "$8,000–$40,000", "$20,000"],
                    ["Fifth Wheel", "$22,000–$75,000", "$38,000"],
                    ["Class B Camper Van", "$40,000–$170,000", "$85,000"],
                    ["Class C Motorhome", "$40,000–$120,000", "$68,000"],
                    ["Class A Motorhome (gas)", "$42,000–$130,000", "$68,000"],
                    ["Class A Motorhome (diesel)", "$60,000–$250,000", "$120,000"],
                  ].map(([type, range, avg], i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#eef5f4]"}>
                      <td className="px-4 py-3 font-medium text-[#161d1d]">{type}</td>
                      <td className="px-4 py-3 text-[#3b4949]">{range}</td>
                      <td className="px-4 py-3 font-semibold text-[#0B1117]">{avg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-[#3b4949] leading-relaxed">
              <strong>Certified pre-owned (CPO)</strong> programs offered by large dealers include inspections, limited warranties, and financing — worth the premium over a private sale.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">The Real Cost of RV Ownership</h2>
            <p className="text-base leading-relaxed mb-5">The purchase price is just the beginning. Here's what you'll spend annually:</p>
            <div className="space-y-3">
              {[
                { label: "Storage", detail: "$50–$200/month if you don't have room at home. Indoor storage runs $150–$400/month." },
                { label: "Insurance", detail: "$500–$2,000/year depending on RV type, value, and coverage. Class A diesel motorhomes are the most expensive to insure." },
                { label: "Maintenance", detail: "Budget $1,000–$2,500/year for routine maintenance (seal checks, tire replacement, appliance service, brake adjustments for towables)." },
                { label: "Fuel", detail: "A Class A motorhome averages 5–8 MPG. A travel trailer behind a half-ton truck might average 12–15 MPG combined. Budget $500–$2,000/year depending on how much you travel." },
                { label: "Campground fees", detail: "$30–$150/night at private parks; many public campgrounds are $15–$45/night. Annual campground memberships can reduce this significantly." },
                { label: "Depreciation", detail: "If you buy new, expect 20–30% depreciation over the first 5 years. If you buy used, depreciation is much slower and often nearly flat beyond year 5." },
              ].map(({ label, detail }, i) => (
                <div key={i} className="flex gap-4 p-4 bg-[#eef5f4] rounded-2xl">
                  <div className="font-bold text-[#0B1117] min-w-[100px] text-sm pt-0.5">{label}</div>
                  <div className="text-[#3b4949] text-sm leading-relaxed">{detail}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Monthly Ownership Cost Estimate (All-In)</h2>
            <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0B1117] text-white">
                    <th className="text-left px-4 py-3 font-bold">RV Type</th>
                    <th className="text-left px-4 py-3 font-bold">Monthly Cost Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Travel Trailer (small)", "$400–$700"],
                    ["Travel Trailer (large)", "$600–$1,100"],
                    ["Fifth Wheel", "$800–$1,500"],
                    ["Class B Camper Van", "$700–$1,200"],
                    ["Class C Motorhome", "$800–$1,500"],
                    ["Class A Motorhome", "$1,200–$2,500+"],
                  ].map(([type, cost], i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#eef5f4]"}>
                      <td className="px-4 py-3 font-medium text-[#161d1d]">{type}</td>
                      <td className="px-4 py-3 font-semibold text-[#0B1117]">{cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[#3b4949] mt-3">Includes payment estimate (if financed), insurance, storage, maintenance, and average campground fees. Does not include fuel.</p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">How to Save Money on Your RV Purchase</h2>
            <div className="space-y-4">
              {[
                {
                  title: "Buy at the right time",
                  body: "RV dealers clear out previous-year models in fall and early winter. October through January typically offers the best negotiating room.",
                },
                {
                  title: "Don't pay full MSRP",
                  body: "Most RVs sell at 10–20% below MSRP. Negotiate. Dealers have more flexibility than their printed prices suggest, especially on older inventory.",
                },
                {
                  title: "Consider last year's models",
                  body: "A 2024 model year RV sitting on a lot is identical in quality to a 2025 model but often priced $2,000–$8,000 lower.",
                },
                {
                  title: "Buy from an independent dealer or private party",
                  body: "Large dealership chains have overhead that independent dealers don't. Private party sales typically save 15–25% compared to dealer retail pricing.",
                },
                {
                  title: "Look at discontinued lines",
                  body: "When a manufacturer discontinues a product line, remaining inventory is often discounted significantly. RV Shows are a good place to find closeout deals.",
                },
                {
                  title: "Rent before you buy",
                  body: "If you're unsure what type of RV fits your lifestyle, rent a few different types through Outdoorsy or RVshare first. A $2,000 rental weekend that saves you from buying the wrong $40,000 RV is money extremely well spent.",
                },
              ].map(({ title, body }, i) => (
                <div key={i} className="flex gap-4 border border-[#E2E8F0] rounded-2xl p-5">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-[#0B1117] text-white flex items-center justify-center font-bold text-sm">{i + 1}</div>
                  <div>
                    <p className="font-semibold text-[#161d1d] mb-1 text-sm">{title}</p>
                    <p className="text-[#3b4949] text-sm leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">What About Monthly RV Living Costs?</h2>
            <p className="text-base leading-relaxed">
              If you're considering full-time RV living, your costs are different. Most full-timers spend $1,500–$3,500/month including campground fees, fuel, insurance, and food. Boondockers (people who camp on public lands for free) can bring this as low as $800–$1,200/month.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-5">Frequently Asked Questions</h2>
            <FAQAccordion faqs={FAQS} />
          </section>
        </div>

        <div className="mt-12 bg-gradient-to-r from-[#0B1117] to-[#002829] rounded-[2rem] p-8 text-white">
          <h2 className="font-display font-black text-2xl mb-3">Stop Guessing. Get Matched.</h2>
          <p className="text-white/80 mb-6">
            Our free Match Report analyzes your vehicle's weight ratings, your budget, and your camping style to show you exactly which RVs are a safe, smart fit.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/match">
              <button className="bg-white text-[#0B1117] px-7 py-3.5 rounded-2xl font-black text-sm hover:bg-[#eef5f4] transition-colors inline-flex items-center gap-2">
                Get Your Free Match Report — It's Free <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <Link href="/browse">
              <button className="border-2 border-white/50 text-white px-7 py-3.5 rounded-2xl font-bold text-sm hover:border-white hover:bg-white/10 transition-colors">
                Browse All RVs
              </button>
            </Link>
          </div>
        </div>

        <div className="mt-12 pt-10 border-t border-[#E2E8F0]">
          <h3 className="font-display font-bold text-lg text-[#161d1d] mb-5">Related Guides</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link href="/guides/travel-trailer-vs-fifth-wheel">
              <div className="group border border-[#E2E8F0] rounded-2xl p-5 hover:border-[#0B1117] hover:shadow-md transition-all">
                <p className="font-semibold text-[#161d1d] group-hover:text-[#0B1117] transition-colors mb-1 text-sm">Travel Trailer vs Fifth Wheel</p>
                <p className="text-[#3b4949] text-xs leading-relaxed">Which towable type is right for you? A head-to-head comparison.</p>
              </div>
            </Link>
            <Link href="/guides/rv-financing-guide">
              <div className="group border border-[#E2E8F0] rounded-2xl p-5 hover:border-[#0B1117] hover:shadow-md transition-all">
                <p className="font-semibold text-[#161d1d] group-hover:text-[#0B1117] transition-colors mb-1 text-sm">RV Financing Guide</p>
                <p className="text-[#3b4949] text-xs leading-relaxed">How RV loans work, what rates to expect, and tips for the best terms.</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
