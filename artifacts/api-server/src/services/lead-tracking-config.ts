/**
 * Lead tracking flags. Everything defaults OFF: with no env set, no lead file
 * is written, no funnel counter is kept, no receipt link is minted and the
 * dashboard answers 404, so production behaves exactly as before.
 */
import { resolve } from "node:path";
import { dataDir } from "./atomic-file";

const truthy = (v: string | undefined) => /^(1|true|yes|on)$/i.test((v ?? "").trim());

let enabledOverride: boolean | null = null;
let receiptLinksOverride: boolean | null = null;

/** LEAD_TRACKING_ENABLED: canonical lead records, funnel counters, receipt pages, lead PostHog events. */
export function leadTrackingEnabled(): boolean {
  return enabledOverride ?? truthy(process.env.LEAD_TRACKING_ENABLED);
}

/** LEAD_RECEIPT_LINKS_IN_EMAIL: put the dealer receipt link in outgoing dealer emails. Needs LEAD_TRACKING_ENABLED too. */
export function receiptLinksInEmailEnabled(): boolean {
  return leadTrackingEnabled() && (receiptLinksOverride ?? truthy(process.env.LEAD_RECEIPT_LINKS_IN_EMAIL));
}

/** Minimum dashboard secret length. A shorter LEADS_DASHBOARD_TOKEN leaves the dashboard disabled. */
export const MIN_DASHBOARD_TOKEN_LENGTH = 24;
let warnedShortToken = false;

/** The dashboard secret, or null when unset or too short (dashboard disabled). Never logged. */
export function dashboardToken(): string | null {
  const t = process.env.LEADS_DASHBOARD_TOKEN?.trim() ?? "";
  if (!t) return null;
  if (t.length < MIN_DASHBOARD_TOKEN_LENGTH) {
    if (!warnedShortToken) {
      warnedShortToken = true;
      console.warn(`[lead-tracking] LEADS_DASHBOARD_TOKEN is shorter than ${MIN_DASHBOARD_TOKEN_LENGTH} characters; the dashboard stays disabled`);
    }
    return null;
  }
  return t;
}

const positiveInt = (raw: string | undefined, fallback: number | null): number | null => {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
};

/** Repeat window: same contact + same dealer inside it is a repeat of the first lead. */
export const dedupeWindowDays = () => positiveInt(process.env.LEAD_DEDUPE_WINDOW_DAYS, 30)!;
/** LEAD_PII_RETENTION_DAYS: unset = keep. purgeLeadPii() clears contact details older than this. Not scheduled. */
export const piiRetentionDays = () => positiveInt(process.env.LEAD_PII_RETENTION_DAYS, null);
/** Funnel counter days kept. */
export const funnelRetentionDays = () => positiveInt(process.env.LEAD_FUNNEL_RETENTION_DAYS, 400)!;

/** Public origin for receipt links. Defaults to the production site. */
export function publicBaseUrl(): string {
  const raw = (process.env.LEAD_RECEIPT_BASE_URL ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(raw) ? raw : "https://matchrv.com";
}

export function leadsPath(): string {
  if (process.env.LEADS_PATH) return resolve(process.env.LEADS_PATH);
  return resolve(dataDir(), "leads.json");
}

export function funnelPath(): string {
  if (process.env.LEAD_FUNNEL_PATH) return resolve(process.env.LEAD_FUNNEL_PATH);
  return resolve(dataDir(), "lead-funnel.json");
}

/** Test hooks. */
export function __setLeadTrackingForTests(opts: { enabled?: boolean | null; receiptLinks?: boolean | null }): void {
  if (opts.enabled !== undefined) enabledOverride = opts.enabled;
  if (opts.receiptLinks !== undefined) receiptLinksOverride = opts.receiptLinks;
}
