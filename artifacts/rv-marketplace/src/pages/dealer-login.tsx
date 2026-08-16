import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Building2, CheckCircle2, LockKeyhole, Mail, ShieldCheck, Sparkles, Zap, Bot } from "lucide-react";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { getDealerSession, setDealerSession, type DealerTier } from "@/lib/dealer-auth";
import { trackEvent } from "@/lib/analytics";

const TIER_OPTIONS: { value: DealerTier; label: string; description: string; badge: string; icon: typeof Sparkles }[] = [
  {
    value: "free",
    label: "Leads",
    description: "Free, included at signup",
    badge: "Free",
    icon: CheckCircle2,
  },
  {
    value: "intelligence",
    label: "Inventory Intelligence",
    description: "Aged stock, demand gaps, hot units",
    badge: "Tier 1",
    icon: Zap,
  },
  {
    value: "agent",
    label: "AI Lead Agent",
    description: "Autonomous 24/7 lead qualification",
    badge: "Tier 2",
    icon: Bot,
  },
];

export function DealerLogin() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tier, setTier] = useState<DealerTier>("free");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    trackEvent("page_view", { metadata: { page: "dealer_login" } });
    if (getDealerSession()) {
      setLocation("/dealers", { replace: true });
    }
  }, [setLocation]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError("");

    if (!email.trim()) {
      setError("Enter your dealer email to continue.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Use a valid dealer email address.");
      return;
    }
    if (!password.trim()) {
      setError("Enter your password to continue.");
      return;
    }

    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 450));
    setDealerSession(email, tier);
    trackEvent("dealer_login", { metadata: { method: "local_demo", tier } });
    setLocation("/dealers");
  }

  return (
    <Layout>
      <SEO
        title="Dealer Login - MatchRV"
        description="Sign in to the MatchRV dealer portal to manage leads, quotes, CRM routing, and performance reporting."
        canonical="https://matchrv.com/dealers/login"
      />
      <section className="min-h-[calc(100vh-80px)] bg-[#f4fbfa] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div className="space-y-7">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#0B1117] hover:text-[#00643f]">
              MatchRV dealer access
              <ArrowRight className="h-4 w-4" />
            </Link>
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded bg-[#00CED1] px-4 py-1.5 text-xs font-black uppercase tracking-widest text-[#0B1117]">
                <Sparkles className="h-3.5 w-3.5" />
                Dealer portal
              </span>
              <h1 className="font-display text-4xl font-black leading-tight tracking-tight text-[#0B1117] sm:text-5xl">
                Sign in to your dealership workspace.
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-[#3b4949]">
                Review high-intent MatchRV buyers, route leads to your CRM, send custom quotes, and track performance from one focused dashboard.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                "Lead scoring",
                "Quote follow-up",
                "CRM routing",
              ].map((label) => (
                <div key={label} className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm font-bold text-[#161d1d] shadow-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#00696b]" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-7 flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-black text-[#161d1d]">Dealer Login</h2>
                  <p className="mt-1 text-sm text-[#6b7a7a]">Use your dealership email to continue.</p>
                </div>
                <div className="rounded-2xl bg-[#e8f7ee] p-3 text-[#0B1117]">
                  <Building2 className="h-6 w-6" />
                </div>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit}>
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-widest text-[#6b7a7a]">Dealer email</span>
                  <span className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#f4fbfa] px-4 py-3 focus-within:border-[#0B1117] focus-within:ring-2 focus-within:ring-[#0B1117]/10">
                    <Mail className="h-5 w-5 shrink-0 text-[#6b7a7a]" />
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                      autoComplete="email"
                      autoFocus
                      placeholder="dealer@example.com"
                      className="w-full bg-transparent text-sm font-semibold text-[#161d1d] outline-none placeholder:text-[#6b7a7a]"
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-widest text-[#6b7a7a]">Password</span>
                  <span className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#f4fbfa] px-4 py-3 focus-within:border-[#0B1117] focus-within:ring-2 focus-within:ring-[#0B1117]/10">
                    <LockKeyhole className="h-5 w-5 shrink-0 text-[#6b7a7a]" />
                    <input
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      type="password"
                      autoComplete="current-password"
                      placeholder="Password"
                      className="w-full bg-transparent text-sm font-semibold text-[#161d1d] outline-none placeholder:text-[#6b7a7a]"
                    />
                  </span>
                </label>

                {error && (
                  <p className="rounded-xl bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#9f2f12]">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B1117] px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-[#0B1117]/15 transition-transform hover:scale-[0.99] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Signing in..." : (<>Sign in to dealer portal <ArrowRight className="h-4 w-4" /></>)}
                </button>
              </form>

              <div className="mt-6 flex items-start gap-3 rounded-2xl bg-[#eef5f4] p-4 text-sm text-[#3b4949]">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0B1117]" />
                <p>
                  Demo mode accepts any dealer email and password. Use the tier selector below to preview each feature set.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
              <p className="mb-4 text-xs font-black uppercase tracking-widest text-[#6b7a7a]">Demo tier: preview portal features</p>
              <div className="space-y-3">
                {TIER_OPTIONS.map(({ value, label, description, badge, icon: Icon }) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-all ${
                      tier === value
                        ? "border-[#0B1117] bg-[#0B1117]/5 ring-2 ring-[#0B1117]/10"
                        : "border-[#E2E8F0] hover:border-[#0B1117]/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="tier"
                      value={value}
                      checked={tier === value}
                      onChange={() => setTier(value)}
                      className="hidden"
                    />
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      tier === value ? "bg-[#0B1117] text-white" : "bg-[#eef5f4] text-[#6b7a7a]"
                    }`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-[#161d1d]">{label}</p>
                      <p className="text-xs text-[#6b7a7a]">{description}</p>
                    </div>
                    <span className={`shrink-0 rounded px-3 py-1 text-xs font-black ${
                      value === "free"
                        ? "bg-[#00CED1] text-[#0B1117]"
                        : value === "intelligence"
                        ? "bg-[#ffe08b] text-[#241a00]"
                        : "bg-[#0B1117] text-white"
                    }`}>{badge}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
