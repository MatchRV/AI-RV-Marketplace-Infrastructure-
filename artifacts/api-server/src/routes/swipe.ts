import { Router, type IRouter, type Request, type Response } from "express";
import { ConstraintError, type RvType } from "@workspace/agent-core";
import { buildDeckPool, deckRadius, outboundTarget, RV_TYPES, unitDetail, withUtm, deckEligible } from "../services/swipe-deck";
import { getScreenedInventory } from "../services/screened-inventory";
import { nearestZip } from "../services/zip-centroids";
import { outboundSummary, recordOutboundClick } from "../services/outbound-clicks";
import { captureProductEvent } from "../services/product-analytics";
import { opsKeyValid } from "../services/dealer-inquiries";

/**
 *   POST /api/swipe/deck        { rvType?, priceMaxUsd?, zip?, lat?, lng?, radiusMiles? (5 to 3000 = nationwide) } → candidate cards (no dealer names)
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
  const money = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 1000 && v <= 2_000_000 ? v : undefined;
  const feet = (v: unknown) => typeof v === "number" && v >= 8 && v <= 60 ? v : undefined;
  const priceMin = money(b.priceMinUsd);
  const priceMax = money(b.priceMaxUsd);
  if (priceMin != null && priceMax != null && priceMin > priceMax) {
    res.status(422).json({ error: "price_range", guidance: "The lowest price is higher than the highest price." });
    return;
  }
  const lengthMin = feet(b.lengthMinFt);
  const lengthMax = feet(b.lengthMaxFt);
  if (lengthMin != null && lengthMax != null && lengthMin > lengthMax) {
    res.status(422).json({ error: "length_range", guidance: "The shortest length is longer than the longest length." });
    return;
  }
  let place = typeof b.zip === "string" && /^\d{5}$/.test(b.zip.trim()) ? b.zip.trim() : undefined;
  if (!place && typeof b.place === "string") {
    const raw = b.place.trim();
    if (raw.length >= 2 && raw.length <= 80 && /^[A-Za-z0-9 .,'-]+$/.test(raw)) place = raw;
  }
  if (!place && typeof b.lat === "number" && typeof b.lng === "number") {
    place = nearestZip(b.lat, b.lng) ?? undefined;
    if (!place) { res.status(422).json({ error: "location_outside_coverage", guidance: "Enter a US city or ZIP instead." }); return; }
  }
  if (!place) { res.status(422).json({ error: "location_required", guidance: "Enter a city or ZIP, or choose Near me." }); return; }
  try {
    const radius = deckRadius(b.radiusMiles);
    const sleeps = typeof b.sleepsMin === "number" && Number.isInteger(b.sleepsMin) && b.sleepsMin >= 1 && b.sleepsMin <= 12 ? b.sleepsMin : undefined;
    const exclude = new Set(Array.isArray(b.excludeIds) ? b.excludeIds.filter((x): x is string => typeof x === "string").slice(0, 100) : []);
    const pool = await buildDeckPool({
      rvTypes: rvType ? [rvType] : undefined,
      priceMinUsd: priceMin, priceMaxUsd: priceMax, lengthMinFt: lengthMin, lengthMaxFt: lengthMax,
      place, radiusMiles: radius, sleepsMin: sleeps,
    }, { exclude });
    res.setHeader("Cache-Control", "no-store");
    res.json({ cards: pool.cards, zip: pool.appliedConstraints.location?.place ?? null, radiusMiles: pool.appliedConstraints.location?.radiusMiles ?? null, matched: pool.stats.matched });
    try {
      captureProductEvent({
        event: "website_search_results",
        source: "website",
        surface: "swipe",
        ...(rvType ? { rv_type: rvType } : {}),
        result_count: pool.cards.length,
        matched_count: pool.stats.matched,
      });
    } catch {
      /* analytics must not change the deck response */
    }
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
  try {
    captureProductEvent({
      event: "website_dealer_click",
      source: "website",
      surface: from === "swipe" ? "swipe" : "outbound",
      listing_id: u.id,
      dealer_id: u.dealer.id,
    });
  } catch {
    /* analytics must not block the redirect */
  }
  res.redirect(302, dest);
});

router.get("/out/ops", (req: Request, res: Response) => {
  if (!process.env.INQUIRY_OPS_KEY) { res.status(503).json({ error: "ops_not_configured" }); return; }
  if (!opsKeyValid(req.get("authorization"))) { res.status(401).json({ error: "unauthorized" }); return; }
  res.json(outboundSummary());
});

export default router;
