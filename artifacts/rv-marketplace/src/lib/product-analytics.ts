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
  const bare = value.split("#")[0]?.split("?")[0] ?? "";
  let path = bare;
  try { path = decodeURIComponent(bare); } catch { return undefined; }
  if (!path.startsWith("/") || path.includes("..") || path.includes("@")) return undefined;
  if (/^\/listing\//.test(path)) return "/listing";
  if (/https?:\/\//i.test(path) || /vin:/i.test(path)) return undefined;
  if (!/^\/[A-Za-z0-9/_.~-]{0,160}$/.test(path)) return undefined;
  return path;
}

function prepareListing(value: unknown): "missing" | "reject" | { raw: string; mode: "passthrough" | "hash" } {
  if (value == null || value === "") return "missing";
  const text = String(value).trim();
  if (text.length < 1 || text.length > 300) return "reject";
  if (/[\s@?#]|[^\u0020-\u007e]|\.\./.test(text)) return "reject";
  if (/^lst_[0-9a-f]{24}$/.test(text)) return { raw: text, mode: "passthrough" };
  const accepted = /^[0-9]{1,12}$/.test(text)
    || (text.startsWith("vin:") && /^vin:[A-HJ-NPR-Z0-9]{11,17}$/i.test(text))
    || (text.startsWith("stk:") && /^stk:[A-Za-z0-9._:-]{1,160}$/.test(text) && !text.includes("://") && !text.includes("/"))
    || (text.startsWith("key:u:") && text.length <= 300 && /^key:u:[^\s]{1,240}$/.test(text));
  return accepted ? { raw: text, mode: "hash" } : "reject";
}

function dealerId(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const text = String(value).trim().toLowerCase();
  if (text.includes("://") || text.includes("@") || text.includes("?") || text.includes("#") || text.includes("/") || text.startsWith("vin:")) return undefined;
  if (/^[a-z0-9][a-z0-9.-]{0,79}$/.test(text)) return text;
  if (/^[a-z0-9][a-z0-9.-]{0,79}:[a-z0-9-]{1,60}$/.test(text)) return text;
  return undefined;
}

async function opaqueListing(prepared: { raw: string; mode: "passthrough" | "hash" }): Promise<string> {
  if (prepared.mode === "passthrough") return prepared.raw;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(prepared.raw));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `lst_${hex.slice(0, 24)}`;
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
    const listing = prepareListing(event.listingId);
    const needsListing = event.event === "website_listing_view" || event.event === "website_card_viewed" || event.event === "website_inventory_attention";
    if (needsListing && (listing === "missing" || listing === "reject")) return false;
    if (!needsListing && listing === "reject") return false;
    const dealer = dealerId(event.dealerId);
    const body: Record<string, unknown> = { event: event.event, source: "website" };
    if (path) body.path = path;
    if (dealer) body.dealer_id = dealer;
    if (event.surface && SURFACES.has(event.surface)) body.surface = event.surface;
    if (event.rvType && RV_TYPES.has(event.rvType)) body.rv_type = event.rvType;
    if (event.action && ACTIONS.has(event.action)) body.action = event.action;
    if (Number.isInteger(event.resultCount) && (event.resultCount as number) >= 0 && (event.resultCount as number) <= 100_000) body.result_count = event.resultCount;
    if (Number.isInteger(event.matchedCount) && (event.matchedCount as number) >= 0 && (event.matchedCount as number) <= 100_000) body.matched_count = event.matchedCount;
    const sid = sessionId(event.sessionId);
    if (sid) body.session_id = sid;
    const dedupe = [event.event, path ?? "", listing === "missing" || listing === "reject" ? "" : listing.raw, body.surface ?? "", body.action ?? "", body.rv_type ?? ""].join("|");
    if (!claim(dedupe)) return false;
    const base = import.meta.env.BASE_URL || "/";
    const url = `${base.endsWith("/") ? base : `${base}/`}api/analytics/product`;
    void (async () => {
      if (listing !== "missing" && listing !== "reject") body.listing_id = await opaqueListing(listing);
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      });
    })().catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}
