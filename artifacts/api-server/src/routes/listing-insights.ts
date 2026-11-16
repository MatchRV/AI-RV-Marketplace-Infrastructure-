import { Router, type IRouter, type Request, type Response } from "express";
import { getInventory } from "../services/agent-inventory";
import { decideListingRequest } from "../lib/listing-public-id";
import { buildUnitInsights } from "../lib/unit-insights";

/**
 * GET /api/listing-insights/:id — what the unit page adds over the dealer's
 * listing (price context, tow check, specs with sources, similar units,
 * hub link, SEO title). Read-only, served from the inventory snapshot, so it
 * works on database-free deployments too. The React listing page renders the
 * same sections the server puts in the HTML for crawlers.
 */
const router: IRouter = Router();

router.get(/^\/listing-insights\/(.+)$/, (req: Request, res: Response) => {
  let requested = String((req.params as Record<string, string>)[0] ?? "");
  try {
    requested = decodeURIComponent(requested);
  } catch {
    /* keep raw */
  }
  try {
    const { unitId } = decideListingRequest(requested);
    const unit = unitId ? getInventory().byId.get(unitId) : undefined;
    if (!unit) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=900");
    res.json(buildUnitInsights(unit));
  } catch (err) {
    console.error("[listing-insights] failed:", err);
    res.status(503).json({ error: "unavailable" });
  }
});

export default router;
