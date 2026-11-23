/**
 * Leaving MatchRV for a dealer's own site.
 *
 * Every link to a dealer site goes through MatchRV's tagged redirect (/api/out). The server logs the time, the
 * RV or dealer, the MatchRV surface and a one-way hash of this tab's analytics session id, then sends the shopper
 * on with utm_source=matchrv&utm_medium=referral&utm_campaign=<surface>. That log is MatchRV's evidence when a
 * dealer later says "that lead came in on our own site" (docs/lead-tracking/LEAD_CREDIT_POLICY.md).
 *
 * Before the first jump in a tab, the shopper is offered an optional price-drop alert on that RV. It is
 * skippable and never blocks the link.
 */
import { getAnalyticsSessionId, trackLead } from "@/lib/analytics";
import { buildLeadBuyerProfile } from "@/lib/buyer-intent";

const BASE = import.meta.env.BASE_URL || "/";
const SEEN_KEY = "matchrv_before_you_go_seen";

export type HandoffSurface = "swipe" | "swipe_detail" | "answer_engine" | "listing_detail" | "compare" | "outfitter";

function sessionId(): string | null {
  try { return getAnalyticsSessionId(); } catch { return null; }
}

/** The tagged /api/out link for one RV (unitId) or, failing that, one dealer's home page (dealerId). */
export function dealerOutHref(target: { unitId?: string | null; dealerId?: string | null }, surface: HandoffSurface, opts: { alertSaved?: boolean; base?: string } = {}): string {
  const p = new URLSearchParams();
  if (target.unitId) p.set("unit", target.unitId);
  else if (target.dealerId) p.set("dealer", target.dealerId);
  p.set("from", surface);
  const sid = sessionId();
  if (sid) p.set("sid", sid);
  if (opts.alertSaved) p.set("alert", "1");
  return `${opts.base ?? BASE}api/out?${p.toString()}`;
}

/** Whether to show the "before you go" step: once per tab, never again after it is answered or skipped. */
export function shouldOfferBeforeYouGo(): boolean {
  try { return sessionStorage.getItem(SEEN_KEY) !== "1"; } catch { return false; }
}
export function markBeforeYouGoSeen(): void {
  try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode: the step just shows again */ }
}

export const looksLikeEmail = (v: string) => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/**
 * Save a price-drop alert on this RV (existing /api/price-alerts). Resolves true only when the server stored it.
 * keepalive lets it finish even though the dealer page opens at the same moment.
 */
export async function savePriceAlertBeforeLeaving(input: { email: string; unitId: string; priceUsd?: number | null; surface: HandoffSurface }): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}api/price-alerts`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email.trim(),
        listingId: input.unitId,
        placement: "before_dealer_site",
        sessionId: sessionId() ?? undefined,
        buyerProfile: buildLeadBuyerProfile({}, { leadSource: "price_alert_email", placement: "before_dealer_site", surface: input.surface }),
      }),
    });
    if (!res.ok) return false;
  } catch {
    return false;
  }
  trackLead("price_alert", {
    formId: "before_dealer_site_price_alert",
    dedupeKey: input.unitId,
    listingId: input.unitId,
    source: input.surface,
    surface: "price_drop",
    placement: "before_dealer_site",
    value: input.priceUsd ?? null,
  });
  return true;
}
