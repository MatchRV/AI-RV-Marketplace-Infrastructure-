import { Router, type IRouter, type Request, type Response } from "express";
import { ConstraintError, type CanonicalUnit, type RvType } from "@workspace/agent-core";
import { buildDeckPool, deckRadius, outboundTarget, RV_TYPES, unitDetail, withUtm, deckEligible } from "../services/swipe-deck";
import { getScreenedInventory } from "../services/screened-inventory";
import { nearestZip } from "../services/zip-centroids";
import { outboundSessionHash, outboundSummary, recordOutboundClick } from "../services/outbound-clicks";
import { captureProductEvent } from "../services/product-analytics";
import { clientFromNodeRequest } from "../services/analytics-client";
import { opsKeyValid } from "../services/dealer-inquiries";

/**
 *   POST /api/swipe/deck        { rvType?, priceMaxUsd?, zip?, lat?, lng?, radiusMiles? (5 to 3000 = nationwide) } → candidate cards (no dealer names)
 *   GET  /api/swipe/units/:id   detail view: adds the dealer name and lot
 *   GET  /api/out?unit=ID&from=&sid=&alert=1
 *                               logged 302 to the dealer's page with utm_source=matchrv&utm_medium=referral&utm_campaign=<from>
 *   GET  /api/out?dealer=ID&from=&sid=
 *                               same, to the dealer's home page (only a dealer MatchRV lists; never an arbitrary URL)
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
      }, clientFromNodeRequest(req));
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

/** Surfaces MatchRV tags clicks with (documented list; any [a-z_]{1,24} value is still accepted so older links keep working). */
export const OUT_SURFACES = ["swipe", "swipe_detail", "answer_engine", "listing_detail", "compare", "outfitter", "app", "chatgpt", "other"] as const;
const SURFACE_RE = /^[a-z_]{1,24}$/;

/** First listed website per dealer id, cached per inventory snapshot. */
const dealerSites = new WeakMap<object, Map<string, { site: string; unit: CanonicalUnit }>>();
function dealerHome(dealerId: string): { site: string; unit: CanonicalUnit } | null {
  const inv = getScreenedInventory();
  let m = dealerSites.get(inv);
  if (!m) {
    m = new Map();
    for (const u of inv.units) {
      const id = u.dealer?.id?.toLowerCase();
      if (!id || m.has(id) || !u.dealer.website) continue;
      try {
        const url = new URL(u.dealer.website);
        if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && url.hostname.includes(".")) m.set(id, { site: url.toString(), unit: u });
      } catch { /* skip */ }
    }
    dealerSites.set(inv, m);
  }
  return m.get(dealerId.toLowerCase()) ?? null;
}

router.get("/out", (req: Request, res: Response) => {
  noindex(res);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "origin");
  const id = typeof req.query.unit === "string" ? req.query.unit : "";
  const dealerParam = typeof req.query.dealer === "string" && /^[A-Za-z0-9._:-]{1,120}$/.test(req.query.dealer) ? req.query.dealer : "";
  const from = typeof req.query.from === "string" && SURFACE_RE.test(req.query.from) ? req.query.from : "swipe";
  const session = outboundSessionHash(typeof req.query.sid === "string" ? req.query.sid : null);
  const alert = req.query.alert === "1";
  const u = id ? getScreenedInventory().byId.get(id) : undefined;
  // A unit goes out only while MatchRV lists it as available (the deck rule for the swipe deck, as before).
  const unitOk = u && (from === "swipe" ? deckEligible(u) : u.status === "available");
  const unitTarget = u && unitOk ? outboundTarget(u) : null;
  const home = !id && dealerParam ? dealerHome(dealerParam) : null;
  const target = unitTarget ?? home?.site ?? null;
  if (!target) {
    res.redirect(302, from === "swipe" || !u ? "/swipe" : `/listing/${encodeURIComponent(u.id)}`);
    return;
  }
  const dealer = (u && unitTarget ? u : home!.unit).dealer;
  const dest = withUtm(target, from === "swipe" ? "swipe_deck" : from);
  recordOutboundClick({
    unitId: u && unitTarget ? u.id : "", dealerId: dealer.id, dealerName: dealer.name, host: new URL(dest).hostname, from,
    ...(session ? { session } : {}), ...(alert ? { alert: true as const } : {}),
    ...(dealer.state ? { dealerState: String(dealer.state).slice(0, 40) } : {}),
  });
  try {
    captureProductEvent({
      event: "website_dealer_click",
      source: "website",
      surface: from === "swipe" ? "swipe" : "outbound",
      ...(u && unitTarget ? { listing_id: u.id } : {}),
      dealer_id: dealer.id,
    }, clientFromNodeRequest(req));
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
