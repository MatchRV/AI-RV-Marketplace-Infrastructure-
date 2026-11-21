/**
 * Lead attribution input: what a client says about where a shopper came from.
 *
 * Every value is optional and whitelisted. Anything unknown becomes "unknown"
 * or "other"; anything that does not match its pattern is dropped. Nothing
 * here can reject a request: a malformed attribution object is treated as
 * absent, so existing clients that send nothing behave exactly as before.
 *
 * Inputs (see docs/lead-tracking/ATTRIBUTION_CONTRACT.md):
 *   HTTP headers   X-MatchRV-Client, X-MatchRV-Platform, X-MatchRV-App-Version,
 *                  X-MatchRV-Session-Id, X-MatchRV-Device-Id, X-MatchRV-Anonymous-Id,
 *                  X-MatchRV-Surface
 *   body / args    attribution: { surface, campaign, utm_*, referrer, landing_page,
 *                  session_id, device_id, anonymous_id, journey }
 *
 * Classification (bot-detect.ts, #109 semantics) decides the traffic class:
 *   human          a browser, or the MatchRV native app (see nativeAppUa below)
 *   ai_agent_user  an AI agent acting for a person in a chat (ChatGPT-User,
 *                  openai-mcp, Claude-User ...) or any MCP caller that is not a
 *                  named crawler: an MCP tool call is agent traffic by definition
 *   bot            every other bot-detect category. Never a lead, never a
 *                  funnel step; only counted in the excluded-bot tally.
 */
import { z } from "zod/v4";
import { classifyUserAgent, type BotCategory, type UaClassification } from "./bot-detect";
import type { AttributionContext } from "./attribution";

export const LEAD_SOURCES = ["native_ios", "native_android", "website", "chatgpt_app", "lotai", "other_ai_agent", "unknown"] as const;
export type LeadSource = typeof LEAD_SOURCES[number];

export const LEAD_SURFACES = [
  "swipe", "grid", "ask_ai", "favorites", "compare", "saved_search_alert", "price_drop", "tow_fit", "unit_detail", "other",
] as const;
export type LeadSurface = typeof LEAD_SURFACES[number];

export type TrafficClass = "human" | "ai_agent_user" | "bot";

export type EntryPoint = "website_inquiry_api" | "mcp_send_dealer_inquiry" | "mcp_v1_send_inquiry" | "legacy_buyer_lead_api";

const SOURCE_SET = new Set<string>(LEAD_SOURCES);
const SURFACE_SET = new Set<string>(LEAD_SURFACES);

/** X-MatchRV-Client values. Aliases map to one canonical source. */
const CLIENT_ALIASES: Record<string, LeadSource> = {
  website: "website", web: "website", "matchrv-web": "website",
  native_ios: "native_ios", ios: "native_ios", "matchrv-ios": "native_ios",
  native_android: "native_android", android: "native_android", "matchrv-android": "native_android",
  chatgpt_app: "chatgpt_app", chatgpt: "chatgpt_app",
  lotai: "lotai",
  other_ai_agent: "other_ai_agent", agent: "other_ai_agent",
};
const PLATFORMS = new Set(["ios", "android", "web"]);

/** Surface aliases clients are likely to send. Unknown values become "other". */
const SURFACE_ALIASES: Record<string, LeadSurface> = {
  listing_detail: "unit_detail", detail: "unit_detail", swipe_detail: "swipe", discover: "grid", category_listings: "grid",
  search: "grid", results: "grid", chat: "ask_ai", outfitter: "ask_ai", saved: "favorites", favorite: "favorites",
  alert: "saved_search_alert", price_alert: "price_drop", tow: "tow_fit", tow_guide: "tow_fit",
};

export function normalizeSource(raw: unknown): LeadSource | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  return CLIENT_ALIASES[v] ?? (SOURCE_SET.has(v) ? (v as LeadSource) : null);
}

export function normalizeSurface(raw: unknown): LeadSurface | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (SURFACE_SET.has(v)) return v as LeadSurface;
  return SURFACE_ALIASES[v] ?? "other";
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/;
/** Opaque client ids only. Anything with '@' or spaces (an email, a name) is dropped. */
export function cleanId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return ID_RE.test(v) && !v.includes("@") ? v : null;
}

/** utm_* and campaign values: lowercase slug, at most 80 chars. Anything else (spaces, '@', URLs) becomes "other". */
export function cleanTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v.length > 80 || v.includes("@") || !/^[a-z0-9][a-z0-9._+~-]*$/.test(v)) return "other";
  return v;
}

/** Referrer: host only (no path or query, which can carry search text or ids). */
export function cleanReferrerHost(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    return /^[a-z0-9.-]{1,120}$/.test(host) ? host : null;
  } catch {
    const host = raw.trim().toLowerCase();
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && host.length <= 120 ? host : null;
  }
}

/** Landing page: path only, ids collapsed, no query string. */
export function cleanLandingPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let path = raw.trim();
  try { if (/^https?:\/\//i.test(path)) path = new URL(path).pathname; } catch { return null; }
  path = path.split("?")[0].split("#")[0];
  if (!path.startsWith("/") || path.includes("..") || path.includes("@") || path.length > 160) return null;
  // ":" is allowed so an already-collapsed path ("/listing/:id") survives re-validation.
  if (!/^\/[A-Za-z0-9/_.~:-]*$/.test(path)) return null;
  return path.replace(/^\/listing\/.+/, "/listing/:id").replace(/^\/swipe\/.+/, "/swipe/:id");
}

const APP_VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$/;

// ── Journey supplied by a client ───────────────────────────────────────────

export const JOURNEY_EVENT_TYPES = ["impression", "view", "swipe", "favorite", "search", "compare", "inquiry_start"] as const;
export type JourneyEventType = typeof JOURNEY_EVENT_TYPES[number];
export const MAX_JOURNEY_EVENTS = 25;

export interface JourneyEvent { type: JourneyEventType; at: string; surface: LeadSurface | null; unit_id: string | null }
export interface JourneySummary {
  source: "server" | "client" | "none";
  counts: Record<"views" | "swipes" | "favorites" | "searches" | "impressions" | "compares", number>;
  first_at: string | null;
  last_at: string | null;
  /** Oldest first, at most MAX_JOURNEY_EVENTS. Types, surfaces, unit ids and times only. */
  events: JourneyEvent[];
}

export function emptyJourney(): JourneySummary {
  return { source: "none", counts: { views: 0, swipes: 0, favorites: 0, searches: 0, impressions: 0, compares: 0 }, first_at: null, last_at: null, events: [] };
}

const UNIT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/;
export const cleanUnitId = (raw: unknown): string | null => (typeof raw === "string" && UNIT_ID_RE.test(raw.trim()) && !raw.includes("@") ? raw.trim() : null);

function isoOrNull(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const t = typeof raw === "number" ? raw : Date.parse(raw);
  if (!Number.isFinite(t) || t < Date.UTC(2024, 0, 1) || t > Date.now() + 5 * 60_000) return null;
  return new Date(t).toISOString();
}

const countField = z.number().int().min(0).max(100_000).optional();
const journeySchema = z.object({
  views: countField, swipes: countField, favorites: countField, searches: countField, impressions: countField, compares: countField,
  first_at: z.union([z.string().max(40), z.number()]).optional(),
  last_at: z.union([z.string().max(40), z.number()]).optional(),
  events: z.array(z.object({
    type: z.string().max(30),
    at: z.union([z.string().max(40), z.number()]).optional(),
    surface: z.string().max(40).optional(),
    unit_id: z.string().max(120).optional(),
  })).max(200).optional(),
});

export function cleanClientJourney(raw: unknown): JourneySummary | null {
  const parsed = journeySchema.safeParse(raw);
  if (!parsed.success) return null;
  const j = parsed.data;
  const out = emptyJourney();
  out.source = "client";
  out.counts = { views: j.views ?? 0, swipes: j.swipes ?? 0, favorites: j.favorites ?? 0, searches: j.searches ?? 0, impressions: j.impressions ?? 0, compares: j.compares ?? 0 };
  const events: JourneyEvent[] = [];
  for (const e of j.events ?? []) {
    if (!(JOURNEY_EVENT_TYPES as readonly string[]).includes(e.type)) continue;
    const at = isoOrNull(e.at);
    if (!at) continue;
    events.push({ type: e.type as JourneyEventType, at, surface: normalizeSurface(e.surface), unit_id: cleanUnitId(e.unit_id) });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  out.events = events.slice(-MAX_JOURNEY_EVENTS);
  out.first_at = isoOrNull(j.first_at) ?? events[0]?.at ?? null;
  out.last_at = isoOrNull(j.last_at) ?? events[events.length - 1]?.at ?? null;
  return out;
}

// ── Attribution object ─────────────────────────────────────────────────────

export interface CleanAttribution {
  declared_source: LeadSource | null;
  platform: "ios" | "android" | "web" | null;
  app_version: string | null;
  surface: LeadSurface | null;
  campaign: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer_host: string | null;
  landing_page: string | null;
  session_id: string | null;
  device_id: string | null;
  anonymous_id: string | null;
  journey: JourneySummary | null;
}

export function emptyAttribution(): CleanAttribution {
  return {
    declared_source: null, platform: null, app_version: null, surface: null, campaign: null,
    utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null,
    referrer_host: null, landing_page: null, session_id: null, device_id: null, anonymous_id: null, journey: null,
  };
}

/** Largest attribution object accepted (serialized). Bigger objects are ignored whole. */
export const MAX_ATTRIBUTION_BYTES = 8_192;

/** The optional `attribution` object on a body or MCP tool call. Never throws. */
export function cleanAttributionObject(raw: unknown): CleanAttribution {
  const out = emptyAttribution();
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    if (JSON.stringify(raw).length > MAX_ATTRIBUTION_BYTES) return out;
    const a = raw as Record<string, unknown>;
    out.declared_source = normalizeSource(a.client ?? a.source);
    out.platform = typeof a.platform === "string" && PLATFORMS.has(a.platform.toLowerCase()) ? (a.platform.toLowerCase() as CleanAttribution["platform"]) : null;
    out.app_version = typeof a.app_version === "string" && APP_VERSION_RE.test(a.app_version) ? a.app_version : null;
    out.surface = normalizeSurface(a.surface);
    out.campaign = cleanTag(a.campaign);
    out.utm_source = cleanTag(a.utm_source);
    out.utm_medium = cleanTag(a.utm_medium);
    out.utm_campaign = cleanTag(a.utm_campaign);
    out.utm_term = cleanTag(a.utm_term);
    out.utm_content = cleanTag(a.utm_content);
    out.referrer_host = cleanReferrerHost(a.referrer);
    out.landing_page = cleanLandingPath(a.landing_page);
    out.session_id = cleanId(a.session_id);
    out.device_id = cleanId(a.device_id);
    out.anonymous_id = cleanId(a.anonymous_id);
    out.journey = a.journey !== undefined ? cleanClientJourney(a.journey) : null;
  } catch {
    return emptyAttribution();
  }
  return out;
}

type HeaderGetter = (name: string) => string | null | undefined;

/** Headers fill only what the body did not say. Body/argument values win. */
export function mergeHeaderAttribution(base: CleanAttribution, get: HeaderGetter): CleanAttribution {
  const out = { ...base };
  try {
    out.declared_source ??= normalizeSource(get("x-matchrv-client"));
    if (!out.platform) {
      const p = (get("x-matchrv-platform") ?? "").trim().toLowerCase();
      out.platform = PLATFORMS.has(p) ? (p as CleanAttribution["platform"]) : null;
    }
    if (!out.app_version) {
      const v = (get("x-matchrv-app-version") ?? "").trim();
      out.app_version = APP_VERSION_RE.test(v) ? v : null;
    }
    out.surface ??= normalizeSurface(get("x-matchrv-surface"));
    out.session_id ??= cleanId(get("x-matchrv-session-id"));
    out.device_id ??= cleanId(get("x-matchrv-device-id"));
    out.anonymous_id ??= cleanId(get("x-matchrv-anonymous-id"));
  } catch {
    /* keep what we had */
  }
  return out;
}

/** Combine an earlier (prepare-time) attribution with a later (send-time) one. Later non-null values win. */
export function overlayAttribution(earlier: CleanAttribution | null | undefined, later: CleanAttribution): CleanAttribution {
  if (!earlier) return later;
  const out = { ...earlier } as Record<string, unknown>;
  for (const [k, v] of Object.entries(later)) if (v !== null && v !== undefined) out[k] = v;
  return out as unknown as CleanAttribution;
}

/** Small form carried inside a signed confirmation token (no journey events). */
export function compactAttribution(a: CleanAttribution): Partial<CleanAttribution> | null {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) if (k !== "journey" && v !== null) out[k] = v;
  return Object.keys(out).length ? (out as Partial<CleanAttribution>) : null;
}

export function expandCompactAttribution(raw: unknown): CleanAttribution | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  // Re-validate every field: the token is signed, but the values came from a client.
  return cleanAttributionObject({ ...r, client: r.declared_source, referrer: r.referrer_host, journey: undefined });
}

// ── Traffic class + source ─────────────────────────────────────────────────

/** Crawler-type categories. Never a lead or a funnel step on any surface. */
const CRAWLER_CATEGORIES = new Set<BotCategory>(["search_crawler", "ai_crawler", "seo_tool", "social_preview", "other_crawler"]);

/**
 * True when the user agent is what the Expo app's HTTP stack sends (iOS
 * CFNetwork/Darwin, Android okhttp, or an unbranded app UA) and the client
 * declared itself as the MatchRV native app. bot-detect tags these as
 * generic_script because they are not "Mozilla/5.0"; for a request that says
 * it is the app, they are the app. A named crawler is never the app.
 */
function nativeAppUa(c: UaClassification, attr: CleanAttribution): boolean {
  if (!c.is_bot) return true;
  const declaredNative = attr.declared_source === "native_ios" || attr.declared_source === "native_android" || attr.platform === "ios" || attr.platform === "android";
  return declaredNative && c.bot_category === "generic_script" && (c.bot_name === "unknown-client" || c.bot_name === "okhttp" || c.bot_name === "empty-ua");
}

export function classifyTraffic(userAgent: string | null | undefined, attr: CleanAttribution, channel: "http" | "mcp"): { traffic: TrafficClass; classification: UaClassification } {
  const c = classifyUserAgent(userAgent);
  if (channel === "mcp") {
    // An MCP tool call is made by an agent for a person. Only named crawlers are excluded.
    if (c.is_bot && CRAWLER_CATEGORIES.has(c.bot_category)) return { traffic: "bot", classification: c };
    return { traffic: "ai_agent_user", classification: c };
  }
  if (!c.is_bot) return { traffic: "human", classification: c };
  if (c.bot_category === "ai_agent_user") return { traffic: "ai_agent_user", classification: c };
  if (nativeAppUa(c, attr)) return { traffic: "human", classification: c };
  return { traffic: "bot", classification: c };
}

const LOTAI_RE = /lotai|lot\s*ai|lotlink/i;
function lotaiClientIds(): Set<string> {
  return new Set((process.env.LEAD_LOTAI_CLIENT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

/**
 * Lead source. A verified API key decides it outright (LotAI when the client id
 * is listed in LEAD_LOTAI_CLIENT_IDS or its registered name says LotAI, else
 * other_ai_agent). Otherwise the channel, then the declared client header.
 * source_verified is true only for the API-key case.
 */
export function resolveSource(input: {
  channel: "http" | "mcp";
  attr: CleanAttribution;
  agent: AttributionContext | null | undefined;
  classification: UaClassification;
}): { source: LeadSource; verified: boolean } {
  const { channel, attr, agent, classification } = input;
  if (agent?.tier === "verified_partner" && agent.clientId) {
    const isLotai = lotaiClientIds().has(agent.clientId) || LOTAI_RE.test(agent.clientName ?? "");
    return { source: isLotai ? "lotai" : "other_ai_agent", verified: true };
  }
  if (channel === "mcp") {
    if (agent?.tier === "unverified_host" && agent.hostLabel === "chatgpt_app") return { source: "chatgpt_app", verified: false };
    if (classification.is_bot && classification.bot_name === "openai-mcp") return { source: "chatgpt_app", verified: false };
    if (attr.declared_source === "lotai" || attr.declared_source === "chatgpt_app") return { source: attr.declared_source, verified: false };
    return { source: "other_ai_agent", verified: false };
  }
  // Plain HTTP (website API).
  const d = attr.declared_source;
  if (d === "native_ios" || attr.platform === "ios") return { source: "native_ios", verified: false };
  if (d === "native_android" || attr.platform === "android") return { source: "native_android", verified: false };
  if (classification.is_bot && classification.bot_category === "ai_agent_user") {
    return { source: classification.bot_name === "chatgpt-user" ? "chatgpt_app" : "other_ai_agent", verified: false };
  }
  if (d) return { source: d, verified: false };
  return { source: classification.is_bot ? "unknown" : "website", verified: false };
}

/** What a caller hands to lead tracking for one inquiry send. Built per request; contains no contact details. */
export interface LeadRequestContext {
  channel: "http" | "mcp";
  entryPoint: EntryPoint;
  userAgent: string | null;
  attribution: CleanAttribution;
  agent: AttributionContext | null;
}

export function buildLeadRequestContext(input: {
  channel: "http" | "mcp";
  entryPoint: EntryPoint;
  headers: HeaderGetter;
  attribution?: unknown;
  agent?: AttributionContext | null;
}): LeadRequestContext {
  const attr = mergeHeaderAttribution(cleanAttributionObject(input.attribution), input.headers);
  const ua = input.headers("user-agent");
  return { channel: input.channel, entryPoint: input.entryPoint, userAgent: typeof ua === "string" ? ua.slice(0, 512) : null, attribution: attr, agent: input.agent ?? null };
}
