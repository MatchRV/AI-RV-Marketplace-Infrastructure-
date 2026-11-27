import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { useGetListings } from "@workspace/api-client-react";
import { trackEvent } from "@/lib/analytics";
import { InventoryCoverage, TypeCount } from "@/components/inventory-coverage";
import { useInventoryTotal } from "@/hooks/use-inventory-total";
import { OUTFITTER_PROMPT_KEY } from "@/lib/site-host";
import { RV_COUNT_PLACEHOLDER, RV_COUNT_LIVE_STATUS, RV_COUNT_UNAVAILABLE_STATUS, formatCount } from "@/config/site";
import {
  ArrowRight,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Star,
  Shield,
  RefreshCw,
  Search,
  BadgeCheck,
  Users,
  Ruler,
  Scale,
  Compass,
  MapPin,
} from "lucide-react";

const faqs = [
  {
    question: "What is the Match Report?",
    answer: "It's a personalized report that narrows the entire RV market down to three specific RVs that fit your situation: a Best Overall pick, a Best Value pick, and an Upgrade Option worth considering. Each pick includes why it fits, honest tradeoffs, and a price-vs-market read.",
  },
  {
    question: "Is it really free?",
    answer: "Yes — completely free. Free to take the quiz, free to see your full report, free to browse every recommendation. We make money helping dealers connect with serious buyers, not by charging you.",
  },
  {
    question: "How long does the quiz take?",
    answer: "Just a few questions: how you'll use it, who's coming, towable vs. motorhome, your tow vehicle, budget, camping style, and any must-haves.",
  },
  {
    question: "How is MatchRV different from RVTrader or Craigslist?",
    answer: "Those are listing dumps — thousands of RVs and you do all the filtering yourself. MatchRV connects dealer inventory to buyers shopping through AI, and can also narrow it down to three picks worth your attention with a free Match Report.",
  },
  {
    question: "Are the picks just the cheapest RVs?",
    answer: "No. Best Overall is scored on fit — tow safety, sleeping capacity, camping style, features. Best Value is the strongest deal in your range. Upgrade is a stretch pick that might be worth the extra spend, with the tradeoffs spelled out. We never recommend on price alone.",
  },
  {
    question: "Do I need an account to browse inventory?",
    answer: "No. Browse all listings, view details, and compare RVs freely. An account lets you save favorites, set price alerts, and receive personalized recommendations.",
  },
];

const TESTIMONIALS = [
  {
    name: "Kevin M.",
    initial: "K",
    location: "Tacoma, WA",
    text: "I was about to buy the wrong RV — the Match Report caught a tow weight issue with my truck that I had completely missed. Saved me from a very expensive mistake.",
    stars: 5,
    featured: false,
  },
  {
    name: "Renee & Tom S.",
    initial: "R",
    location: "Bellevue, WA",
    text: "We looked at RVTrader for weeks and felt overwhelmed. MatchRV pointed us to three specific units and explained exactly why each one fit our camping style. Bought the Best Overall pick!",
    stars: 5,
    featured: true,
  },
  {
    name: "Doug H.",
    initial: "D",
    location: "Spokane, WA",
    text: "The Best Value pick was $4,800 under market price. I never would have found it scrolling through listings on my own. Got a third-party inspection, bought it, love it.",
    stars: 5,
    featured: false,
  },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#E2E8F0] last:border-0">
      <button
        className="w-full flex items-center justify-between py-5 text-left gap-4"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="font-semibold text-[#161d1d] text-base">{question}</span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-[#00696b] flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[#3b4949] flex-shrink-0" />
        )}
      </button>
      <div hidden={!open} className="pb-5 text-[#3b4949] text-sm leading-relaxed">
        {answer}
      </div>
    </div>
  );
}

function formatType(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function HomepageListingCard({ listing }: { listing: {
  id: number; title: string; make: string; model: string; year: number;
  type: string; price: number; sleeps: number; dryWeight?: number | null;
  length?: number | null; images: string[]; dealScore: string; isFeatured?: boolean;
  location?: string;
}}) {
  const hasImage = listing.images && listing.images.length > 0;
  const badgeLabel =
    listing.dealScore === "great_deal" ? "Best Overall" :
    listing.dealScore === "good_deal" ? "Best Value" :
    listing.isFeatured ? "Featured" : null;
  const badgeColor =
    listing.dealScore === "great_deal" ? "bg-[#00CED1] text-[#0B1117]" :
    listing.dealScore === "good_deal" ? "bg-[#ffe08b] text-[#241a00]" :
    "bg-[#0B1117] text-white";

  return (
    <Link href={`/listing/${listing.id}`}>
      <div className="glass-panel rounded-2xl overflow-hidden flex flex-col group h-full cursor-pointer hover:border-[#00CED1]/30 transition-colors">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {hasImage ? (
            <img
              src={listing.images[0]}
              alt={listing.title}
              width={400}
              height={300}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#bac9c9]">
              <Compass className="w-16 h-16" />
            </div>
          )}
          {badgeLabel && (
            <div className={`absolute top-4 left-4 ${badgeColor} text-xs font-bold px-3 py-1 rounded uppercase tracking-wider`}>
              {badgeLabel}
            </div>
          )}
        </div>
        <div className="p-5 flex flex-col flex-grow">
          <div className="flex justify-between items-start mb-1">
            <h3 className="font-display font-bold text-[#161d1d] leading-tight text-base">
              {listing.make} {listing.model}
            </h3>
            <span className="text-[#00696b] font-bold text-sm whitespace-nowrap ml-2">
              ${listing.price.toLocaleString()}
            </span>
          </div>
          <p className="text-[#3b4949] text-xs mb-4">{listing.year} · {formatType(listing.type)}</p>
          <div className="mt-auto flex justify-between border-t border-[#E2E8F0] pt-4">
            {listing.sleeps > 0 && (
              <div className="flex flex-col items-center gap-1">
                <Users className="w-4 h-4 text-[#00696b]" />
                <span className="text-[10px] text-[#3b4949] uppercase">Sleeps {listing.sleeps}</span>
              </div>
            )}
            {listing.dryWeight && (
              <div className="flex flex-col items-center gap-1">
                <Scale className="w-4 h-4 text-[#00696b]" />
                <span className="text-[10px] text-[#3b4949] uppercase">{listing.dryWeight.toLocaleString()} lbs</span>
              </div>
            )}
            {listing.length && (
              <div className="flex flex-col items-center gap-1">
                <Ruler className="w-4 h-4 text-[#00696b]" />
                <span className="text-[10px] text-[#3b4949] uppercase">{listing.length}'</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

const SHOP_TYPES: Array<{ type: "travel_trailer" | "fifth_wheel" | "class_a" | "class_c" | "toy_hauler"; label: string; href: string }> = [
  { type: "travel_trailer", label: "Travel trailers", href: "/travel-trailers-for-sale" },
  { type: "fifth_wheel", label: "Fifth wheels", href: "/fifth-wheels-for-sale" },
  { type: "class_a", label: "Class A", href: "/class-a-rvs-for-sale" },
  { type: "class_c", label: "Class C", href: "/class-c-rvs-for-sale" },
  { type: "toy_hauler", label: "Toy haulers", href: "/toy-haulers-for-sale" },
];

export function Home() {
  const [, navigate] = useLocation();
  const [prompt, setPrompt] = useState("");
  const liveTotal = useInventoryTotal();
  const { data: listingsData } = useGetListings(
    { limit: 4 },
    {
      query: {
        queryKey: ["/api/listings", { limit: 4, scope: "home-strip" }],
      },
    },
  );
  const featuredListings = listingsData?.listings ?? [];
  const bgVideoRef = useRef<HTMLVideoElement>(null);

  function askOutfitter(event: FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (text) {
      try { sessionStorage.setItem(OUTFITTER_PROMPT_KEY, text); } catch { /* private mode */ }
    }
    navigate("/outfitter");
  }

  // Scroll-linked parallax on the fixed background video (no re-renders).
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const v = bgVideoRef.current;
        if (!v) return;
        const y = window.scrollY;
        v.style.transform = `translateY(${y * 0.12}px) scale(${1.08 + Math.min(y / 6000, 0.08)})`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "MatchRV",
    "url": "https://matchrv.com",
    "logo": { "@type": "ImageObject", "url": "https://matchrv.com/matchrv-logo.png", "width": 200, "height": 60 },
    "description": "MatchRV is a consumer RV marketplace. Search dealer inventory in your own words, compare RVs, and ask the dealer.",
    "foundingLocation": { "@type": "Place", "name": "Pacific Northwest, Washington State, USA" },
    "sameAs": ["https://matchrv.com/about"],
  };
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "MatchRV",
    "url": "https://matchrv.com",
  };

  return (
    <Layout>
      <SEO
        title="Find the RV that fits"
        description="Search live dealer inventory in your own words. Browse by type, location, and budget, compare RVs, and ask the dealer. Free Match Report."
        canonical="https://matchrv.com/"
        jsonLd={[organizationSchema, websiteSchema]}
      />
      {/* ── Full-page video backdrop (fixed; parallax on scroll) ─────── */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <video
          ref={bgVideoRef}
          src={`${import.meta.env.BASE_URL}videos/home-bg.mp4`}
          poster={`${import.meta.env.BASE_URL}images/hero-bg.jpg`}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover will-change-transform"
          style={{ transform: "scale(1.08)" }}
        />
        <div className="absolute inset-0 bg-[#0B1117]/45" />
      </div>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative z-10 min-h-screen flex items-center">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(11,17,23,0) 55%, rgba(11,17,23,0.55) 100%)" }} />
        </div>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-16 py-20 sm:py-28">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#00CED1]/20 text-[#00CED1] rounded text-xs font-bold uppercase tracking-widest mb-5 sm:mb-6">
              <span className="w-2 h-2 bg-[#00CED1] rounded-full animate-pulse" />
              <strong data-rv-count="total">{liveTotal.value == null ? RV_COUNT_PLACEHOLDER : formatCount(liveTotal.value)}</strong>
              <span>RVs in live inventory</span>
            </div>
            <p className="sr-only">
              <span data-rv-count-status="total">{liveTotal.live ? RV_COUNT_LIVE_STATUS : RV_COUNT_UNAVAILABLE_STATUS}</span>
            </p>

            <h1 className="text-4xl sm:text-6xl md:text-7xl font-display font-black text-white tracking-tight mb-4 sm:mb-6">
              Search in your own words.{" "}
              <span className="text-[#00CED1]">Compare. Ask the dealer.</span>
            </h1>

            <p className="text-lg sm:text-xl text-white/70 mb-6 sm:mb-8 max-w-xl leading-relaxed">
              Describe the trip, the people coming, and a budget. MatchRV searches dealer inventory, checks tow fit, and lets you ask the dealership about a specific RV. Free.
            </p>

            <form onSubmit={askOutfitter} className="flex flex-col sm:flex-row gap-3 max-w-xl mb-4">
              <label className="sr-only" htmlFor="home-search">Describe the RV you want</label>
              <input
                id="home-search"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Family bunkhouse I can tow with a half-ton"
                className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-4 text-white placeholder:text-white/40 outline-none focus:border-[#00CED1]"
              />
              <button type="submit" className="rounded-xl bg-[#00CED1] text-[#0B1117] font-bold px-6 py-4 inline-flex items-center justify-center gap-2">
                <Search className="w-5 h-5" /> Search
              </button>
            </form>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/match">
                <button
                  onClick={() => trackEvent("hero_cta_click", { metadata: { cta: "get_match_report" } })}
                  className="w-full sm:w-auto bg-white/10 text-white px-8 py-4 min-h-[52px] rounded font-bold flex items-center justify-center gap-3 hover:bg-white/15 active:scale-95 transition-all text-base"
                >
                  Get a Match Report
                  <ArrowRight className="w-5 h-5" />
                </button>
              </Link>
              <Link href="/swipe" className="w-full sm:w-auto px-8 py-4 min-h-[52px] rounded font-bold flex items-center justify-center border border-white/20 text-white">
                Swipe inventory
              </Link>
            </div>

            <p className="mt-4 text-white/40 text-sm">No sign-up required · The count above is the live total from MatchRV inventory</p>
          </div>
        </div>

        {/* Trust bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-[#0B1117]/80 backdrop-blur-sm border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-16 min-h-[3.5rem] py-2 flex flex-wrap items-center justify-center sm:justify-between gap-x-5 gap-y-1">
            {[
              { icon: Sparkles, label: "Free Match Report" },
              { icon: Scale, label: "Side-by-side compare" },
              { icon: BadgeCheck, label: "Ask the dealer from the listing" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-white/60 text-xs font-medium whitespace-nowrap">
                <Icon className="w-4 h-4 text-[#00CED1] flex-shrink-0" />
                {label}
              </div>
            ))}
            <div className="hidden lg:flex items-center gap-2 text-white/60 text-xs font-medium whitespace-nowrap">
              <Search className="w-4 h-4 text-[#00CED1] flex-shrink-0" />
              Live inventory, updated daily
            </div>
            <div className="hidden lg:flex items-center gap-2 text-white/60 text-xs font-medium whitespace-nowrap">
              <Shield className="w-4 h-4 text-[#00CED1] flex-shrink-0" />
              Free to use
            </div>
          </div>
        </div>
      </section>
      <section className="relative z-10 bg-[#0B1117] text-white border-y border-white/10 px-4 py-12" aria-labelledby="browse-title">
        <div className="max-w-7xl mx-auto sm:px-12">
          <h2 id="browse-title" className="font-display font-black text-2xl sm:text-3xl mb-6">Browse by type, then narrow it</h2>
          <ul className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
            {SHOP_TYPES.map((item) => (
              <li key={item.type}>
                <Link href={item.href} className="block rounded-xl bg-white/5 border border-white/10 p-4 hover:border-[#00CED1]">
                  <span className="block font-bold">{item.label}</span>
                  <span className="block text-xs text-white/60 mt-1"><TypeCount type={item.type} /> listed</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3 text-sm font-bold">
            <Link href="/shop" className="rounded-full bg-[#00CED1] text-[#0B1117] px-4 py-2">Shop by budget and location</Link>
            <Link href="/tow-guide" className="rounded-full border border-white/20 px-4 py-2">Check tow fit</Link>
            <Link href="/swipe" className="rounded-full border border-white/20 px-4 py-2">Compare favorites</Link>
            <a href="https://dealer.matchrv.com/" className="rounded-full border border-white/20 px-4 py-2">For dealerships</a>
          </div>
          <div className="mt-8 text-white/80">
            <InventoryCoverage />
          </div>
        </div>
      </section>
      {/* ── How It Works ──────────────────────────────────────────────── */}
      <section className="relative z-10 py-20 sm:py-28 bg-[#f4fbfa]/90 backdrop-blur-md overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-16 text-center mb-16">
          <span className="text-[#00696b] font-bold text-xs tracking-widest uppercase mb-4 block">AI Shopping Assistant</span>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-[#161d1d] tracking-tight">
            Stop scrolling. Start matching.
          </h2>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-16 grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          <div className="hidden md:block absolute top-1/2 left-0 w-full h-px -translate-y-1/2" style={{ background: "linear-gradient(to right, transparent, rgba(11,17,23,0.08), transparent)" }} />
          {[
            { n: 1, title: "Answer 7 questions", desc: "Lifestyle, who's coming, tow vehicle, budget, camping style, and must-haves." },
            { n: 2, title: "We score every listing", desc: "Tow safety, deal score, sleeping capacity, features, and your specific situation." },
            { n: 3, title: "Get your 3-pick report", desc: "Best Overall, Best Value, Upgrade — with honest tradeoffs and clear next steps." },
          ].map((s) => (
            <div key={s.n} className="glass-panel p-8 rounded-2xl relative z-10 flex flex-col items-center text-center hover:border-[#00CED1]/30 transition-colors">
              <div className="w-12 h-12 bg-[#00CED1] text-[#0B1117] rounded-full flex items-center justify-center font-bold text-xl mb-6">
                {s.n}
              </div>
              <h3 className="font-display font-bold text-[#161d1d] text-xl mb-3">{s.title}</h3>
              <p className="text-[#3b4949] text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-14">
          <Link href="/match">
            <button
              onClick={() => trackEvent("hero_cta_click", { metadata: { cta: "how_it_works" } })}
              className="bg-[#00CED1] text-[#0B1117] px-8 py-4 rounded font-bold text-base inline-flex items-center gap-3 glow-cyan hover:brightness-110 active:scale-95 transition-all"
            >
              <Sparkles className="w-5 h-5" />
              Find My Perfect RV
              <ArrowRight className="w-5 h-5" />
            </button>
          </Link>
          <p className="text-[#3b4949] text-xs mt-3">Free · No account needed</p>
        </div>
      </section>
      {/* ── Inventory Preview ─────────────────────────────────────────── */}
      <section className="relative z-10 py-20 sm:py-28 bg-[#e9f5f4]/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
            <div>
              <span className="text-[#00696b] font-bold text-xs tracking-widest uppercase mb-4 block">Real Inventory</span>
              <h2 className="text-3xl sm:text-4xl font-display font-black text-[#161d1d] tracking-tight">
                RVs on MatchRV right now
              </h2>
            </div>
            <Link href="/browse" className="text-[#00696b] flex items-center gap-2 hover:underline text-sm font-medium flex-shrink-0">
              View all inventory <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {featuredListings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredListings.map((listing) => (
                <HomepageListingCard key={listing.id} listing={listing as Parameters<typeof HomepageListingCard>[0]["listing"]} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="glass-panel rounded-2xl aspect-[3/4] animate-pulse" />
              ))}
            </div>
          )}

          <div className="flex justify-center mt-12">
            <Link href="/browse">
              <button className="px-8 py-3 rounded border-2 border-[#0B1117] text-[#0B1117] font-medium text-sm hover:bg-[#0B1117]/5 transition-colors">
                Browse RVs
              </button>
            </Link>
          </div>
        </div>
      </section>
      {/* ── Trust / Buyer Protection ───────────────────────────────────── */}
      <section className="relative z-10 py-20 sm:py-28 bg-[#f4fbfa]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-16 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <span className="text-[#00696b] font-bold text-xs tracking-widest uppercase mb-4 block">Buyer Protection</span>
            <h2 className="text-3xl sm:text-4xl font-display font-black text-[#161d1d] mb-6 tracking-tight">
              How we help you shop safely
            </h2>
            <p className="text-[#3b4949] text-lg mb-10 leading-relaxed">
              RV scams, stale listings, and misleading pricing are real problems. Here's how MatchRV protects you through every step of the journey.
            </p>

            <div className="space-y-6">
              {[
                {
                  icon: RefreshCw,
                  title: "Live Inventory Only",
                  desc: "Every listing is actively for sale. We flag or remove sold units daily so you never fall in love with a ghost.",
                },
                {
                  icon: BadgeCheck,
                  title: "Vetted Dealers",
                  desc: "We only work with established, verified dealerships with proven track records for honesty and service.",
                },
                {
                  icon: Shield,
                  title: "Transparent Pricing",
                  desc: "No hidden fees or bait-and-switch. We show you the deal score and market comparison on every listing.",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex gap-4">
                  <div className="w-12 h-12 bg-[#00CED1]/10 rounded-xl flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-[#00696b]" />
                  </div>
                  <div>
                    <h4 className="text-[#161d1d] font-bold mb-1">{title}</h4>
                    <p className="text-[#3b4949] text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-[#00CED1]/10 blur-[100px] rounded-full pointer-events-none" />
            <div className="glass-panel p-2 rounded-3xl relative overflow-hidden">
              <img
                src={`${import.meta.env.BASE_URL}images/hero-bg.jpg`}
                alt="RV interior"
                width={1920}
                height={1280}
                loading="lazy"
                decoding="async"
                className="w-full h-80 object-cover rounded-2xl object-[50%_40%]"
              />
            </div>
          </div>
        </div>
      </section>
      {/* ── Testimonials ──────────────────────────────────────────────── */}
      <section className="relative z-10 py-20 sm:py-28 bg-[#e9f5f4]/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-16 text-center mb-16">
          <span className="text-[#00696b] font-bold text-xs tracking-widest uppercase mb-4 block">Real Buyers</span>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-[#161d1d] tracking-tight">
            What our users are saying
          </h2>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className={`glass-panel p-8 rounded-2xl flex flex-col ${t.featured ? "border-[#00CED1]/20 bg-[#00CED1]/5" : ""}`}
            >
              <div className="flex gap-1 mb-6">
                {Array.from({ length: t.stars }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-[#00696b] text-[#00696b]" />
                ))}
              </div>
              <p className="text-[#3b4949] text-sm leading-relaxed flex-grow mb-8 italic">"{t.text}"</p>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[#00CED1]/20 flex items-center justify-center font-bold text-[#00696b] text-sm">
                  {t.initial}
                </div>
                <div>
                  <p className="text-[#161d1d] font-bold text-sm">{t.name}</p>
                  <p className="text-[#3b4949] text-xs flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {t.location}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section className="relative z-10 py-20 sm:py-28 bg-[#f4fbfa]/90 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 sm:px-16">
          <div className="text-center mb-10">
            <span className="text-[#00696b] font-bold text-xs tracking-widest uppercase mb-4 block">FAQ</span>
            <h2 className="text-3xl sm:text-4xl font-display font-black text-[#161d1d] tracking-tight">
              Common questions
            </h2>
          </div>
          <div className="glass-panel rounded-2xl px-6 sm:px-8" role="list">
            {faqs.map((f) => <FAQItem key={f.question} {...f} />)}
          </div>
        </div>
      </section>
      {/* ── Final CTA ─────────────────────────────────────────────────── */}
      <section className="relative z-10 py-20 sm:py-28 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[#0B1117]/70" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <Compass className="w-12 h-12 text-[#00CED1] mx-auto mb-6" />
          <h2 className="text-3xl sm:text-5xl font-display font-black text-white tracking-tight mb-6 leading-tight">
            Ready to find your perfect RV?
          </h2>
          <p className="text-white/60 text-lg mb-10 leading-relaxed">
            Browse live dealer inventory, or get a free Match Report — no account needed.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/match">
              <button
                onClick={() => trackEvent("hero_cta_click", { metadata: { cta: "final_cta" } })}
                className="bg-[#00CED1] text-[#0B1117] px-10 py-4 rounded font-bold text-lg glow-cyan active:scale-95 transition-all"
              >
                Find My Perfect RV
              </button>
            </Link>
            <Link href="/browse">
              <button className="px-10 py-4 rounded border border-white/15 bg-white/5 text-white font-medium text-lg hover:bg-white/10 transition-colors">
                Browse RVs
              </button>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
