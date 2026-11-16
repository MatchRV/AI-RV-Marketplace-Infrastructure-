/**
 * Attribution report: which integrations showed a dealer's inventory and
 * which of them produced leads.
 *
 * Two sections that are never merged:
 *
 *   verifiedPartners  API-key traffic. Billing-grade.
 *   unverified        host-labelled (e.g. ChatGPT metadata), anonymous MCP,
 *                     MatchRV's own website, and leads stored before
 *                     attribution existed. Informational only.
 *
 * Activity counts come from the daily counters. Lead counts come from the
 * stored inquiries themselves (tests and dry runs excluded), so a lead is
 * counted once, under the identity that sent it, with its current status.
 * The report holds ids and counts only: no shopper details.
 */
import { getAgentClient } from "./agent-clients";
import { attributionRows, type AttributionEvent } from "./attribution";
import { isTestInquiry, listStoredInquiries, type DealerInquiry } from "./dealer-inquiries";

type LeadStatus = "delivered" | "queued_for_matchrv" | "forwarded" | "failed";
export interface LeadCounts { total: number; delivered: number; queued_for_matchrv: number; forwarded: number; failed: number; reachedDealer: number }
export type EventCounts = Partial<Record<AttributionEvent, number>>;

interface Bucket { events: EventCounts; leads: LeadCounts }
interface Group extends Bucket { dealers: Map<string, Bucket & { dealerName: string | null }> }

const emptyLeads = (): LeadCounts => ({ total: 0, delivered: 0, queued_for_matchrv: 0, forwarded: 0, failed: 0, reachedDealer: 0 });
const newGroup = (): Group => ({ events: {}, leads: emptyLeads(), dealers: new Map() });

function addEvent(group: Group, dealer: string, event: AttributionEvent, count: number, dealerFilter: string | null): void {
  if (dealerFilter && dealer !== dealerFilter) return;
  group.events[event] = (group.events[event] ?? 0) + count;
  if (dealer === "-") return;
  const d = group.dealers.get(dealer) ?? { events: {}, leads: emptyLeads(), dealerName: null };
  d.events[event] = (d.events[event] ?? 0) + count;
  group.dealers.set(dealer, d);
}

function bump(leads: LeadCounts, status: LeadStatus): void {
  leads.total += 1;
  leads[status] += 1;
  if (status === "delivered" || status === "forwarded") leads.reachedDealer += 1;
}

function addLead(group: Group, inquiry: DealerInquiry): void {
  const status = inquiry.status as LeadStatus;
  if (!(["delivered", "queued_for_matchrv", "forwarded", "failed"] as string[]).includes(status)) return;
  bump(group.leads, status);
  const dealerId = inquiry.preview.dealer.id;
  const d = group.dealers.get(dealerId) ?? { events: {}, leads: emptyLeads(), dealerName: null };
  d.dealerName = inquiry.preview.dealer.name;
  bump(d.leads, status);
  group.dealers.set(dealerId, d);
}

function render(group: Group) {
  return {
    events: group.events,
    leads: group.leads,
    dealers: [...group.dealers.entries()]
      .map(([dealerId, d]) => ({ dealerId, dealerName: d.dealerName, events: d.events, leads: d.leads }))
      .sort((a, b) => b.leads.total - a.leads.total || (b.events.impression ?? 0) - (a.events.impression ?? 0) || a.dealerId.localeCompare(b.dealerId)),
  };
}

/** A filter can leave a group with nothing in it; those are not reported. */
const hasActivity = (group: Group) => group.leads.total > 0 || Object.keys(group.events).length > 0;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function buildAttributionReport(opts: { from?: string; to?: string; dealerId?: string; clientId?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const to = opts.to && DAY_RE.test(opts.to) ? opts.to : now.toISOString().slice(0, 10);
  const from = opts.from && DAY_RE.test(opts.from) ? opts.from : new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  const dealerFilter = opts.dealerId?.trim() || null;
  const clientFilter = opts.clientId?.trim() || null;

  const partners = new Map<string, Group>();
  const unverified = new Map<string, Group>();
  const group = (map: Map<string, Group>, key: string) => {
    let g = map.get(key);
    if (!g) { g = newGroup(); map.set(key, g); }
    return g;
  };

  for (const row of attributionRows(from, to)) {
    if (row.tier === "verified_partner") {
      if (clientFilter && row.client !== clientFilter) continue;
      addEvent(group(partners, row.client), row.dealer, row.event, row.count, dealerFilter);
    } else if (!clientFilter) {
      addEvent(group(unverified, row.tier === "unverified_host" ? `host:${row.client}` : "anonymous:mcp"), row.dealer, row.event, row.count, dealerFilter);
    }
  }

  for (const inquiry of listStoredInquiries()) {
    if (isTestInquiry(inquiry)) continue;
    const day = inquiry.createdAt.slice(0, 10);
    if (day < from || day > to) continue;
    if (dealerFilter && inquiry.preview.dealer.id !== dealerFilter) continue;
    const a = inquiry.attribution;
    // billingGrade alone is not trusted: the tier and a client id must agree with it.
    if (a && a.billingGrade === true && a.tier === "verified_partner" && a.clientId) {
      if (clientFilter && a.clientId !== clientFilter) continue;
      addLead(group(partners, a.clientId), inquiry);
      continue;
    }
    if (clientFilter) continue;
    const key = !a ? "unrecorded" : a.tier === "unverified_host" ? `host:${a.hostLabel ?? "unknown"}` : a.surface === "website" ? "website" : "anonymous:mcp";
    addLead(group(unverified, key), inquiry);
  }

  const describe: Record<string, string> = {
    "anonymous:mcp": "MCP calls with no API key and no recognised host metadata.",
    website: "Inquiries sent from matchrv.com itself.",
    unrecorded: "Leads stored before attribution was recorded.",
  };

  return {
    range: { from, to, timezone: "UTC" },
    generatedAt: now.toISOString(),
    filters: { dealerId: dealerFilter, clientId: clientFilter },
    verifiedPartners: {
      billingGrade: true,
      basis: "Requests authenticated with a MatchRV API key. Leads are bound to the key that prepared and sent them.",
      clients: [...partners.entries()].filter(([, g]) => hasActivity(g)).map(([clientId, g]) => {
        const client = getAgentClient(clientId);
        return { clientId, name: client?.name ?? null, status: client?.status ?? "unknown", ...render(g) };
      }).sort((a, b) => b.leads.total - a.leads.total || a.clientId.localeCompare(b.clientId)),
    },
    unverified: {
      billingGrade: false,
      basis: "No API key. Host labels come from request metadata or the user agent, which any caller can set. Do not bill, pay out or report these to a dealer as a named integration.",
      sources: [...unverified.entries()].filter(([, g]) => hasActivity(g)).map(([source, g]) => ({
        source,
        description: describe[source] ?? "Labelled from request metadata or user agent only; unverified.",
        ...render(g),
      })).sort((a, b) => a.source.localeCompare(b.source)),
    },
  };
}
