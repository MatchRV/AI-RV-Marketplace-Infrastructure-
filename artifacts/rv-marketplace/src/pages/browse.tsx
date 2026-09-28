/**
 * /browse and /browse/:slug — Dealership AI Visibility Report.
 *
 * - /browse → Cascade RV Center demo sample (public nav sample)
 * - /browse/tacoma-rv, /browse/baydos → live rooftop audits for call links
 *
 * Data loads 1:1 from /visibility/<slug>.json (Vite public/). No ChatGPT
 * ranking / citation % claims. MCP, WebMCP, /shop, and agent APIs untouched.
 */
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { BrandLayout as Layout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ImageIcon,
  Mail,
  Search,
  Sparkles,
  AlertTriangle,
  Database,
  Bot,
  ListChecks,
} from "lucide-react";

const REPORT_MAILTO =
  "mailto:jonathan@matchrv.com?subject=AI%20Visibility%20Report%20Request&body=Hi%20Jonathan%2C%0A%0AI%27d%20like%20an%20AI%20Visibility%20Report%20for%20our%20dealership.%0A%0ADealership%20name%3A%0AWebsite%20%2F%20inventory%20URL%3A%0ACity%2C%20State%3A%0A%0AThanks%21";

const KNOWN_SLUGS = new Set(["cascade", "tacoma-rv", "baydos"]);

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

export type VisibilityReportData = {
  slug?: string;
  isDemo?: boolean;
  dealer: string;
  city: string;
  state: string;
  phone?: string;
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

export function Browse() {
  const [, params] = useRoute("/browse/:slug?");
  const rawSlug = (params?.slug || "").trim().toLowerCase();
  const slug = rawSlug && KNOWN_SLUGS.has(rawSlug) ? rawSlug : "cascade";
  const unknownSlug = Boolean(rawSlug) && !KNOWN_SLUGS.has(rawSlug);

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
  const canonical = slug === "cascade" && !rawSlug ? "/browse" : `/browse/${slug}`;
  const seoTitle = report
    ? isDemo
      ? "AI Visibility Report Demo — MatchRV for Dealers"
      : `${report.dealer} AI Visibility Report — MatchRV`
    : "AI Visibility Report — MatchRV for Dealers";
  const seoDescription = report
    ? isDemo
      ? "Sample dealership AI Visibility Report: Inventory Quality, Missing Data, Image Quality, AI Readiness, Search Visibility, and a prioritized action plan. Demo data only."
      : `Live AI Visibility Report for ${report.dealer} (${report.city}, ${report.state}): inventory quality, AI readiness, image quality, search visibility, and ranked fixes. No ChatGPT ranking claims.`
    : "Dealership AI Visibility Report from MatchRV.";

  return (
    <Layout>
      <SEO title={seoTitle} description={seoDescription} canonical={canonical} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
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

        {report && (
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
                    Starter reports typically run{" "}
                    <span className="text-white font-semibold">$99</span> one-time. Optional monitoring: $199/month.
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

            {/* Why this matters — CSO verbatim, locked claims only */}
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

            {/* Search visibility — query readiness, NOT live ChatGPT citations */}
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
                AI Visibility Reports cost <strong>$99 one-time</strong>. Optional monitoring is <strong>$199/month</strong>. We confirm scope before starting; requesting a report does not start a subscription.
              </p>
              <p className="text-sm opacity-75 mb-6 max-w-2xl">
                Email us your dealership name and inventory URL — no form required.
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
        )}
      </div>
    </Layout>
  );
}
