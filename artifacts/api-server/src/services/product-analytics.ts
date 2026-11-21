/**
 * MatchRV product analytics collector.
 *
 * Posts allowlisted events to PostHog's public capture API. US cloud ingestion
 * is https://us.i.posthog.com/batch/ (EU: https://eu.i.posthog.com/batch/).
 * See https://posthog.com/docs/api/capture and
 * https://posthog.com/docs/data/anonymous-vs-identified-events.
 *
 * Disabled unless POSTHOG_PROJECT_API_KEY is set. Network failures, a full
 * queue, and a bad host are dropped. Callers never wait on ingestion and
 * never see a throw.
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  ANALYTICS_CLIENT_IP_HEADER, UUID_RE, botTags, classifyUserAgent, hashedIpUaId, opaqueHash,
  resetAnalyticsClientForTests, sessionUuidFor, type AnalyticsClient,
} from "./analytics-client";

export type { AnalyticsClient } from "./analytics-client";

export const POSTHOG_US_HOST = "https://us.i.posthog.com";
export const POSTHOG_EU_HOST = "https://eu.i.posthog.com";
const ALLOWED_HOSTS = new Set([POSTHOG_US_HOST, POSTHOG_EU_HOST]);

const WEBSITE_EVENTS = new Set([
  "website_page_view",
  "website_listing_view",
  "website_card_viewed",
  "website_inventory_attention",
  "website_search_results",
  "website_dealer_click",
]);

const SERVER_EVENTS = new Set([
  ...WEBSITE_EVENTS,
  "mcp_tool_started",
  "mcp_tool_completed",
  "mcp_protocol_request",
  "inquiry_outcome",
]);

const RV_TYPES = new Set([
  "travel_trailer", "fifth_wheel", "toy_hauler", "class_a", "class_b", "class_c", "popup_camper", "truck_camper",
]);

const SURFACES = new Set([
  "listing_detail", "category_listings", "discover", "swipe", "swipe_detail", "header", "outbound",
]);

const ACTIONS = new Set(["like", "detail_open", "save"]);

const INQUIRY_CHANNELS = new Set(["dealer_email", "matchrv_forward", "demo_lead_record", "none"]);

const REJECTION_STATUSES = new Set([
  "not_confirmed", "invalid_token", "expired_token", "rate_limited", "unit_unavailable",
  "awaiting_human_approval", "rejected", "already_submitted", "not_found", "expired",
]);

const CLIENT_HINTS = new Set(["unknown", "openai_mcp_user_agent", "anthropic_user_agent", "test_or_scan"]);

export interface AnalyticsTransport {
  sendBatch(body: string, signal: AbortSignal): Promise<{ ok: boolean }>;
}

interface RuntimeConfig {
  apiKey: string;
  host: string;
  transport: AnalyticsTransport;
  maxQueue: number;
  timeoutMs: number;
}

type ProductEvent = Record<string, unknown>;

const DEFAULT_MAX_QUEUE = 100;
const DEFAULT_TIMEOUT_MS = 1_500;
const MAX_BATCH = 20;

let testConfig: RuntimeConfig | null | undefined;
let queue: ProductEvent[] = [];
let dropped = 0;
let generation = 0;
let flushChain: Promise<void> = Promise.resolve();
let scheduled = false;
let warnedAt = 0;

export function resetProductAnalyticsForTests(): void {
  resetAnalyticsClientForTests();
  generation += 1;
  testConfig = undefined;
  queue = [];
  dropped = 0;
  scheduled = false;
  flushChain = Promise.resolve();
}

export function configureProductAnalyticsForTests(opts: {
  apiKey?: string;
  host?: string;
  timeoutMs?: number;
  maxQueue?: number;
  transport?: AnalyticsTransport;
} | null): void {
  generation += 1;
  queue = [];
  dropped = 0;
  if (!opts) {
    testConfig = null;
    return;
  }
  const host = normalizeHost(opts.host ?? POSTHOG_US_HOST);
  const apiKey = (opts.apiKey ?? "").trim();
  if (!apiKey || !host) {
    testConfig = null;
    return;
  }
  testConfig = {
    apiKey,
    host,
    transport: opts.transport ?? fetchTransport(host),
    maxQueue: opts.maxQueue ?? DEFAULT_MAX_QUEUE,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

export function productAnalyticsDroppedCount(): number {
  return dropped;
}

export function classifyClientHint(userAgent: string | null | undefined): { client_hint: string; client_hint_is_proof: false } {
  const ua = (userAgent ?? "").trim().toLowerCase();
  if (!ua) return { client_hint: "unknown", client_hint_is_proof: false };
  if (ua.includes("openai-mcp")) return { client_hint: "openai_mcp_user_agent", client_hint_is_proof: false };
  if (ua.includes("anthropic") || ua.includes("claude")) return { client_hint: "anthropic_user_agent", client_hint_is_proof: false };
  if (/(curl|wget|python-requests|go-http-client|postman|insomnia|bot|spider|crawler|uptime|pingdom|node-fetch)/.test(ua)) {
    return { client_hint: "test_or_scan", client_hint_is_proof: false };
  }
  return { client_hint: "unknown", client_hint_is_proof: false };
}

function normalizeHost(raw: string | undefined): string | null {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  if (!value) return POSTHOG_US_HOST;
  return ALLOWED_HOSTS.has(value) ? value : null;
}

function activeConfig(): RuntimeConfig | null {
  if (testConfig !== undefined) return testConfig;
  const apiKey = process.env.POSTHOG_PROJECT_API_KEY?.trim() ?? "";
  if (!apiKey) return null;
  const host = normalizeHost(process.env.POSTHOG_HOST);
  if (!host) return null;
  return {
    apiKey,
    host,
    transport: fetchTransport(host),
    maxQueue: DEFAULT_MAX_QUEUE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

function fetchTransport(host: string): AnalyticsTransport {
  return {
    async sendBatch(body, signal) {
      const response = await fetch(`${host}/batch/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal,
      });
      return { ok: response.ok };
    },
  };
}

function acceptedListingKey(text: string): boolean {
  if (/^[0-9]{1,12}$/.test(text)) return true;
  if (text.startsWith("vin:")) return /^vin:[A-HJ-NPR-Z0-9]{11,17}$/i.test(text);
  if (text.startsWith("stk:")) return /^stk:[A-Za-z0-9._:-]{1,160}$/.test(text) && !text.includes("://") && !text.includes("/");
  if (text.startsWith("key:u:")) return text.length <= 300 && /^key:u:[^\s]{1,240}$/.test(text);
  return false;
}

/** `lst_` plus the first 24 hex chars of SHA-256. Same input always maps to the same id. */
export function telemetryListingId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) value = String(value);
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length < 1 || text.length > 300) return undefined;
  if (/[\s@?#]|[^\u0020-\u007e]|\.\./.test(text)) return undefined;
  if (/^lst_[0-9a-f]{24}$/.test(text)) return text;
  if (!acceptedListingKey(text)) return undefined;
  return `lst_${createHash("sha256").update(text).digest("hex").slice(0, 24)}`;
}

/** Dealer slug only. URLs, VINs, and contact-shaped values are omitted. */
export function telemetryDealerId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) value = String(value);
  if (typeof value !== "string") return undefined;
  const text = value.trim().toLowerCase();
  if (text.length < 1 || text.length > 120) return undefined;
  if (text.includes("://") || text.includes("@") || text.includes("?") || text.includes("#") || text.includes("/") || text.startsWith("vin:")) return undefined;
  if (/^[a-z0-9][a-z0-9.-]{0,79}$/.test(text)) return text;
  if (/^[a-z0-9][a-z0-9.-]{0,79}:[a-z0-9-]{1,60}$/.test(text)) return text;
  return undefined;
}

function safePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const bare = value.split("#")[0]?.split("?")[0] ?? "";
  let path = bare;
  try { path = decodeURIComponent(bare); } catch { return undefined; }
  if (!path.startsWith("/") || path.includes("..") || path.includes("@")) return undefined;
  if (/^\/listing\/./.test(path)) path = "/listing";
  if (/https?:\/\//i.test(path) || /vin:/i.test(path)) return undefined;
  if (!/^\/[A-Za-z0-9/_.~-]{0,160}$/.test(path)) return undefined;
  return path;
}

function safeCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < 0 || value > 100_000) return undefined;
  return value;
}

function safeCode(value: unknown, max = 40): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!new RegExp(`^[a-z0-9_]{1,${max}}$`).test(value)) return undefined;
  return value;
}

function safeTool(value: unknown): string | undefined {
  return safeCode(value, 64);
}

function safeMethod(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!/^[a-zA-Z0-9/_-]{1,64}$/.test(value)) return undefined;
  return value;
}

function flag(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

const SESSION_RE = /^[A-Za-z0-9_-]{8,80}$/;
/** posthog-js anonymous ids are UUIDv7; identified ids are Clerk/dealer ids. Reserved prefixes are refused so a browser cannot claim a bot or MCP id. */
const CLIENT_DISTINCT_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/;
const RESERVED_DISTINCT_PREFIX = /^(bot:|mcp_|anon_|web_session_)/i;

function cleanClientDistinctId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!CLIENT_DISTINCT_RE.test(text) || RESERVED_DISTINCT_PREFIX.test(text) || text.includes("@")) return undefined;
  return text;
}

function cleanSessionUuid(value: unknown): string | undefined {
  return typeof value === "string" && UUID_RE.test(value.trim()) ? value.trim().toLowerCase() : undefined;
}

function clientProperties(client?: AnalyticsClient): ProductEvent {
  if (!client) return {};
  const out: ProductEvent = {};
  if (client.ip) out.$ip = client.ip;
  if (client.userAgent) out.$raw_user_agent = client.userAgent.slice(0, 512);
  return out;
}

/**
 * Identity for website events, first match wins:
 *  1. Known bot / AI agent / script user agent: distinct_id `bot:<name>` (one id per bot).
 *  2. The browser's posthog-js distinct_id, posted by the beacon.
 *  3. The browser's MatchRV session id: `web_session_<id>`.
 *  4. Daily-rotating HMAC of client IP + UA: `anon_<hash>`.
 *  5. A random per-request id (no client info at all; tests and internal callers).
 * $process_person_profile stays false for every server event, so none of these create person profiles.
 */
function websiteIdentity(raw: ProductEvent, clean: ProductEvent, client?: AnalyticsClient): ProductEvent & { distinctId: string } {
  const session = typeof clean.session_id === "string" && SESSION_RE.test(clean.session_id) ? clean.session_id : undefined;
  const postedDistinct = cleanClientDistinctId(raw.distinct_id);
  const postedSession = cleanSessionUuid(raw.$session_id);
  const tags = client ? botTags(classifyUserAgent(client.userAgent)) : undefined;
  let distinctId: string;
  let scope: string;
  if (tags?.is_bot && tags.bot_name) {
    distinctId = `bot:${tags.bot_name}`;
    scope = "bot";
  } else if (postedDistinct) {
    distinctId = postedDistinct;
    scope = "browser_distinct_id";
  } else if (session) {
    distinctId = `web_session_${session}`;
    scope = "anonymous_session";
  } else {
    const hashed = client ? hashedIpUaId("anon_", client) : undefined;
    distinctId = hashed ?? `anon_${randomBytes(16).toString("hex")}`;
    scope = hashed ? "anonymous_ip_ua_daily" : "anonymous_request";
  }
  let sessionUuid = tags?.is_bot ? undefined : postedSession;
  if (!sessionUuid && scope !== "anonymous_request") {
    const key = tags?.is_bot
      ? `${distinctId}|${hashedIpUaId("", client ?? {}) ?? ""}`
      : session ? `web:${session}` : `id:${distinctId}`;
    sessionUuid = sessionUuidFor(key);
  }
  return {
    ...clean,
    ...clientProperties(client),
    ...(tags ?? {}),
    ...(sessionUuid ? { $session_id: sessionUuid } : {}),
    session_id: undefined,
    identity_scope: scope,
    identity_is_person: false,
    $process_person_profile: false,
    distinctId,
  };
}

/**
 * Identity for MCP events. AI-agent traffic is a segment, never a person:
 * distinct_id `mcp_<hash>` from the Mcp-Session-Id (or X-MatchRV-Session)
 * header, else a daily-rotating hash of client IP + UA. The raw session id,
 * IP and UA never appear in the id. Every MCP event carries is_bot=true.
 */
export function mcpIdentity(headers: Headers | null | undefined, responseHeaders?: Headers | null): ProductEvent & { distinctId: string } {
  const get = (name: string) => headers?.get(name) ?? null;
  const ua = get("user-agent")?.slice(0, 512) || undefined;
  const ip = get(ANALYTICS_CLIENT_IP_HEADER) || undefined;
  const client: AnalyticsClient = { ip, userAgent: ua };
  // initialize has no session yet; the server assigns one on its response.
  const rawSession = get("mcp-session-id") ?? get("x-matchrv-session") ?? responseHeaders?.get("mcp-session-id") ?? null;
  const session = rawSession && /^[A-Za-z0-9._:-]{8,128}$/.test(rawSession) ? rawSession : undefined;
  const classified = classifyUserAgent(ua);
  const tags = classified.is_bot
    ? botTags(classified)
    : { is_bot: true, bot_name: "browser-mcp-client", bot_category: "ai_agent_user" };
  let distinctId: string;
  let scope: string;
  if (session) {
    distinctId = `mcp_${opaqueHash("mcp-session", session)}`;
    scope = "mcp_session";
  } else {
    const hashed = hashedIpUaId("mcp_", client);
    distinctId = hashed ?? `mcp_req_${randomBytes(12).toString("hex")}`;
    scope = hashed ? "mcp_ip_ua_daily" : "anonymous_request";
  }
  return {
    ...clientProperties(client),
    ...tags,
    ...(scope !== "anonymous_request" ? { $session_id: sessionUuidFor(`mcp:${distinctId}`) } : {}),
    identity_scope: scope,
    distinctId,
  };
}

function withIdentity(event: ProductEvent, identity?: ProductEvent & { distinctId: string }): ProductEvent & { distinctId: string } {
  if (identity) {
    return {
      ...event,
      ...identity,
      session_id: undefined,
      identity_is_person: false,
      $process_person_profile: false,
    };
  }
  // Server-side event with no request context (inquiry outcomes): one-off anonymous id.
  return {
    ...event,
    session_id: undefined,
    identity_scope: event.identity_scope ?? "anonymous_request",
    identity_is_person: false,
    $process_person_profile: false,
    distinctId: `anon_${randomBytes(16).toString("hex")}`,
  };
}

/** Public website events only. MCP and inquiry names are rejected so a browser cannot forge them. */
export function sanitizeProductEvent(event: ProductEvent): ProductEvent | null {
  if (!event || typeof event !== "object") return null;
  const name = event.event;
  if (typeof name !== "string" || !WEBSITE_EVENTS.has(name)) return null;
  if (event.source !== "website") return null;
  const clean: ProductEvent = {
    event: name,
    source: "website",
    identity_is_person: false,
    $process_person_profile: false,
    identity_scope: "anonymous_request",
  };
  const path = safePath(event.path);
  if (name === "website_page_view") {
    if (!path) return null;
    clean.path = path;
  } else if (path) clean.path = path;
  const listing = telemetryListingId(event.listing_id);
  const dealer = telemetryDealerId(event.dealer_id);
  if (listing) clean.listing_id = listing;
  if (dealer) clean.dealer_id = dealer;
  if (typeof event.surface === "string" && SURFACES.has(event.surface)) clean.surface = event.surface;
  if (typeof event.rv_type === "string" && RV_TYPES.has(event.rv_type)) clean.rv_type = event.rv_type;
  if (typeof event.action === "string" && ACTIONS.has(event.action)) clean.action = event.action;
  const resultCount = safeCount(event.result_count);
  const matched = safeCount(event.matched_count);
  if (resultCount !== undefined) clean.result_count = resultCount;
  if (matched !== undefined) clean.matched_count = matched;
  if (typeof event.session_id === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(event.session_id)) {
    clean.session_id = event.session_id;
    clean.identity_scope = "anonymous_session";
  }
  return clean;
}

function sanitizeServerEvent(event: ProductEvent, identity?: ProductEvent & { distinctId: string }): (ProductEvent & { distinctId: string }) | null {
  const name = event.event;
  if (typeof name !== "string" || !SERVER_EVENTS.has(name)) return null;
  if (WEBSITE_EVENTS.has(name)) {
    const web = sanitizeProductEvent(event);
    return web ? websiteIdentity(event, web) : null;
  }
  const clean: ProductEvent = {
    event: name,
    identity_is_person: false,
    $process_person_profile: false,
    identity_scope: "anonymous_request",
  };
  if (event.source === "mcp" || event.source === "website" || event.source === "website_webmcp" || event.source === "unknown") {
    clean.source = event.source;
  } else return null;
  const copyCode = (key: string, max = 40) => {
    const value = safeCode(event[key], max);
    if (value) clean[key] = value;
  };
  copyCode("tool_name", 64);
  const method = safeMethod(event.method);
  if (method) clean.method = method;
  copyCode("outcome", 40);
  copyCode("error_code", 40);
  copyCode("status", 40);
  copyCode("channel", 40);
  if (typeof event.channel === "string" && INQUIRY_CHANNELS.has(event.channel)) clean.channel = event.channel;
  else delete clean.channel;
  if (typeof event.client_hint === "string" && CLIENT_HINTS.has(event.client_hint)) clean.client_hint = event.client_hint;
  if (event.client_hint_is_proof === false) clean.client_hint_is_proof = false;
  const listing = telemetryListingId(event.listing_id);
  const dealer = telemetryDealerId(event.dealer_id);
  if (listing) clean.listing_id = listing;
  if (dealer) clean.dealer_id = dealer;
  for (const key of ["counts_as_shopper_tool", "counts_as_error", "counts_as_results_returned", "counts_as_submitted", "counts_as_queued", "counts_as_delivered", "batch_executed"] as const) {
    const value = flag(event[key]);
    if (value !== undefined) clean[key] = value;
  }
  const requestedTools = safeCount(event.requested_tool_calls);
  if (requestedTools !== undefined && requestedTools <= 20) clean.requested_tool_calls = requestedTools;
  const latency = safeCount(event.latency_ms);
  const http = safeCount(event.http_status);
  const results = safeCount(event.result_count);
  if (latency !== undefined && latency <= 600_000) clean.latency_ms = latency;
  if (http !== undefined && http <= 599) clean.http_status = http;
  if (results !== undefined) clean.result_count = results;
  if (typeof event.execution_id === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(event.execution_id)) clean.execution_id = event.execution_id;
  if (typeof event.surface === "string" && SURFACES.has(event.surface)) clean.surface = event.surface;
  return withIdentity(clean, identity);
}

/**
 * Website event from a browser beacon or a server route. Pass `client` (from
 * clientFromNodeRequest) so $ip, $raw_user_agent, bot tags and a stable id are set.
 */
export function captureProductEvent(event: ProductEvent, client?: AnalyticsClient): void {
  try {
    const clean = sanitizeProductEvent(event);
    if (!clean) return;
    enqueue(websiteIdentity(event, clean, client));
  } catch {
    /* fail open */
  }
}

export function captureServerProductEvent(event: ProductEvent, identity?: ProductEvent & { distinctId: string }): void {
  try {
    const clean = sanitizeServerEvent(event, identity);
    if (!clean) return;
    enqueue(clean);
  } catch {
    /* fail open */
  }
}

function enqueue(event: ProductEvent & { distinctId: string }): void {
  try {
    const cfg = activeConfig();
    if (!cfg) return;
    // Browser events cannot fill the queue and evict MCP or inquiry events.
    const websiteCap = cfg.maxQueue >= 20 ? Math.floor(cfg.maxQueue / 2) : cfg.maxQueue;
    if (event.source === "website") {
      let websiteCount = 0;
      for (const queued of queue) if (queued.source === "website") websiteCount += 1;
      if (websiteCount >= websiteCap) {
        dropped += 1;
        return;
      }
    }
    if (queue.length >= cfg.maxQueue) {
      dropped += 1;
      return;
    }
    queue.push(event);
    scheduleFlush();
  } catch {
    /* fail open */
  }
}

function scheduleFlush(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    void flushProductAnalytics();
  });
}

export function flushProductAnalytics(): Promise<void> {
  const run = flushChain.then(() => flushOnce());
  flushChain = run.catch(() => undefined);
  return run;
}

async function flushOnce(): Promise<void> {
  const cfg = activeConfig();
  const gen = generation;
  if (!cfg || queue.length === 0) return;
  const batch = queue.splice(0, MAX_BATCH);
  const body = JSON.stringify({
    api_key: cfg.apiKey,
    historical_migration: false,
    batch: batch.map((event) => {
      const { distinctId, ...properties } = event;
      return {
        event: properties.event,
        distinct_id: distinctId,
        properties,
        timestamp: new Date().toISOString(),
        // Same body is retried, so this uuid lets PostHog drop the duplicate delivery.
        uuid: randomUUID(),
      };
    }),
  });
  const ok = await sendWithRetry(cfg, body, gen);
  if (generation !== gen) return;
  if (!ok) {
    dropped += batch.length;
    const now = Date.now();
    if (now - warnedAt > 60_000) {
      warnedAt = now;
      console.warn(`[product-analytics] dropped ${batch.length} events; ingestion unavailable`);
    }
  }
  if (queue.length > 0) scheduleFlush();
}

async function sendWithRetry(cfg: RuntimeConfig, body: string, gen: number): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (generation !== gen) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const result = await Promise.race([
        cfg.transport.sendBatch(body, controller.signal),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("analytics_timeout")));
        }),
      ]);
      if (result.ok) return true;
    } catch {
      /* retry once, then drop */
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

export interface InquiryOutcomeInput {
  source: "mcp" | "website" | "website_webmcp" | "unknown";
  status: string;
  channel: string;
  duplicate: boolean;
  dryRun: boolean;
  listingId?: string;
  dealerId?: string;
  dealerDeliverySupported?: boolean;
  email?: string;
  message?: string;
}

export function buildInquiryOutcomeEvent(input: InquiryOutcomeInput): ProductEvent {
  const listing = telemetryListingId(input.listingId);
  const dealer = telemetryDealerId(input.dealerId);
  const channel = INQUIRY_CHANNELS.has(input.channel) ? input.channel : "none";
  const status = safeCode(input.status) ?? "unknown";
  let outcome = "rejected";
  let counts_as_submitted = false;
  let counts_as_queued = false;
  let counts_as_delivered = false;
  if (input.duplicate) outcome = "duplicate";
  else if (input.dryRun || status === "dry_run") outcome = "dry_run";
  else if (status === "delivered" && input.dealerDeliverySupported !== false) {
    outcome = "submitted_delivered";
    counts_as_submitted = true;
    counts_as_delivered = true;
  } else if (status === "queued_for_matchrv" || (status === "delivered" && input.dealerDeliverySupported === false)) {
    outcome = "submitted_queued";
    counts_as_submitted = true;
    counts_as_queued = true;
  } else if (status === "failed") {
    outcome = "submitted_failed";
    counts_as_submitted = true;
  } else if (REJECTION_STATUSES.has(status)) outcome = "rejected";
  return {
    event: "inquiry_outcome",
    source: input.source,
    outcome,
    status,
    channel,
    counts_as_submitted,
    counts_as_queued,
    counts_as_delivered,
    ...(listing ? { listing_id: listing } : {}),
    ...(dealer ? { dealer_id: dealer } : {}),
    identity_is_person: false,
    identity_scope: "anonymous_request",
    $process_person_profile: false,
  };
}

export function recordInquiryOutcome(input: InquiryOutcomeInput): void {
  try {
    captureServerProductEvent(buildInquiryOutcomeEvent(input));
  } catch {
    /* fail open */
  }
}

function executionId(): string {
  return `exec_${randomBytes(12).toString("hex")}`;
}

function parseRpcBody(raw: string): { result?: Record<string, unknown>; error?: unknown } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const jsonText = trimmed.startsWith("{") || trimmed.startsWith("[")
    ? trimmed
    : trimmed.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as { result?: Record<string, unknown>; error?: unknown };
  } catch {
    return null;
  }
}

function toolPayload(result: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!result) return null;
  const content = result.content;
  if (!Array.isArray(content)) return null;
  const text = content.find((item) => item && typeof item === "object" && (item as { type?: string }).type === "text") as { text?: unknown } | undefined;
  if (!text || typeof text.text !== "string") return null;
  try {
    const parsed = JSON.parse(text.text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function summarizeMcpExchange(input: {
  method: string;
  toolName?: string;
  httpStatus: number;
  latencyMs: number;
  responseBody: string;
  userAgent?: string | null;
  listingIds?: string[];
  executionId?: string;
  bodyState?: "ok" | "aborted";
}): ProductEvent[] {
  const hint = classifyClientHint(input.userAgent);
  const method = safeCode(input.method.replaceAll("/", "_"), 64) ?? "unknown";
  const latency = Math.max(0, Math.min(600_000, Math.round(input.latencyMs)));
  const httpStatus = input.httpStatus;
  const shared = {
    source: "mcp" as const,
    ...hint,
    identity_is_person: false,
    identity_scope: "anonymous_request",
    $process_person_profile: false,
  };
  if (input.method !== "tools/call") {
    return [{
      ...shared,
      event: "mcp_protocol_request",
      method: input.method === "tools/list" ? "tools/list" : method === "initialize" ? "initialize" : method,
      http_status: httpStatus,
      latency_ms: latency,
      counts_as_shopper_tool: false,
    }];
  }

  const rpc = parseRpcBody(input.responseBody);
  const result = rpc?.result;
  const payload = toolPayload(result);
  const isError = result?.isError === true || httpStatus >= 400 || Boolean(rpc?.error);
  const status = typeof payload?.status === "string" ? payload.status : undefined;
  const results = Array.isArray(payload?.results) ? payload.results.length : undefined;
  let outcome = "completed";
  let counts_as_error = false;
  let counts_as_results_returned = false;
  let error_code: string | undefined;
  if (input.bodyState === "aborted") {
    outcome = "aborted";
    counts_as_error = true;
  } else if (isError) {
    outcome = httpStatus >= 400 || rpc?.error ? "protocol_error" : "app_error";
    if (result?.isError === true) outcome = "app_error";
    counts_as_error = true;
    error_code = safeCode(payload?.error);
  } else if (status === "needs_discovery" || status === "choose_swipe_or_chat" || status === "answer_directly") {
    outcome = "discovery";
  } else if (status === "shortlist" && results === 0) {
    outcome = "no_results";
  } else if (status === "shortlist" && typeof results === "number") {
    outcome = "results";
    counts_as_results_returned = true;
  } else if (status === "preview_only_nothing_sent") {
    outcome = "preview";
  } else if (!payload && !result) {
    outcome = "unparsed";
  }
  const listing = (input.listingIds ?? []).map((id) => telemetryListingId(id)).find((id): id is string => Boolean(id));
  const execution_id = input.executionId && /^[A-Za-z0-9_-]{8,80}$/.test(input.executionId) ? input.executionId : executionId();
  const tool_name = safeTool(input.toolName) ?? "unknown";
  const started: ProductEvent = {
    ...shared,
    event: "mcp_tool_started",
    tool_name,
    execution_id,
    counts_as_shopper_tool: true,
  };
  const completed: ProductEvent = {
    ...shared,
    event: "mcp_tool_completed",
    tool_name,
    execution_id,
    outcome,
    http_status: httpStatus,
    latency_ms: latency,
    counts_as_shopper_tool: outcome !== "protocol_error" && outcome !== "aborted" && outcome !== "unparsed",
    counts_as_error,
    counts_as_results_returned,
    ...((outcome === "results" || outcome === "no_results") && results !== undefined ? { result_count: results } : {}),
    ...(error_code ? { error_code } : {}),
    ...(listing ? { listing_id: listing } : {}),
  };
  return [started, completed];
}

export interface PeekedToolCall {
  id: string;
  toolName?: string;
  listingIds: string[];
}

export interface PeekedMcpRequest {
  method: string;
  toolName?: string;
  listingIds: string[];
  batch: boolean;
  calls: PeekedToolCall[];
}

function listingIdsFromArgs(args: unknown): string[] {
  if (!args || typeof args !== "object" || Array.isArray(args)) return [];
  const record = args as { unit_id?: unknown; unit_ids?: unknown };
  const ids: string[] = [];
  if (typeof record.unit_id === "string") ids.push(record.unit_id);
  if (Array.isArray(record.unit_ids)) {
    for (const id of record.unit_ids.slice(0, 4)) if (typeof id === "string") ids.push(id);
  }
  return ids;
}

function toolCallFromMessage(message: unknown): PeekedToolCall | null {
  if (!message || typeof message !== "object" || Array.isArray(message)) return null;
  const body = message as { id?: unknown; method?: unknown; params?: { name?: unknown; arguments?: unknown } };
  if (body.method !== "tools/call") return null;
  const id = typeof body.id === "string" || typeof body.id === "number" ? String(body.id) : "";
  if (!id) return null;
  return {
    id,
    toolName: typeof body.params?.name === "string" ? body.params.name : undefined,
    listingIds: listingIdsFromArgs(body.params?.arguments),
  };
}

/** Read JSON-RPC method and tool names. A batch is not one tool execution. */
export function peekMcpRequest(raw: string): PeekedMcpRequest | null {
  const slice = raw.length > 65_536 ? raw.slice(0, 65_536) : raw;
  try {
    const parsed = JSON.parse(slice) as unknown;
    if (Array.isArray(parsed)) {
      const calls = parsed.map(toolCallFromMessage).filter((call): call is PeekedToolCall => Boolean(call)).slice(0, 20);
      return { method: "batch", listingIds: [], batch: true, calls };
    }
    if (!parsed || typeof parsed !== "object") return null;
    const body = parsed as { method?: unknown; params?: { name?: unknown; arguments?: unknown }; id?: unknown };
    const method = typeof body.method === "string" ? body.method.slice(0, 64) : "unknown";
    const call = toolCallFromMessage(parsed);
    return {
      method,
      toolName: typeof body.params?.name === "string" ? body.params.name : undefined,
      listingIds: listingIdsFromArgs(body.params?.arguments),
      batch: false,
      calls: call ? [call] : [],
    };
  } catch {
    return null;
  }
}

function rpcMessages(raw: string): Array<{ id?: string; result?: Record<string, unknown>; error?: unknown }> {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parsedValues: unknown[] = [];
  const take = (value: string) => {
    try { parsedValues.push(JSON.parse(value)); } catch { /* ignore a non-json frame */ }
  };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) take(trimmed);
  else {
    for (const line of trimmed.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload && payload !== "[DONE]") take(payload);
    }
  }
  const messages: Array<{ id?: string; result?: Record<string, unknown>; error?: unknown }> = [];
  const push = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const body = value as { id?: unknown; result?: unknown; error?: unknown };
    messages.push({
      id: typeof body.id === "string" || typeof body.id === "number" ? String(body.id) : undefined,
      result: body.result && typeof body.result === "object" && !Array.isArray(body.result) ? body.result as Record<string, unknown> : undefined,
      error: body.error,
    });
  };
  if (Array.isArray(parsedValues[0])) {
    for (const item of parsedValues[0]) push(item);
  } else {
    for (const item of parsedValues) push(item);
  }
  return messages;
}

export async function observeMcpFetch(request: Request, inner: (request: Request) => Promise<Response>): Promise<Response> {
  const started = performance.now();
  const enabled = Boolean(activeConfig());
  // Clone the request before the handler reads it, but do not wait on that read.
  let peekPromise: Promise<ReturnType<typeof peekMcpRequest>> = Promise.resolve(null);
  if (enabled) {
    try {
      peekPromise = request.clone().text().then((raw) => peekMcpRequest(raw)).catch(() => null);
    } catch {
      peekPromise = Promise.resolve(null);
    }
  }
  let response: Response;
  try {
    response = await inner(request);
  } catch (err) {
    if (enabled) {
      let failIdentity: ReturnType<typeof mcpIdentity> | undefined;
      try { failIdentity = mcpIdentity(request.headers); } catch { failIdentity = undefined; }
      void peekPromise.then((peeked) => {
        const calls = peeked?.calls ?? [];
        for (const call of calls) {
          for (const event of summarizeMcpExchange({
            method: "tools/call",
            toolName: call.toolName,
            httpStatus: 500,
            latencyMs: performance.now() - started,
            responseBody: "",
            userAgent: request.headers.get("user-agent"),
            listingIds: call.listingIds,
            executionId: executionId(),
            bodyState: "aborted",
          })) captureServerProductEvent(event, failIdentity);
        }
      }).catch(() => undefined);
    }
    throw err;
  }
  if (!enabled) return response;
  const userAgent = request.headers.get("user-agent");
  const httpStatus = response.status;
  let identity: ReturnType<typeof mcpIdentity> | undefined;
  try { identity = mcpIdentity(request.headers, response.headers); } catch { identity = undefined; }
  // Only POST bodies are finite tool results. A GET SSE session is not read.
  let bodyPromise: Promise<string> | null = null;
  if (request.method === "POST") {
    try { bodyPromise = response.clone().text(); } catch { bodyPromise = null; }
  }
  void peekPromise.then(async (peeked) => {
    const calls = peeked?.calls ?? [];
    const method = peeked?.method ?? "unknown";
    if (calls.length === 0) {
      for (const event of summarizeMcpExchange({
        method,
        httpStatus,
        latencyMs: performance.now() - started,
        responseBody: "",
        userAgent,
      })) {
        captureServerProductEvent(peeked?.batch ? { ...event, batch_executed: false, requested_tool_calls: 0 } : event, identity);
      }
      return;
    }
    let responseBody = "";
    let bodyState: "ok" | "aborted" = bodyPromise ? "ok" : "aborted";
    if (bodyPromise) {
      try { responseBody = await bodyPromise; } catch { bodyState = "aborted"; }
    }
    if (!responseBody.trim()) bodyState = "aborted";
    const messages = bodyState === "ok" ? rpcMessages(responseBody) : [];
    const latencyMs = performance.now() - started;
    const executed = httpStatus < 400 && bodyState === "ok";
    if (peeked?.batch) {
      captureServerProductEvent({
        event: "mcp_protocol_request",
        source: "mcp",
        method: "batch",
        http_status: httpStatus,
        latency_ms: latencyMs,
        counts_as_shopper_tool: false,
        batch_executed: executed,
        requested_tool_calls: calls.length,
        ...classifyClientHint(userAgent),
        identity_is_person: false,
        identity_scope: "anonymous_request",
        $process_person_profile: false,
      }, identity);
    }
    for (const call of calls) {
      const matched = peeked?.batch
        ? messages.find((message) => message.id === call.id)
        : messages.find((message) => message.id === call.id) ?? messages[0];
      const failed = !executed || !matched;
      const pair = summarizeMcpExchange({
        method: "tools/call",
        toolName: call.toolName,
        httpStatus,
        latencyMs,
        responseBody: matched ? JSON.stringify({ result: matched.result, error: matched.error }) : "",
        userAgent,
        listingIds: call.listingIds,
        executionId: executionId(),
        bodyState: failed ? "aborted" : "ok",
      });
      captureServerProductEvent(pair[0], identity);
      captureServerProductEvent(pair[1], identity);
    }
  }).catch(() => undefined);
  return response;
}

// ── Lead tracking events (LEAD_TRACKING_ENABLED) ───────────────────────────

const LEAD_EVENTS = new Set(["lead_created", "lead_repeat", "lead_stage", "lead_funnel_step"]);
const LEAD_ENUMS: Record<string, ReadonlySet<string>> = {
  lead_source: new Set(["native_ios", "native_android", "website", "chatgpt_app", "lotai", "other_ai_agent", "unknown"]),
  lead_surface: new Set(["swipe", "grid", "ask_ai", "favorites", "compare", "saved_search_alert", "price_drop", "tow_fit", "unit_detail", "other"]),
  traffic: new Set(["human", "ai_agent_user"]),
  entry_point: new Set(["website_inquiry_api", "mcp_send_dealer_inquiry", "mcp_v1_send_inquiry", "legacy_buyer_lead_api"]),
  funnel_step: new Set(["impression", "view", "swipe", "favorite", "search", "compare", "inquiry_start", "inquiry"]),
  stage: new Set(["sent", "delivered", "opened", "dealer_responded", "appointment", "sold", "lost"]),
  lost_reason: new Set(["bought_elsewhere", "unit_sold", "no_response_from_shopper", "financing", "price", "not_a_fit", "duplicate", "spam", "other"]),
  price_band: new Set(["under_20k", "20k_40k", "40k_60k", "60k_100k", "100k_200k", "200k_plus", "unknown"]),
  rv_type: RV_TYPES,
};
const LEAD_FLAGS = ["lead_source_verified", "qualified", "has_name", "has_contact", "specific_unit", "exclusivity", "repeat"] as const;
const LEAD_COUNTS = ["repeat_count", "response_time_minutes", "step_count"] as const;
const LEAD_TAGS = ["utm_source", "utm_medium", "utm_campaign"] as const;

/**
 * Allowlisted lead event for PostHog. Only enums, booleans, counts, an opaque
 * lead id, a hashed listing id, a dealer slug, a state code and slug-shaped utm
 * tags pass. No name, email, phone, message, IP or user agent is ever copied.
 */
export function sanitizeLeadEvent(name: string, props: Record<string, unknown>): ProductEvent | null {
  if (!LEAD_EVENTS.has(name)) return null;
  const out: ProductEvent = { event: name, source: "lead_tracking", identity_is_person: false, $process_person_profile: false };
  for (const [key, allowed] of Object.entries(LEAD_ENUMS)) {
    const v = props[key];
    if (typeof v === "string" && allowed.has(v)) out[key] = v;
  }
  for (const key of LEAD_FLAGS) if (typeof props[key] === "boolean") out[key] = props[key];
  for (const key of LEAD_COUNTS) { const n = safeCount(props[key]); if (n !== undefined) out[key] = n; }
  for (const key of LEAD_TAGS) {
    const v = props[key];
    if (typeof v === "string" && /^[a-z0-9][a-z0-9._+~-]{0,79}$/.test(v)) out[key] = v;
  }
  if (typeof props.lead_id === "string" && /^lead_[A-Za-z0-9_-]{8,40}$/.test(props.lead_id)) out.lead_id = props.lead_id;
  if (typeof props.region === "string" && /^[A-Z]{2,3}$/.test(props.region)) out.region = props.region;
  const listing = telemetryListingId(props.listing_id);
  const dealer = telemetryDealerId(props.dealer_id);
  if (listing) out.listing_id = listing;
  if (dealer) out.dealer_id = dealer;
  return out;
}

/**
 * Queue a lead event. identityKey is an already-hashed session key; the
 * distinct id is a further HMAC of it, so it cannot be joined to the raw id.
 * Without one, events about the same lead share an id derived from lead_id.
 */
export function captureLeadAnalyticsEvent(name: string, props: Record<string, unknown>, identityKey: string | null): void {
  try {
    const clean = sanitizeLeadEvent(name, props);
    if (!clean) return;
    const basis = identityKey ? `s:${identityKey}` : typeof clean.lead_id === "string" ? `l:${clean.lead_id}` : null;
    const distinctId = basis ? `anon_${opaqueHash("lead-tracking", basis)}` : `anon_${randomBytes(16).toString("hex")}`;
    enqueue({ ...clean, identity_scope: basis ? "lead_tracking_session" : "anonymous_request", distinctId });
  } catch {
    /* fail open */
  }
}
