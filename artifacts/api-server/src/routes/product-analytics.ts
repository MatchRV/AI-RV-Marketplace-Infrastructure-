import { Router, type IRouter, type Request, type Response } from "express";
import { captureProductEvent } from "../services/product-analytics";

/**
 * Browser events for the product collector. The body is allowlisted again in
 * captureProductEvent. Inquiry and MCP events are not accepted here.
 * Always answers 204 so a client retry loop cannot form from a collector error.
 */
const router: IRouter = Router();
const hits = new Map<string, { n: number; at: number }>();

function allowed(key: string): boolean {
  const now = Date.now();
  const row = hits.get(key);
  if (!row || now - row.at > 60_000) {
    if (hits.size > 5_000) hits.clear();
    hits.set(key, { n: 1, at: now });
    return true;
  }
  if (row.n >= 60) return false;
  row.n += 1;
  return true;
}

router.post("/analytics/product", (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const session = typeof body.session_id === "string" ? body.session_id.slice(0, 80) : "anon";
    if (allowed(session)) captureProductEvent({ ...body, source: "website" });
  } catch {
    /* fail open */
  }
  res.status(204).end();
});

export default router;
