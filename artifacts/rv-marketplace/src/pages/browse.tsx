/**
 * /browse and /browse/:slug — Dealership AI Visibility Report.
 *
 * - /browse → Cascade RV Center demo sample (public nav sample, FULL view)
 * - /browse/tacoma-rv, /browse/sumner-rv → TEASER UX for cold-email unlock
 * - /browse/baydos → live rooftop (full or teaser per JSON mode)
 *
 * Data loads 1:1 from /visibility/<slug>.json (Vite public/). No ChatGPT
 * ranking / citation % claims. MCP, WebMCP, /shop, and agent APIs untouched.
 *
 * Teaser mode (mode:"teaser" in JSON, or ?teaser=1): overall score + 2–3 pain
 * cards visible; fix list / deep detail blurred with Founding 5 unlock CTA $99 (then $299–$499).
 * Cascade stays full free public demo — teaser query is ignored for cascade.
 */
import { useEffect, useMemo, useState } from "react";
import { useRoute, useSearch } from "wouter";
import { BrandLayout as Layout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ImageIcon,
  Lock,
  Mail,
  Search,
  Sparkles,
  AlertTriangle,
  Database,
  Bot,
  ListChecks,
} from "lucide-react";

const UNLOCK_MAILTO =
  "mailto:jonathan@matchrv.com?subject=Founding%205%20%E2%80%94%20Unlock%20Full%20AI%20Visibility%20Report%20(%2499)&body=Hi%20Jonathan%2C%0A%0AI%27d%20like%20to%20unlock%20the%20full%20AI%20Visibility%20Report%20under%20the%20Founding%205%20offer%20(%2499%3B%20then%20%24299%E2%80%93%24499).%0A%0ADealership%20name%3A%0AWebsite%20%2F%20inventory%20URL%3A%0ACity%2C%20State%3A%0A%0AThanks%21";

const REPORT_MAILTO =
  "mailto:jonathan@matchrv.com?subject=Founding%205%20AI%20Visibility%20Report%20Request%20(%2499)&body=Hi%20Jonathan%2C%0A%0AI%27d%20like%20an%20AI%20Visibility%20Report%20under%20the%20Founding%205%20offer%20(%2499%3B%20then%20%24299%E2%80%93%24499).%0A%0ADealership%20name%3A%0AWebsite%20%2F%20inventory%20URL%3A%0ACity%2C%20State%3A%0A%0AThanks%21";

const KNOWN_SLUGS = new Set(["cascade", "tacoma-rv", "baydos", "sumner-rv"]);

type MissingRow = {
  field: string;
  missing: number;
  of: number;
  pct: number;
  impact: string;
};

type ImageRow = { label: string; value: string; note: string };
type QueryRow = { query: string; ready: string; reason: string };
type ActionRow = {
  priority: number;
  title: string;
  why: string;
  effort: string;
  impact: string;
  affected_units?: number;
};
type TeaserPain = { label: string; body: string };

export type VisibilityReportData = {
  slug?: string;
  isDemo?: boolean;
  mode?: "teaser" | "full";
  dealer: string;
  city: string;
  state: string;
  phone?: string;
  website?: string;
  unitsSampled: number;
  liveSitemapVdps?: number;
  observedLabel: string;
  inventoryQuality: number;
  aiReadiness: number;
  imageQuality: number;
  searchVisibility: number;
  crawlability?: number;
  overall?: number;
  scoresRaw?: Record<string, number>;
  missing: MissingRow[];
  images: ImageRow[];
  queryCoverage: QueryRow[];
  actions: ActionRow[];
  disclaimer?: string;
  inventory_url?: string;
  teaserSummary?: string;
  teaserPains?: TeaserPain[];
};

function ScoreCard({
  label,
  score,
  hint,
  icon: Icon,
}: {
  label: string;
  score: number;
  hint: string;
  icon: typeof Database;
}) {
  const tone =
    score >= 70 ? "text-emerald-700" : score >= 45 ? "text-amber-700" : "text-red-700";
  const bar =
    score >= 70 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="bg-card border border-border rounded-2xl p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <h3 className="font-display font-bold text-sm sm:text-base leading-tight">{label}</h3>
        </div>
        <span className={`text-3xl font-black tabular-nums ${tone}`}>{score}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{hint}</p>
    </div>
  );
}

function ReadyPill({ ready }: { ready: string }) {
  const cls =
    ready === "Strong"
      ? "bg-emerald-100 text-emerald-800"
      : ready === "Partial"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide ${cls}`}>
      {ready}
    </span>
  );
}

function sampleCaption(report: VisibilityReportData): string {
  if (report.liveSitemapVdps && report.liveSitemapVdps > report.unitsSampled) {
    return `${report.unitsSampled} of ~${report.liveSitemapVdps} units sampled · ${report.observedLabel}`;
  }
  return `${report.unitsSampled} units sampled · ${report.observedLabel}`;
}

function statusForScore(score: number): { label: string; tone: string; ring: string } {
  if (score >= 70) return { label: "SOLID", tone: "text-emerald-700", ring: "#10b981" };
  if (score >= 45) return { label: "NEEDS ATTENTION", tone: "text-amber-700", ring: "#d97706" };
  return { label: "NEEDS ATTENTION", tone: "text-amber-800", ring: "#b45309" };
}

function ScoreGauge({ score }: { score: number }) {
  const status = statusForScore(score);
  const pct = Math.min(100, Math.max(0, score));
  const r = 54;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative w-[140px] h-[140px] shrink-0">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={status.ring}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-black tabular-nums leading-none ${status.tone}`}>{score}</span>
        <span className="text-xs font-bold text-muted-foreground mt-1">/ 100</span>
      </div>
    </div>
  );
}

function deriveTeaserPains(report: VisibilityReportData): TeaserPain[] {
  if (report.teaserPains && report.teaserPains.length > 0) return report.teaserPains.slice(0, 3);
  const pains: TeaserPain[] = [];
  const price = report.missing.find((m) => m.field === "price");
  if (price && price.pct > 0) {
    const shown = Math.max(0, 100 - price.pct);
    pains.push({
      label: "PRICING",
      body:
        shown < 50
          ? `Only under half of your listings show a clear price — AI assistants skip listings they can't confirm a price for.`
          : `${price.pct}% of sampled listings are missing a clear price — AI assistants skip listings they can't confirm a price for.`,
    });
  }
  const qScore = report.searchVisibility;
  pains.push({
    label: "SEARCH MATCH",
    body: `Your inventory matched only ${qScore}% of the common buyer searches we tested (things like "fifth wheel under $75,000 near ${report.city}").`,
  });
  const ai = report.aiReadiness;
  if (ai < 50 && pains.length < 3) {
    pains.push({
      label: "AI READABILITY",
      body: `AI readiness scored ${ai}/100 — many unit pages lack structured specs agents need to recommend a confident match.`,
    });
  }
  return pains.slice(0, 3);
}

function TeaserView({ report }: { report: VisibilityReportData }) {
  const overall = typeof report.overall === "number" ? report.overall : report.inventoryQuality;
  const status = statusForScore(overall);
  const pains = deriveTeaserPains(report);
  const expected = report.liveSitemapVdps || report.unitsSampled;
  const verified = report.unitsSampled;
  const summary =
    report.teaserSummary ||
    `Out of ${expected} vehicles listed on your site, we could only fully verify ${verified} listing pages — and most are missing details AI assistants rely on to recommend a match.`;
  const unlockHref = UNLOCK_MAILTO.replace(
    "Dealership%20name%3A",
    `Dealership%20name%3A%20${encodeURIComponent(report.dealer)}`,
  );
  const website = report.website || report.inventory_url || "";

  return (
    <div className="max-w-3xl mx-auto">
      {/* Dark teaser chrome */}
      <div className="rounded-t-3xl bg-[#0B1117] text-white px-5 sm:px-8 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="font-display font-black text-lg tracking-tight">
            MATCH<span className="text-[#00CED1]">RV</span>
          </p>
          <p className="text-xs text-white/55 mt-0.5">AI Visibility Report</p>
        </div>
        <div className="sm:text-right">
          <p className="font-display font-bold text-base">{report.dealer}</p>
          <p className="text-sm text-white/60">
            {report.city}, {report.state}
          </p>
          {website && (
            <a href={website} className="text-xs text-[#65E7DF] hover:underline break-all" target="_blank" rel="noreferrer">
              {website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      </div>

      <div className="rounded-b-3xl border border-t-0 border-border bg-[#f1f5f9] px-4 sm:px-8 py-8 sm:py-10">
        <h1 className="text-2xl sm:text-3xl font-display font-black text-[#0B1117] leading-tight mb-2">
          Here&apos;s how AI shopping assistants see your inventory right now.
        </h1>
        <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-6 max-w-2xl">
          When a shopper asks an AI assistant to help find an RV like the ones {report.dealer} sells, here&apos;s what
          it can (and can&apos;t) find today.
        </p>

        {/* Score card */}
        <div className="bg-white border border-border rounded-2xl p-5 sm:p-7 mb-4 flex flex-col sm:flex-row gap-5 sm:items-center shadow-sm">
          <ScoreGauge score={overall} />
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500 mb-1">
              AI Visibility Score
            </p>
            <p className={`text-lg sm:text-xl font-black uppercase tracking-wide ${status.tone}`}>{status.label}</p>
            <p className="text-sm text-slate-600 leading-relaxed mt-2">{summary}</p>
            <p className="text-xs text-slate-400 mt-2">{sampleCaption(report)}</p>
          </div>
        </div>

        {/* Pain cards */}
        <div className={`grid gap-3 mb-6 ${pains.length >= 2 ? "sm:grid-cols-2" : ""}`}>
          {pains.map((p) => (
            <div key={p.label} className="bg-white border border-border rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-700 shrink-0" />
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{p.label}</p>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>

        {/* Gated / blurred fix list */}
        <div className="relative rounded-2xl overflow-hidden border border-border bg-white shadow-sm">
          <div className="p-5 sm:p-6 select-none pointer-events-none" aria-hidden="true" style={{ filter: "blur(6px)" }}>
            <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Prioritized fix list</p>
            <div className="space-y-3">
              {(report.actions.length ? report.actions : [{ priority: 1, title: "Fix structured data", why: "…", effort: "Medium", impact: "High" }, { priority: 2, title: "Fix price data", why: "…", effort: "Medium", impact: "High" }, { priority: 3, title: "Fix sleeping capacity", why: "…", effort: "Medium", impact: "Medium" }]).slice(0, 5).map((a) => (
                <div key={a.priority} className="flex gap-3 items-start">
                  <div className="w-8 h-8 rounded-lg bg-[#0B1117] text-[#00CED1] flex items-center justify-center font-black text-sm shrink-0">
                    {a.priority}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{a.title}</p>
                    <p className="text-xs text-slate-500">{a.why}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 grid sm:grid-cols-2 gap-3 opacity-70">
              <div className="h-16 rounded-xl bg-slate-100" />
              <div className="h-16 rounded-xl bg-slate-100" />
            </div>
          </div>

          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-white/40 via-white/70 to-white/90 px-4 py-8">
            <div className="bg-white border border-border rounded-2xl shadow-xl max-w-md w-full p-6 sm:p-7 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <Lock className="w-5 h-5 text-slate-600" />
              </div>
              <h2 className="text-xl font-display font-black text-[#0B1117] mb-2">Unlock Your Complete Report</h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-5">
                Every finding, every listing, a prioritized fix list.{" "}
                <strong>Founding 5: $99</strong>
                <span className="text-slate-500"> · then $299–$499</span>{" "}
                (first five rooftops only).
              </p>
              <a
                href={unlockHref}
                className="inline-flex items-center justify-center gap-2 w-full bg-[#00CED1] text-[#0B1117] px-5 py-3.5 rounded-lg font-bold hover:brightness-95 active:scale-[0.98] transition-all min-h-[48px]"
              >
                Unlock Full Report — $99
                <ArrowRight className="w-4 h-4" />
              </a>
              <p className="mt-3 text-xs text-slate-500">
                Founding 5: $99 · then $299–$499 ·{" "}
                <a href={unlockHref} className="underline font-medium text-slate-700">
                  request full report
                </a>{" "}
                → jonathan@matchrv.com
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-[11px] text-slate-500 leading-relaxed text-center">
          MatchRV · Dealer AI Visibility Reports · matchrv.com
          <span className="mx-2">·</span>
          Readiness score only — not an AI ranking guarantee.
        </p>
      </div>
    </div>
  );
}

function FullReportView({ report, isDemo }: { report: VisibilityReportData; isDemo: boolean }) {
  return (
    <>
      {/* Status banner */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {isDemo ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-900 px-3 py-1 text-xs font-black uppercase tracking-wider">
              Demo sample
            </span>
            <span className="text-xs sm:text-sm text-muted-foreground">
              Fictional dealership and illustrative data — not a live audit of any real dealership. No ChatGPT citation claims.
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-900 px-3 py-1 text-xs font-black uppercase tracking-wider">
              Live audit
            </span>
            <span className="text-xs sm:text-sm text-muted-foreground">
              Customer-grade scores for {report.dealer}. Inventory quality / AI readiness / ranked fixes only —
              not a ChatGPT ranking claim.
              {report.liveSitemapVdps && report.liveSitemapVdps > report.unitsSampled
                ? ` Sample ${report.unitsSampled} of ~${report.liveSitemapVdps} sitemap VDPs.`
                : ""}
            </span>
          </>
        )}
      </div>

      {/* Hero */}
      <div className="rounded-3xl bg-[#0B1117] text-white p-6 sm:p-10 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#65E7DF] mb-3">
              Dealership AI Visibility Report
            </p>
            <h1 className="text-3xl sm:text-4xl font-display font-black leading-tight mb-3">
              What AI can (and can&apos;t) read on your lot
            </h1>
            <p className="text-white/70 max-w-2xl leading-relaxed">
              {isDemo
                ? "This is the paid audit preview: inventory completeness, image readiness, agent-readable specs, and shopper-query coverage — plus the top fixes."
                : "Live audit of inventory completeness, image readiness, agent-readable specs, and shopper-query coverage — plus the top fixes for this rooftop."}{" "}
              <span className="text-white font-semibold">Founding 5: $99</span>
              <span className="text-white/70"> · then $299–$499</span>{" "}
              (first five rooftops only).
            </p>
            {typeof report.overall === "number" && !isDemo && (
              <p className="mt-4 text-sm text-white/55">
                Overall score{" "}
                <span className="text-white font-bold tabular-nums">
                  {report.scoresRaw?.overall?.toFixed?.(1) ?? report.overall}
                </span>
                {report.scoresRaw ? (
                  <span>
                    {" "}
                    · inv {report.scoresRaw.inventory_health} · AI-read {report.scoresRaw.ai_readability} ·
                    crawl {report.scoresRaw.crawlability} · query {report.scoresRaw.query_coverage}
                  </span>
                ) : null}
              </p>
            )}
          </div>
          <div className="shrink-0 rounded-2xl border border-white/15 bg-white/5 px-5 py-4 min-w-[200px]">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-[#00CED1]" />
              <p className="text-xs font-bold uppercase tracking-wider text-[#00CED1]">
                {isDemo ? "Demo rooftop" : "Audited rooftop"}
              </p>
            </div>
            <p className="font-display font-bold text-lg">{report.dealer}</p>
            <p className="text-sm text-white/60">
              {report.city}, {report.state}
            </p>
            {report.phone && !isDemo && (
              <p className="text-sm text-white/55 mt-1">{report.phone}</p>
            )}
            <p className="text-xs text-white/45 mt-2">{sampleCaption(report)}</p>
          </div>
        </div>
      </div>

      {/* Why this matters */}
      <section className="mb-10">
        <h2 className="text-2xl font-display font-bold mb-4">Why this matters</h2>
        <div className="bg-card border border-border rounded-2xl p-5 sm:p-8 space-y-4">
          <p className="text-base sm:text-lg text-foreground leading-relaxed">
            Today&apos;s buyers research long before they contact a dealership. Industry data shows{" "}
            <span className="font-semibold">92% of vehicle buyers research online before purchasing</span>, and
            nearly half of consumers (<span className="font-semibold">44%</span>) have already used AI-powered
            tools while shopping for a vehicle{" "}
            <span className="text-sm text-muted-foreground">(Cars.com AI in Car Shopping Consumer Survey, 2025)</span>
            . Among shoppers already using AI, <span className="font-semibold">97%</span> say it influences their
            purchase decision <span className="text-sm text-muted-foreground">(Cars.com)</span>.
          </p>
          <p className="text-base sm:text-lg text-foreground leading-relaxed">
            As AI becomes part of product discovery, dealers need inventory that&apos;s complete, accurate, and
            readable by AI systems.{" "}
            <span className="font-semibold">
              If your listings are missing specs, photos, or clear descriptions, AI can&apos;t confidently
              recommend your units.
            </span>
          </p>
          <details className="pt-2 border-t border-border/60 group">
            <summary className="cursor-pointer text-sm font-semibold text-primary list-none flex items-center gap-2 select-none">
              <span className="group-open:hidden">Supporting figures · sources</span>
              <span className="hidden group-open:inline">Hide supporting figures</span>
            </summary>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground leading-relaxed">
              <li className="flex gap-2">
                <span className="text-primary font-bold shrink-0">·</span>
                <span>
                  <span className="font-semibold text-foreground">73%</span> of AI-assisted vehicle shoppers say AI
                  saves time <span className="text-xs">(Cars.com)</span>
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold shrink-0">·</span>
                <span>
                  <span className="font-semibold text-foreground">38%</span> of U.S. consumers have used generative
                  AI while shopping online and <span className="font-semibold text-foreground">53%</span> use AI for
                  product research <span className="text-xs">(Adobe Digital Insights)</span>
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold shrink-0">·</span>
                <span>
                  <span className="font-semibold text-foreground">43%</span> have discovered a new brand through AI{" "}
                  <span className="text-xs">(Semrush)</span>
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold shrink-0">·</span>
                <span>
                  <span className="font-semibold text-foreground">16.9M</span> U.S. households interested in buying
                  an RV within five years <span className="text-xs">(RVIA)</span>
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary font-bold shrink-0">·</span>
                <span>
                  Many first-time RV buyers spend <span className="font-semibold text-foreground">10+ hours</span>{" "}
                  researching online before purchase <span className="text-xs">(RVDA-cited research)</span>
                </span>
              </li>
            </ul>
          </details>
        </div>
      </section>

      {/* Score grid */}
      <section className="mb-10">
        <h2 className="text-2xl font-display font-bold mb-4">Score overview</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <ScoreCard
            label="Inventory Quality Score"
            score={report.inventoryQuality}
            hint="Required fields present on unit pages (year, make, model, price, availability, location)."
            icon={Database}
          />
          <ScoreCard
            label="AI Readiness Score"
            score={report.aiReadiness}
            hint="Specs agents need for tow-fit and constraint search: weights, sleeps, length, structured markup."
            icon={Bot}
          />
          <ScoreCard
            label="Image Quality"
            score={report.imageQuality}
            hint="Photo coverage, gallery depth, and whether images carry useful captions for agents."
            icon={ImageIcon}
          />
          <ScoreCard
            label="Search Visibility"
            score={report.searchVisibility}
            hint="How often shopper queries can be answered from published fields — inventory readiness, not live AI citations."
            icon={Search}
          />
        </div>
      </section>

      {/* Missing data */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-display font-bold">Missing data</h2>
            <p className="text-sm text-muted-foreground">
              Fields blank or not machine-readable across the {report.unitsSampled}-unit
              {report.liveSitemapVdps && report.liveSitemapVdps > report.unitsSampled
                ? ` sample (${report.unitsSampled} of ~${report.liveSitemapVdps})`
                : " sample"}
            </p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-3 font-bold">Field</th>
                  <th className="px-5 py-3 font-bold">Missing</th>
                  <th className="px-5 py-3 font-bold">Gap</th>
                  <th className="px-5 py-3 font-bold">Impact</th>
                </tr>
              </thead>
              <tbody>
                {report.missing.map((row) => (
                  <tr key={row.field} className="border-b border-border last:border-0">
                    <td className="px-5 py-3.5 font-semibold">{row.field}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {row.missing} / {row.of}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${row.pct}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-muted-foreground">{row.pct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`text-xs font-black uppercase ${
                          row.impact === "High" ? "text-red-700" : "text-amber-700"
                        }`}
                      >
                        {row.impact}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Image quality detail */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-2xl font-display font-bold">Image quality detail</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {report.images.map((item) => (
            <div key={item.label} className="bg-card border border-border rounded-2xl p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                {item.label}
              </p>
              <p className="text-2xl font-black font-display text-[#0B1117]">{item.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Search visibility */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Search className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-2xl font-display font-bold">Search visibility</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
          Shopper queries scored against published inventory fields only. This is{" "}
          <span className="font-semibold text-foreground">not</span> a live “appeared in ChatGPT” metric — paid
          reports can optionally add controlled query tests, labeled separately.
        </p>
        <div className="space-y-3">
          {report.queryCoverage.map((q) => (
            <div
              key={q.query}
              className="bg-card border border-border rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-6"
            >
              <div className="sm:pt-0.5">
                <ReadyPill ready={q.ready} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold leading-snug">&ldquo;{q.query}&rdquo;</p>
                <p className="text-sm text-muted-foreground mt-1">{q.reason}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Prioritized action plan */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ListChecks className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-display font-bold">Prioritized action plan</h2>
            <p className="text-sm text-muted-foreground">
              {isDemo ? "Top fixes from the demo audit — ship these first" : "Top fixes from this live audit — ship these first"}
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {report.actions.map((a) => (
            <div key={a.priority} className="bg-card border border-border rounded-2xl p-5 flex gap-4">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-[#0B1117] text-[#00CED1] flex items-center justify-center font-black">
                {a.priority}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="font-display font-bold">{a.title}</h3>
                  <span className="text-[10px] font-black uppercase tracking-wide rounded-full bg-red-100 text-red-800 px-2 py-0.5">
                    Impact {a.impact}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wide rounded-full bg-slate-100 text-slate-700 px-2 py-0.5">
                    Effort {a.effort}
                  </span>
                  {typeof a.affected_units === "number" && (
                    <span className="text-[10px] font-black uppercase tracking-wide rounded-full bg-primary/10 text-primary px-2 py-0.5">
                      {a.affected_units} units
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{a.why}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {report.disclaimer && !isDemo && (
        <p className="mb-8 text-xs text-muted-foreground leading-relaxed max-w-3xl">{report.disclaimer}</p>
      )}

      {/* CTA */}
      <section className="bg-primary text-primary-foreground rounded-2xl p-6 sm:p-8 mb-8">
        <div className="flex items-start gap-3 mb-3">
          <Sparkles className="w-6 h-6 shrink-0 mt-0.5" />
          <h2 className="text-2xl font-display font-bold">Get this report for your rooftop</h2>
        </div>
        <p className="opacity-90 leading-relaxed mb-2 max-w-2xl">
          <strong>Founding 5: $99</strong> · then $299–$499 (first five rooftops only).
          We confirm scope before starting; requesting a report does not start a subscription.
        </p>
        <p className="text-sm opacity-75 mb-6 max-w-2xl">
          Email jonathan@matchrv.com your dealership name and inventory URL — no form required.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={REPORT_MAILTO}
            className="inline-flex items-center justify-center gap-2 bg-white text-primary px-6 py-3.5 rounded-lg font-bold hover:brightness-95 active:scale-[0.98] transition-all min-h-[48px]"
          >
            <Mail className="w-5 h-5" />
            Request your report
            <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="/for-dealers"
            className="inline-flex items-center justify-center gap-2 border-2 border-white/40 text-white px-6 py-3.5 rounded-lg font-bold hover:bg-white/10 active:scale-[0.98] transition-all min-h-[48px]"
          >
            Back to For Dealers
          </a>
        </div>
        <p className="mt-4 text-sm opacity-75">
          Or email{" "}
          <a href="mailto:jonathan@matchrv.com" className="underline font-medium">
            jonathan@matchrv.com
          </a>{" "}
          directly.
        </p>
      </section>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          MCP / Agent Shop unchanged
        </span>
        <a href="/shop" className="text-primary font-medium hover:underline">
          Agent Shop →
        </a>
        <a href="/for-dealers" className="text-primary font-medium hover:underline">
          Dealer landing →
        </a>
      </div>
    </>
  );
}

export function Browse() {
  const [, params] = useRoute("/browse/:slug?");
  const search = useSearch();
  const rawSlug = (params?.slug || "").trim().toLowerCase();
  const slug = rawSlug && KNOWN_SLUGS.has(rawSlug) ? rawSlug : "cascade";
  const unknownSlug = Boolean(rawSlug) && !KNOWN_SLUGS.has(rawSlug);
  const forceTeaser = useMemo(() => {
    const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    return q.get("teaser") === "1" || q.get("mode") === "teaser";
  }, [search]);

  const [report, setReport] = useState<VisibilityReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setError(null);
    const loadSlug = unknownSlug ? "cascade" : slug;
    fetch(`/visibility/${loadSlug}.json`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load report (${res.status})`);
        return res.json() as Promise<VisibilityReportData>;
      })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load report");
      });
    return () => {
      cancelled = true;
    };
  }, [slug, unknownSlug]);

  const isDemo = report?.isDemo !== false && (report?.slug === "cascade" || !report?.slug || slug === "cascade");
  // Cascade stays the free full public demo — never teaser-gate it.
  const isTeaser =
    !isDemo &&
    (report?.mode === "teaser" || forceTeaser) &&
    slug !== "cascade";

  const canonical = slug === "cascade" && !rawSlug ? "/browse" : `/browse/${slug}`;
  const seoTitle = report
    ? isDemo
      ? "AI Visibility Report Demo — MatchRV for Dealers"
      : `${report.dealer} AI Visibility Report — MatchRV`
    : "AI Visibility Report — MatchRV for Dealers";
  const seoDescription = report
    ? isDemo
      ? "Sample dealership AI Visibility Report: Inventory Quality, Missing Data, Image Quality, AI Readiness, Search Visibility, and a prioritized action plan. Demo data only."
      : isTeaser
        ? `AI Visibility teaser for ${report.dealer} (${report.city}, ${report.state}). Founding 5 unlock $99 · then $299–$499. Readiness scores only — not a ChatGPT ranking claim.`
        : `Live AI Visibility Report for ${report.dealer} (${report.city}, ${report.state}): inventory quality, AI readiness, image quality, search visibility, and ranked fixes. No ChatGPT ranking claims.`
    : "Dealership AI Visibility Report from MatchRV.";

  return (
    <Layout>
      <SEO title={seoTitle} description={seoDescription} canonical={canonical} />

      <div className={`mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 ${isTeaser ? "max-w-3xl" : "max-w-5xl"}`}>
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 text-red-900 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {unknownSlug && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 text-amber-950 px-4 py-3 text-sm">
            Unknown report slug — showing the public Cascade demo sample instead.
          </div>
        )}

        {!report && !error && (
          <div className="mb-6 text-sm text-muted-foreground">Loading visibility report…</div>
        )}

        {report && (isTeaser ? <TeaserView report={report} /> : <FullReportView report={report} isDemo={isDemo} />)}
      </div>
    </Layout>
  );
}
