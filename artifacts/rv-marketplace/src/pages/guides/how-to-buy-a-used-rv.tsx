import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { ArrowRight, Clock, BookOpen } from "lucide-react";

export function HowToBuyAUsedRv() {
  return (
    <Layout>
      <SEO
        title="How to Buy a Used RV: Step-by-Step Guide | MatchRV"
        description="A practical, step-by-step guide to buying a used RV. Learn how to set your budget, inspect for water damage, negotiate price, and complete the paperwork without getting burned."
        canonical="/guides/how-to-buy-a-used-rv"
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Buyer Guides", href: "/guides" },
          { name: "How to Buy a Used RV", href: "/guides/how-to-buy-a-used-rv" },
        ]}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <nav className="text-[#3b4949] text-sm mb-6 flex items-center gap-2">
          <Link href="/" className="hover:text-[#0B1117] transition-colors">Home</Link>
          <span>/</span>
          <Link href="/guides" className="hover:text-[#0B1117] transition-colors">Buyer Guides</Link>
          <span>/</span>
          <span className="text-[#161d1d]">How to Buy a Used RV</span>
        </nav>

        <div className="flex items-center gap-3 mb-4">
          <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded">Buying Guide</span>
          <div className="flex items-center gap-1 text-[#3b4949] text-sm">
            <Clock className="w-4 h-4" />
            <span>9 min read</span>
          </div>
        </div>

        <h1 className="font-display font-black text-3xl md:text-4xl text-[#161d1d] mb-4 leading-tight">
          How to Buy a Used RV: A Step-by-Step Guide
        </h1>
        <p className="text-[#3b4949] text-lg leading-relaxed mb-10">
          Buying a used RV the wrong way is expensive. Water damage alone can turn a $40,000 bargain into a six-figure repair bill. Here's how to do it right — from setting your budget to driving off the lot.
        </p>

        <div className="space-y-10 text-[#3b4949]">
          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Step 1: Set a Realistic Budget</h2>
            <p className="text-base leading-relaxed mb-3">
              Your budget isn't just the purchase price — it's the purchase price plus insurance, registration, storage or site fees, towing equipment (if buying a towable), and an emergency repair fund. A common rule of thumb is to have 10–15% of the purchase price set aside for repairs in the first year, particularly on units older than seven years.
            </p>
            <p className="text-base leading-relaxed mb-3">
              Used RV prices have a wide range. A functional older travel trailer might cost $8,000; a well-maintained used Class A diesel pusher from 2018 could run $150,000+. Be specific about what you need before you start shopping — floorplan type, sleeping capacity, length limits for your expected campsites, and any must-have features like residential fridge, solar, or slide-outs.
            </p>
            <p className="text-base leading-relaxed">
              Use MatchRV's AI deal scoring to understand whether any specific listing is priced fairly. Our engine compares each unit against recent comparable sales in the same region, flagging Great Deal, Good Deal, and Fair Deal ratings so you walk in negotiating from a position of knowledge.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Step 2: Choose the Right RV Type</h2>
            <p className="text-base leading-relaxed mb-3">
              Before you start scheduling walk-throughs, decide which category of RV fits your travel plans. The main decision is towable vs. motorized:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-base leading-relaxed">
              <li><strong className="text-[#161d1d]">Travel trailers</strong> — most affordable, biggest selection, require a tow vehicle but give you freedom to unhitch at camp.</li>
              <li><strong className="text-[#161d1d]">Fifth wheels</strong> — more stable and more spacious than travel trailers; require a pickup truck with a fifth-wheel hitch in the bed.</li>
              <li><strong className="text-[#161d1d]">Class C motorhomes</strong> — built on a truck chassis, good for families, easier to drive than Class A, no separate tow vehicle needed.</li>
              <li><strong className="text-[#161d1d]">Class A motorhomes</strong> — the largest option, most residential, highest purchase and operating costs.</li>
              <li><strong className="text-[#161d1d]">Class B campervans</strong> — most fuel-efficient, most maneuverable, least living space.</li>
            </ul>
            <p className="text-base leading-relaxed">
              Browse our category pages to see live inventory filtered by type: <Link href="/travel-trailers-for-sale" className="text-[#0B1117] font-semibold hover:underline">travel trailers</Link>, <Link href="/fifth-wheels-for-sale" className="text-[#0B1117] font-semibold hover:underline">fifth wheels</Link>, <Link href="/class-a-rvs-for-sale" className="text-[#0B1117] font-semibold hover:underline">Class A motorhomes</Link>, <Link href="/class-b-rvs-for-sale" className="text-[#0B1117] font-semibold hover:underline">Class B campervans</Link>, and <Link href="/class-c-rvs-for-sale" className="text-[#0B1117] font-semibold hover:underline">Class C motorhomes</Link>.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Step 3: Inspect for Water Damage — Thoroughly</h2>
            <p className="text-base leading-relaxed mb-3">
              Water damage is the single most important thing to inspect on any used RV. It's also the most common dealbreaker. Water infiltrates through roof seams, slide-out seals, window frames, and any penetration in the exterior skin — and it can silently rot the wood substructure for years before showing itself.
            </p>
            <h3 className="font-bold text-lg text-[#161d1d] mb-2">What to check:</h3>
            <ul className="list-disc pl-6 space-y-2 mb-4 text-base leading-relaxed">
              <li><strong className="text-[#161d1d]">Ceiling corners and around all windows</strong> — look for staining, bubbling paint, or soft spots.</li>
              <li><strong className="text-[#161d1d]">Roof seams and slide-out seals</strong> — climb up (or ask for a ladder) and inspect all seams. Cracked or separated lap sealant is a warning sign.</li>
              <li><strong className="text-[#161d1d]">Floors</strong> — walk every inch slowly. Soft, spongy, or springy areas indicate water-damaged subfloor.</li>
              <li><strong className="text-[#161d1d]">Underbelly</strong> — if you can access it, look for dark staining or mold.</li>
              <li><strong className="text-[#161d1d]">Inside wall panels</strong> — tap the walls. A hollow sound in unexpected areas can indicate delamination.</li>
            </ul>
            <p className="text-base leading-relaxed">
              A professional RV inspector typically charges $200–$400 and can catch issues you'd miss. For purchases over $30,000, this is almost always worth the fee. The National RV Inspectors Association (NRVIA) maintains a directory of certified inspectors.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Step 4: Test Every System</h2>
            <p className="text-base leading-relaxed mb-3">
              During your walk-through, run every system. Don't just look at them — use them. Dealers who won't let you run the systems are a red flag.
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-3 text-base leading-relaxed">
              <li>Run the furnace and air conditioner and let each run for at least 10 minutes.</li>
              <li>Test all appliances: stovetop burners, oven, microwave, refrigerator (check temp after running), and any washer/dryer.</li>
              <li>Fill the fresh water tank and run every faucet, including the outdoor shower if equipped. Check under every sink for leaks.</li>
              <li>Test the water heater — both gas and electric modes if it's a combo unit.</li>
              <li>Operate all slide-outs several times and inspect the seals for cracks or tears.</li>
              <li>Test the generator under load, if present.</li>
              <li>Inspect the batteries: check the age (often stamped on the battery), voltage under load, and look for corrosion on terminals.</li>
            </ul>
            <p className="text-base leading-relaxed">
              For motorhomes, drive it — not just around the parking lot. Accelerate on a highway ramp to check engine performance, test the brakes on a downhill, and listen for any concerning noises at highway speed.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Step 5: Negotiate the Right Price</h2>
            <p className="text-base leading-relaxed mb-3">
              RV prices have more room to negotiate than car prices. Dealers often have 10–20% margin on used inventory. Knowing the market value before you arrive is your biggest advantage.
            </p>
            <p className="text-base leading-relaxed mb-3">
              Reference points for negotiation: MatchRV's deal score, NADA RV values, and recent comparable sales in your region. If the inspection turned up items that need repair — a roof seal that needs resealing, a battery that needs replacing, a slide seal that's cracking — itemize the costs and deduct them from your offer. Dealers expect this.
            </p>
            <p className="text-base leading-relaxed">
              Don't forget to negotiate the "out-the-door" price, not just the list price. Documentation fees, freight charges, and dealer prep fees can add $500–$2,500 to the final cost. Ask for an itemized breakdown before signing anything.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Step 6: Complete Your Pre-Delivery Inspection (PDI)</h2>
            <p className="text-base leading-relaxed mb-3">
              Before you drive the RV off the lot, insist on a thorough PDI walkthrough with a technician who can show you how every system works. This is your opportunity to identify anything that wasn't functioning correctly before you signed — and to get it fixed at the dealer's cost.
            </p>
            <p className="text-base leading-relaxed mb-3">
              Bring a checklist and take your time. PDIs routinely take 2–3 hours for a complex RV. Don't let anyone rush you. Everything on the PDI checklist should work correctly before you take delivery.
            </p>
            <p className="text-base leading-relaxed">
              Get everything in writing — any repairs promised, any items to be ordered, any extended warranty terms. A verbal promise at the dealer is worth nothing after you drive away.
            </p>
          </section>
        </div>

        <div className="mt-12 bg-gradient-to-r from-[#0B1117] to-[#002829] rounded-[2rem] p-8 text-white">
          <h2 className="font-display font-black text-2xl mb-3">Ready to start shopping?</h2>
          <p className="text-white/80 mb-6">Browse thousands of used RVs with AI deal scoring on every listing — so you always know if the price is right.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/rvs-for-sale">
              <button className="bg-white text-[#0B1117] px-7 py-3.5 rounded-2xl font-black text-sm hover:bg-[#eef5f4] transition-colors inline-flex items-center gap-2">
                Browse RVs for Sale <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <Link href="/guides">
              <button className="border-2 border-white/50 text-white px-7 py-3.5 rounded-2xl font-bold text-sm hover:border-white hover:bg-white/10 transition-colors inline-flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> More Buyer Guides
              </button>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
