import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { MapPin, Star, Shield, TrendingUp, ArrowRight, Building2 } from "lucide-react";

const STATE_LINKS = [
  { state: "Washington", slug: "wa" },
  { state: "Oregon", slug: "or" },
  { state: "California", slug: "ca" },
  { state: "Texas", slug: "tx" },
  { state: "Florida", slug: "fl" },
  { state: "Colorado", slug: "co" },
  { state: "Arizona", slug: "az" },
  { state: "Montana", slug: "mt" },
  { state: "Idaho", slug: "id" },
  { state: "Nevada", slug: "nv" },
  { state: "Utah", slug: "ut" },
  { state: "Tennessee", slug: "tn" },
];

const TRUST_SIGNALS = [
  {
    icon: Shield,
    title: "Verified Inventory",
    description: "Every listing is verified for accuracy. No duplicate VINs, no ghost listings — just real RVs from real dealers.",
  },
  {
    icon: Star,
    title: "AI-Scored Deals",
    description: "Our pricing engine compares each unit against recent comparable sales to score every listing as Great, Good, or Fair Deal.",
  },
  {
    icon: TrendingUp,
    title: "Buyer Intent Data",
    description: "Dealers gain access to aggregated search trends and buyer behavior data to price inventory more competitively.",
  },
  {
    icon: Building2,
    title: "Multi-Location Support",
    description: "Whether you operate one lot or twelve, MatchRV supports multi-rooftop dealer groups with centralized inventory management.",
  },
];

export function RvDealers() {
  return (
    <Layout>
      <SEO
        title="RV Dealers Near You | Find Local RV Dealerships | MatchRV"
        description="Find RV dealers near you in Washington, Oregon, California, Texas, Florida, Colorado, and more. MatchRV connects buyers with verified dealers and real inventory."
        canonical="/rv-dealers"
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "RV Dealers", href: "/rv-dealers" },
        ]}
      />

      <div className="bg-gradient-to-br from-[#0B1117] to-[#002829] text-white py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <nav className="text-[#00CED1]/70 text-sm mb-4 flex items-center justify-center gap-2">
            <Link href="/" className="hover:text-[#00CED1] transition-colors">Home</Link>
            <span>/</span>
            <span className="text-[#00CED1]">RV Dealers</span>
          </nav>
          <h1 className="font-display font-black text-3xl md:text-5xl mb-4 leading-tight">
            Find RV Dealers Near You
          </h1>
          <p className="text-white/80 text-base max-w-2xl mx-auto leading-relaxed">
            MatchRV partners with verified RV dealers across the country. Browse by state to find dealerships near you, or search our full inventory to see every listing from every dealer on our platform.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-12">
          <h2 className="font-display font-black text-2xl text-[#161d1d] mb-2">Browse Dealers by State</h2>
          <p className="text-[#6b7a7a] text-sm mb-8">Select a state to browse RV dealers and their available inventory near you.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {STATE_LINKS.map(({ state, slug }) => (
              <Link key={slug} href={`/browse?state=${slug.toUpperCase()}`}>
                <div className="group flex items-center gap-2 p-4 rounded-2xl border-2 border-[#E2E8F0] bg-white hover:border-[#0B1117] hover:shadow-md transition-all cursor-pointer">
                  <MapPin className="w-4 h-4 text-[#2a6a4a] shrink-0 group-hover:text-[#0B1117]" />
                  <span className="font-bold text-sm text-[#161d1d] group-hover:text-[#0B1117] transition-colors">{state}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-[#eef5f4] rounded-[2rem] p-8 md:p-12 mb-12">
          <div className="max-w-3xl">
            <h2 className="font-display font-black text-2xl md:text-3xl text-[#161d1d] mb-4">
              About RV Dealer Listings on MatchRV
            </h2>
            <p className="text-[#3b4949] text-base leading-relaxed mb-4">
              MatchRV aggregates real-time inventory from RV dealerships across the United States. Our platform indexes listings from independent dealers, multi-rooftop dealer groups, and franchise networks — giving buyers the most comprehensive view of available inventory in any region.
            </p>
            <p className="text-[#3b4949] text-base leading-relaxed mb-6">
              Every listing is processed through our AI deal scoring engine, which compares each unit's price against recent comparable sales in the same region. This means buyers always know whether they're looking at a great deal, a fair price, or an overpriced unit — before they ever contact a dealer.
            </p>
            <Link href="/browse">
              <button className="inline-flex items-center gap-2 bg-[#0B1117] text-white px-6 py-3.5 rounded-2xl font-bold text-sm hover:bg-[#002829] transition-colors">
                Search All Dealer Inventory <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </div>
        </div>

        <div className="mb-12">
          <h2 className="font-display font-black text-2xl text-[#161d1d] mb-8">Why Buyers Trust MatchRV Dealers</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TRUST_SIGNALS.map(({ icon: Icon, title, description }) => (
              <div key={title} className="bg-white rounded-2xl p-6 border border-[#E2E8F0] flex gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#0B1117]/10 flex items-center justify-center shrink-0">
                  <Icon className="w-6 h-6 text-[#0B1117]" />
                </div>
                <div>
                  <h3 className="font-bold text-[#161d1d] mb-1">{title}</h3>
                  <p className="text-[#6b7a7a] text-sm leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-r from-[#924c00] to-[#b85d00] rounded-[2rem] p-8 md:p-12 text-white">
          <div className="max-w-2xl">
            <h2 className="font-display font-black text-2xl md:text-3xl mb-3">Are You a Dealer?</h2>
            <p className="text-white/80 text-base leading-relaxed mb-6">
              Get your inventory in front of serious RV buyers. MatchRV delivers qualified, intent-driven traffic from buyers who are actively searching — not just browsing. Join our dealer network to list your inventory, access buyer insights, and grow your leads.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/dealers">
                <button className="bg-white text-[#924c00] px-7 py-3.5 rounded-2xl font-black text-sm hover:bg-[#fff8f0] transition-colors">
                  Learn About Dealer Tools
                </button>
              </Link>
              <Link href="/contact">
                <button className="border-2 border-white/50 text-white px-7 py-3.5 rounded-2xl font-bold text-sm hover:border-white hover:bg-white/10 transition-colors">
                  Contact Our Team
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
