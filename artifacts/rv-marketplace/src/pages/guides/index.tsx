import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { BookOpen, Clock, ArrowRight } from "lucide-react";

const GUIDES = [
  {
    slug: "how-to-buy-a-used-rv",
    title: "How to Buy a Used RV",
    description: "The complete step-by-step guide to purchasing a used RV — from setting your budget to completing the PDI inspection. What to look for, what to avoid, and how to negotiate the best price.",
    readTime: "9 min read",
    category: "Buying Guide",
  },
  {
    slug: "best-rvs-for-families",
    title: "Best RVs for Families",
    description: "Kid-friendly floorplans, bunkhouse layouts, and family features to look for in a travel trailer, fifth wheel, or motorhome. Our recommendations by budget and family size.",
    readTime: "7 min read",
    category: "Buying Guide",
  },
  {
    slug: "best-rvs-for-full-time-living",
    title: "Best RVs for Full-Time Living",
    description: "What to prioritize when choosing an RV to live in year-round — storage, bathroom quality, build durability, and the layouts that actually work for day-to-day life.",
    readTime: "10 min read",
    category: "Lifestyle",
  },
  {
    slug: "motorhome-vs-travel-trailer",
    title: "Motorhome vs Travel Trailer: Which Is Right for You?",
    description: "A practical breakdown of the real differences between motorhomes and towable RVs — cost, convenience, driving experience, campsite flexibility, and long-term ownership.",
    readTime: "8 min read",
    category: "Comparison",
  },
  {
    slug: "rv-financing-guide",
    title: "RV Financing Guide",
    description: "How RV loans work, what rates to expect, how your credit score affects your rate, and tips for getting the best financing terms — whether you're buying new or used.",
    readTime: "7 min read",
    category: "Finance",
  },
  {
    slug: "towing-guide",
    title: "RV Towing Guide: How to Match Your Tow Vehicle",
    description: "Understand towing capacity, Gross Vehicle Weight Rating, tongue weight, and payload — and how to find out exactly what your truck or SUV can safely tow.",
    readTime: "8 min read",
    category: "Technical",
  },
  {
    slug: "tow-vehicle-guide",
    title: "How to Match Your Tow Vehicle to an RV",
    description: "Learn exactly how to match your truck, SUV, or crossover to the right RV using GVWR, payload, and tongue weight. Avoid the most dangerous and expensive mistake in RV buying.",
    readTime: "10 min read",
    category: "Technical",
  },
  {
    slug: "travel-trailer-vs-fifth-wheel",
    title: "Travel Trailer vs Fifth Wheel: The Honest Comparison",
    description: "Travel trailer or fifth wheel? We break down towing, cost, livability, maneuverability, and which is better for your situation. No dealer spin — just the facts.",
    readTime: "9 min read",
    category: "Comparison",
  },
  {
    slug: "rv-cost-guide",
    title: "How Much Does an RV Cost in 2025? Complete Price Guide",
    description: "Full breakdown of 2025 RV prices for travel trailers, fifth wheels, Class A, B, and C motorhomes. Includes new vs. used comparison, ownership costs, and budget tips.",
    readTime: "8 min read",
    category: "Finance",
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  "Buying Guide": "bg-emerald-100 text-emerald-800",
  "Lifestyle": "bg-blue-100 text-blue-800",
  "Comparison": "bg-purple-100 text-purple-800",
  "Finance": "bg-amber-100 text-amber-800",
  "Technical": "bg-orange-100 text-orange-800",
};

export function GuidesIndex() {
  return (
    <Layout>
      <SEO
        title="RV Buyer Guides | Expert Advice for RV Shoppers | MatchRV"
        description="Free RV buying guides from MatchRV. Learn how to buy a used RV, choose the best motorhome for families, finance your RV, and match your tow vehicle — all in one place."
        canonical="/guides"
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Buyer Guides", href: "/guides" },
        ]}
      />

      <div className="bg-gradient-to-br from-[#0B1117] to-[#002829] text-white py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <nav className="text-[#00CED1]/70 text-sm mb-4 flex items-center justify-center gap-2">
            <Link href="/" className="hover:text-[#00CED1] transition-colors">Home</Link>
            <span>/</span>
            <span className="text-[#00CED1]">Buyer Guides</span>
          </nav>
          <div className="flex items-center justify-center gap-3 mb-4">
            <BookOpen className="w-8 h-8 text-[#00CED1]" />
          </div>
          <h1 className="font-display font-black text-3xl md:text-5xl mb-4 leading-tight">
            RV Buyer Guides
          </h1>
          <p className="text-white/80 text-base max-w-2xl mx-auto leading-relaxed">
            Buying an RV is a big decision. Our guides give you the honest, specific advice you need to choose the right RV, get the best price, and avoid expensive mistakes.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {GUIDES.map((guide) => (
            <Link key={guide.slug} href={`/guides/${guide.slug}`}>
              <div className="group bg-white rounded-[1.5rem] p-6 border border-[#E2E8F0] hover:border-[#0B1117] hover:shadow-xl transition-all duration-300 cursor-pointer h-full flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  <span className={`text-xs font-bold px-3 py-1 rounded ${CATEGORY_COLORS[guide.category] ?? "bg-gray-100 text-gray-700"}`}>
                    {guide.category}
                  </span>
                  <div className="flex items-center gap-1 text-[#3b4949] text-xs">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{guide.readTime}</span>
                  </div>
                </div>
                <h2 className="font-display font-black text-lg text-[#161d1d] group-hover:text-[#0B1117] transition-colors mb-3 leading-snug">
                  {guide.title}
                </h2>
                <p className="text-[#3b4949] text-sm leading-relaxed flex-1 mb-5">
                  {guide.description}
                </p>
                <div className="flex items-center gap-2 text-[#0B1117] font-bold text-sm group-hover:gap-3 transition-all">
                  Read Guide <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-16 bg-[#eef5f4] rounded-[2rem] p-8 text-center">
          <h2 className="font-display font-black text-2xl text-[#161d1d] mb-3">Ready to start shopping?</h2>
          <p className="text-[#3b4949] text-sm mb-6 max-w-md mx-auto">Browse our full inventory with AI-powered deal scoring on every listing. Find your perfect RV at the right price.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/browse">
              <button className="bg-[#0B1117] text-white px-7 py-3.5 rounded-2xl font-bold text-sm hover:bg-[#002829] transition-colors">
                Browse All RVs
              </button>
            </Link>
            <Link href="/rvs-for-sale">
              <button className="border-2 border-[#0B1117] text-[#0B1117] px-7 py-3.5 rounded-2xl font-bold text-sm hover:bg-[#0B1117] hover:text-white transition-colors">
                Shop by Type
              </button>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
