import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { MapPin, Star, Trees, Phone, ExternalLink, Tent, Wifi, Car, Waves } from "lucide-react";

const KM_LOCATIONS = [
  { name: "Lake Limerick Country Club", city: "Shelton", region: "South Sound", highlight: "Golf, lake swimming & full hookups" },
  { name: "Ponderosa Falls", city: "Spokane Valley", region: "Eastern WA", highlight: "Wooded retreat near the city" },
  { name: "Suncrest Resort", city: "Deer Park", region: "Eastern WA", highlight: "Peaceful meadows & mountain views" },
  { name: "Tall Timber RV Park", city: "Morton", region: "South Cascades", highlight: "Old-growth forest setting" },
  { name: "Harmony Lakeside RV Park", city: "Silver Lake", region: "South WA", highlight: "Waterfront sites on Silver Lake" },
  { name: "Rainbow Resort", city: "Republic", region: "Ferry County", highlight: "Remote fishing & hiking base camp" },
  { name: "Camp Lazy J", city: "Orondo", region: "North Central WA", highlight: "Columbia River views & orchards" },
  { name: "Lakeside RV Park", city: "Chelan", region: "Lake Chelan", highlight: "Minutes from Lake Chelan wine country" },
  { name: "Elbe RV Park", city: "Elbe", region: "Mt. Rainier Foothills", highlight: "Gateway to Mt. Rainier National Park" },
  { name: "Beacon Rock Resort", city: "North Bonneville", region: "Columbia River Gorge", highlight: "Gorge views & river access" },
];

const AMENITIES = [
  { icon: Wifi, label: "Free WiFi at select parks" },
  { icon: Car, label: "Full hookup & pull-through sites" },
  { icon: Waves, label: "Swimming, fishing & water access" },
  { icon: Trees, label: "Wooded & meadow settings" },
  { icon: Tent, label: "Seasonal & annual memberships" },
  { icon: Star, label: "Pet-friendly parks" },
];

export function Campgrounds() {
  return (
    <Layout>
      <SEO
        title="Campground Finder & Trip Planner — Washington RV Parks | MatchRV"
        description="Find the best RV campgrounds in Washington state. KM Resorts featured — 10+ locations from the Cascades to the Columbia River Gorge."
        canonical="https://matchrv.com/campgrounds"
      />

      <section className="bg-[#0B1117] text-white py-14 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-white/10 border border-white/20">
            <MapPin className="w-3.5 h-3.5 text-[#00CED1]" />
            <span className="text-xs font-black uppercase tracking-widest text-[#00CED1]">Campground Finder</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-display font-black tracking-tighter mb-4">
            Find Your Perfect Camp
          </h1>
          <p className="text-white/70 text-base leading-relaxed max-w-2xl mx-auto">
            Washington has some of the most stunning RV country in North America — from the rainy coast to high desert plateaus. Start here.
          </p>
        </div>
      </section>

      <section className="bg-[#f4fbfa] py-16 px-4">
        <div className="max-w-5xl mx-auto">

          <div className="flex flex-col md:flex-row gap-8 items-start mb-14">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-[#0B1117]/10 text-[#0B1117] text-xs font-black uppercase tracking-wider">
                <Star className="w-3.5 h-3.5" /> Featured Partner
              </div>
              <h2 className="text-3xl sm:text-4xl font-display font-black tracking-tighter text-[#161d1d] mb-4">
                KM Resorts of Washington
              </h2>
              <p className="text-[#3b4949] text-base leading-relaxed mb-4">
                KM Resorts operates <strong>10+ RV parks and campgrounds across Washington state</strong>, making them one of the largest and most loved resort networks in the Pacific Northwest. From lakefront retreats on Silver Lake to mountain getaways near Mt. Rainier, KM has a home base for every adventure.
              </p>
              <p className="text-[#3b4949] text-base leading-relaxed mb-6">
                Whether you're a weekend warrior or a full-time RVer, KM Resorts offers affordable seasonal memberships, nightly stays, and full-hookup sites — all in the kinds of settings Washington is famous for.
              </p>
              <a
                href="https://www.kmresorts.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#0B1117] text-white font-black text-sm hover:bg-[#002829] transition-colors"
              >
                Visit KM Resorts <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            <div className="md:w-80 flex-shrink-0">
              <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-sm">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-[#0B1117] flex items-center justify-center mx-auto mb-3">
                    <Trees className="w-8 h-8 text-[#00CED1]" />
                  </div>
                  <div className="font-display font-black text-2xl text-[#0B1117]">10+</div>
                  <div className="text-sm text-[#6b7a7a]">Locations across WA</div>
                </div>
                <div className="space-y-3">
                  {AMENITIES.map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-3 text-sm text-[#3b4949]">
                      <div className="w-7 h-7 rounded-lg bg-[#f0f7f4] flex items-center justify-center flex-shrink-0">
                        <Icon className="w-3.5 h-3.5 text-[#0B1117]" />
                      </div>
                      {label}
                    </div>
                  ))}
                </div>
                <div className="mt-5 pt-5 border-t border-[#E2E8F0] flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-[#0B1117]" />
                  <span className="text-[#3b4949]">
                    <a href="https://www.kmresorts.com" target="_blank" rel="noopener noreferrer" className="text-[#0B1117] font-semibold hover:underline">kmresorts.com</a>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <h3 className="text-xl font-display font-black text-[#161d1d] mb-6">KM Resorts Locations in Washington</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
            {KM_LOCATIONS.map((loc) => (
              <div key={loc.name} className="bg-white rounded-2xl border border-[#E2E8F0] p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#f0f7f4] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4 text-[#0B1117]" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[#161d1d] leading-tight">{loc.name}</div>
                    <div className="text-xs text-[#6b7a7a] mt-0.5">{loc.city} · {loc.region}</div>
                    <div className="text-xs text-[#3b4949] mt-2 leading-relaxed">{loc.highlight}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-[#0B1117] rounded-3xl p-8 md:p-10 text-white text-center">
            <h3 className="text-2xl font-display font-black tracking-tighter mb-3">Plan Your Trip with MatchRV</h3>
            <p className="text-white/70 text-sm leading-relaxed max-w-lg mx-auto mb-6">
              Already have your RV picked out? Use our AI Outfitter to match you with the right rig for Washington camping — then browse live dealer inventory to find it near you.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="/match"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#00CED1] text-[#0B1117] font-black text-sm hover:bg-[#93d5ad] transition-colors"
              >
                Get My RV Match
              </a>
              <a
                href="/trips"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white/10 border border-white/20 text-white font-black text-sm hover:bg-white/20 transition-colors"
              >
                Trip Planner
              </a>
            </div>
          </div>

        </div>
      </section>
    </Layout>
  );
}
