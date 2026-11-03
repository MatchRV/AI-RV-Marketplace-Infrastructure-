import { Router, type IRouter, type Request, type Response } from "express";
import { ConstraintError, type RvType } from "@workspace/agent-core";
import { buildDeckPool, outboundTarget, RV_TYPES, unitDetail, withUtm, deckEligible } from "../services/swipe-deck";
import { getScreenedInventory } from "../services/screened-inventory";
import { nearestZip } from "../services/zip-centroids";
import { outboundSummary, recordOutboundClick } from "../services/outbound-clicks";
import { opsKeyValid } from "../services/dealer-inquiries";

/**
 *   POST /api/swipe/deck        { rvType?, priceMaxUsd?, zip?, lat?, lng? } → candidate cards (no dealer names)
 *   GET  /api/swipe/units/:id   detail view: adds the dealer name and lot
 *   GET  /api/out?unit=ID&from= logged 302 to the dealer's page with utm_source=matchrv
 *   GET  /api/out/ops           click counts (Authorization: Bearer INQUIRY_OPS_KEY)
 */
const router: IRouter = Router();
const noindex = (res: Response) => res.setHeader("X-Robots-Tag", "noindex, nofollow");

router.post("/swipe/deck", async (req: Request, res: Response) => {
  noindex(res);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const rvType = typeof b.rvType === "string" && (RV_TYPES as string[]).includes(b.rvType) ? (b.rvType as RvType) : undefined;
  const price = typeof b.priceMaxUsd === "number" && b.priceMaxUsd > 0 && b.priceMaxUsd < 5_000_000 ? Math.round(b.priceMaxUsd) : undefined;
  let zip = typeof b.zip === "string" && /^\d{5}$/.test(b.zip.trim()) ? b.zip.trim() : undefined;
  if (!zip && typeof b.lat === "number" && typeof b.lng === "number") {
    zip = nearestZip(b.lat, b.lng) ?? undefined;
    if (!zip) { res.status(422).json({ error: "location_outside_coverage", guidance: "Enter a US ZIP code instead." }); return; }
  }
  try {
    const pool = await buildDeckPool({ rvTypes: rvType ? [rvType] : undefined, priceMaxUsd: price, zip });
    res.setHeader("Cache-Control", "no-store");
    res.json({ cards: pool.cards, zip: pool.appliedConstraints.location?.place ?? null, radiusMiles: pool.appliedConstraints.location?.radiusMiles ?? null, matched: pool.stats.matched });
  } catch (err) {
    if (err instanceof ConstraintError) { res.status(422).json({ error: "unknown_location", guidance: "That ZIP code isn't in our table. Try a nearby ZIP." }); return; }
    console.error("[swipe] deck failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/swipe/units/:id", (req: Request, res: Response) => {
  noindex(res);
  const d = unitDetail(String(req.params.id));
  if (!d) { res.status(404).json({ error: "unit_not_found" }); return; }
  res.json(d);
});

router.get("/out", (req: Request, res: Response) => {
  noindex(res);
  res.setHeader("Cache-Control", "no-store");
  const id = typeof req.query.unit === "string" ? req.query.unit : "";
  const from = typeof req.query.from === "string" && /^[a-z_]{1,24}$/.test(req.query.from) ? req.query.from : "swipe";
  const u = id ? getScreenedInventory().byId.get(id) : undefined;
  const target = u && deckEligible(u) ? outboundTarget(u) : null;
  if (!u || !target) { res.redirect(302, "/swipe"); return; }
  const dest = withUtm(target, from === "swipe" ? "swipe_deck" : from);
  recordOutboundClick({ unitId: u.id, dealerId: u.dealer.id, dealerName: u.dealer.name, host: new URL(dest).hostname, from });
  res.redirect(302, dest);
});

router.get("/out/ops", (req: Request, res: Response) => {
  if (!process.env.INQUIRY_OPS_KEY) { res.status(503).json({ error: "ops_not_configured" }); return; }
  if (!opsKeyValid(req.get("authorization"))) { res.status(401).json({ error: "unauthorized" }); return; }
  res.json(outboundSummary());
});

export default router;
