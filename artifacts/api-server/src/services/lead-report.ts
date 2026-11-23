/**
 * Owner dashboard numbers, computed from the canonical lead store and the
 * funnel counters. Pure reads. Tests and dry runs are excluded unless asked.
 * Days are UTC. A "week" starts Monday (ISO week), labeled by its Monday.
 */
import { botExclusions, funnelRows, HEADLINE_FUNNEL } from "./lead-funnel";
import { listLeads, type LeadRecord } from "./lead-store";
import { creditVerdict, leadCreditEnabled } from "./lead-credit";

export type Granularity = "day" | "week";

export interface ReportOptions { from?: string; to?: string; granularity?: Granularity; includeTests?: boolean; now?: number }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayOf = (iso: string) => iso.slice(0, 10);

export function resolveRange(opts: ReportOptions): { from: string; to: string } {
  const now = opts.now ?? Date.now();
  const to = opts.to && DAY_RE.test(opts.to) ? opts.to : new Date(now).toISOString().slice(0, 10);
  const from = opts.from && DAY_RE.test(opts.from) ? opts.from : new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  return from <= to ? { from, to } : { from: to, to: from };
}

export function bucketOf(day: string, g: Granularity): string {
  if (g === "day") return day;
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export interface Breakdown { key: string; leads: number; qualified: number; qualifiedPct: number | null; repeats: number; sold: number; lost: number; costUsd: number | null; revenueUsd: number | null }

function breakdown(rows: LeadRecord[], keyFn: (l: LeadRecord) => string | null): Breakdown[] {
  const m = new Map<string, Breakdown>();
  for (const l of rows) {
    const key = keyFn(l) ?? "unknown";
    const b = m.get(key) ?? { key, leads: 0, qualified: 0, qualifiedPct: null, repeats: 0, sold: 0, lost: 0, costUsd: null, revenueUsd: null };
    b.leads += 1;
    if (l.qualification.qualified) b.qualified += 1;
    b.repeats += l.repeat_count;
    if (l.lifecycle.sold_at) b.sold += 1;
    if (l.lifecycle.lost_at) b.lost += 1;
    if (typeof l.cost_usd === "number") b.costUsd = (b.costUsd ?? 0) + l.cost_usd;
    if (typeof l.revenue_usd === "number") b.revenueUsd = (b.revenueUsd ?? 0) + l.revenue_usd;
    m.set(key, b);
  }
  for (const b of m.values()) b.qualifiedPct = pct(b.qualified, b.leads);
  return [...m.values()].sort((a, b) => b.leads - a.leads || a.key.localeCompare(b.key));
}

export interface DealerResponse { dealerId: string; dealerName: string; leads: number; responded: number; medianMinutes: number | null; p90Minutes: number | null }

export function buildLeadReport(opts: ReportOptions = {}) {
  const { from, to } = resolveRange(opts);
  const g: Granularity = opts.granularity === "week" ? "week" : "day";
  const rows = listLeads().filter((l) => (opts.includeTests || !l.test) && dayOf(l.created_at) >= from && dayOf(l.created_at) <= to);

  // Over time
  const series = new Map<string, { bucket: string; leads: number; qualified: number; bySource: Record<string, number> }>();
  for (const l of rows) {
    const b = bucketOf(dayOf(l.created_at), g);
    const s = series.get(b) ?? { bucket: b, leads: 0, qualified: 0, bySource: {} };
    s.leads += 1;
    if (l.qualification.qualified) s.qualified += 1;
    s.bySource[l.source] = (s.bySource[l.source] ?? 0) + 1;
    series.set(b, s);
  }

  // Funnel (aggregate counters; inquiry = leads counted by the server)
  const funnel = funnelRows(from, to);
  const stepTotals: Record<string, { human: number; ai_agent_user: number }> = {};
  for (const r of funnel) {
    const t = (stepTotals[r.step] ??= { human: 0, ai_agent_user: 0 });
    if (r.traffic === "human" || r.traffic === "ai_agent_user") t[r.traffic] += r.count;
  }
  const headline = HEADLINE_FUNNEL.map((step, i) => {
    const t = stepTotals[step] ?? { human: 0, ai_agent_user: 0 };
    const total = t.human + t.ai_agent_user;
    const prevStep = i > 0 ? HEADLINE_FUNNEL[i - 1] : null;
    const prev = prevStep ? (stepTotals[prevStep]?.human ?? 0) + (stepTotals[prevStep]?.ai_agent_user ?? 0) : null;
    return { step, human: t.human, aiAgentUser: t.ai_agent_user, total, conversionFromPreviousPct: prev == null ? null : pct(total, prev) };
  });
  const funnelBySource = new Map<string, Record<string, number>>();
  for (const r of funnel) {
    const m = funnelBySource.get(r.source) ?? {};
    m[r.step] = (m[r.step] ?? 0) + r.count;
    funnelBySource.set(r.source, m);
  }

  // Dealer response times (only leads with a recorded response)
  const byDealer = new Map<string, { name: string; leads: number; minutes: number[] }>();
  for (const l of rows) {
    const id = l.dealer.id ?? "unknown";
    const d = byDealer.get(id) ?? { name: l.dealer.name ?? id, leads: 0, minutes: [] };
    d.leads += 1;
    if (l.lifecycle.response_time_minutes != null) d.minutes.push(l.lifecycle.response_time_minutes);
    byDealer.set(id, d);
  }
  const dealerResponse: DealerResponse[] = [...byDealer.entries()].map(([dealerId, d]) => {
    const sorted = [...d.minutes].sort((a, b) => a - b);
    return { dealerId, dealerName: d.name, leads: d.leads, responded: sorted.length, medianMinutes: percentile(sorted, 50), p90Minutes: percentile(sorted, 90) };
  }).sort((a, b) => b.leads - a.leads);
  const allMinutes = rows.map((l) => l.lifecycle.response_time_minutes).filter((n): n is number => n != null).sort((a, b) => a - b);

  const outcomes: Record<string, number> = {};
  const lostReasons: Record<string, number> = {};
  for (const l of rows) {
    outcomes[l.lifecycle.stage] = (outcomes[l.lifecycle.stage] ?? 0) + 1;
    if (l.lifecycle.lost_reason) lostReasons[l.lifecycle.lost_reason] = (lostReasons[l.lifecycle.lost_reason] ?? 0) + 1;
  }
  const reached = {
    delivered: rows.filter((l) => l.lifecycle.delivered_at).length,
    opened: rows.filter((l) => l.lifecycle.opened_at).length,
    dealer_responded: rows.filter((l) => l.lifecycle.dealer_responded_at).length,
    appointment: rows.filter((l) => l.lifecycle.appointment_at).length,
    sold: rows.filter((l) => l.lifecycle.sold_at).length,
    lost: rows.filter((l) => l.lifecycle.lost_at).length,
  };

  const qualified = rows.filter((l) => l.qualification.qualified).length;
  return {
    range: { from, to, granularity: g, includeTests: Boolean(opts.includeTests), timezone: "UTC" },
    totals: {
      leads: rows.length, qualified, qualifiedPct: pct(qualified, rows.length),
      repeats: rows.reduce((n, l) => n + l.repeat_count, 0),
      medianResponseMinutes: percentile(allMinutes, 50), p90ResponseMinutes: percentile(allMinutes, 90),
    },
    series: [...series.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)),
    bySource: breakdown(rows, (l) => l.source),
    bySurface: breakdown(rows, (l) => l.surface),
    byDealer: breakdown(rows, (l) => (l.dealer.name ? `${l.dealer.name} (${l.dealer.id})` : l.dealer.id)),
    byUnitType: breakdown(rows, (l) => l.unit.unit_type),
    byPriceBand: breakdown(rows, (l) => l.unit.price_band),
    byRegion: breakdown(rows, (l) => l.region),
    byCampaign: breakdown(rows, (l) => l.campaign.utm_campaign ?? l.campaign.campaign ?? l.campaign.utm_source),
    funnel: headline,
    funnelBySource: [...funnelBySource.entries()].map(([source, steps]) => ({ source, ...steps })),
    botsExcluded: botExclusions(from, to),
    dealerResponse,
    outcomes, reached, lostReasons,
  };
}

// ── CSV ────────────────────────────────────────────────────────────────────

export const CSV_COLUMNS = [
  "lead_id", "created_at", "entry_point", "source", "source_verified", "surface", "traffic",
  "campaign", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "referrer_host", "landing_page",
  "unit_id", "stock_number", "unit_title", "unit_type", "condition", "year", "make", "model", "price_usd", "price_band",
  "dealer_id", "dealer_name", "region", "inquiry_ids", "delivery_status", "delivery_channel",
  "has_name", "has_contact", "specific_unit", "exclusivity", "qualified", "test", "repeat_count",
  "stage", "sent_at", "delivered_at", "opened_at", "dealer_responded_at", "appointment_at", "sold_at", "lost_at", "lost_reason", "response_time_minutes",
  "journey_views", "journey_swipes", "journey_favorites", "journey_searches", "journey_first_at", "journey_last_at",
  "session_id", "device_id", "anonymous_id", "agent_tier", "agent_client_id", "agent_host_label",
  "cost_usd", "revenue_usd", "contact_name", "contact_email", "contact_phone", "pii_purged_at",
  "credit_first_view_at", "credit_first_outbound_click_at", "credit_outbound_clicks", "credit_first_touch_at",
  "credit_review_status", "credit_review_reason", "credit_dealer_record_at", "credit_verdict", "credit_billable",
] as const;

/** Quote a CSV cell and neutralize spreadsheet formulas (=, +, -, @ at the start). */
export function csvCell(v: unknown): string {
  if (v == null) return "";
  let s = Array.isArray(v) ? v.join(" ") : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function leadsCsv(opts: ReportOptions & { includeContact?: boolean } = {}): string {
  const { from, to } = resolveRange(opts);
  const rows = listLeads().filter((l) => (opts.includeTests || !l.test) && dayOf(l.created_at) >= from && dayOf(l.created_at) <= to);
  const lines = [CSV_COLUMNS.join(",")];
  // The billing verdict columns stay empty until LEAD_CREDIT_ENABLED (DRAFT terms).
  const verdictOn = leadCreditEnabled();
  for (const l of rows) {
    const c = opts.includeContact ? l.contact : null;
    const lc = l.lifecycle;
    const values: unknown[] = [
      l.lead_id, l.created_at, l.entry_point, l.source, l.source_verified, l.surface, l.traffic,
      l.campaign.campaign, l.campaign.utm_source, l.campaign.utm_medium, l.campaign.utm_campaign, l.campaign.utm_term, l.campaign.utm_content, l.campaign.referrer_host, l.campaign.landing_page,
      l.unit.id, l.unit.stock_number, l.unit.title, l.unit.unit_type, l.unit.condition, l.unit.year, l.unit.make, l.unit.model, l.unit.price_usd, l.unit.price_band,
      l.dealer.id, l.dealer.name, l.region, l.inquiry_ids, l.delivery.inquiry_status, l.delivery.channel,
      l.qualification.has_name, l.qualification.has_contact, l.qualification.specific_unit, l.qualification.exclusivity, l.qualification.qualified, l.test, l.repeat_count,
      lc.stage, lc.sent_at, lc.delivered_at, lc.opened_at, lc.dealer_responded_at, lc.appointment_at, lc.sold_at, lc.lost_at, lc.lost_reason, lc.response_time_minutes,
      l.journey.counts.views, l.journey.counts.swipes, l.journey.counts.favorites, l.journey.counts.searches, l.journey.first_at, l.journey.last_at,
      l.ids.session_id, l.ids.device_id, l.ids.anonymous_id, l.ids.agent_tier, l.ids.agent_client_id, l.ids.agent_host_label,
      l.cost_usd, l.revenue_usd, c?.name ?? null, c?.email ?? null, c?.phone ?? null, l.pii_purged_at,
      l.credit?.evidence.first_view_at ?? null, l.credit?.evidence.first_outbound_click_at ?? null, l.credit?.evidence.outbound_clicks ?? null, l.credit?.evidence.first_touch_at ?? null,
      l.credit?.review.status ?? null, l.credit?.review.reason ?? null, l.credit?.review.dealer_record_at ?? null,
      ...(verdictOn ? [creditVerdict(l).status, creditVerdict(l).billable] : [null, null]),
    ];
    lines.push(values.map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
