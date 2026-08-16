import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { Clock, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const ARTICLE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "How to Match Your Tow Vehicle to an RV | The Complete Guide",
  description:
    "Learn exactly how to match your truck, SUV, or crossover to the right RV using GVWR, payload, and tongue weight. Avoid the most dangerous and expensive mistake in RV buying.",
  datePublished: "2026-05-16",
  dateModified: "2026-05-16",
  author: { "@type": "Organization", name: "MatchRV", url: "https://matchrv.com" },
  publisher: {
    "@type": "Organization",
    name: "MatchRV",
    logo: { "@type": "ImageObject", url: "https://matchrv.com/logo.png" },
  },
  mainEntityOfPage: { "@type": "WebPage", "@id": "https://matchrv.com/guides/tow-vehicle-guide" },
};

const FAQS = [
  {
    question: "Can my half-ton truck tow a fifth wheel?",
    answer:
      "Yes, some fifth wheels are specifically designed as half-ton towable. Look for models with a GVWR under 14,000 lbs and a pin weight typically under 2,000 lbs. Always verify against your specific vehicle's payload, not just tow rating.",
  },
  {
    question: "What's more important, tow capacity or payload?",
    answer:
      "Payload is more often the limiting factor. A truck can have a 12,000-lb tow rating but only 1,800 lbs of payload — and if your trailer's tongue weight is 1,200 lbs, you've already used most of your payload before you add a single passenger.",
  },
  {
    question: "What is tongue weight and how do I calculate it?",
    answer:
      "Tongue weight is the downward force the front of a travel trailer puts on the hitch ball. It's typically 10–15% of the trailer's loaded weight. For a trailer with a GVWR of 7,000 lbs, expect 700–1,050 lbs of tongue weight.",
  },
  {
    question: "Should I use the max tow rating or a lower number?",
    answer:
      "Use a number below the max. Industry experts recommend targeting 80% of your max tow rating for comfortable, safe towing. Max ratings assume ideal conditions — flat ground, sea level, new vehicle.",
  },
  {
    question: "Can I exceed my vehicle's GVWR if I'm careful?",
    answer:
      "No. Exceeding your GVWR is unsafe and can void your warranty and insurance coverage. It is also illegal in most states.",
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
        <p className="font-semibold text-[#161d1d] mb-1">Not sure what your vehicle can handle?</p>
        <p className="text-[#3b4949] text-sm">Get a personalized Match Report that shows which RVs fit your exact setup — tow ratings, payload, and all.</p>
      </div>
      <Link href="/match">
        <button className="shrink-0 bg-[#0B1117] text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#002829] transition-colors inline-flex items-center gap-2 whitespace-nowrap">
          Get Your Free Match Report <ArrowRight className="w-4 h-4" />
        </button>
      </Link>
    </div>
  );
}

export function TowVehicleGuide() {
  return (
    <Layout>
      <SEO
        title="How to Match Your Tow Vehicle to an RV | The Complete Guide"
        description="Learn exactly how to match your truck, SUV, or crossover to the right RV using GVWR, payload, and tongue weight. Avoid the most dangerous and expensive mistake in RV buying."
        canonical="/guides/tow-vehicle-guide"
        type="article"
        jsonLd={ARTICLE_SCHEMA}
        faqs={FAQS}
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "RV Guides", href: "/guides" },
          { name: "How to Match Your Tow Vehicle to an RV", href: "/guides/tow-vehicle-guide" },
        ]}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <nav className="text-[#3b4949] text-sm mb-6 flex items-center gap-2">
          <Link href="/" className="hover:text-[#0B1117] transition-colors">Home</Link>
          <span>/</span>
          <Link href="/guides" className="hover:text-[#0B1117] transition-colors">RV Guides</Link>
          <span>/</span>
          <span className="text-[#161d1d]">Tow Vehicle Guide</span>
        </nav>

        <div className="flex items-center gap-3 mb-4">
          <span className="bg-orange-100 text-orange-800 text-xs font-bold px-3 py-1 rounded">Technical</span>
          <div className="flex items-center gap-1 text-[#3b4949] text-sm">
            <Clock className="w-4 h-4" />
            <span>10 min read</span>
          </div>
          <span className="text-[#3b4949] text-sm">Updated May 2026</span>
        </div>

        <h1 className="font-display font-black text-3xl md:text-4xl text-[#161d1d] mb-4 leading-tight">
          How to Match Your Tow Vehicle to an RV (Without Losing Sleep)
        </h1>
        <p className="text-[#3b4949] text-lg leading-relaxed mb-10">
          The single most expensive mistake first-time RV buyers make isn't choosing the wrong floor plan or paying too much — it's buying an RV their vehicle can't safely tow. This guide walks you through the five numbers that matter and a step-by-step process to make a safe, confident match.
        </p>

        <div className="space-y-10 text-[#3b4949]">
          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">The Five Numbers That Matter</h2>
            <p className="text-base leading-relaxed mb-5">
              Before you look at a single RV, you need five numbers — three from your vehicle and two from any RV you're considering.
            </p>

            <h3 className="font-bold text-xl text-[#161d1d] mb-3">From your tow vehicle:</h3>
            <ol className="list-decimal pl-6 space-y-3 text-base leading-relaxed mb-5">
              <li>
                <strong>Max Towing Capacity</strong> — the heaviest thing your vehicle can pull, according to the manufacturer. Found in your owner's manual or on a door sticker.
              </li>
              <li>
                <strong>Payload Capacity</strong> — the maximum weight you can carry in and on the vehicle itself (passengers, gear, tongue weight, anything in the bed or trunk). Found on the Tire and Loading Information label inside the driver's side door frame.
              </li>
              <li>
                <strong>Gross Combined Weight Rating (GCWR)</strong> — the maximum allowable weight of your vehicle <em>plus</em> everything you're towing, fully loaded. Found in your owner's manual.
              </li>
            </ol>

            <h3 className="font-bold text-xl text-[#161d1d] mb-3">From the RV:</h3>
            <ol start={4} className="list-decimal pl-6 space-y-3 text-base leading-relaxed">
              <li>
                <strong>GVWR (Gross Vehicle Weight Rating)</strong> — the maximum safe weight of the RV when fully loaded with water, food, clothes, gear, and passengers. This is the number you must stay under.
              </li>
              <li>
                <strong>Tongue Weight (travel trailers) or Pin Weight (fifth wheels)</strong> — the downward force the RV puts on your hitch. Travel trailers typically place 10–15% of their loaded weight on the hitch. Fifth wheels place 15–25% on the pin.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Step-by-Step: How to Match Your RV to Your Vehicle</h2>

            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-lg text-[#161d1d] mb-2">Step 1: Start with what you already own.</h3>
                <p className="text-base leading-relaxed">
                  Don't pick an RV first. Start with your vehicle's specs and work backward. This prevents the heartbreak of buying your dream trailer only to discover your truck can't handle it.
                </p>
              </div>
              <div>
                <h3 className="font-bold text-lg text-[#161d1d] mb-2">Step 2: Subtract your payload first — it's the real bottleneck.</h3>
                <p className="text-base leading-relaxed">
                  Most buyers focus on towing capacity. That's a mistake. Payload is almost always the limiting factor, especially with half-ton trucks and large SUVs. Tongue weight counts toward your payload, not just your tow rating. If your payload is 1,800 lbs and your tongue weight is 1,200 lbs, you only have 600 lbs left for passengers, gear, and anything else in the vehicle.
                </p>
              </div>
              <div>
                <h3 className="font-bold text-lg text-[#161d1d] mb-2">Step 3: Verify the tow rating covers the RV's GVWR.</h3>
                <p className="text-base leading-relaxed">
                  Your RV's GVWR (fully loaded weight) must be less than or equal to your vehicle's max towing capacity. Use the GVWR, not the dry weight — dealers often advertise dry weight, which is the trailer without any fluids, food, or gear. As a safety buffer, aim for a tow rating at least 10–15% above the RV's GVWR.
                </p>
              </div>
              <div>
                <h3 className="font-bold text-lg text-[#161d1d] mb-2">Step 4: Check GCWR.</h3>
                <p className="text-base leading-relaxed">
                  Your fully loaded vehicle plus fully loaded RV together can't exceed your GCWR. If your GCWR is 18,500 lbs and your vehicle curb weight is 7,000 lbs, your trailer's loaded weight can't exceed 11,500 lbs.
                </p>
              </div>
              <div>
                <h3 className="font-bold text-lg text-[#161d1d] mb-2">Step 5: Weigh your actual setup at a CAT scale.</h3>
                <p className="text-base leading-relaxed">
                  Once you own the rig, load it the way you actually camp — full fresh water tank, food for a week, clothes, bikes, grills, everything. Then weigh it at a certified truck scale. You'll usually find you're heavier than expected. Cost: typically $10–$15. Worth every penny.
                </p>
              </div>
            </div>
          </section>

          <InlineCTA />

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Quick Reference: Vehicle Classes and What They Can Tow</h2>
            <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0B1117] text-white">
                    <th className="text-left px-4 py-3 font-bold">Vehicle Class</th>
                    <th className="text-left px-4 py-3 font-bold">Typical Tow Capacity</th>
                    <th className="text-left px-4 py-3 font-bold">Compatible RV Types</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Half-ton truck (F-150, Silverado 1500, Ram 1500)", "5,000–13,300 lbs", "Light travel trailers, small fifth wheels, pop-ups, teardrops"],
                    ["Three-quarter-ton truck (F-250, Silverado 2500, Ram 2500)", "10,000–14,500 lbs", "Most travel trailers, many mid-size fifth wheels"],
                    ["One-ton truck (F-350, Silverado 3500, Ram 3500)", "14,000–35,000+ lbs", "Full-size fifth wheels, toy haulers, large travel trailers"],
                    ["Large SUV (Tahoe, Expedition, Sequoia)", "5,000–9,500 lbs", "Lightweight travel trailers, pop-ups, small teardrops"],
                    ["Midsize SUV (4Runner, Grand Cherokee)", "5,000–7,700 lbs", "Ultra-light travel trailers, pop-ups"],
                    ["Minivan / Crossover", "1,000–5,000 lbs", "Small pop-ups, teardrops, lightweight micro-trailers"],
                  ].map(([vehicle, capacity, rvTypes], i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#eef5f4]"}>
                      <td className="px-4 py-3 font-medium text-[#161d1d]">{vehicle}</td>
                      <td className="px-4 py-3 text-[#3b4949]">{capacity}</td>
                      <td className="px-4 py-3 text-[#3b4949]">{rvTypes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Common Mistakes That Get People in Trouble</h2>
            <div className="space-y-4">
              {[
                {
                  title: "Buying based on the dealer's 'you'll be fine' reassurance.",
                  body: "Dealers often use the max tow rating, not real-world numbers. Ask for the payload sticker and do the math yourself.",
                },
                {
                  title: "Ignoring the weight of options.",
                  body: "Solar panels, auto-leveling systems, slide-toppers, and washer/dryer combos can add 500–1,500 lbs to an RV that the spec sheet doesn't fully account for.",
                },
                {
                  title: "Forgetting about passengers in the tow vehicle.",
                  body: "If four adults + a dog + gear already uses 800 lbs of your payload, that reduces the tongue weight your truck can handle by 800 lbs.",
                },
                {
                  title: "Not accounting for weight distribution hitch tongue weight.",
                  body: "A weight distribution hitch adds roughly 50–100 lbs to the tongue weight figure. Include it in your calculation.",
                },
              ].map(({ title, body }, i) => (
                <div key={i} className="bg-red-50 border border-red-100 rounded-2xl p-5">
                  <p className="font-semibold text-[#161d1d] mb-1">Mistake {i + 1}: {title}</p>
                  <p className="text-[#3b4949] text-sm leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">What If My Vehicle Isn't Enough?</h2>
            <p className="text-base leading-relaxed mb-4">
              Not every vehicle is built for every RV — and that's okay. You have three options:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-base leading-relaxed mb-4">
              <li>Choose a smaller or lighter RV that fits your current vehicle</li>
              <li>Upgrade your tow vehicle to something with more capacity</li>
              <li>Consider a motorized RV (Class B or Class C) that doesn't require towing at all</li>
            </ul>
            <p className="text-base leading-relaxed">
              MatchRV's free Match Report takes your vehicle's actual numbers, your budget, and your travel style and tells you which RVs are genuinely safe matches for your setup.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Summary</h2>
            <p className="text-base leading-relaxed">
              Matching your tow vehicle to an RV comes down to five numbers and one rule: always check payload first. Most buyers fixate on towing capacity and miss the real constraint. Use the GVWR, not dry weight. Add a 10–15% safety margin. And when in doubt, weigh your rig at a CAT scale.
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
          <Link href="/match">
            <button className="bg-white text-[#0B1117] px-7 py-3.5 rounded-2xl font-black text-sm hover:bg-[#eef5f4] transition-colors inline-flex items-center gap-2">
              Get Your Free Match Report — It's Free <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
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
            <Link href="/guides/towing-guide">
              <div className="group border border-[#E2E8F0] rounded-2xl p-5 hover:border-[#0B1117] hover:shadow-md transition-all">
                <p className="font-semibold text-[#161d1d] group-hover:text-[#0B1117] transition-colors mb-1 text-sm">RV Towing Guide</p>
                <p className="text-[#3b4949] text-xs leading-relaxed">GVWR, payload, tongue weight — all the towing numbers explained.</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
