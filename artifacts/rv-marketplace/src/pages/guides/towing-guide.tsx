import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { ArrowRight, Clock } from "lucide-react";

export function TowingGuide() {
  return (
    <Layout>
      <SEO
        title="RV Towing Guide: Match Your Tow Vehicle & Trailer | MatchRV"
        description="How to safely match your truck or SUV to a travel trailer or fifth wheel. Understand towing capacity, GVWR, payload, tongue weight, and hitch requirements before you buy."
        canonical="/guides/towing-guide"
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Buyer Guides", href: "/guides" },
          { name: "RV Towing Guide", href: "/guides/towing-guide" },
        ]}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <nav className="text-[#3b4949] text-sm mb-6 flex items-center gap-2">
          <Link href="/" className="hover:text-[#0B1117] transition-colors">Home</Link>
          <span>/</span>
          <Link href="/guides" className="hover:text-[#0B1117] transition-colors">Buyer Guides</Link>
          <span>/</span>
          <span className="text-[#161d1d]">RV Towing Guide</span>
        </nav>

        <div className="flex items-center gap-3 mb-4">
          <span className="bg-orange-100 text-orange-800 text-xs font-bold px-3 py-1 rounded">Technical</span>
          <div className="flex items-center gap-1 text-[#3b4949] text-sm">
            <Clock className="w-4 h-4" />
            <span>8 min read</span>
          </div>
        </div>

        <h1 className="font-display font-black text-3xl md:text-4xl text-[#161d1d] mb-4 leading-tight">
          RV Towing Guide: How to Match Your Tow Vehicle to Your Trailer
        </h1>
        <p className="text-[#3b4949] text-lg leading-relaxed mb-10">
          Towing beyond your vehicle's rated capacity is one of the most dangerous and most common mistakes RV buyers make. Understanding the numbers before you buy protects your family, your vehicle, and the other drivers on the road.
        </p>

        <div className="space-y-10 text-[#3b4949]">
          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">The Four Numbers You Need to Know</h2>

            <h3 className="font-bold text-xl text-[#161d1d] mb-3">1. Tow Vehicle's Maximum Tow Rating</h3>
            <p className="text-base leading-relaxed mb-4">
              Every pickup truck, SUV, and van has a published maximum tow rating — the heaviest trailer it can tow. This number is found in the owner's manual and is specific to the trim level, engine, axle ratio, and optional tow package on your vehicle. Never use the window sticker number or a generic number from a commercial — always consult the owner's manual for your specific vehicle configuration.
            </p>
            <p className="text-base leading-relaxed mb-4">
              Important: the maximum tow rating assumes your truck is empty — no passengers, no cargo in the bed, no weight in the cabin. The moment you add people, gear, and a loaded bed, your effective tow capacity drops.
            </p>

            <h3 className="font-bold text-xl text-[#161d1d] mb-3">2. Trailer's Gross Vehicle Weight Rating (GVWR)</h3>
            <p className="text-base leading-relaxed mb-4">
              GVWR is the maximum legal weight of the trailer when fully loaded — including fresh water, food, clothing, gear, and passengers. This number is on the trailer's VIN plate, usually located near the door hinge. GVWR must be lower than your vehicle's maximum tow rating. If the trailer's GVWR exceeds your truck's max tow rating, you cannot safely tow that trailer, period.
            </p>
            <p className="text-base leading-relaxed mb-4">
              Note: Unloaded Vehicle Weight (UVW) or "dry weight" is what the trailer weighs from the factory with no water, no gear, and no propane. This number is dramatically lower than the GVWR and is commonly used in misleading marketing. Always use GVWR, not dry weight, when evaluating whether a trailer is towable with your vehicle.
            </p>

            <h3 className="font-bold text-xl text-[#161d1d] mb-3">3. Payload Capacity</h3>
            <p className="text-base leading-relaxed mb-4">
              Payload capacity is the maximum weight your truck can carry — in the cab, in the bed, and on the hitch. It's calculated as: GVWR of the tow vehicle minus the curb weight of the tow vehicle. You can find your specific payload on the yellow sticker inside the driver's door jamb.
            </p>
            <p className="text-base leading-relaxed mb-4">
              Why does payload matter for towing? Because the tongue weight of your trailer (see below) counts against your payload. A family of four passengers in a crew cab truck might use 600–800 lbs of payload before you've added a single piece of gear. This leaves less room for tongue weight — and many truck/trailer combinations that look acceptable on tow rating alone exceed the truck's actual payload when loaded.
            </p>

            <h3 className="font-bold text-xl text-[#161d1d] mb-3">4. Tongue Weight</h3>
            <p className="text-base leading-relaxed mb-4">
              Tongue weight is the downward force the trailer exerts on the hitch ball. For a conventional travel trailer, it should be 10–15% of the trailer's actual loaded weight. Too little tongue weight (under 10%) causes trailer sway — the most dangerous towing condition, where the trailer fishtails and can cause a jackknife crash. Too much tongue weight overloads the rear axle of your truck and can cause loss of front-axle steering control.
            </p>
            <p className="text-base leading-relaxed">
              The tongue weight of your loaded trailer must not exceed your truck's rear Gross Axle Weight Rating (GAWR) minus the rear axle weight when empty. Check the owner's manual for your specific truck's tongue weight rating — it's a separate number from the maximum tow rating and payload capacity.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">What Can Common Vehicles Tow?</h2>
            <div className="bg-[#eef5f4] rounded-2xl p-5 mb-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="font-black text-[#3b4949] text-xs uppercase tracking-widest">Vehicle</div>
                <div className="font-black text-[#3b4949] text-xs uppercase tracking-widest">Max Tow Rating</div>
                <div className="font-semibold text-[#161d1d] border-t border-[#E2E8F0] pt-2">Toyota 4Runner (base)</div>
                <div className="text-[#3b4949] border-t border-[#E2E8F0] pt-2">5,000 lbs</div>
                <div className="font-semibold text-[#161d1d]">Ford F-150 (max tow pkg)</div>
                <div className="text-[#3b4949]">13,000–14,000 lbs</div>
                <div className="font-semibold text-[#161d1d]">Ram 2500 (diesel)</div>
                <div className="text-[#0B1117] font-bold">19,680 lbs</div>
                <div className="font-semibold text-[#161d1d]">Ford F-350 dually (diesel)</div>
                <div className="text-[#0B1117] font-bold">21,000 lbs</div>
                <div className="font-semibold text-[#161d1d]">Chevy Tahoe (max pkg)</div>
                <div className="text-[#3b4949]">8,400 lbs</div>
                <div className="font-semibold text-[#161d1d]">Ram 1500 (max tow pkg)</div>
                <div className="text-[#3b4949]">12,750 lbs</div>
              </div>
            </div>
            <p className="text-sm text-[#3b4949] italic">
              These are maximum ratings — always verify your specific vehicle's configuration in the owner's manual. Ratings vary significantly by engine, cab size, bed length, and axle ratio.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Hitch Requirements by Trailer Type</h2>

            <h3 className="font-bold text-lg text-[#161d1d] mb-2">Travel Trailers: Weight Distribution Hitches</h3>
            <p className="text-base leading-relaxed mb-4">
              Travel trailers over 5,000 lbs loaded almost always require a weight distribution hitch (WDH) — not just a ball hitch. A WDH uses spring bars to redistribute tongue weight from the rear axle to all four wheels, leveling the truck and trailer and restoring front-axle steering and braking effectiveness. They typically cost $300–$600 for the hitch plus $100–$200 for professional installation.
            </p>
            <p className="text-base leading-relaxed mb-4">
              Sway control is a separate component — either a friction sway bar or an electronic sway control system integrated with the trailer brakes. For trailers over 6,000 lbs, sway control is strongly recommended. For trailers over 10,000 lbs, it's essentially mandatory.
            </p>

            <h3 className="font-bold text-lg text-[#161d1d] mb-2">Fifth Wheels: Fifth-Wheel Hitches</h3>
            <p className="text-base leading-relaxed mb-4">
              <Link href="/fifth-wheels-for-sale" className="text-[#0B1117] font-semibold hover:underline">Fifth wheels</Link> require a completely different hitch — a kingpin coupling that mounts in the bed of a pickup truck. The fifth-wheel hitch costs $500–$1,200 and takes up significant bed space. This is why fifth wheels can only be towed by pickup trucks — the hitch physically can't be installed in an SUV or van.
            </p>
            <p className="text-base leading-relaxed">
              Fifth-wheel towing is inherently more stable than travel trailer towing because the coupling point is over the rear axle, not behind it. The tongue weight (called pin weight for fifth wheels) is typically 20–25% of the trailer's loaded weight — higher than a travel trailer's tongue weight, but distributed directly over the axle rather than behind it.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">The 80% Towing Rule</h2>
            <p className="text-base leading-relaxed mb-3">
              RV technicians and towing professionals widely recommend the "80% rule" — never tow more than 80% of your vehicle's maximum rated tow capacity for regular use. If your truck is rated at 12,000 lbs, keep your trailer's GVWR under 9,600 lbs.
            </p>
            <p className="text-base leading-relaxed">
              Why? Maximum ratings are engineering limits calculated under ideal conditions. Real-world towing involves mountain passes, headwinds, loaded trailers that exceed their own GVWR, and tow vehicles carrying passengers and gear. The 80% margin gives you a practical safety buffer — particularly important for transmission temperature, brake fade on mountain descents, and sway stability.
            </p>
          </section>

          <section>
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-4">Before You Buy a Trailer</h2>
            <ol className="list-decimal pl-6 space-y-3 text-base leading-relaxed">
              <li>Find your truck's tow rating, payload capacity, and tongue weight rating in the owner's manual — not online guides, not the window sticker.</li>
              <li>Identify the GVWR of any trailer you're considering, not the dry weight or UVW.</li>
              <li>Calculate your truck's effective payload after accounting for passengers and gear (typical family of 4 in a crew cab: ~900 lbs before gear).</li>
              <li>Confirm that the trailer's tongue weight (10–15% of GVWR for travel trailers) fits within your remaining payload capacity.</li>
              <li>If the numbers are close to the limits, go down in trailer size. The 80% rule gives you the margin you need.</li>
            </ol>
          </section>
        </div>

        <div className="mt-12 bg-gradient-to-r from-[#0B1117] to-[#002829] rounded-[2rem] p-8 text-white">
          <h2 className="font-display font-black text-2xl mb-3">Find trailers that fit your tow vehicle</h2>
          <p className="text-white/80 mb-6">Browse travel trailers and fifth wheels by weight, length, and type — with AI deal scoring on every listing.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/travel-trailers-for-sale">
              <button className="bg-white text-[#0B1117] px-7 py-3.5 rounded-2xl font-black text-sm hover:bg-[#eef5f4] transition-colors inline-flex items-center gap-2">
                Travel Trailers <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <Link href="/fifth-wheels-for-sale">
              <button className="border-2 border-white/50 text-white px-7 py-3.5 rounded-2xl font-bold text-sm hover:border-white hover:bg-white/10 transition-colors">
                Fifth Wheels
              </button>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
