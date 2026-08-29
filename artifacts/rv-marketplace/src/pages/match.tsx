import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { useChatSession } from "@/hooks/use-chat-session";
import { trackEvent } from "@/lib/analytics";
import { trackClarity } from "@/lib/clarity";
import { buildLeadBuyerProfile } from "@/lib/buyer-intent";
import { useAppAuth } from "@/contexts/auth-context";
import type { BuyerProfile } from "@workspace/api-client-react";
import type { ExpansionSuggestion } from "@/hooks/use-chat-session";
import {
  Send, Loader2, Sparkles, CheckCircle2,
  ArrowRight, Shield, Star, AlertTriangle, User, Phone,
  Compass, Heart, TreePine, Mic, MicOff,
} from "lucide-react";
import { useSpeechToText } from "@/hooks/use-speech-to-text";

const AGENT_PRICE_FROM = 499;

function MatchReadyCard({
  count, onViewReport, isGenerating, hasFailed,
}: {
  count: number; onViewReport: () => void; isGenerating: boolean; hasFailed: boolean;
}) {
  return (
    <div className="bg-white border-2 border-[#0B1117] rounded-3xl overflow-hidden shadow-xl">
      <div className="bg-[#0B1117] px-5 py-5 text-white text-center">
        <div className="w-12 h-12 rounded-full bg-[#00CED1]/20 flex items-center justify-center mx-auto mb-3">
          {isGenerating ? (
            <Loader2 className="w-6 h-6 text-[#00CED1] animate-spin" />
          ) : (
            <CheckCircle2 className="w-6 h-6 text-[#00CED1]" />
          )}
        </div>
        <div className="text-[10px] font-black uppercase tracking-widest text-[#00CED1] mb-1">
          {isGenerating ? "Building Your Report" : "Your Report Is Ready"}
        </div>
        <div className="font-display font-black text-xl">
          {isGenerating
            ? "Finding the 3 RVs that fit your life..."
            : `Your Top ${count} RV Picks Are Ready`
          }
        </div>
        <div className="text-white/60 text-xs mt-1">
          {isGenerating
            ? "Analyzing live inventory against your camping lifestyle"
            : "Personalized to how you actually camp"
          }
        </div>
        {isGenerating && (
          <div className="text-[#00CED1]/70 text-[11px] mt-1 font-medium">
            Hang tight — usually about 15 seconds…
          </div>
        )}
      </div>

      <div className="px-5 pt-5 pb-2">
        <div className="grid grid-cols-2 gap-2">
          {[
            "Matched to your lifestyle",
            "Honest tradeoffs included",
            "Live dealer inventory",
            "Why each one fits YOU",
          ].map(f => (
            <div key={f} className="flex items-start gap-1.5 text-xs text-[#3b4949]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#0B1117] flex-shrink-0 mt-0.5" />
              {f}
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5 space-y-2.5 mt-4">
        {hasFailed && !isGenerating && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-center">
            Something went wrong building your report. Tap below to try again.
          </div>
        )}
        <button
          onClick={onViewReport}
          disabled={isGenerating}
          className="w-full py-4 rounded-2xl bg-[#0B1117] text-white font-black text-base hover:bg-[#002829] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {isGenerating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Building report...</>
          ) : hasFailed ? (
            <><ArrowRight className="w-4 h-4" /> Try Again</>
          ) : (
            <><Star className="w-4 h-4" /> See My {count} Matches</>
          )}
        </button>
        <div className="flex items-center justify-center gap-3 text-[10px] text-[#3b4949]">
          <div className="flex items-center gap-1"><Heart className="w-3 h-3" /> 100% free</div>
        </div>
      </div>
    </div>
  );
}

function EmailCaptureCard({
  onCaptured, onSkip, fallbackQuiz,
}: {
  onCaptured: (email: string) => void; onSkip: () => void; fallbackQuiz: Record<string, unknown>;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError("");
    const clean = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      // The report may still be generating when the email is submitted, so fall
      // back to the quiz answers built from the live profile.
      let reportId: string | null = null;
      let quiz: Record<string, unknown> = fallbackQuiz;
      try {
        const stored = sessionStorage.getItem("matchrv_report");
        if (stored) {
          const r = JSON.parse(stored) as { reportId?: string; quiz?: Record<string, unknown> };
          reportId = r.reportId ?? null;
          quiz = r.quiz ?? fallbackQuiz;
        }
      } catch { /* ignore */ }
      const res = await fetch(`/api/match-report/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean, reportId, quiz, source: "match_quiz" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Something went wrong. Please try again.");
      }
      try { localStorage.setItem("matchrv_email", clean); } catch { /* ignore */ }
      trackClarity("email_captured");
      trackEvent("match_report_email_capture", { metadata: { reportId, source: "match_quiz" } });
      onCaptured(clean);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border-2 border-[#00CED1] rounded-3xl overflow-hidden shadow-xl">
      <div className="bg-[#0B1117] px-5 py-5 text-white text-center">
        <div className="w-12 h-12 rounded-full bg-[#00CED1]/20 flex items-center justify-center mx-auto mb-3">
          <Sparkles className="w-6 h-6 text-[#00CED1]" />
        </div>
        <div className="text-[10px] font-black uppercase tracking-widest text-[#00CED1] mb-1">One Last Thing</div>
        <div className="font-display font-black text-xl">Where should we send your Match Report?</div>
        <div className="text-white/60 text-xs mt-1">
          We'll email you a copy so you don't lose your picks — plus price-drop alerts on your matches.
        </div>
      </div>
      <form onSubmit={handleSubmit} className="px-5 py-5 space-y-2.5">
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoFocus
          className={`w-full px-4 py-3 rounded-xl border-2 text-sm text-[#161d1d] placeholder:text-[#6b7a7a] focus:outline-none bg-white ${
            error ? "border-red-400 focus:border-red-400" : "border-[#00CED1]/50 focus:border-[#00CED1]"
          }`}
        />
        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 rounded-2xl bg-[#0B1117] text-white font-black text-base hover:bg-[#002829] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Email My Report <ArrowRight className="w-4 h-4" /></>}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="w-full text-center text-xs text-[#3b4949] underline underline-offset-2 py-1 hover:text-[#161d1d]"
        >
          Skip — just show my matches
        </button>
        <div className="flex items-center justify-center gap-3 text-[10px] text-[#3b4949]">
          <div className="flex items-center gap-1"><Shield className="w-3 h-3" /> No spam, ever</div>
          <div className="flex items-center gap-1"><Heart className="w-3 h-3" /> 100% free</div>
        </div>
      </form>
    </div>
  );
}

function AgentInterestCard({ profile, onDone }: { profile: BuyerProfile; onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(() => {
    try { return localStorage.getItem("rv_sms_opt_in") === "true"; } catch { return false; }
  });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean }>({});

  const nameError = !name.trim() ? "Please enter your name." : "";
  const emailError = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? "Please enter a valid email address."
    : "";

  const handleSubmit = async () => {
    setTouched({ name: true, email: true });
    if (nameError || emailError) return;
    setLoading(true);
    try {
      try { localStorage.setItem("rv_sms_opt_in", String(smsOptIn)); } catch { /* ignore */ }
      await fetch(`/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName: name.trim(),
          contactEmail: email.trim(),
          contactPhone: phone.trim() || null,
          buyerProfile: buildLeadBuyerProfile(profile as Record<string, unknown>, { leadSource: "buyers_agent_inquiry" }),
          message: `Buyers Agent Inquiry — Starting at $${AGENT_PRICE_FROM}`,
          leadSource: "buyers_agent_inquiry",
          smsOptIn,
        }),
      });
    } catch { /* silent */ }
    setLoading(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-3xl p-6 text-center">
        <CheckCircle2 className="w-10 h-10 text-amber-600 mx-auto mb-2" />
        <div className="font-black text-[#161d1d] mb-1">We'll be in touch!</div>
        <p className="text-sm text-[#3b4949] mb-4">Expect a call or email within 1 business day.</p>
        <button onClick={onDone} className="text-xs text-[#3b4949] underline">Close</button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-amber-300 rounded-3xl p-5 shadow-lg">
      <div className="font-display font-black text-lg text-[#161d1d] mb-1">Want a real person doing this?</div>
      <div className="text-sm text-[#3b4949] mb-3 leading-relaxed">
        A dedicated buyers agent handles your entire search — from shortlisting to negotiating the deal.
      </div>
      <div className="text-base font-black text-amber-900 mb-3">Starting at ${AGENT_PRICE_FROM}</div>
      <ul className="space-y-1.5 text-xs text-[#3b4949] mb-5">
        {[
          "Dedicated agent assigned within 24 hours",
          "Curated shortlist from all WA dealer inventory",
          "Scheduling & coordination with dealers",
          "Professional negotiation on your behalf",
          "Guidance through paperwork & closing",
        ].map(f => (
          <li key={f} className="flex items-start gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#0B1117] flex-shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>
      <div className="space-y-2.5">
        <div>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3b4949]" />
            <input type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, name: true }))}
              className={`w-full pl-9 pr-4 py-3 rounded-xl border text-sm text-[#161d1d] placeholder:text-[#6b7a7a] focus:outline-none bg-white ${
                touched.name && nameError ? "border-red-400 focus:border-red-400" : "border-[#E2E8F0] focus:border-[#0B1117]"
              }`} />
          </div>
          {touched.name && nameError && <p className="mt-1 text-xs font-semibold text-red-600">{nameError}</p>}
        </div>
        <div>
          <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)}
            onBlur={() => setTouched(t => ({ ...t, email: true }))}
            className={`w-full px-4 py-3 rounded-xl border text-sm text-[#161d1d] placeholder:text-[#6b7a7a] focus:outline-none bg-white ${
              touched.email && emailError ? "border-red-400 focus:border-red-400" : "border-[#E2E8F0] focus:border-[#0B1117]"
            }`} />
          {touched.email && emailError && <p className="mt-1 text-xs font-semibold text-red-600">{emailError}</p>}
        </div>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3b4949]" />
          <input type="tel" placeholder="Phone (optional)" value={phone} onChange={e => setPhone(e.target.value)}
            className="w-full pl-9 pr-4 py-3 rounded-xl border border-[#E2E8F0] text-sm text-[#161d1d] placeholder:text-[#6b7a7a] focus:outline-none focus:border-[#0B1117] bg-white" />
        </div>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={smsOptIn}
            onChange={e => setSmsOptIn(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#E2E8F0] accent-amber-600 flex-shrink-0"
          />
          <span className="text-xs text-[#3b4949] leading-relaxed">
            Text me updates about my matches and price drops. Standard message & data rates may apply.{" "}
            <a href="/privacy" className="underline hover:text-[#161d1d]" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
          </span>
        </label>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-3.5 rounded-2xl bg-amber-600 text-white font-black text-sm hover:bg-amber-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Request a Buyers Agent"}
        </button>
      </div>
    </div>
  );
}

export function Match() {
  const {
    messages, sendMessage, isTyping, profile,
    recommendations, stage, noMatch,
    expansionSuggestions,
  } = useChatSession();
  useAppAuth();

  const [, navigate] = useLocation();
  const [input, setInput] = useState("");
  const [showAgent, setShowAgent] = useState(false);
  const [emailDone, setEmailDone] = useState(() => {
    try { return !!localStorage.getItem("matchrv_email"); } catch { return false; }
  });
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportFailed, setReportFailed] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    trackEvent("page_view", { metadata: { page: "match_quiz_chat" } });
  }, []);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, isTyping]);

  // Auto-generate report when matches are ready. The backend may signal readiness
  // as either "complete" or "matching" (e.g. when the buyer says "show me everything"
  // and the server safety net forces the matching stage), so accept both.
  const matchesReady =
    (stage === "complete" || stage === "matching") && recommendations.length > 0;
  const reportGenerated = useRef(false);
  const quizCompletedTracked = useRef(false);

  useEffect(() => {
    if (matchesReady && !reportGenerated.current && !isGeneratingReport) {
      reportGenerated.current = true;
      generateReport();
    }
    if (matchesReady && !quizCompletedTracked.current) {
      quizCompletedTracked.current = true;
      trackClarity("quiz_completed");
    }
  }, [matchesReady]);

  // Quiz progress: 7 core questions the guide walks through
  const QUIZ_STEPS: { key: string; done: boolean }[] = [
    { key: "useCase", done: !!profile.useCase },
    { key: "travelers", done: profile.travelers != null },
    { key: "rvType", done: !!profile.rvType },
    { key: "towVehicle", done: !!profile.towVehicle || (!!profile.rvType && !["travel_trailer","fifth_wheel","toy_hauler","popup_camper","truck_camper","not_sure"].includes(profile.rvType)) },
    { key: "budget", done: profile.maxBudget != null },
    { key: "campingStyle", done: !!profile.campingStyle },
    { key: "mustHaves", done: Array.isArray(profile.mustHaves) && profile.mustHaves.length > 0 },
  ];
  const answeredCount = QUIZ_STEPS.filter(s => s.done).length;
  const totalSteps = QUIZ_STEPS.length;
  const currentStep = Math.min(answeredCount + 1, totalSteps);
  const quizInProgress = !matchesReady && answeredCount > 0;

  // Build quiz payload from the live profile (also used as the lead fallback
  // when the email is submitted before report generation finishes).
  const buildQuizPayload = () => {
    const realType = profile.rvType && profile.rvType !== "not_sure" ? profile.rvType : null;
    const towableTypes = ["travel_trailer","fifth_wheel","toy_hauler","popup_camper","truck_camper"];
    return {
        useCase: profile.useCase,
        travelers: profile.travelers,
        hasKids: profile.hasKids,
        hasPets: profile.hasPets,
        driveType: realType
          ? (towableTypes.includes(realType) ? "towable" : "drivable")
          : "either",
        rvType: realType,
        towVehicle: profile.towVehicle,
        towCapacity: profile.towVehicle ? undefined : undefined, // Let server estimate
        budgetMin: profile.minBudget,
        budgetMax: profile.maxBudget,
        lengthMin: profile.lengthFlexibility ? undefined : profile.minLength,
        lengthMax: profile.lengthFlexibility ? undefined : profile.maxLength,
        campingStyle: profile.campingStyle,
        mustHaves: profile.mustHaves,
        experience: profile.experience,
        activities: profile.activities,
        intendedUse: profile.intendedUse,
    };
  };

  const generateReport = async () => {
    setIsGeneratingReport(true);
    setReportFailed(false);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35_000);
    try {
      const quizPayload = buildQuizPayload();

      const res = await fetch(`/api/match-report/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quiz: quizPayload }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const report = await res.json();
        sessionStorage.setItem("matchrv_report", JSON.stringify(report));
        trackEvent("match_report_generated", {
          metadata: { reportId: report.reportId, picksCount: report.picks?.length },
        });
      } else {
        setReportFailed(true);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("Report generation failed:", err);
      setReportFailed(true);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleViewReport = () => {
    const stored = sessionStorage.getItem("matchrv_report");
    if (stored) {
      navigate("/match-report");
    } else if (!isGeneratingReport) {
      reportGenerated.current = false;
      setReportFailed(false);
      generateReport().then(() => {
        const s = sessionStorage.getItem("matchrv_report");
        if (s) navigate("/match-report");
      });
    }
  };

  const { status: micStatus, toggle: toggleMic } = useSpeechToText({
    onResult: (transcript) => setInput(prev => prev ? `${prev} ${transcript}` : transcript),
  });

  const quizStartedTracked = useRef(false);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || isTyping) return;
    if (!quizStartedTracked.current) {
      quizStartedTracked.current = true;
      trackClarity("quiz_started");
    }
    setInput("");
    await sendMessage(text);
  };

  const reportReady = !isGeneratingReport && !!sessionStorage.getItem("matchrv_report");

  return (
    <Layout>
      <SEO
        title="Find Your RV — Free Personalized Match Report"
        description="Tell us about your camping lifestyle and we'll match you with 3 RVs from live dealer inventory. No pressure, just honest guidance."
        canonical="https://matchrv.com/match"
      />

      <div className="flex flex-col" style={{ height: "calc(100vh - 5rem)" }}>

        <section className="bg-[#0B1117] text-white py-6 px-4 flex-shrink-0">
          <div className="max-w-2xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 mb-2 px-3 py-1.5 rounded bg-white/10 border border-white/20">
              <Compass className="w-3.5 h-3.5 text-[#00CED1]" />
              <span className="text-xs font-black uppercase tracking-widest text-[#00CED1]">RV Guide</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-black tracking-tighter mb-1">
              Let's Find What Fits Your Life
            </h1>
            <p className="text-white/70 text-sm leading-relaxed max-w-lg mx-auto">
              No pressure, no sales pitch. Just tell me about your camping plans and I'll show you 3 RVs that actually make sense for how you live.
            </p>
            <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-white/50">
              <span className="flex items-center gap-1"><TreePine className="w-3 h-3" /> No account needed</span>
              <span>·</span>
              <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> Free forever</span>
            </div>
          </div>
        </section>

        <div className="flex-1 bg-background flex flex-col overflow-hidden">
          {quizInProgress && (
            <div className="bg-white border-b border-[#E2E8F0] flex-shrink-0">
              <div className="max-w-2xl mx-auto px-4 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-[#161d1d]">
                    Question {currentStep} of {totalSteps}
                  </span>
                  <span className="text-[11px] text-[#3b4949]">
                    {answeredCount === totalSteps ? "Almost done!" : `${totalSteps - answeredCount} to go`}
                  </span>
                </div>
                <div className="h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden" role="progressbar" aria-valuenow={answeredCount} aria-valuemin={0} aria-valuemax={totalSteps}>
                  <div
                    className="h-full bg-[#00CED1] rounded-full transition-all duration-500"
                    style={{ width: `${(answeredCount / totalSteps) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-3">

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-[#0B1117] flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                  <Compass className="w-3.5 h-3.5 text-[#00CED1]" />
                </div>
              )}
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-[#0B1117] text-white rounded-br-sm"
                    : "bg-white border border-[#E2E8F0] text-[#161d1d] rounded-bl-sm shadow-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-[#0B1117] flex items-center justify-center flex-shrink-0 mr-2">
                <Compass className="w-3.5 h-3.5 text-[#00CED1]" />
              </div>
              <div className="bg-white border border-[#E2E8F0] rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                <div className="flex gap-1 items-center h-4">
                  {[0, 150, 300].map(delay => (
                    <div
                      key={delay}
                      className="w-1.5 h-1.5 bg-[#3b4949] rounded-full animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {noMatch && !isTyping && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm">
              <div className="flex items-center gap-2 font-bold text-amber-800 mb-2">
                <AlertTriangle className="w-4 h-4" />
                No exact matches for those criteria
              </div>
              {expansionSuggestions.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  {expansionSuggestions.map((s: ExpansionSuggestion, i: number) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s.message ?? s.label)}
                      className="text-left px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {matchesReady && !emailDone && (
            <EmailCaptureCard
              fallbackQuiz={buildQuizPayload()}
              onCaptured={() => setEmailDone(true)}
              onSkip={() => {
                trackClarity("email_skipped");
                trackEvent("match_report_email_skip", { metadata: { source: "match_quiz" } });
                setEmailDone(true);
              }}
            />
          )}

          {matchesReady && emailDone && (
            <MatchReadyCard
              count={recommendations.length}
              onViewReport={handleViewReport}
              isGenerating={isGeneratingReport}
              hasFailed={reportFailed}
            />
          )}

          {matchesReady && emailDone && reportReady && (
            <div className="mt-2">
              <button
                onClick={() => setShowAgent(true)}
                className="w-full text-left bg-amber-50 border border-amber-200 rounded-2xl p-4 hover:bg-amber-100 transition"
              >
                <div className="text-[10px] font-black text-amber-800 uppercase tracking-wider mb-1">Prefer a real person?</div>
                <p className="text-xs text-amber-700 leading-relaxed">
                  A dedicated buyers agent can handle everything — matching, dealer calls, and negotiation. Starting at ${AGENT_PRICE_FROM}.
                </p>
              </button>
            </div>
          )}

          {showAgent && (
            <AgentInterestCard profile={profile} onDone={() => setShowAgent(false)} />
          )}

            </div>
          </div>

          {!matchesReady && (
            <div className="bg-white border-t border-[#E2E8F0] shadow-md flex-shrink-0">
              <form onSubmit={handleSend} className="max-w-2xl mx-auto px-4 py-3 flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder={micStatus === "listening" ? "Listening…" : "Type your answer…"}
                  className={`flex-1 px-4 py-3 rounded-xl border-2 text-sm text-[#161d1d] placeholder:text-[#6b7a7a] focus:outline-none focus:ring-2 focus:ring-[#00CED1]/30 bg-white transition ${
                    micStatus === "listening"
                      ? "border-red-400 focus:border-red-400 bg-red-50"
                      : "border-[#00CED1]/50 focus:border-[#00CED1]"
                  }`}
                  disabled={isTyping}
                />
                {micStatus !== "unsupported" && (
                  <button
                    type="button"
                    onClick={toggleMic}
                    disabled={isTyping}
                    title={micStatus === "listening" ? "Stop recording" : "Speak your answer"}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center transition flex-shrink-0 disabled:opacity-40 ${
                      micStatus === "listening"
                        ? "bg-red-500 text-white animate-pulse"
                        : "bg-[#eef5f4] text-[#3b4949] hover:bg-[#E2E8F0]"
                    }`}
                  >
                    {micStatus === "listening" ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!input.trim() || isTyping}
                  className="w-12 h-12 rounded-xl bg-[#0B1117] text-white flex items-center justify-center hover:bg-[#002829] transition disabled:opacity-40 flex-shrink-0"
                >
                  {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}
