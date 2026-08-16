import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { useChatSession } from "@/hooks/use-chat-session";
import { Send, Loader2, Sparkles, Compass, ChevronRight, Heart, ExternalLink, Search, AlertTriangle, RefreshCw, MessageCircle, HelpCircle, Mic, MicOff } from "lucide-react";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { formatCurrency, formatRvType } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { useAppAuth } from "@/contexts/auth-context";
import type { BuyerProfile } from "@workspace/api-client-react/src/generated/api.schemas";
import type { ExpansionSuggestion } from "@/hooks/use-chat-session";

// ── Client-side budget helper (mirrors server formula) ──────────────────────
function computeMaxBudget(prof: BuyerProfile): number | null {
  if (prof.maxBudget) return prof.maxBudget;
  if (prof.monthlyPayment) {
    const r = 0.0699 / 12;
    const n = 180;
    const loan = prof.monthlyPayment * ((1 - Math.pow(1 + r, -n)) / r);
    return Math.round(loan + (prof.downPayment ?? 0));
  }
  return null;
}

// ── Match reason badges for a listing vs buyer profile ──────────────────────
function getMatchBadges(listing: Record<string, unknown>, prof: BuyerProfile): string[] {
  const badges: string[] = [];

  if (prof.rvType && prof.rvType !== "not_sure" && listing.type === prof.rvType) {
    badges.push(`${formatRvType(prof.rvType)} ✓`);
  }

  if (listing.length != null) {
    const l = Number(listing.length);
    const hasRange = prof.minLength || prof.maxLength;
    if (hasRange) {
      const minOk = !prof.minLength || l >= prof.minLength - 1;
      const maxOk = !prof.maxLength || l <= prof.maxLength + 1;
      if (minOk && maxOk) badges.push(`${l.toFixed(0)} ft ✓`);
    }
  }

  const maxB = computeMaxBudget(prof);
  if (maxB && Number(listing.price) <= maxB) badges.push("Within budget ✓");

  const needed = prof.sleepingCapacity ?? prof.travelers;
  if (needed && Number(listing.sleeps) >= Number(needed)) {
    badges.push(`Sleeps ${listing.sleeps} ✓`);
  }

  if (prof.useCase && prof.useCase !== "other") {
    const useCaseLabel: Record<string, string> = {
      weekends: "Weekend-ready ✓",
      full_time: "Full-time ✓",
      seasonal: "Seasonal ✓",
      tailgating: "Tailgating ✓",
    };
    const label = useCaseLabel[prof.useCase];
    if (label) badges.push(label);
  }

  return badges.slice(0, 4);
}

// ── Suggested questions for open Q&A mode ───────────────────────────────────
const SUGGESTED_QUESTIONS = [
  { label: "What's the difference between a fifth wheel and a travel trailer?", icon: HelpCircle },
  { label: "What should I look for in a used RV?", icon: Search },
  { label: "Can I full-time in an RV?", icon: Compass },
  { label: "Help me find my perfect RV", icon: Heart },
];

export function Outfitter() {
  const { messages, sendMessage, isTyping, profile, recommendations, stage, noMatch, noMatchFilters, expansionSuggestions, messagesEndRef } = useChatSession();
  const { isAuthenticated, login, isSaved, toggleSave } = useAppAuth();
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [smsOptIn, setSmsOptIn] = useState(() => {
    try { return localStorage.getItem("rv_sms_opt_in") === "true"; } catch { return false; }
  });

  useEffect(() => {
    trackEvent("page_view", { metadata: { page: "outfitter_chat" } });
  }, []);

  // Hide suggestions after first user message
  useEffect(() => {
    if (messages.length > 1) {
      setShowSuggestions(false);
    }
  }, [messages]);

  const { status: micStatus, toggle: toggleMic } = useSpeechToText({
    onResult: (transcript) => setInput(prev => prev ? `${prev} ${transcript}` : transcript),
  });

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || isTyping) return;
    setInput("");
    await sendMessage(text);
  };

  const handleSuggestionClick = (question: string) => {
    setShowSuggestions(false);
    sendMessage(question);
  };

  const hasRecommendations = recommendations.length > 0;

  return (
    <Layout>
      <SEO
        title="RV Outfitter — Your Personal RV Expert"
        description="Ask any RV question or let our AI Outfitter help you find the perfect RV for your lifestyle. Free, no pressure."
        canonical="https://matchrv.com/outfitter"
      />

      <div className="flex flex-col" style={{ height: "calc(100vh - 5rem)" }}>

        {/* Header */}
        <section className="bg-[#0B1117] text-white py-5 px-4 flex-shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#00CED1]/20 flex items-center justify-center flex-shrink-0">
                <Compass className="w-5 h-5 text-[#00CED1]" />
              </div>
              <div>
                <h1 className="text-lg font-display font-black tracking-tight">RV Outfitter</h1>
                <p className="text-white/60 text-xs">
                  Ask me anything about RVs — or say "help me find one" to get personalized matches
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Chat area */}
        <div className="flex-1 bg-background flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-3">

              {/* Messages */}
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

              {/* Typing indicator */}
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

              {/* Suggested questions (shown initially) */}
              {showSuggestions && messages.length <= 1 && !isTyping && (
                <div className="mt-4">
                  <p className="text-xs text-[#3b4949] mb-3 font-medium">Or try one of these:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SUGGESTED_QUESTIONS.map((q) => {
                      const Icon = q.icon;
                      return (
                        <button
                          key={q.label}
                          onClick={() => handleSuggestionClick(q.label)}
                          className="text-left px-4 py-3 bg-white border border-[#E2E8F0] rounded-xl text-sm text-[#161d1d] hover:border-[#0B1117] hover:bg-[#00CED1]/5 transition flex items-start gap-2.5"
                        >
                          <Icon className="w-4 h-4 text-[#0B1117] flex-shrink-0 mt-0.5" />
                          <span>{q.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* No match state */}
              {noMatch && !isTyping && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm">
                  <div className="flex items-center gap-2 font-bold text-amber-800 mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    No exact matches for those criteria
                  </div>
                  <p className="text-amber-700 text-xs mb-3">
                    Our inventory changes daily. Here are some options:
                  </p>
                  {expansionSuggestions.length > 0 && (
                    <div className="flex flex-col gap-2">
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

              {/* Recommendations */}
              {hasRecommendations && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-[#0B1117]" />
                    <span className="text-sm font-black text-[#161d1d]">Your Matches</span>
                  </div>

                  {!isAuthenticated ? (
                    /* ── Sign-in gate ── */
                    <div className="bg-white border border-[#0B1117]/20 rounded-2xl p-6 text-center shadow-sm">
                      <div className="w-12 h-12 rounded-full bg-[#00CED1]/30 flex items-center justify-center mx-auto mb-3">
                        <Sparkles className="w-6 h-6 text-[#0B1117]" />
                      </div>
                      <p className="font-black text-[#161d1d] text-base mb-1">
                        Your matches are ready!
                      </p>
                      <p className="text-sm text-[#3b4949] mb-4 leading-relaxed">
                        Sign in to see your {recommendations.length} personalized RV matches — free, takes 10 seconds.
                      </p>
                      <label className="flex items-start gap-2.5 cursor-pointer text-left mb-4 px-1">
                        <input
                          type="checkbox"
                          checked={smsOptIn}
                          onChange={e => {
                            setSmsOptIn(e.target.checked);
                            try { localStorage.setItem("rv_sms_opt_in", String(e.target.checked)); } catch { /* ignore */ }
                          }}
                          className="mt-0.5 w-4 h-4 rounded border-[#E2E8F0] accent-[#0B1117] flex-shrink-0"
                        />
                        <span className="text-xs text-[#3b4949] leading-relaxed">
                          Text me updates about my matches and price drops. Standard message & data rates may apply.{" "}
                          <a href="/privacy" className="underline hover:text-[#161d1d]" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
                        </span>
                      </label>
                      <button
                        onClick={() => {
                          try { localStorage.setItem("rv_sms_opt_in", String(smsOptIn)); } catch { /* ignore */ }
                          login();
                        }}
                        className="w-full py-3 rounded-xl bg-[#0B1117] text-white font-black text-sm hover:bg-[#002829] transition flex items-center justify-center gap-2"
                      >
                        <Heart className="w-4 h-4" /> Sign In to View Matches
                      </button>
                    </div>
                  ) : (
                    /* ── Authenticated: show cards ── */
                    <>
                      {recommendations.map((rec: Record<string, unknown>, i: number) => {
                        const badges = getMatchBadges(rec, profile);
                        return (
                          <Link key={String(rec.id)} href={`/listing/${rec.id}`}>
                            <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden hover:border-[#0B1117] transition cursor-pointer shadow-sm">
                              <div className="flex">
                                {/* Image */}
                                <div className="w-28 h-28 flex-shrink-0 bg-[#eef5f4]">
                                  {Array.isArray(rec.images) && rec.images[0] ? (
                                    <img src={String(rec.images[0])} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[#3b4949] text-xs">No photo</div>
                                  )}
                                </div>
                                {/* Details */}
                                <div className="flex-1 p-3 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs text-[#3b4949] truncate">{formatRvType(String(rec.type))}</p>
                                      <p className="text-sm font-bold text-[#161d1d] truncate">
                                        {rec.year} {rec.make} {rec.model}
                                      </p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <p className="text-sm font-black text-[#0B1117]">{formatCurrency(Number(rec.price))}</p>
                                    </div>
                                  </div>
                                  {/* Match badges */}
                                  {badges.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {badges.map((b) => (
                                        <span key={b} className="px-2 py-0.5 bg-[#00CED1]/30 text-[#0B1117] text-[10px] font-bold rounded">
                                          {b}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {/* Why it matches */}
                                  {rec.whyMatch && (
                                    <p className="text-xs text-[#3b4949] mt-1.5 line-clamp-2 leading-relaxed">
                                      {String(rec.whyMatch)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </Link>
                        );
                      })}

                      {/* CTA to full match report */}
                      <Link href="/match">
                        <button className="w-full mt-2 py-3 rounded-xl bg-[#0B1117] text-white font-black text-sm hover:bg-[#002829] transition flex items-center justify-center gap-2">
                          <Heart className="w-4 h-4" /> Get Your Full Match Report
                        </button>
                      </Link>
                    </>
                  )}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input area */}
          <div className="bg-white border-t border-[#E2E8F0] shadow-md flex-shrink-0">
            <form onSubmit={handleSend} className="max-w-3xl mx-auto px-4 py-3 flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={micStatus === "listening"
                  ? "Listening…"
                  : stage === "knowledge" || messages.length <= 1
                    ? "Ask me anything about RVs..."
                    : "Type your answer…"
                }
                className={`flex-1 px-4 py-3 rounded-xl border text-sm text-[#161d1d] placeholder:text-[#6b7a7a] focus:outline-none bg-white transition ${
                  micStatus === "listening"
                    ? "border-red-400 focus:border-red-400 bg-red-50"
                    : "border-[#E2E8F0] focus:border-[#0B1117]"
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
            <div className="max-w-3xl mx-auto px-4 pb-2">
              <p className="text-[10px] text-[#3b4949] text-center">
                Ask any RV question, or say "help me find one" to start a personalized match
              </p>
            </div>
          </div>
        </div>

      </div>
    </Layout>
  );
}
