/**
 * Key-protected product feed for OpenAI's merchant portal ("hosted URL" delivery).
 *
 *   GET /feeds/openai-products.jsonl          JSON Lines
 *   GET /feeds/openai-products.jsonl.gz       the same, gzip file
 *   GET /feeds/openai-products.meta.json      row counts, for checking a delivery
 *
 * Every request must send `Authorization: Bearer <PRODUCT_FEED_KEY>`. The key is
 * never accepted in the path or the query string: URLs end up in request logs
 * (ours and Render's access log), headers do not.
 *
 * The feed is the whole inventory in one file, so it is off until
 * PRODUCT_FEED_KEY is set (every path answers 404), and a missing or wrong key
 * also answers 404 so the URL does not reveal that a feed exists.
 * Responses are never cached: a shared cache must not serve the file to a
 * request that did not present the key.
 */
import { timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { Router, type Request, type Response } from "express";
import type { CanonicalUnit } from "@workspace/agent-core";
import { emptyFeedStats, feedLines, feedStats } from "../lib/product-feed";
import { inventoryFreshnessRecheckEnabled, recheckForRecommend } from "../services/inventory-state-freshness";
import { getScreenedInventory } from "../services/screened-inventory";

const router = Router();

/** Keys shorter than this are refused outright: a guessable key is no key. */
const MIN_KEY_LENGTH = 24;

export function feedKeyValid(presented: unknown, configured = process.env.PRODUCT_FEED_KEY): boolean {
  const key = (configured ?? "").trim();
  if (key.length < MIN_KEY_LENGTH || typeof presented !== "string" || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The key from `Authorization: Bearer <key>`. Nothing else is read: not the path, not the query string. */
export function presentedKey(req: Pick<Request, "get">): string | undefined {
  const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(req.get("authorization") ?? "");
  return m?.[1];
}

/**
 * The units the feed publishes. With INVENTORY_STATE_FRESHNESS on, this is the
 * request-time recheck the MCP tools use, so units MCP holds back (unknown
 * dealer state, sold, left the active set, stale by the recheck's clock) are
 * held back here too. With it off, the process-start screened inventory, as before.
 */
export function feedInventory(): { units: readonly CanonicalUnit[]; snapshot?: { builtAt?: string } | null } {
  if (inventoryFreshnessRecheckEnabled()) {
    const fresh = recheckForRecommend();
    return { units: fresh.units, snapshot: fresh.snapshot };
  }
  const inv = getScreenedInventory();
  return { units: inv.units, snapshot: inv.snapshot };
}

function guard(req: Request, res: Response): boolean {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (feedKeyValid(presentedKey(req))) return true;
  res.status(404).type("text/plain").send("not found");
  return false;
}

async function sendFeed(req: Request, res: Response, gzip: boolean): Promise<void> {
  if (!guard(req, res)) return;
  const inv = feedInventory();
  const builtAt = Date.parse(inv.snapshot?.builtAt ?? "");
  if (Number.isFinite(builtAt)) res.setHeader("Last-Modified", new Date(builtAt).toUTCString());
  const source = Readable.from(feedLines(inv.units, emptyFeedStats()));
  try {
    if (gzip) {
      res.status(200).type("application/gzip");
      res.setHeader("Content-Disposition", 'attachment; filename="openai-products.jsonl.gz"');
      await pipeline(source, createGzip({ level: 6 }), res);
    } else {
      res.status(200).type("application/x-ndjson; charset=utf-8");
      await pipeline(source, res);
    }
  } catch (err) {
    // The reader hung up, or the stream failed after headers went out.
    if (!res.headersSent) res.status(503).type("text/plain").send("feed unavailable");
    else res.destroy(err instanceof Error ? err : undefined);
  }
}

function sendMeta(req: Request, res: Response): void {
  if (!guard(req, res)) return;
  const inv = feedInventory();
  res.json({
    format: "OpenAI product feed, JSON Lines",
    schema: "https://developers.openai.com/commerce/specs/file-upload/products",
    inventoryBuiltAt: inv.snapshot?.builtAt ?? null,
    inventoryRecheck: inventoryFreshnessRecheckEnabled(),
    ...feedStats(inv.units),
    note: "Price and availability are what each dealer's site showed when MatchRV last saw the unit. Rows missing a price, image, brand or title are left out, as are units the dealer has taken down or marked sold.",
  });
}

router.get("/feeds/openai-products.jsonl", (req, res) => void sendFeed(req, res, false));
router.get("/feeds/openai-products.jsonl.gz", (req, res) => void sendFeed(req, res, true));
router.get("/feeds/openai-products.meta.json", sendMeta);
// Anything else under /feeds/ (including the old /feeds/<key>/… form) is a plain 404,
// not the website's page fallback.
router.all(/^\/feeds(?:\/|$)/i, (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.status(404).type("text/plain").send("not found");
});

export default router;
