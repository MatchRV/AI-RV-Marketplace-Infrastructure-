/**
 * Lead tracking for the MCP endpoints (/mcp and /mcp/v1).
 *
 * The published tool input schemas are NOT changed (the /mcp inquiry tools are
 * pinned to the reviewed v2.2.6 fixture). Clients may still send an optional
 * `attribution` object as an extra tool argument, or as
 * params._meta["matchrv/attribution"], or as X-MatchRV-* headers. The MCP SDK
 * strips unknown arguments before a tool handler runs, so the attribution
 * wrapper keeps the raw arguments of this request here, read-only.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { AttributionContext } from "./attribution";
import { buildLeadRequestContext, classifyTraffic, cleanUnitId, resolveSource, type EntryPoint, type LeadRequestContext, type LeadSurface } from "./lead-attribution";
import { recordFunnelStep, sessionKeyFor, type FunnelStep } from "./lead-funnel";
import { leadTrackingEnabled } from "./lead-tracking-config";

export interface McpLeadPeek {
  headers: Headers;
  meta: Record<string, unknown>;
  calls: Array<{ tool: string; args: Record<string, unknown> }>;
}

const store = new AsyncLocalStorage<McpLeadPeek>();

export function runWithMcpLeadPeek<T>(peek: McpLeadPeek, fn: () => T): T {
  return store.run(peek, fn);
}

function rawAttribution(peek: McpLeadPeek, tools: readonly string[]): unknown {
  const call = peek.calls.find((c) => tools.includes(c.tool));
  const fromArgs = call?.args.attribution;
  if (fromArgs && typeof fromArgs === "object") return fromArgs;
  const fromMeta = peek.meta["matchrv/attribution"];
  return fromMeta && typeof fromMeta === "object" ? fromMeta : undefined;
}

/** Lead context for the tool call now running, or null outside an MCP request or when tracking is off. */
export function mcpLeadContext(tools: readonly string[], entryPoint: EntryPoint, agent: AttributionContext | null): LeadRequestContext | null {
  try {
    if (!leadTrackingEnabled()) return null;
    const peek = store.getStore();
    if (!peek) return buildLeadRequestContext({ channel: "mcp", entryPoint, headers: () => null, agent });
    return buildLeadRequestContext({ channel: "mcp", entryPoint, headers: (n) => peek.headers.get(n), attribution: rawAttribution(peek, tools), agent });
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Funnel steps implied by one successful MCP tool result. Ids only; free text is never read. */
export function recordMcpToolFunnel(headers: Headers, meta: Record<string, unknown>, agent: AttributionContext, call: { tool: string; args: Record<string, unknown> }, payload: Record<string, unknown>): void {
  try {
    if (!leadTrackingEnabled()) return;
    const ctx = buildLeadRequestContext({
      channel: "mcp", entryPoint: "mcp_send_dealer_inquiry", headers: (n) => headers.get(n), agent,
      attribution: call.args.attribution && typeof call.args.attribution === "object" ? call.args.attribution : meta["matchrv/attribution"],
    });
    const { traffic, classification } = classifyTraffic(ctx.userAgent, ctx.attribution, "mcp");
    const { source } = resolveSource({ channel: "mcp", attr: ctx.attribution, agent, classification });
    const sessionKey = sessionKeyFor(ctx);
    const botCategory = classification.is_bot ? classification.bot_category : undefined;
    const step = (s: FunnelStep, surface: LeadSurface, unitId: string | null, count = 1, forward = true) =>
      recordFunnelStep({ step: s, source, surface: ctx.attribution.surface ?? surface, traffic, botCategory, sessionKey, unitId, count, forward });
    switch (call.tool) {
      case "search_rvs":
      case "search_inventory": {
        if (payload.status !== undefined && payload.status !== "shortlist") break;
        const rows = (Array.isArray(payload.results) ? payload.results : []).slice(0, 50);
        step("search", "ask_ai", null);
        if (rows.length) step("impression", "ask_ai", null, rows.length, false);
        break;
      }
      case "get_rv":
      case "get_unit": {
        const id = cleanUnitId(str((payload.unit as { id?: unknown } | undefined)?.id));
        if (id) step("view", "ask_ai", id);
        break;
      }
      case "compare_rvs":
      case "compare_units":
        step("compare", "compare", null);
        break;
      case "prepare_dealer_inquiry":
      case "prepare_inquiry": {
        const id = cleanUnitId(str((payload.preview as { unit?: { id?: unknown } } | undefined)?.unit?.id));
        if (id) step("inquiry_start", "ask_ai", id);
        break;
      }
      default:
        break;
    }
  } catch {
    /* fail open */
  }
}
