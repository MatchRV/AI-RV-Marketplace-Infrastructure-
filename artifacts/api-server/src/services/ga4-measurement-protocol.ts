/**
 * GA4 Measurement Protocol: server-side generate_lead for off-site leads
 * (ChatGPT / MCP, LotAI, other keyed agents, native iOS/Android app).
 *
 * Website browser leads already send generate_lead from gtag — this module
 * must not repeat those, or conversions would double.
 *
 * Independent of LEAD_TRACKING_ENABLED (PR #110). Hooked from dealer-inquiries
 * performSend after a successful, non-duplicate, non-test send. When both
 * flags are on: the lead store records the canonical lead; this module only
 * notifies GA4 for off-site sources.
 *
 * Off by default (GA4_MP_ENABLED). Requires GA4_API_SECRET. Fire-and-forget:
 * a failure or a missing secret never changes inquiry delivery.
 *
 * Never send name, email, phone, message, or raw user agents. Do not log the
 * API secret.
 */
import { createHash } from "node:crypto";
import { classifyTraffic, resolveSource, type LeadRequestContext, type LeadSource } from "./lead-attribution";

const truthy = (v: string | undefined) => /^(1|true|yes|on)$/i.test((v ?? "").trim());

/** Sources that do not run the website gtag snippet (or cannot be relied on to). */
export const OFFSITE_LEAD_SOURCES: ReadonlySet<LeadSource> = new Set([
  "chatgpt_app",
  "lotai",
  "other_ai_agent",
  "native_ios",
  "native_android",
]);

const DEFAULT_MEASUREMENT_ID = "G-Y2C0PN44L2";
const MP_URL = "https://www.google-analytics.com/mp/collect";
const TIMEOUT_MS = 2_000;

let enabledOverride: boolean | null = null;
let idOverride: string | null | undefined = undefined;
let secretOverride: string | null | undefined = undefined;
let fetchOverride: typeof fetch | null = null;
let warnedMissing = false;

export function ga4MpEnabled(): boolean {
  return enabledOverride ?? truthy(process.env.GA4_MP_ENABLED);
}

export function ga4MeasurementId(): string | null {
  if (idOverride !== undefined) return idOverride;
  const raw = (process.env.GA4_MEASUREMENT_ID ?? DEFAULT_MEASUREMENT_ID).trim();
  return /^G-[A-Z0-9]{6,14}$/.test(raw) ? raw : null;
}

function ga4ApiSecret(): string | null {
  if (secretOverride !== undefined) return secretOverride;
  const raw = (process.env.GA4_API_SECRET ?? "").trim();
  return raw.length >= 8 ? raw : null;
}

export function ga4MpReady(): boolean {
  return ga4MpEnabled() && Boolean(ga4MeasurementId()) && Boolean(ga4ApiSecret());
}

export interface OffsiteGenerateLeadInput {
  ctx?: LeadRequestContext | null;
  unitId?: string | null;
  dealerId?: string | null;
  priceUsd?: number | null;
  inquiryId?: string | null;
}

const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PII_KEY = /email|phone|e-?mail|sms|message|^body$|^(full_?)?name$|first_?name|last_?name/i;

function stripPii(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (PII_KEY.test(key)) continue;
    if (typeof value === "string" && EMAIL_LIKE.test(value.trim())) continue;
    if (value == null || value === "") continue;
    out[key] = value;
  }
  return out;
}

function clientIdFor(inquiryId: string | null | undefined, sessionId: string | null | undefined): string {
  const basis = inquiryId || sessionId || `anon-${Date.now()}`;
  const hex = createHash("sha256").update(`ga4-mp:${basis}`).digest("hex");
  return `${hex.slice(0, 16)}.${hex.slice(16, 32)}`;
}

function amount(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && n > 0 && n < 1e9 ? Math.round(n * 100) / 100 : undefined;
}

export interface GenerateLeadParams {
  clientId: string;
  source: LeadSource;
  surface?: string | null;
  item_id?: string | null;
  dealer_id?: string | null;
  value?: number | null;
  lead_type?: string;
  lead_audience?: string;
  lead_verified?: boolean;
  entry_point?: string;
  placement?: string;
}

/**
 * POST one generate_lead event. Resolves after the request finishes or times
 * out. Never throws. Callers should not await this on the lead path.
 */
export function sendGenerateLead(params: GenerateLeadParams): Promise<void> {
  return (async () => {
    if (!ga4MpReady()) {
      if (ga4MpEnabled() && !warnedMissing) {
        warnedMissing = true;
        console.warn("[ga4-mp] GA4_MP_ENABLED is on but GA4_MEASUREMENT_ID or GA4_API_SECRET is missing or invalid; off-site generate_lead is not sent");
      }
      return;
    }
    const measurementId = ga4MeasurementId()!;
    const apiSecret = ga4ApiSecret()!;
    const value = amount(params.value);
    const eventParams = stripPii({
      lead_type: params.lead_type ?? "buyer_dealer_inquiry",
      lead_audience: params.lead_audience ?? "shopper",
      lead_verified: params.lead_verified ?? true,
      source: params.source,
      lead_source: params.source,
      surface: params.surface ?? undefined,
      item_id: params.item_id ?? undefined,
      dealer_id: params.dealer_id ?? undefined,
      entry_point: params.entry_point ?? undefined,
      placement: params.placement ?? undefined,
      engagement_time_msec: 1,
      ...(value !== undefined ? { value, currency: "USD" } : {}),
    });
    const body = JSON.stringify({
      client_id: params.clientId,
      events: [{ name: "generate_lead", params: eventParams }],
    });
    const url = `${MP_URL}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
    const fetchImpl = fetchOverride ?? fetch;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: ac.signal,
      });
    } catch {
      // fire-and-forget
    } finally {
      clearTimeout(timer);
    }
  })();
}

/**
 * If this inquiry is an off-site lead and MP is enabled, enqueue generate_lead.
 * Safe to call on every successful send. No-ops for website/browser leads,
 * bots (crawlers), missing context, or when the flag is off.
 */
export function reportOffsiteGenerateLead(input: OffsiteGenerateLeadInput): void {
  try {
    if (!ga4MpEnabled()) return;
    const ctx = input.ctx;
    if (!ctx) return;
    const { traffic, classification } = classifyTraffic(ctx.userAgent, ctx.attribution, ctx.channel);
    if (traffic === "bot") return;
    const { source } = resolveSource({
      channel: ctx.channel,
      attr: ctx.attribution,
      agent: ctx.agent,
      classification,
    });
    if (!OFFSITE_LEAD_SOURCES.has(source)) return;
    void sendGenerateLead({
      clientId: clientIdFor(input.inquiryId, ctx.attribution.session_id),
      source,
      surface: ctx.attribution.surface,
      item_id: input.unitId ?? null,
      dealer_id: input.dealerId ?? null,
      value: input.priceUsd ?? null,
      lead_type: "buyer_dealer_inquiry",
      lead_audience: "shopper",
      lead_verified: true,
      entry_point: ctx.entryPoint,
    });
  } catch {
    // never block lead flow
  }
}

/** Test hooks. Pass null to force a missing id/secret; undefined restores env. */
export function __setGa4MpForTests(opts: {
  enabled?: boolean | null;
  measurementId?: string | null;
  apiSecret?: string | null;
  fetchImpl?: typeof fetch | null;
}): void {
  if (opts.enabled !== undefined) enabledOverride = opts.enabled;
  if (opts.measurementId !== undefined) idOverride = opts.measurementId;
  if (opts.apiSecret !== undefined) secretOverride = opts.apiSecret;
  if (opts.fetchImpl !== undefined) fetchOverride = opts.fetchImpl;
  warnedMissing = false;
}

export function __resetGa4MpForTests(): void {
  enabledOverride = null;
  idOverride = undefined;
  secretOverride = undefined;
  fetchOverride = null;
  warnedMissing = false;
}
