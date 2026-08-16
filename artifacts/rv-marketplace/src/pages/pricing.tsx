import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { buildLeadBuyerProfile } from "@/lib/buyer-intent";
import {
  CheckCircle2, Sparkles, User, ArrowRight, Lock,
  Shield, Star, Phone, ChevronDown, ChevronUp,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const FAQS = [
  {
    q: "What's the difference between the free Match Report and the in-depth one?",
    a: "The free Match Report asks 7 core questions (type, budget, camping style, tow vehicle, etc.) and returns your top 3 picks with deal scores. The In-Depth Match Report adds a second round of questions — interior layout preferences, specific feature priorities, full-time vs. recreational use, trade-in details, and financing situation — producing a more refined shortlist with expanded tradeoff reasoning.",
  },
  {
    q: "Is the basic Match Report really free?",
    a: "Yes — completely free. Answer 7 questions, get your top 3 picks with deal scores and tradeoff notes. No account required, no credit card.",
  },
  {
    q: "How does the Personal Shopper service work?",
    a: "Once you sign up, a dedicated human advisor contacts you within one business day, runs through your full requirements, builds a curated shortlist from all available WA inventory, coordinates dealer walkthroughs, and helps you negotiate. You get a real expert handling the entire process.",
  },
  {
    q: "Is the In-Depth Match Report a one-time charge?",
    a: "Yes — $29.96 one time gets you the full extended report plus a 30-day price-drop alert on your top picks.",
  },
  {
    q: "What if I'm not happy with the report?",
    a: "We offer a 30-day money-back guarantee on the In-Depth Match Report, no questions asked.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#E2E8F0] last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left py-4 flex items-center justify-between gap-4"
      >
        <span className="font-bold text-[#161d1d] text-sm leading-snug">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-[#6b7a7a] flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-[#6b7a7a] flex-shrink-0" />}
      </button>
      {open && <p className="pb-4 text-sm text-[#6b7a7a] leading-relaxed">{a}</p>}
    </div>
  );
}

function PersonalShopperForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setLoading(true);
    try {
      await fetch(`${BASE}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName: name.trim(),
          contactEmail: email.trim(),
          contactPhone: phone.trim() || null,
          buyerProfile: buildLeadBuyerProfile({}, { leadSource: "personal_shopper_inquiry" }),
          message: "Personal Shopper Inquiry — $999",
          leadSource: "personal_shopper_inquiry",
        }),
      });
    } catch { /* silent */ }
    setLoading(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="text-center py-6">
        <CheckCircle2 className="w-10 h-10 text-[#0B1117] mx-auto mb-3" />
        <div className="font-black text-white text-lg mb-1">You're on the list!</div>
        <p className="text-white/70 text-sm">We'll reach out within 1 business day.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required
          className="w-full pl-9 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-sm focus:outline-none focus:border-[#00CED1]" />
      </div>
      <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required
        className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-sm focus:outline-none focus:border-[#00CED1]" />
      <div className="relative">
        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input type="tel" placeholder="Phone (optional)" value={phone} onChange={e => setPhone(e.target.value)}
          className="w-full pl-9 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-sm focus:outline-none focus:border-[#00CED1]" />
      </div>
      <button type="submit" disabled={loading || !name.trim() || !email.trim()}
        className="w-full py-3.5 rounded-2xl bg-[#00CED1] text-[#0B1117] font-black text-sm hover:bg-[#93d5ad] transition flex items-center justify-center gap-2 disabled:opacity-40">
        {loading ? "Submitting…" : "Request a Personal Shopper"}
      </button>
      <p className="text-white/40 text-xs text-center">No obligation. We'll reach out to discuss your needs.</p>
    </form>
  );
}

export function Pricing() {
  const [, navigate] = useLocation();
  const [listingCount, setListingCount] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/listings?limit=1`)
      .then(r => r.json())
      .then(d => { if (d.total) setListingCount(d.total); })
      .catch(() => {});
  }, []);

  return (
    <Layout>
      <SEO
        title="MatchRV Pricing — Free Match Report, In-Depth Report & Personal Shopper"
        description="Get a free RV Match Report, upgrade to an in-depth report for $29.96, or let a real Personal Shopper handle everything for $999."
        canonical="https://matchrv.com/pricing"
      />

      {/* Hero */}
      <section className="bg-[#0B1117] text-white py-14 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-white/10 border border-white/20">
            <Sparkles className="w-3.5 h-3.5 text-[#00CED1]" />
            <span className="text-xs font-black uppercase tracking-widest text-[#00CED1]">Simple Pricing</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-display font-black tracking-tighter mb-4">
            Buy Your 3rd RV First
          </h1>
          <p className="text-white/70 text-base leading-relaxed max-w-xl mx-auto">
            Start free. Go deeper when you're ready. Or let a real expert handle everything.
          </p>
        </div>
      </section>

      {/* Tier cards */}
      <section className="py-14 px-4 bg-[#f4fbfa]">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Free — Browse + Basic Match Report */}
          <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 flex flex-col">
            <div className="text-xs font-black uppercase tracking-widest text-[#6b7a7a] mb-1">Free</div>
            <div className="text-3xl font-black text-[#161d1d] mb-1">$0</div>
            <div className="text-sm text-[#6b7a7a] mb-5">Always free</div>
            <ul className="space-y-2 mb-6 flex-1">
              {[
                `Browse all ${listingCount ? listingCount.toLocaleString() : "7,500+"} WA dealer listings`,
                "Advanced filters (type, price, size)",
                "Tow capacity checker",
                "Save favorites to your account",
                "Price drop alerts",
                "Basic Match Report — top 3 picks",
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-[#3b4949]">
                  <CheckCircle2 className="w-4 h-4 text-[#6b7a7a] flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => navigate("/match")}
              className="w-full py-3 rounded-2xl border-2 border-[#E2E8F0] text-[#161d1d] font-black text-sm hover:border-[#0B1117] transition"
            >
              Get Free Match Report
            </button>
          </div>

          {/* In-Depth Match Report — highlighted */}
          <div className="bg-white text-[#161d1d] border-2 border-[#00CED1] rounded-3xl p-6 flex flex-col shadow-xl shadow-[#0B1117]/10 relative overflow-hidden md:-mt-3 md:-mb-3">
            <div className="absolute top-0 right-0 bg-[#00CED1] text-[#0B1117] text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-bl-2xl">
              Most Popular
            </div>
            <div className="text-xs font-black uppercase tracking-widest text-[#00696b] mb-1 mt-4">In-Depth Match Report</div>
            <div className="text-3xl font-black mb-1">$29.96</div>
            <div className="text-sm text-[#3b4949] mb-5">One-time · 30-day guarantee</div>
            <ul className="space-y-2 mb-6 flex-1">
              {[
                "Everything in Free",
                "Extended AI interview — second set of deeper questions",
                "Interior layout & feature priority scoring",
                "Full-time vs. recreational use analysis",
                "Trade-in & financing situation factored in",
                "Expanded tradeoff reasoning on every pick",
                "Emailed report for future reference",
                "30-day price-drop alerts on your picks",
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-[#3b4949]">
                  <CheckCircle2 className="w-4 h-4 text-[#00696b] flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => navigate("/match")}
              className="w-full py-3.5 rounded-2xl bg-[#00CED1] text-[#0B1117] font-black text-sm hover:bg-[#93d5ad] transition flex items-center justify-center gap-2"
            >
              Get In-Depth Report <ArrowRight className="w-4 h-4" />
            </button>
            <div className="flex items-center justify-center gap-3 mt-3 text-[10px] text-[#3b4949]">
              <div className="flex items-center gap-1"><Shield className="w-3 h-3" /> 30-day guarantee</div>
              <span>·</span>
              <div className="flex items-center gap-1"><Star className="w-3 h-3" /> Secure checkout</div>
            </div>
          </div>

          {/* Personal Shopper */}
          <div className="bg-white text-[#161d1d] border border-[#E2E8F0] rounded-3xl p-6 flex flex-col">
            <div className="text-xs font-black uppercase tracking-widest text-amber-600 mb-1">Personal Shopper</div>
            <div className="text-3xl font-black mb-1">$999</div>
            <div className="text-sm text-[#3b4949] mb-5">Full-service concierge</div>
            <ul className="space-y-2 mb-6 flex-1">
              {[
                "Everything in In-Depth Match Report",
                "Dedicated advisor within 24 hours",
                "Curated shortlist from all WA inventory",
                "Dealer scheduling & coordination",
                "Professional negotiation on your behalf",
                "Guidance through paperwork & closing",
              ].map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-[#3b4949]">
                  <CheckCircle2 className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => {
                const el = document.getElementById("shopper-form");
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="w-full py-3 rounded-2xl bg-amber-500 text-white font-black text-sm hover:bg-amber-600 transition flex items-center justify-center gap-2"
            >
              <User className="w-4 h-4" /> Request a Personal Shopper
            </button>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-display font-black text-[#161d1d] tracking-tight mb-8 text-center">
            What you get with each plan
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0]">
                  <th className="text-left py-3 pr-4 font-bold text-[#6b7a7a]">Feature</th>
                  <th className="text-center py-3 px-3 font-bold text-[#6b7a7a]">Free</th>
                  <th className="text-center py-3 px-3 font-black text-[#0B1117]">$29.96</th>
                  <th className="text-center py-3 px-3 font-bold text-amber-700">$999</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Browse all listings", true, true, true],
                  ["Filters, tow check, save", true, true, true],
                  ["Basic Match Report (top 3 picks)", true, true, true],
                  ["Extended AI interview (deeper questions)", false, true, true],
                  ["Interior layout & feature scoring", false, true, true],
                  ["Full-time vs. recreational analysis", false, true, true],
                  ["Trade-in & financing factored in", false, true, true],
                  ["Expanded tradeoff reasoning", false, true, true],
                  ["30-day price-drop alerts on picks", false, true, true],
                  ["Emailed report", false, true, true],
                  ["Dedicated human advisor", false, false, true],
                  ["Dealer coordination & scheduling", false, false, true],
                  ["Professional negotiation", false, false, true],
                  ["Paperwork guidance", false, false, true],
                ].map(([label, free, paid, shopper]) => (
                  <tr key={label as string} className="border-b border-[#f0efee] hover:bg-[#f4fbfa]">
                    <td className="py-3 pr-4 text-[#161d1d]">{label as string}</td>
                    <td className="text-center py-3 px-3">
                      {free ? <CheckCircle2 className="w-4 h-4 text-[#6b7a7a] mx-auto" /> : <span className="text-[#bac9c9]">—</span>}
                    </td>
                    <td className="text-center py-3 px-3">
                      {paid ? <CheckCircle2 className="w-4 h-4 text-[#0B1117] mx-auto" /> : <span className="text-[#bac9c9]">—</span>}
                    </td>
                    <td className="text-center py-3 px-3">
                      {shopper ? <CheckCircle2 className="w-4 h-4 text-amber-500 mx-auto" /> : <span className="text-[#bac9c9]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Personal Shopper signup */}
      <section id="shopper-form" className="py-14 px-4 bg-[#0B1117]">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <div className="text-xs font-black uppercase tracking-widest text-[#00CED1] mb-2">Personal Shopper</div>
            <h2 className="text-3xl font-display font-black text-white tracking-tight mb-3">
              Let us do the work
            </h2>
            <p className="text-white/60 text-sm leading-relaxed">
              A real expert handles your entire RV search — from curating a shortlist to closing the deal.
            </p>
            <div className="text-2xl font-black text-amber-400 mt-3">$999</div>
          </div>
          <PersonalShopperForm />
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 px-4 bg-[#f4fbfa]">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-display font-black text-[#161d1d] tracking-tight mb-6 text-center">
            Frequently Asked Questions
          </h2>
          <div className="bg-white border border-[#E2E8F0] rounded-3xl px-6 divide-y divide-[#E2E8F0]">
            {FAQS.map(faq => <FaqItem key={faq.q} {...faq} />)}
          </div>
        </div>
      </section>

    </Layout>
  );
}
