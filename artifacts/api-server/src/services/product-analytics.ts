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

import { randomBytes } from "node:crypto";

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

function safeId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // Inventory keys include stk:host:stock and key:u:https://dealer/product/slug.
  // Query strings, fragments, and contact-shaped values stay out.
  if (value.length < 1 || value.length > 200) return undefined;
  if (!/^[A-Za-z0-9:._/-]+$/.test(value)) return undefined;
  if (value.includes("..") || value.includes("@") || value.includes("?") || value.includes("#")) return undefined;
  return value;
}

function safePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!/^\/[A-Za-z0-9/_-]{0,160}$/.test(value)) return undefined;
  if (value.includes("..")) return undefined;
  return value;
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

function baseIdentity(sessionId?: string): { distinctId: string; identity_scope: string } {
  if (sessionId) return { distinctId: `web_session_${sessionId}`, identity_scope: "anonymous_session" };
  return { distinctId: `anon_${randomBytes(16).toString("hex")}`, identity_scope: "anonymous_request" };
}

function withIdentity(event: ProductEvent, distinctId?: string): ProductEvent & { distinctId: string } {
  const session = typeof event.session_id === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(event.session_id)
    ? event.session_id
    : undefined;
  const identity = distinctId
    ? { distinctId, identity_scope: "anonymous_request" as const }
    : baseIdentity(session);
  return {
    ...event,
    session_id: undefined,
    identity_scope: event.identity_scope ?? identity.identity_scope,
    identity_is_person: false,
    $process_person_profile: false,
    distinctId: distinctId ?? identity.distinctId,
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
  const listing = safeId(event.listing_id);
  const dealer = safeId(event.dealer_id);
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

function sanitizeServerEvent(event: ProductEvent): (ProductEvent & { distinctId: string }) | null {
  const name = event.event;
  if (typeof name !== "string" || !SERVER_EVENTS.has(name)) return null;
  if (WEBSITE_EVENTS.has(name)) {
    const web = sanitizeProductEvent(event);
    return web ? withIdentity(web) : null;
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
  const listing = safeId(event.listing_id);
  const dealer = safeId(event.dealer_id);
  if (listing) clean.listing_id = listing;
  if (dealer) clean.dealer_id = dealer;
  for (const key of ["counts_as_shopper_tool", "counts_as_error", "counts_as_results_returned", "counts_as_submitted", "counts_as_queued", "counts_as_delivered"] as const) {
    const value = flag(event[key]);
    if (value !== undefined) clean[key] = value;
  }
  const latency = safeCount(event.latency_ms);
  const http = safeCount(event.http_status);
  const results = safeCount(event.result_count);
  if (latency !== undefined && latency <= 600_000) clean.latency_ms = latency;
  if (http !== undefined && http <= 599) clean.http_status = http;
  if (results !== undefined) clean.result_count = results;
  if (typeof event.execution_id === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(event.execution_id)) clean.execution_id = event.execution_id;
  if (typeof event.surface === "string" && SURFACES.has(event.surface)) clean.surface = event.surface;
  return withIdentity(clean, typeof event.distinctId === "string" ? event.distinctId : undefined);
}

export function captureProductEvent(event: ProductEvent): void {
  const clean = sanitizeProductEvent(event);
  if (!clean) return;
  enqueue(withIdentity(clean));
}

export function captureServerProductEvent(event: ProductEvent): void {
  try {
    const clean = sanitizeServerEvent(event);
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
  const listing = safeId(input.listingId);
  const dealer = safeId(input.dealerId);
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
  if (isError) {
    outcome = httpStatus >= 400 || rpc?.error ? "protocol_error" : "app_error";
    if (result?.isError === true) outcome = "app_error";
    counts_as_error = true;
    error_code = safeCode(payload?.error);
  } else if (status === "needs_discovery" || status === "choose_swipe_or_chat" || status === "answer_directly") {
    outcome = "discovery";
  } else if (status === "shortlist" && results === 0) {
    outcome = "no_results";
    counts_as_results_returned = true;
  } else if (status === "shortlist" && typeof results === "number") {
    outcome = "results";
    counts_as_results_returned = true;
  } else if (status === "preview_only_nothing_sent") {
    outcome = "preview";
  } else if (!payload && !result) {
    outcome = "unparsed";
  }
  const listing = (input.listingIds ?? []).map((id) => safeId(id)).find((id): id is string => Boolean(id));
  const execution_id = executionId();
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
    counts_as_shopper_tool: true,
    counts_as_error,
    counts_as_results_returned,
    ...(counts_as_results_returned && results !== undefined ? { result_count: results } : {}),
    ...(error_code ? { error_code } : {}),
    ...(listing ? { listing_id: listing } : {}),
  };
  return [started, completed];
}

/** Read a JSON-RPC method and tool name without keeping the raw arguments. */
export function peekMcpRequest(raw: string): { method: string; toolName?: string; listingIds: string[] } | null {
  const slice = raw.length > 65_536 ? raw.slice(0, 65_536) : raw;
  try {
    const parsed = JSON.parse(slice) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { method: "batch", listingIds: [] };
    const body = parsed as { method?: unknown; params?: { name?: unknown; arguments?: unknown } };
    const method = typeof body.method === "string" ? body.method.slice(0, 64) : "unknown";
    const toolName = typeof body.params?.name === "string" ? body.params.name : undefined;
    const args = body.params?.arguments;
    const listingIds: string[] = [];
    if (args && typeof args === "object" && !Array.isArray(args)) {
      const record = args as { unit_id?: unknown; unit_ids?: unknown };
      if (typeof record.unit_id === "string") listingIds.push(record.unit_id);
      if (Array.isArray(record.unit_ids)) {
        for (const id of record.unit_ids.slice(0, 6)) if (typeof id === "string") listingIds.push(id);
      }
    }
    return { method, toolName, listingIds };
  } catch {
    return null;
  }
}

export async function observeMcpFetch(request: Request, inner: (request: Request) => Promise<Response>): Promise<Response> {
  const started = performance.now();
  const enabled = Boolean(activeConfig());
  // Clone before the handler reads the body, but do not wait on that read.
  // The tool runs immediately; classification happens after the response is returned.
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
      void peekPromise.then((peeked) => {
        if (peeked?.method !== "tools/call") return;
        for (const event of summarizeMcpExchange({
          method: "tools/call",
          toolName: peeked.toolName,
          httpStatus: 500,
          latencyMs: performance.now() - started,
          responseBody: "",
          userAgent: request.headers.get("user-agent"),
          listingIds: peeked.listingIds,
        })) captureServerProductEvent(event);
      }).catch(() => undefined);
    }
    throw err;
  }
  if (!enabled) return response;
  const latencyMs = performance.now() - started;
  const userAgent = request.headers.get("user-agent");
  const httpStatus = response.status;
  let copyText: Promise<string> = Promise.resolve("");
  try {
    copyText = response.clone().text();
  } catch {
    copyText = Promise.resolve("");
  }
  void Promise.all([peekPromise, copyText]).then(([peeked, responseBody]) => {
    const summary = summarizeMcpExchange({
      method: peeked?.method ?? "unknown",
      toolName: peeked?.toolName,
      httpStatus,
      latencyMs,
      responseBody,
      userAgent,
      listingIds: peeked?.listingIds,
    });
    for (const event of summary) captureServerProductEvent(event);
  }).catch(() => undefined);
  return response;
}
