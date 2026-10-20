import { Router, type IRouter, type Request, type Response } from "express";
import { getInventory } from "../services/agent-inventory";
import {
  getInquiryStatus, opsGet, opsKeyValid, opsList, opsUpdate, prepareInquiry, rateLimit, sendInquiry,
} from "../services/dealer-inquiries";

/**
 * Dealer inquiry HTTP API (same service the MCP tools use).
 *
 *   POST /api/inquiries                 step 1 (no confirmation_token): preview + token, sends nothing
 *                                       step 2 ({confirmation_token, confirmed:true}): records + delivers
 *   GET  /api/inquiries/:id             status; requires the inquiry's status token
 *                                       (X-Inquiry-Token header or ?token=)
 *   GET  /api/inquiries/ops             ops list        (Authorization: Bearer INQUIRY_OPS_KEY)
 *   GET  /api/inquiries/ops/:id         ops detail
 *   POST /api/inquiries/ops/:id         ops update: { status?, statusDetail?, dealerReply? }
 */
const router: IRouter = Router();
const requester = (req: Request) => `ip:${req.ip ?? "unknown"}`;

router.post("/inquiries", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.confirmation_token === "string") {
    const result = await sendInquiry({
      confirmationToken: body.confirmation_token,
      confirmed: body.confirmed === true,
      dryRun: body.dry_run === true,
      requesterKey: requester(req),
      scope: null,
      lookupUnit: (id) => getInventory().byId.get(id),
    });
    if (!result.ok) {
      res.status(result.code === "rate_limited" ? 429 : result.code === "not_confirmed" ? 400 : result.code === "unit_unavailable" ? 404 : 400).json({ error: result.code, guidance: result.guidance });
      return;
    }
    res.status(result.duplicate ? 200 : 201).json({ inquiry: result.inquiry, statusToken: result.duplicate ? null : result.statusToken, duplicate: result.duplicate, statusUrl: `/api/inquiries/${result.inquiry.inquiryId}` });
    return;
  }
  if (!rateLimit("preview", requester(req))) { res.status(429).json({ error: "rate_limited" }); return; }
  const unit = typeof body.unit_id === "string" ? getInventory().byId.get(body.unit_id) : undefined;
  if (!unit) { res.status(404).json({ error: "unit_not_found" }); return; }
  const prepared = prepareInquiry(unit, {
    name: typeof body.name === "string" ? body.name : undefined,
    email: typeof body.email === "string" ? body.email : null,
    phone: typeof body.phone === "string" ? body.phone : null,
    message: typeof body.message === "string" ? body.message : undefined,
  });
  if (!prepared.ok) { res.status(400).json({ error: "invalid_contact", errors: prepared.errors }); return; }
  res.json({ preview: prepared.preview, confirmationToken: prepared.confirmationToken, expiresAt: prepared.expiresAt, next: "Nothing has been sent. POST again with { confirmation_token, confirmed: true } only after the shopper approves this exact preview." });
});

function requireOps(req: Request, res: Response): boolean {
  if (!process.env.INQUIRY_OPS_KEY) { res.status(503).json({ error: "ops_not_configured" }); return false; }
  if (!opsKeyValid(req.get("authorization"))) { res.status(401).json({ error: "unauthorized" }); return false; }
  return true;
}
router.get("/inquiries/ops", (req: Request, res: Response) => { if (requireOps(req, res)) res.json({ inquiries: opsList() }); });
router.get("/inquiries/ops/:id", (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  const i = opsGet(String(req.params.id));
  if (!i) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ inquiry: i });
});
router.post("/inquiries/ops/:id", (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const status = b.status === "delivered" || b.status === "queued_for_matchrv" || b.status === "failed" ? b.status : undefined;
  const i = opsUpdate(String(req.params.id), { status, statusDetail: typeof b.statusDetail === "string" ? b.statusDetail : undefined, dealerReply: typeof b.dealerReply === "string" ? b.dealerReply : undefined });
  if (!i) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ inquiry: i });
});

router.get("/inquiries/:id", (req: Request, res: Response) => {
  const token = req.get("x-inquiry-token") ?? (typeof req.query.token === "string" ? req.query.token : "");
  const inquiry = getInquiryStatus(String(req.params.id), token);
  if (!inquiry) { res.status(404).json({ error: "not_found", guidance: "Unknown inquiry id or wrong status token." }); return; }
  res.setHeader("Cache-Control", "no-store");
  res.json({ inquiry });
});

export default router;
