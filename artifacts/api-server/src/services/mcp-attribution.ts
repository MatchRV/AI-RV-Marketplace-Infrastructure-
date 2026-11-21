/**
 * Attribution wrapper for MCP endpoints.
 *
 * Sits outside the MCP server: it reads the request headers and JSON-RPC
 * envelope, decides who is calling, runs the real handler inside that context
 * and, after the response is on its way, counts what was shown. It never
 * changes a tool's input, output or schema, and it never requires a key: a
 * request with no key, or with a rejected one, is served exactly as before
 * and counted as unverified or anonymous.
 */
import { agentKeyFromHeaders, checkAgentKey } from "./agent-clients";
import {
  ANONYMOUS_CONTEXT, allowClientRequest, hashSession, recordAttributionEvent, runWithAttribution, touchUnits,
  type AttributionContext, type AttributionSurface,
} from "./attribution";
import { recordMcpToolFunnel, runWithMcpLeadPeek } from "./lead-mcp";

const MAX_PEEK_BYTES = 262_144;
const SESSION_RE = /^[A-Za-z0-9._:-]{8,128}$/;

interface RpcCall { id: string; tool: string; args: Record<string, unknown> }
interface Peek { meta: Record<string, unknown>; calls: RpcCall[] }

function peekBody(raw: string): Peek {
  const out: Peek = { meta: {}, calls: [] };
  if (!raw || raw.length > MAX_PEEK_BYTES) return out;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return out; }
  const messages = (Array.isArray(parsed) ? parsed : [parsed]).slice(0, 20);
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const m = message as { id?: unknown; method?: unknown; params?: { name?: unknown; arguments?: unknown; _meta?: unknown } };
    const meta = m.params?._meta;
    if (meta && typeof meta === "object" && !Array.isArray(meta) && Object.keys(out.meta).length === 0) out.meta = meta as Record<string, unknown>;
    if (m.method !== "tools/call" || typeof m.params?.name !== "string") continue;
    const id = typeof m.id === "string" || typeof m.id === "number" ? String(m.id) : "";
    const args = m.params.arguments && typeof m.params.arguments === "object" && !Array.isArray(m.params.arguments) ? m.params.arguments as Record<string, unknown> : {};
    out.calls.push({ id, tool: m.params.name, args });
  }
  return out;
}

/** Decide who is calling. A valid key is the only route to verified_partner. */
export function resolveAttribution(headers: Headers, meta: Record<string, unknown>, surface: AttributionSurface): AttributionContext {
  const presented = agentKeyFromHeaders(headers);
  const check = checkAgentKey(presented);
  const rawSession = headers.get("x-matchrv-session") ?? headers.get("mcp-session-id");
  const session = rawSession && SESSION_RE.test(rawSession) ? rawSession : null;
  if (check.status === "ok") {
    return {
      surface, tier: "verified_partner", clientId: check.client.id, clientName: check.client.name, hostLabel: null,
      sessionHash: session ? hashSession(check.client.id, session) : null,
      scopes: check.client.scopes, limits: check.client.limits, rejectedKey: false,
    };
  }
  const rejectedKey = check.status === "invalid";
  const subject = typeof meta["openai/subject"] === "string" ? meta["openai/subject"] as string : null;
  const oaiSession = typeof meta["openai/session"] === "string" ? meta["openai/session"] as string : null;
  const ua = (headers.get("user-agent") ?? "").toLowerCase();
  if (subject || oaiSession || ua.includes("openai-mcp")) {
    const basis = subject ?? oaiSession ?? session;
    return {
      surface, tier: "unverified_host", clientId: null, clientName: null, hostLabel: "chatgpt_app",
      sessionHash: basis ? hashSession("chatgpt_app", basis) : null, scopes: [], limits: null, rejectedKey,
    };
  }
  return { ...ANONYMOUS_CONTEXT, surface, sessionHash: session ? hashSession("anonymous", session) : null, rejectedKey };
}

function rpcResults(raw: string): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  const take = (value: unknown) => {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (!item || typeof item !== "object") continue;
      const body = item as { id?: unknown; result?: unknown };
      if (!body.result || typeof body.result !== "object") continue;
      out.set(typeof body.id === "string" || typeof body.id === "number" ? String(body.id) : "", body.result as Record<string, unknown>);
    }
  };
  const trimmed = raw.trim();
  if (!trimmed) return out;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try { take(JSON.parse(trimmed)); } catch { /* not json */ }
    return out;
  }
  for (const line of trimmed.split("\n")) {
    if (!line.startsWith("data:")) continue;
    try { take(JSON.parse(line.slice(5).trim())); } catch { /* not a json frame */ }
  }
  return out;
}

function toolPayload(result: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!result || result.isError === true) return null;
  const structured = result.structuredContent;
  if (structured && typeof structured === "object" && !Array.isArray(structured)) return structured as Record<string, unknown>;
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.find((c) => c && typeof c === "object" && (c as { type?: unknown }).type === "text") as { text?: unknown } | undefined;
  if (typeof text?.text !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(text.text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export type DealerResolver = (unitId: string) => string | null;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const dealerOf = (unit: unknown): string | null => str(((unit as { dealer?: { id?: unknown } } | null)?.dealer)?.id);

/** Count what one successful tool call showed. Reads ids only; ignores every free-text field. */
export function recordToolOutcome(ctx: AttributionContext, call: { tool: string; args: Record<string, unknown> }, payload: Record<string, unknown>, dealerFor: DealerResolver): void {
  const seen: string[] = [];
  const count = (event: Parameters<typeof recordAttributionEvent>[1], unitId: string | null, dealerId: string | null) => {
    if (unitId) seen.push(unitId);
    recordAttributionEvent(ctx, event, dealerId ?? (unitId ? dealerFor(unitId) : null));
  };
  switch (call.tool) {
    case "search_rvs":
    case "search_inventory": {
      if (payload.status !== undefined && payload.status !== "shortlist") break;
      const rows = Array.isArray(payload.results) ? payload.results : [];
      recordAttributionEvent(ctx, "search", null);
      for (const row of rows.slice(0, 50)) {
        const id = str((row as { unit_id?: unknown })?.unit_id) ?? str((row as { id?: unknown })?.id);
        if (id) count("impression", id, null);
      }
      break;
    }
    case "get_rv":
    case "get_unit": {
      const unit = payload.unit as { id?: unknown } | undefined;
      const id = str(unit?.id);
      if (id) count("detail_view", id, dealerOf(unit));
      break;
    }
    case "compare_rvs":
    case "compare_units": {
      for (const unit of (Array.isArray(payload.units) ? payload.units : []).slice(0, 6)) {
        const id = str((unit as { id?: unknown })?.id);
        if (id) count("compare", id, dealerOf(unit));
      }
      break;
    }
    case "evaluate_tow_fit": {
      for (const id of (Array.isArray(call.args.unit_ids) ? call.args.unit_ids : []).slice(0, 6)) {
        if (typeof id === "string") count("tow_check", id, null);
      }
      break;
    }
    case "prepare_dealer_inquiry":
    case "prepare_inquiry": {
      const preview = payload.preview as { unit?: { id?: unknown }; dealer?: { id?: unknown } } | undefined;
      const id = str(preview?.unit?.id);
      if (id) count("inquiry_preview", id, str(preview?.dealer?.id));
      break;
    }
    default:
      break;
  }
  touchUnits(ctx, seen);
}

function rateLimited(ctx: AttributionContext): Response {
  recordAttributionEvent(ctx, "rate_limited", null);
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "rate_limited: this API key is over its per-minute request limit. Retry after a minute." } }),
    { status: 429, headers: { "content-type": "application/json", "retry-after": "60", "cache-control": "no-store" } },
  );
}

/**
 * Run `inner` with the caller's attribution context and count the outcome.
 * Any failure in here falls back to serving the request unattributed.
 */
export async function attributeMcpFetch(
  request: Request,
  inner: (request: Request) => Promise<Response>,
  opts: { surface: AttributionSurface; dealerFor: DealerResolver },
): Promise<Response> {
  let ctx: AttributionContext = { ...ANONYMOUS_CONTEXT, surface: opts.surface };
  let peek: Peek = { meta: {}, calls: [] };
  try {
    if (request.method === "POST") peek = peekBody(await request.clone().text());
    ctx = resolveAttribution(request.headers, peek.meta, opts.surface);
  } catch {
    /* serve unattributed */
  }
  if (ctx.tier === "verified_partner" && ctx.clientId && ctx.limits && !allowClientRequest(ctx.clientId, ctx.limits.requestsPerMinute)) {
    return rateLimited(ctx);
  }
  const leadPeek = { headers: request.headers, meta: peek.meta, calls: peek.calls };
  const response = await runWithAttribution(ctx, () => runWithMcpLeadPeek(leadPeek, () => inner(request)));
  if (ctx.rejectedKey) {
    try { response.headers.set("x-matchrv-key-status", "rejected"); } catch { /* immutable headers */ }
  }
  if (peek.calls.length && response.status < 400) {
    let body: Promise<string> | null = null;
    try { body = response.clone().text(); } catch { body = null; }
    if (body) {
      void body.then((raw) => {
        const results = rpcResults(raw);
        for (const call of peek.calls) {
          const result = results.get(call.id) ?? (peek.calls.length === 1 ? [...results.values()][0] : undefined);
          const payload = toolPayload(result);
          if (payload) {
            recordToolOutcome(ctx, call, payload, opts.dealerFor);
            recordMcpToolFunnel(request.headers, peek.meta, ctx, call, payload);
          }
        }
      }).catch(() => undefined);
    }
  }
  return response;
}
