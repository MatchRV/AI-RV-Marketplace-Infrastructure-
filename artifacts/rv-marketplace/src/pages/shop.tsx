/**
 * /shop — the agent-native shopping experience.
 *
 * A human browses real inventory; their AI agent (via WebMCP site tools)
 * works the same shared session: structured search, explainable matches,
 * honest unknowns, and a human-approved dealer handoff. The page must make
 * sense even with no agent connected.
 */

import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import {
  BadgeCheck,
  Bot,
  Heart,
  MapPin,
  PlugZap,
  ScanSearch,
  Scale,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { UnitMatch } from "@workspace/agent-core";
import { useAgentSession, toggleShortlist, setLeadModalHidden } from "@/agent/session";
import { getToolContractsForDisplay } from "@/agent/webmcp";
import { runGuidedDemo } from "@/agent/simulated";
import { humanCompare, humanFocusUnit } from "@/agent/human-actions";
import { agentApi } from "@/agent/api";
import { ScoreRing, VerifiedPill } from "@/components/agent/bits";
import { SessionRail } from "@/components/agent/session-rail";
import { CompareSheet, LeadApprovalModal, UnitDrawer } from "@/components/agent/overlays";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const SAMPLE_PROMPT =
  "I have an F-150 rated around 8,000 lbs and two kids. Find me a bunkhouse travel trailer under $45k, under 30 feet, within 150 miles of Tacoma — we boondock, so prioritize solar and lithium. Show the best three and explain the compromises.";

function StatusChips() {
  const s = useAgentSession();
  const tools = getToolContractsForDisplay();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border ${
          s.runtime === "native"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-amber-50 text-[#b45309] border-amber-200"
        }`}
      >
        <PlugZap className="w-3.5 h-3.5" />
        {s.runtime === "native" ? "Agent runtime connected" : "No agent runtime detected"}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border bg-white text-[#161d1d] border-[#E2E8F0] hover:border-[#00CED1] transition-colors">
            <Bot className="w-3.5 h-3.5 text-[#00CED1]" />
            {s.toolCount} site tools exposed
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 max-h-80 overflow-y-auto rounded-xl">
          <p className="text-xs font-bold uppercase tracking-wider text-[#8a9a9a] mb-2">
            WebMCP capabilities on this page
          </p>
          <ul className="space-y-2">
            {tools.map((t) => (
              <li key={t.name}>
                <p className="text-sm font-semibold text-[#161d1d] flex items-center gap-2">
                  <code className="text-xs bg-[#f4fbfa] border border-[#E2E8F0] rounded px-1.5 py-0.5">{t.name}</code>
                  {t.readOnly ? (
                    <span className="text-[10px] text-[#0e7490]">read</span>
                  ) : (
                    <span className="text-[10px] text-[#b45309]">action</span>
                  )}
                </p>
                <p className="text-xs text-[#5c6b6b] mt-0.5 leading-snug">{t.description.slice(0, 140)}…</p>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border bg-white text-[#5c6b6b] border-[#E2E8F0]">
        <BadgeCheck className="w-3.5 h-3.5 text-[#00CED1]" />
        Real dealer snapshot · 1,056 units · 28 PNW dealerships
      </span>
    </div>
  );
}

function ResultCard({
  match,
  selected,
  onToggleCompare,
}: {
  match: UnitMatch;
  selected: boolean;
  onToggleCompare: (id: string) => void;
}) {
  const s = useAgentSession();
  const u = match.unit;
  const inShortlist = s.shortlist.some((x) => x.id === u.id);
  const [imgIdx, setImgIdx] = useState(0);
  const imgSrc = imgIdx < u.images.length ? u.images[imgIdx] : null;

  return (
    <article className="group bg-white rounded-[1.5rem] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col border border-[#E2E8F0]">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#eef5f4]">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={u.title}
            loading="lazy"
            onError={() => setImgIdx((i) => i + 1)}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#0B1117] to-[#1a2b33] text-white/70">
            <span className="font-display font-semibold text-sm">{u.year} {u.make}</span>
            <span className="text-[11px] uppercase tracking-widest">{u.rvType.replace(/_/g, " ")}</span>
          </div>
        )}
        <div className="absolute top-3 left-3">
          <VerifiedPill status={match.hardStatus} />
        </div>
        <button
          onClick={() =>
            toggleShortlist(
              { id: u.id, title: u.title, price: u.priceUsd.value, image: u.images[0] ?? null, dealer: u.dealer.name },
              "human",
            )
          }
          aria-label={inShortlist ? "Remove from shortlist" : "Add to shortlist"}
          aria-pressed={inShortlist}
          className="absolute top-3 right-3 rounded-full bg-white/90 p-2 shadow hover:scale-110 transition-transform"
        >
          <Heart className={`w-4 h-4 ${inShortlist ? "fill-[#e11d48] text-[#e11d48]" : "text-[#5c6b6b]"}`} />
        </button>
        {match.identicalUnitIds?.length ? (
          <span className="absolute bottom-3 left-3 rounded-full bg-[#0B1117]/80 text-white text-[10px] font-semibold px-2 py-1">
            {match.identicalUnitIds.length + 1} in stock
          </span>
        ) : null}
      </div>

      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display font-semibold tracking-tight text-[#161d1d] leading-snug line-clamp-2">{u.title}</h3>
            <p className="text-xs text-[#5c6b6b] mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {u.dealer.name} · {u.dealer.city}
              {match.distanceMiles != null && <span className="text-[#0e7490] font-semibold">· {match.distanceMiles} mi</span>}
            </p>
          </div>
          <ScoreRing score={match.score} />
        </div>

        <p className="text-xl font-bold text-[#161d1d]">
          {u.priceUsd.value != null ? `$${u.priceUsd.value.toLocaleString()}` : "Price unknown"}
        </p>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#5c6b6b]">
          {u.lengthFt.value != null && <span>{u.lengthFt.value} ft</span>}
          {u.dryWeightLbs.value != null && <span>{u.dryWeightLbs.value.toLocaleString()} lbs dry</span>}
          {u.sleeps.value != null && <span>Sleeps {u.sleeps.value}</span>}
          {u.bunkhouse.value === true && <span className="text-[#0e7490] font-semibold">Bunkhouse</span>}
          {u.solar.value === "installed" && <span className="text-[#0e7490] font-semibold">Solar</span>}
        </div>

        {match.unknownFields.length > 0 && (
          <p className="text-[11px] text-[#b45309]">
            Unknown: {match.unknownFields.slice(0, 3).join(", ")}
            {match.unknownFields.length > 3 ? ` +${match.unknownFields.length - 3}` : ""}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-2">
          <button
            onClick={() => void humanFocusUnit(u.id)}
            className="flex-1 rounded-xl bg-[#0B1117] text-white text-sm font-semibold py-2.5 hover:bg-[#1a2530] transition-colors"
          >
            Why this match?
          </button>
          <label className={`flex items-center gap-1.5 text-xs font-semibold rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${selected ? "border-[#00CED1] bg-[#00CED1]/10 text-[#0e7490]" : "border-[#E2E8F0] text-[#5c6b6b] hover:border-[#00CED1]"}`}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleCompare(u.id)}
              className="sr-only"
            />
            <Scale className="w-3.5 h-3.5" />
            Compare
          </label>
        </div>
      </div>
    </article>
  );
}

export function Shop() {
  const s = useAgentSession();
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [datasetNote, setDatasetNote] = useState<string | null>(null);

  useEffect(() => {
    void agentApi.meta().then((r) => {
      if (r.ok) setDatasetNote(r.data.dataset.note);
    });
  }, []);

  const toggleCompare = (id: string) =>
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-4)));

  const results = s.results;
  const verified = useMemo(() => results.filter((m) => m.hardStatus === "pass"), [results]);
  const unverified = useMemo(() => results.filter((m) => m.hardStatus === "unverified"), [results]);

  return (
    <Layout>
      <SEO
        title="Shop with your AI agent"
        description="MatchRV exposes real RV inventory as structured WebMCP capabilities: agents search, explain, and compare — you stay in control."
      />
      <div className="bg-[#f4fbfa] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-16">
          {/* Hero */}
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#0e7490]">
              <Sparkles className="w-3.5 h-3.5" /> Agent-native shopping · WebMCP
            </p>
            <h1 className="font-display font-semibold tracking-tight text-3xl sm:text-4xl text-[#161d1d] mt-2">
              Your AI agent can use this page.
            </h1>
            <p className="text-[#5c6b6b] mt-3 leading-relaxed">
              MatchRV turns fragmented dealer inventory into structured capabilities an agent can call —
              search with real constraints, explainable matches, honest unknowns, and dealer contact that
              always waits for your approval. Say something like:
            </p>
            <blockquote className="mt-3 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#3b4a4a] italic">
              “{SAMPLE_PROMPT}”
            </blockquote>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <StatusChips />
            </div>
            {s.runtime === "none" && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => void runGuidedDemo()}
                  disabled={s.guidedDemoRunning}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#00CED1] text-[#0B1117] font-bold px-5 py-3 hover:brightness-105 transition disabled:opacity-60"
                >
                  <Wand2 className="w-4 h-4" />
                  {s.guidedDemoRunning ? "Guided demo running…" : "Watch the guided demo"}
                </button>
                <p className="text-xs text-[#5c6b6b] max-w-sm">
                  For the real thing: open this page in <strong>ChatGPT's in-app browser</strong>, or Chrome 149+ with{" "}
                  <code className="bg-white border border-[#E2E8F0] rounded px-1">chrome://flags/#enable-webmcp-testing</code>.
                </p>
              </div>
            )}
          </div>

          {/* Pending approval ribbon */}
          {s.leadPreview?.status === "awaiting_human_approval" && s.leadModalHidden && (
            <button
              onClick={() => setLeadModalHidden(false)}
              className="mt-6 w-full rounded-xl border border-amber-300 bg-amber-50 text-[#92400e] text-sm font-semibold px-4 py-3 text-left hover:bg-amber-100 transition-colors"
            >
              ⏳ Your agent prepared a dealer contact request — review &amp; approve it
            </button>
          )}

          {/* Body */}
          <div className="mt-8 grid lg:grid-cols-[340px_1fr] gap-6 items-start">
            <SessionRail />

            <main>
              {s.searching && (
                <div className="flex items-center gap-2 text-sm text-[#0e7490] font-semibold mb-4">
                  <ScanSearch className="w-4 h-4 animate-pulse" /> Searching the normalized inventory…
                </div>
              )}

              {!s.funnel && !s.searching && (
                <div className="rounded-[1.5rem] border border-dashed border-[#c9d8d8] bg-white/60 p-10 text-center">
                  <Bot className="w-10 h-10 text-[#00CED1] mx-auto" />
                  <h2 className="font-display font-semibold text-xl text-[#161d1d] mt-3">The inventory is listening.</h2>
                  <p className="text-sm text-[#5c6b6b] mt-2 max-w-md mx-auto">
                    Ask your agent for what you actually want — six messy requirements in one sentence is
                    exactly the point. Results land here, and you can adjust anything by hand.
                  </p>
                </div>
              )}

              {verified.length > 0 && (
                <>
                  <h2 className="font-display font-semibold text-lg text-[#161d1d] mb-3">
                    Verified matches <span className="text-[#8a9a9a] font-normal">— every hard requirement confirmed</span>
                  </h2>
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    {verified.slice(0, 12).map((m) => (
                      <ResultCard key={m.unit.id} match={m} selected={compareIds.includes(m.unit.id)} onToggleCompare={toggleCompare} />
                    ))}
                  </div>
                </>
              )}

              {s.funnel && !s.searching && verified.length === 0 && unverified.length > 0 && (
                <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-6 py-4">
                  <h2 className="font-display font-semibold text-lg text-[#161d1d]">
                    No unit satisfies every hard requirement.
                  </h2>
                  <p className="text-sm text-[#5c6b6b] mt-1">
                    MatchRV won't pretend otherwise. The closest candidates are below — each fails nothing, but a
                    fact you require is unpublished. Have your agent ask the dealer to confirm it, or relax a
                    constraint (the funnel shows what each one costs).
                  </p>
                </div>
              )}

              {unverified.length > 0 && (
                <>
                  <h2 className="font-display font-semibold text-lg text-[#161d1d] mt-8 mb-1">
                    Close, but unverified
                  </h2>
                  <p className="text-xs text-[#5c6b6b] mb-3 max-w-2xl">
                    These fail nothing — but the dealer doesn't publish a fact your requirements need, and MatchRV
                    won't guess. Your agent can ask the dealership to confirm.
                  </p>
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    {unverified.slice(0, 6).map((m) => (
                      <ResultCard key={m.unit.id} match={m} selected={compareIds.includes(m.unit.id)} onToggleCompare={toggleCompare} />
                    ))}
                  </div>
                </>
              )}

              {s.funnel && verified.length === 0 && unverified.length === 0 && !s.searching && (
                <div className="rounded-[1.5rem] border border-[#E2E8F0] bg-white p-8">
                  <h2 className="font-display font-semibold text-lg text-[#161d1d]">No unit satisfies every hard requirement.</h2>
                  <p className="text-sm text-[#5c6b6b] mt-2">
                    The funnel shows exactly which constraint eliminated what — relax one, or make it a preference.
                  </p>
                </div>
              )}

              {datasetNote && (
                <p className="text-[11px] text-[#8a9a9a] mt-8 max-w-2xl">{datasetNote}</p>
              )}
            </main>
          </div>
        </div>

        {/* Compare bar */}
        {compareIds.length >= 2 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
            <button
              onClick={() => void humanCompare(compareIds)}
              className="rounded-full bg-[#0B1117] text-white font-semibold pl-5 pr-6 py-3 shadow-xl flex items-center gap-2 hover:bg-[#1a2530] transition-colors"
            >
              <Scale className="w-4 h-4 text-[#00CED1]" />
              Compare {compareIds.length} units
            </button>
          </div>
        )}

        <UnitDrawer />
        <CompareSheet />
        <LeadApprovalModal />
      </div>
    </Layout>
  );
}
