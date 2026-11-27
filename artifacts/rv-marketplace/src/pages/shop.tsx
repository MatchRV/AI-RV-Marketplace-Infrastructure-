import { FormEvent, useState } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { InventoryCoverage, TypeCount } from "@/components/inventory-coverage";
import { OUTFITTER_PROMPT_KEY } from "@/lib/site-host";
import { ArrowRight, GitCompare, MapPin, MessageCircle, Scale, Search, Sparkles } from "lucide-react";

const TYPES: Array<{ type: "travel_trailer" | "fifth_wheel" | "class_c" | "toy_hauler" | "class_a" | "class_b" | "truck_camper" | "popup_camper"; label: string; href: string }> = [
  { type: "travel_trailer", label: "Travel trailers", href: "/travel-trailers-for-sale" },
  { type: "fifth_wheel", label: "Fifth wheels", href: "/fifth-wheels-for-sale" },
  { type: "class_a", label: "Class A motorhomes", href: "/class-a-rvs-for-sale" },
  { type: "class_b", label: "Class B camper vans", href: "/class-b-rvs-for-sale" },
  { type: "class_c", label: "Class C motorhomes", href: "/class-c-rvs-for-sale" },
  { type: "toy_hauler", label: "Toy haulers", href: "/toy-haulers-for-sale" },
  { type: "truck_camper", label: "Truck campers", href: "/rvs-for-sale" },
  { type: "popup_camper", label: "Pop-up campers", href: "/rvs-for-sale" },
];

const BUDGETS = [20000, 35000, 50000, 75000, 100000];

export function Shop() {
  const [, navigate] = useLocation();
  const [prompt, setPrompt] = useState("");
  const [place, setPlace] = useState("");

  function askOutfitter(event: FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (text) {
      try { sessionStorage.setItem(OUTFITTER_PROMPT_KEY, text); } catch { /* private mode */ }
    }
    navigate("/outfitter");
  }

  function shopPlace(event: FormEvent) {
    event.preventDefault();
    const value = place.trim();
    navigate(value ? `/swipe?place=${encodeURIComponent(value)}` : "/swipe");
  }

  return (
    <Layout>
      <SEO
        title="Shop RVs — Search, Compare, and Ask the Dealer"
        description="Search MatchRV inventory in your own words. Browse by type, location, and budget, then compare RVs and ask the dealer if one is still available."
        canonical="https://matchrv.com/shop"
      />
      <section className="bg-[#0B1117] text-white px-4 py-16 sm:py-24">
        <div className="max-w-3xl mx-auto">
          <p className="text-[#00CED1] text-xs font-bold uppercase tracking-widest mb-4">Shop RVs</p>
          <h1 className="font-display font-black text-4xl sm:text-6xl tracking-tight mb-4">Find an RV in your own words.</h1>
          <p className="text-white/70 text-lg mb-8">Tell MatchRV who is traveling, what you tow, and what you want to spend. Then compare real dealer inventory and ask the dealer about the one you like.</p>
          <form onSubmit={askOutfitter} className="flex flex-col sm:flex-row gap-3">
            <label className="sr-only" htmlFor="shop-search">Describe the RV you want</label>
            <input
              id="shop-search"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Bunkhouse trailer under $40,000 near Austin"
              className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-4 text-white placeholder:text-white/40 outline-none focus:border-[#00CED1]"
            />
            <button type="submit" className="rounded-xl bg-[#00CED1] text-[#0B1117] font-bold px-6 py-4 inline-flex items-center justify-center gap-2">
              <Search className="w-5 h-5" /> Search
            </button>
          </form>
          <div className="mt-8">
            <InventoryCoverage />
          </div>
        </div>
      </section>

      <section className="bg-[#f4fbfa] px-4 py-16" aria-labelledby="type-title">
        <div className="max-w-6xl mx-auto">
          <h2 id="type-title" className="font-display font-black text-3xl text-[#161d1d] mb-8">Browse by type</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TYPES.map((item) => (
              <li key={item.type}>
                <Link href={item.href} className="block rounded-2xl bg-white border border-[#E2E8F0] p-5 hover:border-[#00CED1]">
                  <h3 className="font-bold text-[#161d1d]">{item.label}</h3>
                  <p className="text-sm text-[#3b4949] mt-2"><TypeCount type={item.type} /> listed</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 py-16 bg-white" aria-labelledby="budget-title">
        <div className="max-w-6xl mx-auto">
          <h2 id="budget-title" className="font-display font-black text-3xl text-[#161d1d] mb-3">Shop by budget</h2>
          <p className="text-[#3b4949] mb-6">These open the swipe deck at a price ceiling. The live price on each RV is the one to confirm with the dealer.</p>
          <div className="flex flex-wrap gap-3">
            {BUDGETS.map((amount) => (
              <Link key={amount} href={`/swipe?price_max=${amount}`} className="rounded-full border-2 border-[#0B1117] px-4 py-2 font-bold text-sm text-[#161d1d] hover:bg-[#0B1117] hover:text-white">
                Under ${amount.toLocaleString("en-US")}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 bg-[#e9f5f4]" aria-labelledby="place-title">
        <div className="max-w-3xl mx-auto">
          <h2 id="place-title" className="font-display font-black text-3xl text-[#161d1d] mb-3">Shop by location</h2>
          <p className="text-[#3b4949] mb-6">Start from a city, state, or ZIP. You can widen the distance on the next screen.</p>
          <form onSubmit={shopPlace} className="flex flex-col sm:flex-row gap-3">
            <label className="sr-only" htmlFor="shop-place">City, state, or ZIP</label>
            <input
              id="shop-place"
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              placeholder="Tacoma, WA or 98402"
              className="flex-1 rounded-xl border-2 border-[#E2E8F0] px-4 py-3 outline-none focus:border-[#00696b]"
            />
            <button type="submit" className="rounded-xl bg-[#0B1117] text-white font-bold px-5 py-3 inline-flex items-center justify-center gap-2">
              <MapPin className="w-4 h-4" /> See RVs
            </button>
          </form>
        </div>
      </section>

      <section className="px-4 py-16 bg-[#f4fbfa]" id="swipe" aria-labelledby="swipe-title">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-[#00696b] text-xs font-bold uppercase tracking-widest mb-3">Already know the type?</p>
            <h2 id="swipe-title" className="font-display font-black text-4xl text-[#161d1d] mb-4">Swipe to find your RV.</h2>
            <p className="text-[#3b4949] text-lg mb-6">Pass or save one RV at a time, then compare the ones you kept side by side.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/swipe" className="rounded-xl bg-[#00CED1] text-[#0B1117] font-bold px-6 py-3 inline-flex items-center justify-center gap-2">Start swiping <ArrowRight className="w-4 h-4" /></Link>
              <Link href="/match" className="rounded-xl border-2 border-[#0B1117] text-[#161d1d] font-bold px-6 py-3 inline-flex items-center justify-center">Help me choose instead</Link>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-3 text-sm text-[#161d1d]">
            <li className="rounded-2xl bg-white p-4 border border-[#E2E8F0]"><strong>Travel trailers</strong><br /><TypeCount type="travel_trailer" /> in inventory</li>
            <li className="rounded-2xl bg-white p-4 border border-[#E2E8F0]"><strong>Pop-up campers</strong><br /><TypeCount type="popup_camper" /> in inventory</li>
          </ul>
        </div>
      </section>

      <section className="px-4 py-16 bg-white" aria-labelledby="tools-title">
        <div className="max-w-6xl mx-auto">
          <h2 id="tools-title" className="font-display font-black text-3xl text-[#161d1d] mb-8">Compare, tow-check, then ask the dealer</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/outfitter" className="rounded-2xl border border-[#E2E8F0] p-5 hover:border-[#00CED1]"><Sparkles className="w-5 h-5 text-[#00696b] mb-3" /><h3 className="font-bold">AI Outfitter</h3><p className="text-sm text-[#3b4949] mt-2">A short conversation that narrows the search.</p></Link>
            <Link href="/match" className="rounded-2xl border border-[#E2E8F0] p-5 hover:border-[#00CED1]"><Scale className="w-5 h-5 text-[#00696b] mb-3" /><h3 className="font-bold">Match Report</h3><p className="text-sm text-[#3b4949] mt-2">Three RVs, with the tradeoffs written down.</p></Link>
            <Link href="/swipe" className="rounded-2xl border border-[#E2E8F0] p-5 hover:border-[#00CED1]"><GitCompare className="w-5 h-5 text-[#00696b] mb-3" /><h3 className="font-bold">Side by side</h3><p className="text-sm text-[#3b4949] mt-2">Compare the RVs you saved in the deck.</p></Link>
            <Link href="/tow-guide" className="rounded-2xl border border-[#E2E8F0] p-5 hover:border-[#00CED1]"><MessageCircle className="w-5 h-5 text-[#00696b] mb-3" /><h3 className="font-bold">Tow check</h3><p className="text-sm text-[#3b4949] mt-2">See whether a tow vehicle fits before you inquire.</p></Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
