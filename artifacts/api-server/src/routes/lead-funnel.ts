import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { buildLeadRequestContext, classifyTraffic, cleanUnitId, normalizeSurface, resolveSource, type LeadSurface } from "../services/lead-attribution";
import { recordFunnelStep, sessionKeyFor, type FunnelStep } from "../services/lead-funnel";
import { leadTrackingEnabled } from "../services/lead-tracking-config";

/**
 * POST /api/funnel/events — shopper funnel steps from apps and the website.
 *
 *   { "events": [{ "type": "view", "surface": "swipe", "unit_id": "vin:..." }, ...],
 *     "attribution": { "session_id": "...", "utm_source": "...", ... } }
 *
 * Plus the X-MatchRV-* headers (docs/lead-tracking/ATTRIBUTION_CONTRACT.md).
 * 404 while LEAD_TRACKING_ENABLED is off (the route does not exist today).
 * Body limit 8 KB (set in app.ts), at most 25 events, 60 requests a minute per
 * client address and 3,000 a minute overall. "inquiry" is not accepted here:
 * leads are only ever counted by the server when an inquiry is actually sent.
 * Bot traffic gets the same 202 and is only counted as excluded.
 */
const router: IRouter = Router();

const CLIENT_STEPS = ["impression", "view", "swipe", "favorite", "search", "compare", "inquiry_start"] as const;
const bodySchema = z.object({
  events: z.array(z.object({
    type: z.enum(CLIENT_STEPS),
    surface: z.string().max(40).optional(),
    unit_id: z.string().max(120).optional(),
    count: z.number().int().min(1).max(100).optional(),
  })).min(1).max(25),
  attribution: z.unknown().optional(),
});

const hits = new Map<string, { n: number; at: number }>();
let globalAt = 0;
let globalN = 0;
export function funnelRateAllowed(key: string, now = Date.now()): boolean {
  if (now - globalAt > 60_000) { globalAt = now; globalN = 0; }
  if (globalN >= 3_000) return false;
  const row = hits.get(key);
  if (!row || now - row.at > 60_000) {
    if (hits.size > 10_000) hits.clear();
    hits.set(key, { n: 1, at: now });
    globalN += 1;
    return true;
  }
  if (row.n >= 60) return false;
  row.n += 1;
  globalN += 1;
  return true;
}
export function __resetFunnelRateLimit(): void { hits.clear(); globalAt = 0; globalN = 0; }

router.post("/funnel/events", (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  if (!leadTrackingEnabled()) { res.status(404).json({ error: "not_found" }); return; }
  if (!funnelRateAllowed(`ip:${req.ip ?? "unknown"}`)) { res.setHeader("Retry-After", "60"); res.status(429).json({ error: "rate_limited" }); return; }
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_events" }); return; }
  const ctx = buildLeadRequestContext({ channel: "http", entryPoint: "website_inquiry_api", headers: (n) => req.get(n), attribution: parsed.data.attribution });
  const { traffic, classification } = classifyTraffic(ctx.userAgent, ctx.attribution, "http");
  const { source } = resolveSource({ channel: "http", attr: ctx.attribution, agent: null, classification });
  const sessionKey = sessionKeyFor(ctx);
  let accepted = 0;
  for (const e of parsed.data.events) {
    recordFunnelStep({
      step: e.type, source, surface: normalizeSurface(e.surface) ?? ctx.attribution.surface ?? "other", traffic,
      botCategory: classification.is_bot ? classification.bot_category : undefined, sessionKey, unitId: cleanUnitId(e.unit_id), count: e.count,
    });
    if (traffic !== "bot") accepted += 1;
  }
  res.status(202).json({ accepted });
});

/** Website beacon events (POST /api/analytics/product) as funnel steps. Same bot rules. */
const WEB_SURFACE: Record<string, LeadSurface> = {
  listing_detail: "unit_detail", category_listings: "grid", discover: "grid", swipe: "swipe", swipe_detail: "swipe",
};
export function recordWebsiteBeaconFunnel(req: Request, body: Record<string, unknown>): void {
  try {
    if (!leadTrackingEnabled()) return;
    let step: FunnelStep | null = null;
    switch (body.event) {
      case "website_card_viewed": step = "impression"; break;
      case "website_listing_view": step = "view"; break;
      case "website_search_results": step = "search"; break;
      case "website_inventory_attention":
        step = body.action === "like" || body.action === "save" ? "favorite" : body.action === "detail_open" ? "view" : null;
        break;
      default: step = null;
    }
    if (!step) return;
    const ctx = buildLeadRequestContext({
      channel: "http", entryPoint: "website_inquiry_api", headers: (n) => req.get(n),
      attribution: { client: "website", session_id: typeof body.session_id === "string" ? body.session_id : undefined },
    });
    const { traffic, classification } = classifyTraffic(ctx.userAgent, ctx.attribution, "http");
    const surface = (typeof body.surface === "string" && WEB_SURFACE[body.surface]) || (body.action === "like" ? "swipe" : "other");
    recordFunnelStep({
      step, source: "website", surface, traffic, botCategory: classification.is_bot ? classification.bot_category : undefined,
      sessionKey: sessionKeyFor(ctx), unitId: cleanUnitId(body.listing_id),
      // These events already reach PostHog as website_* events; do not send them twice.
      forward: false,
    });
  } catch {
    /* fail open */
  }
}

export default router;
