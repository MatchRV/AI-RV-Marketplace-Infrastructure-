import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { trackEvent } from "@/lib/analytics";
import { trackClarity } from "@/lib/clarity";
import { useAppAuth } from "@/contexts/auth-context";
import {
  ArrowRight, Award, TrendingDown, Sparkles, Check, AlertCircle,
  MapPin, Calendar, Bed, Ruler, RefreshCcw, Lock, X, User, Phone,
  Compass, Heart, Shield, MessageCircle, Loader2, CheckCircle2, Bell,
} from "lucide-react";

type Pick = {
  tier: "best_overall" | "best_value" | "upgrade";
  matchScore?: number;
  whyItFits: string;
  tradeoffs: string[];
  priceContext: string;
  listing: {
    id: number;
    title: string;
    make: string;
    model: string;
    year: number;
    type: string;
    price: number;
    marketValue: number;
    dealScore: string;
    dealSavings: number;
    length: number | null;
    sleeps: number;
    location: string;
    state: string;
    dealerName: string;
    images: string[];
    daysOnMarket: number;
    condition: string;
  };
};

type Report = {
  reportId: string;
  generatedAt: string;
  expertSummary: string;
  picks: Pick[];
  totalConsidered: number;
  relaxedNote?: string | null;
  quiz?: {
    budgetMax?: number;
    driveType?: string;
    useCase?: string;
    [key: string]: unknown;
  };
};

const TIER_META = {
  best_overall: {
    label: "Best Fit for Your Life",
    subtitle: "This one matches how you actually camp",
    icon: Award,
    color: "bg-[#0B1117] text-[#00CED1]",
    pillBg: "bg-[#0B1117]",
    pillText: "text-white",
  },
  best_value: {
    label: "Smart Money Pick",
    subtitle: "Great fit at a great price",
    icon: TrendingDown,
    color: "bg-[#00CED1] text-[#0B1117]",
    pillBg: "bg-[#00CED1]",
    pillText: "text-[#0B1117]",
  },
  upgrade: {
    label: "Worth a Look If You Can Stretch",
    subtitle: "Here's what a little extra budget gets you",
    icon: Sparkles,
    color: "bg-[#ffe08b] text-[#241a00]",
    pillBg: "bg-[#ffe08b]",
    pillText: "text-[#241a00]",
  },
} as const;

// Fallback display scores per tier when the API doesn't return one
const TIER_FALLBACK_SCORE: Record<Pick["tier"], number> = {
  best_overall: 94,
  best_value: 88,
  upgrade: 82,
};

function formatType(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function MatchArc({ percent }: { percent: number }) {
  const size = 72;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = (clamped / 100) * c;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} aria-label={`${clamped}% match`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(11,17,23,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#00CED1"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-lg font-black text-[#0B1117]">{clamped}%</span>
        <span className="text-[8px] font-bold uppercase tracking-wider text-[#3b4949]">Match</span>
      </div>
    </div>
  );
}

function ContactDealerModal({ pick, onClose }: { pick: Pick; onClose: () => void }) {
  const l = pick.listing;
  const [name, setName] = useState("");
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem("matchrv_email") ?? ""; } catch { return ""; }
  });
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(
    `Hi, I'm interested in the ${l.year} ${l.make} ${l.model} listed at $${l.price.toLocaleString()}. Is it still available?`,
  );
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const nameError = !name.trim() ? "Please enter your name so the dealer knows who to reply to." : "";
  const emailError = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? "Please enter a valid email address."
    : "";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true });
    if (nameError || emailError) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: l.id,
          contactName: name.trim(),
          contactEmail: email.trim(),
          contactPhone: phone.trim() || null,
          message: message.trim(),
          leadSource: "match_report_dealer_contact",
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      try { localStorage.setItem("matchrv_email", email.trim()); } catch { /* ignore */ }
      trackEvent("dealer_contact_submitted", {
        metadata: { listingId: l.id, source: "match_report", tier: pick.tier },
      });
      trackClarity("dealer_contacted");
      setSent(true);
    } catch {
      setSubmitError("We couldn't send your message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Contact dealer"
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#0B1117] text-white px-6 py-5 flex items-start justify-between gap-4 sm:rounded-t-3xl">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-[#00CED1] mb-1">Contact Dealer</div>
            <div className="font-display font-black text-lg leading-tight">
              {l.year} {l.make} {l.model}
            </div>
            <div className="text-white/60 text-xs mt-1">${l.price.toLocaleString()} · {l.dealerName}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-2 text-white/60 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-[#00CED1] mx-auto mb-3" />
            <h3 className="font-display font-black text-xl text-[#161d1d] mb-1">Message sent!</h3>
            <p className="text-sm text-[#3b4949] mb-6">
              {l.dealerName} will get back to you soon, usually within 1 business day.
            </p>
            <button
              onClick={onClose}
              className="bg-[#0B1117] text-white px-8 py-3 rounded-xl font-black text-sm hover:bg-[#002829] transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4" noValidate>
            <div>
              <label htmlFor="cd-name" className="text-xs font-bold text-[#161d1d] block mb-1.5">Your name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3b4949]" />
                <input
                  id="cd-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  placeholder="First and last name"
                  className={`w-full pl-9 pr-4 py-3 rounded-xl border text-sm text-[#161d1d] placeholder:text-[#6b7a7a] focus:outline-none bg-white ${
                    touched.name && nameError ? "border-red-400 focus:border-red-400" : "border-[#E2E8F0] focus:border-[#0B1117]"
                  }`}
                />
              </div>
              {touched.name && nameError && <p className="mt-1 text-xs font-semibold text-red-600">{nameError}</p>}
            </div>

            <div>
              <label htmlFor="cd-email" className="text-xs font-bold text-[#161d1d] block mb-1.5">Email</label>
              <input
                id="cd-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                placeholder="you@example.com"
                className={`w-full px-4 py-3 rounded-xl border text-sm text-[#161d1d] placeholder:text-[#6b7a7a] focus:outline-none bg-white ${
                  touched.email && emailError ? "border-red-400 focus:border-red-400" : "border-[#E2E8F0] focus:border-[#0B1117]"
                }`}
              />
              {touched.email && emailError && <p className="mt-1 text-xs font-semibold text-red-600">{emailError}</p>}
            </div>

            <div>
              <label htmlFor="cd-phone" className="text-xs font-bold text-[#161d1d] block mb-1.5">Phone <span className="font-normal text-[#3b4949]">(optional)</span></label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3b4949]" />
                <input
                  id="cd-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 555-5555"
                  className="w-full pl-9 pr-4 py-3 rounded-xl border border-[#E2E8F0] text-sm text-[#161d1d] placeholder:text-[#6b7a7a] focus:outline-none focus:border-[#0B1117] bg-white"
                />
              </div>
            </div>

            <div>
              <label htmlFor="cd-message" className="text-xs font-bold text-[#161d1d] block mb-1.5">Message</label>
              <textarea
                id="cd-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] text-sm text-[#161d1d] focus:outline-none focus:border-[#0B1117] bg-white resize-none"
              />
            </div>

            {submitError && <p className="text-sm font-semibold text-red-600">{submitError}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 rounded-xl bg-[#00CED1] text-[#0B1117] font-black text-sm hover:brightness-110 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <>Send to Dealer <ArrowRight className="w-4 h-4" /></>}
            </button>
            <p className="text-[10px] text-[#3b4949] text-center flex items-center justify-center gap-1">
              <Shield className="w-3 h-3" /> Your info goes only to this dealer. No spam.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export function MatchReport() {
  const [, navigate] = useLocation();
  const { isAuthenticated, login } = useAppAuth();
  const [report, setReport] = useState<Report | null>(null);
  const [contactPick, setContactPick] = useState<Pick | null>(null);
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem("matchrv_email") ?? ""; } catch { return ""; }
  });
  const [saved, setSaved] = useState(() => {
    try { return !!localStorage.getItem("matchrv_email"); } catch { return false; }
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("matchrv_report");
    if (!raw) {
      navigate("/match");
      return;
    }
    try {
      const r = JSON.parse(raw) as Report;
      setReport(r);
      trackClarity("results_viewed");
      const bestOverall = r.picks.find((p) => p.tier === "best_overall");
      trackEvent("quiz_complete", {
        metadata: {
          report_id: r.reportId,
          picks_count: r.picks.length,
          top_pick_type: bestOverall?.listing?.type ?? null,
          top_pick_price: bestOverall?.listing?.price ?? null,
          budget_max: r.quiz?.budgetMax ?? null,
          drive_type: r.quiz?.driveType ?? null,
          use_case: r.quiz?.useCase ?? null,
          total_considered: r.totalConsidered ?? null,
        },
      });
    } catch {
      navigate("/match");
    }
  }, [navigate]);

  async function handleSaveMatches(e: FormEvent) {
    e.preventDefault();
    setError("");
    const clean = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setError("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/match-report/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: clean,
          reportId: report?.reportId ?? null,
          quiz: report?.quiz ?? {},
          source: "match_report",
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Something went wrong. Please try again.");
      }
      try { localStorage.setItem("matchrv_email", clean); } catch { /* ignore */ }
      trackEvent("match_report_email_capture", { metadata: { reportId: report?.reportId ?? null } });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your email. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!report) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <p className="text-[#3b4949]">Loading your report…</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SEO
        title="Your RV Match Report: Personalized Picks"
        description="Your personalized RV recommendations based on your camping lifestyle, budget, and needs. Honest guidance, no sales pressure."
        canonical="https://matchrv.com/match-report"
      />

      {/* Hero */}
      <section className="bg-[#0B1117] text-white py-12 sm:py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <Compass className="w-5 h-5 text-[#00CED1]" />
            <span className="text-xs font-black uppercase tracking-widest text-[#00CED1]">Your Personal Report</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-display font-black tracking-tighter mb-4">
            Here's What Fits Your Life
          </h1>
          <p className="text-white/80 text-base sm:text-lg leading-relaxed max-w-3xl">
            {report.expertSummary || "Based on what you told me about your camping plans, here are three RVs worth your attention. Each one fits your life a little differently. Read the honest tradeoffs before reaching out."}
          </p>
          {report.relaxedNote && (
            <div className="mt-4 max-w-3xl flex items-start gap-2 rounded-xl bg-[#00CED1]/10 border border-[#00CED1]/30 px-4 py-3 text-sm text-white/90">
              <Compass className="w-4 h-4 text-[#00CED1] flex-shrink-0 mt-0.5" />
              <span>{report.relaxedNote}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-4 mt-6 text-sm text-white/60">
            <span>Compared <strong className="text-white">{report.totalConsidered}</strong> live listings</span>
            <span>•</span>
            <span>Generated {new Date(report.generatedAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-4 mt-4 text-[10px] text-white/40">
            <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> No sales pressure</span>
            <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> Honest tradeoffs included</span>
          </div>
        </div>
      </section>

      {/* Picks — all matches shown up front, no gate */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-5xl mx-auto space-y-8">
          {report.picks.map((p, idx) => (
            <PickCard key={p.tier} pick={p} pickNumber={idx + 1} onContact={() => setContactPick(p)} />
          ))}

          {/* Save your matches */}
          {saved ? (
            <div className="rounded-3xl bg-[#eef5f4] border border-[#E2E8F0] p-8 sm:p-10">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#0B1117] flex items-center justify-center flex-shrink-0">
                  <Check className="w-6 h-6 text-[#00CED1]" />
                </div>
                <div>
                  <h3 className="text-xl font-display font-black text-[#161d1d]">Your matches are saved</h3>
                  <p className="text-sm text-[#3b4949] mt-1">
                    We will keep an eye on these picks and email you if any of them drop in price.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border-2 border-[#00CED1] bg-[#0B1117] text-white p-8 sm:p-10 shadow-lg">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-[#00CED1] flex items-center justify-center flex-shrink-0">
                  <Bell className="w-6 h-6 text-[#0B1117]" />
                </div>
                <div>
                  <h3 className="text-2xl font-display font-black">Save your matches and get alerts</h3>
                  <p className="text-sm text-white/70 mt-1 max-w-xl">
                    Don't lose these picks. We will email you your full report and let you know if any of them drop in price or sell.
                  </p>
                </div>
              </div>
              <form onSubmit={handleSaveMatches} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="flex-1 px-5 py-3 rounded-xl border-2 border-white/20 bg-white/10 focus:border-[#00CED1] focus:ring-2 focus:ring-[#00CED1]/30 outline-none text-sm text-white placeholder:text-white/50"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-[#00CED1] text-[#0B1117] px-7 py-3 rounded-xl font-black text-sm hover:brightness-110 transition disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  {submitting ? "Saving..." : (<>Save My Matches <ArrowRight className="w-4 h-4" /></>)}
                </button>
              </form>
              {error && <p className="mt-3 text-sm font-semibold text-[#ffb4a2]">{error}</p>}
              {!isAuthenticated && (
                <div className="mt-5 pt-5 border-t border-white/10 flex flex-col sm:flex-row sm:items-center gap-3">
                  <p className="text-xs text-white/60 flex-1">
                    Want saved favorites, price alerts, and personalized recommendations everywhere?
                  </p>
                  <button
                    type="button"
                    onClick={login}
                    className="text-sm font-black text-[#00CED1] hover:underline flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Lock className="w-3.5 h-3.5" /> Create free account
                  </button>
                </div>
              )}
              <p className="mt-3 text-xs text-white/40">Free. No spam. Unsubscribe anytime.</p>
            </div>
          )}
        </div>
      </section>

      {/* Next steps */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xl font-display font-black text-[#161d1d] mb-6 text-center">What would you like to do next?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/match">
              <button className="w-full h-full bg-white border border-[#E2E8F0] rounded-2xl p-6 text-left hover:border-[#0B1117] transition-colors">
                <RefreshCcw className="w-6 h-6 text-[#0B1117] mb-3" />
                <div className="font-bold text-[#161d1d]">Retake the quiz</div>
                <div className="text-sm text-[#3b4949] mt-1">Adjust your answers and get a fresh report.</div>
              </button>
            </Link>
            <Link href="/outfitter">
              <button className="w-full h-full bg-white border border-[#E2E8F0] rounded-2xl p-6 text-left hover:border-[#0B1117] transition-colors">
                <MessageCircle className="w-6 h-6 text-[#0B1117] mb-3" />
                <div className="font-bold text-[#161d1d]">Ask the RV Outfitter</div>
                <div className="text-sm text-[#3b4949] mt-1">Have questions about your picks or anything RV-related? Ask away.</div>
              </button>
            </Link>
            <Link href="/browse">
              <button className="w-full h-full bg-white border border-[#E2E8F0] rounded-2xl p-6 text-left hover:border-[#0B1117] transition-colors">
                <ArrowRight className="w-6 h-6 text-[#0B1117] mb-3" />
                <div className="font-bold text-[#161d1d]">Browse all inventory</div>
                <div className="text-sm text-[#3b4949] mt-1">See every listing and filter on your own terms.</div>
              </button>
            </Link>
          </div>
        </div>
      </section>

      {contactPick && <ContactDealerModal pick={contactPick} onClose={() => setContactPick(null)} />}
    </Layout>
  );
}

function PickCard({ pick, pickNumber, onContact }: { pick: Pick; pickNumber: number; onContact: () => void }) {
  const meta = TIER_META[pick.tier];
  const Icon = meta.icon;
  const l = pick.listing;
  const img = l.images[0];
  const matchPercent = pick.matchScore ?? TIER_FALLBACK_SCORE[pick.tier] ?? 85;

  return (
    <article className="bg-white rounded-3xl border border-[#E2E8F0] overflow-hidden shadow-sm">
      {/* Tier banner */}
      <div className={`${meta.color} px-6 py-4 flex items-center gap-3`}>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <span className="font-black uppercase tracking-widest text-sm block">{meta.label}</span>
          <span className="text-xs opacity-70">{meta.subtitle}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-0">
        {/* Image */}
        <div className="md:col-span-2 bg-[#eef5f4] aspect-[4/3] md:aspect-auto md:min-h-[280px] relative">
          {img ? (
            <img
              src={img}
              alt={l.title}
              width={640}
              height={480}
              loading={pickNumber === 1 ? "eager" : "lazy"}
              decoding="async"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#3b4949] text-sm">No photo</div>
          )}
          {l.dealSavings > 0 && (
            <div className="absolute top-3 left-3 bg-[#0B1117] text-white px-3 py-1 rounded text-xs font-black">
              ${l.dealSavings.toLocaleString()} below market
            </div>
          )}
        </div>

        {/* Body */}
        <div className="md:col-span-3 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-start gap-4 min-w-0">
              <MatchArc percent={matchPercent} />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-widest text-[#3b4949]">{formatType(l.type)} • {l.condition === "new" ? "New" : "Used"}</p>
                <h3 className="text-xl sm:text-2xl font-display font-black text-[#161d1d] tracking-tight mt-1">
                  {l.year} {l.make} {l.model}
                </h3>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-2xl sm:text-3xl font-black text-[#0B1117]">${l.price.toLocaleString()}</div>
              {l.marketValue > 0 && l.marketValue !== l.price && (
                <div className="text-xs text-[#3b4949]">Market: ${l.marketValue.toLocaleString()}</div>
              )}
            </div>
          </div>

          {/* Specs */}
          <div className="flex flex-wrap gap-3 mb-5 text-xs text-[#3b4949]">
            <span className="inline-flex items-center gap-1.5 bg-[#eef5f4] px-3 py-1.5 rounded"><Bed className="w-3.5 h-3.5" /> Sleeps {l.sleeps}</span>
            {l.length && <span className="inline-flex items-center gap-1.5 bg-[#eef5f4] px-3 py-1.5 rounded"><Ruler className="w-3.5 h-3.5" /> {l.length}ft</span>}
            <span className="inline-flex items-center gap-1.5 bg-[#eef5f4] px-3 py-1.5 rounded"><MapPin className="w-3.5 h-3.5" /> {l.location}</span>
            <span className="inline-flex items-center gap-1.5 bg-[#eef5f4] px-3 py-1.5 rounded"><Calendar className="w-3.5 h-3.5" /> {l.daysOnMarket}d on market</span>
          </div>

          {/* Why it fits — the key personalized section */}
          {pick.whyItFits && (
            <div className="mb-5 bg-[#00CED1]/10 border border-[#00CED1]/30 rounded-2xl p-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-[#0B1117] mb-2 flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5" /> Why this fits your camping life
              </h4>
              <p className="text-sm text-[#161d1d] leading-relaxed">{pick.whyItFits}</p>
            </div>
          )}

          {/* Tradeoffs — honest and trust-building */}
          {pick.tradeoffs.length > 0 && (
            <div className="mb-5">
              <h4 className="text-xs font-black uppercase tracking-widest text-[#924c00] mb-2 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Things to consider
              </h4>
              <ul className="space-y-1.5">
                {pick.tradeoffs.map((t, i) => (
                  <li key={i} className="text-sm text-[#3b4949] leading-relaxed flex gap-2">
                    <span className="text-[#924c00]">•</span>{t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Price context */}
          {pick.priceContext && (
            <div className="mb-6 text-xs text-[#3b4949] italic">{pick.priceContext}</div>
          )}

          {/* CTAs */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onContact}
              className="bg-[#00CED1] text-[#0B1117] px-6 py-3 rounded font-black text-sm flex items-center gap-2 hover:brightness-110 transition-all"
            >
              <MessageCircle className="w-4 h-4" /> Contact Dealer
            </button>
            <Link href={`/listing/${l.id}`}>
              <button className="bg-white text-[#0B1117] border-2 border-[#0B1117] px-6 py-3 rounded font-black text-sm hover:bg-[#0B1117]/5 transition-colors flex items-center gap-2">
                See Full Details <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </div>

          <p className="text-xs text-[#3b4949] mt-4">{l.dealerName}</p>
        </div>
      </div>
    </article>
  );
}
