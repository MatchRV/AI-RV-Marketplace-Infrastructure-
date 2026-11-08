import { getAnalyticsSessionId } from "@/lib/analytics";

/**
 * Allowlisted website events for the server collector at POST /api/analytics/product.
 * The server drops anything else. This helper also drops repeats of the same
 * action inside a short window so a rerender or retry is not a second event.
 * Fetch failures are ignored.
 */

const WINDOW_MS = 2_000;
const recent = new Map<string, number>();

const EVENTS = new Set([
  "website_page_view",
  "website_listing_view",
  "website_card_viewed",
  "website_inventory_attention",
  "website_search_results",
]);

const RV_TYPES = new Set([
  "travel_trailer", "fifth_wheel", "toy_hauler", "class_a", "class_b", "class_c", "popup_camper", "truck_camper",
]);

const SURFACES = new Set([
  "listing_detail", "category_listings", "discover", "swipe", "swipe_detail",
]);

const ACTIONS = new Set(["like", "detail_open", "save"]);

export interface WebsiteProductEvent {
  event: "website_page_view" | "website_listing_view" | "website_card_viewed" | "website_inventory_attention" | "website_search_results";
  path?: string;
  listingId?: string;
  dealerId?: string;
  surface?: string;
  rvType?: string;
  action?: "like" | "detail_open" | "save";
  resultCount?: number;
  matchedCount?: number;
  sessionId?: string;
}

function cleanPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const path = value.split("#")[0]?.split("?")[0] ?? "";
  if (!/^\/[A-Za-z0-9/_:%.~-]{0,200}$/.test(path) || path.includes("..")) return undefined;
  return path;
}

function cleanId(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value);
  if (!/^[A-Za-z0-9:._/-]{1,200}$/.test(text) || text.includes("..") || text.includes("@") || text.includes("?") || text.includes("#")) return undefined;
  return text;
}

function cleanSession(value: string | undefined): string | undefined {
  if (!value || !/^[A-Za-z0-9_-]{8,80}$/.test(value)) return undefined;
  return value;
}

function sessionId(explicit?: string): string | undefined {
  const given = cleanSession(explicit);
  if (given) return given;
  try {
    return cleanSession(getAnalyticsSessionId());
  } catch {
    return undefined;
  }
}

function claim(key: string): boolean {
  const now = Date.now();
  const prev = recent.get(key);
  if (prev !== undefined && now - prev < WINDOW_MS) return false;
  recent.set(key, now);
  if (recent.size > 500) {
    for (const [id, at] of recent) {
      if (now - at > WINDOW_MS) recent.delete(id);
    }
  }
  return true;
}

export function trackWebsiteProductEvent(event: WebsiteProductEvent): boolean {
  try {
    if (!EVENTS.has(event.event)) return false;
    const path = cleanPath(event.path);
    if (event.event === "website_page_view" && !path) return false;
    const listingId = cleanId(event.listingId);
    const dealerId = cleanId(event.dealerId);
    if ((event.event === "website_listing_view" || event.event === "website_card_viewed" || event.event === "website_inventory_attention") && !listingId) return false;
    const body: Record<string, unknown> = { event: event.event, source: "website" };
    if (path) body.path = path;
    if (listingId) body.listing_id = listingId;
    if (dealerId) body.dealer_id = dealerId;
    if (event.surface && SURFACES.has(event.surface)) body.surface = event.surface;
    if (event.rvType && RV_TYPES.has(event.rvType)) body.rv_type = event.rvType;
    if (event.action && ACTIONS.has(event.action)) body.action = event.action;
    if (Number.isInteger(event.resultCount) && (event.resultCount as number) >= 0 && (event.resultCount as number) <= 100_000) body.result_count = event.resultCount;
    if (Number.isInteger(event.matchedCount) && (event.matchedCount as number) >= 0 && (event.matchedCount as number) <= 100_000) body.matched_count = event.matchedCount;
    const sid = sessionId(event.sessionId);
    if (sid) body.session_id = sid;
    const dedupe = [event.event, path ?? "", listingId ?? "", body.surface ?? "", body.action ?? "", body.rv_type ?? ""].join("|");
    if (!claim(dedupe)) return false;
    const base = import.meta.env.BASE_URL || "/";
    const url = `${base.endsWith("/") ? base : `${base}/`}api/analytics/product`;
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}
