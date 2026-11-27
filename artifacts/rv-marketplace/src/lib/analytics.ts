import { siteSurface } from "@/lib/site-host";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const SESSION_KEY = "orv_session_id";
const GA_ID = "G-Y2C0PN44L2";

function getSessionId(): string {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

export function getAnalyticsSessionId(): string {
  return getSessionId();
}

/** Keys that must never go to GA (or the first-party event mirror). */
const PII_KEY = /email|phone|e-?mail|sms|message|^body$|^(full_?)?name$|^(contact_?)?(name|email|phone)$|first_?name|last_?name|guest(name|email|phone)|alertemail|user_email/i;
const PII_KEY_ALLOW = new Set([
  "dealer_name", "dealername", "form_name", "form_id", "lead_type",
  "item_name", "page_title", "event_name", "listing_type",
]);
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isGaPiiKey(key: string): boolean {
  const k = key.toLowerCase();
  if (PII_KEY_ALLOW.has(k)) return false;
  return PII_KEY.test(k);
}

/** Drop email/name/phone/message fields and any string that looks like an email. */
export function stripPii(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isGaPiiKey(key)) continue;
    if (typeof value === "string" && EMAIL_LIKE.test(value.trim())) continue;
    out[key] = value;
  }
  return out;
}

function asFiniteAmount(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 && n < 1e9 ? n : undefined;
}

function fireGtag(eventName: string, params: Record<string, unknown> = {}) {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", eventName, { ...stripPii(params), send_to: GA_ID });
    }
  } catch {
    // silently fail
  }
}

// Map internal event names → GA4 recommended event names where applicable.
// Lead/conversion events are NOT mapped here: they go through trackLead() so
// each outcome is a distinct, deduplicated event and generate_lead only fires
// after the server confirms the submission. (Previously quiz events were
// reported to GA4 as begin_checkout/purchase and contact clicks as
// generate_lead, which inflated conversion counts.)
// return_visit must NOT map to the reserved session_start event.
const GA4_EVENT_MAP: Record<string, string> = {
  page_view: "page_view",
  listing_view: "view_item",
  match_report_generated: "quiz_complete",
  outfitter_session: "outfitter_chat_start",
  return_visit: "return_visit",
};

const VISIT_KEY = "matchrv_has_visited";

export function detectReturnVisit(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const isReturn = localStorage.getItem(VISIT_KEY) === "1";
    if (isReturn) {
      trackEvent("return_visit", {});
    } else {
      localStorage.setItem(VISIT_KEY, "1");
    }
    return isReturn;
  } catch {
    return false;
    // localStorage unavailable — skip silently
  }
}

export function trackEvent(
  eventType: string,
  data: {
    listingId?: number | string;
    dealerId?: number | string;
    metadata?: Record<string, unknown>;
  } = {}
) {
  const metadata = stripPii(data.metadata ?? {});
  sendInternalEvent(eventType, { listingId: data.listingId, dealerId: data.dealerId, metadata });

  const ga4EventName = GA4_EVENT_MAP[eventType] ?? eventType;
  const ga4Params: Record<string, unknown> = {
    ...metadata,
    ...(data.listingId != null && data.listingId !== "" ? { item_id: String(data.listingId) } : {}),
    ...(data.dealerId != null && data.dealerId !== "" ? { dealer_id: String(data.dealerId) } : {}),
  };
  fireGtag(ga4EventName, ga4Params);
}

function sendInternalEvent(
  eventType: string,
  data: { listingId?: number | string; dealerId?: number | string; metadata?: Record<string, unknown> },
) {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const apiUrl = `${baseUrl}api/analytics/event`;
  const shouldSendInternalAnalytics =
    ( !import.meta.env.DEV || import.meta.env.VITE_ENABLE_ANALYTICS_API === "true") &&
    !document.querySelector('meta[name="matchrv-mode"][content="demo"]');

  if (shouldSendInternalAnalytics) {
    try {
      fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          sessionId: getSessionId(),
          listingId: data.listingId ?? null,
          dealerId: data.dealerId ?? null,
          metadata: stripPii(data.metadata ?? {}),
        }),
      }).catch(() => {});
    } catch {
      // silently fail
    }
  }
}

// Dedicated page_view tracker for the SPA router
export function trackPageView(path: string, title: string) {
  // Also record in internal analytics
  trackEvent("page_view", { metadata: { page_path: path, page_title: title, page_location: window.location.href, site_surface: siteSurface() } });
}

/**
 * Conversion outcomes. generate_lead is the single GA4 key event for verified
 * submissions; the typed event is for breakdowns (lead_type dimension).
 *  - dealer_contact_form   /contact form accepted by the server        (verified)
 *  - snapshot_request      free Visibility Snapshot generated          (verified)
 *  - snapshot_pdf_email    snapshot PDF emailed                        (verified)
 *  - buyer_dealer_inquiry  shopper inquiry about a listing saved       (verified)
 *  - buyer_email_capture   shopper saved a Match Report by email       (verified)
 *  - price_alert           price-drop / similar-RV email signup        (verified)
 *  - buyers_agent_inquiry  Personal / Buyers Agent request             (verified)
 *  - seller_listing_submit shopper submitted an RV on /sell            (verified)
 *  - book_demo_click       opened the booking calendar                 (intent only —
 *                          the booking itself happens on Google Calendar)
 */
export type LeadType =
  | "dealer_contact_form"
  | "snapshot_request"
  | "snapshot_pdf_email"
  | "buyer_dealer_inquiry"
  | "buyer_email_capture"
  | "price_alert"
  | "buyers_agent_inquiry"
  | "seller_listing_submit"
  | "book_demo_click";

export type LeadAudience = "dealer" | "shopper" | "seller";

const VERIFIED_LEADS: ReadonlySet<LeadType> = new Set([
  "dealer_contact_form",
  "snapshot_request",
  "snapshot_pdf_email",
  "buyer_dealer_inquiry",
  "buyer_email_capture",
  "price_alert",
  "buyers_agent_inquiry",
  "seller_listing_submit",
]);

const DEALER_LEADS: ReadonlySet<LeadType> = new Set([
  "dealer_contact_form",
  "snapshot_request",
  "snapshot_pdf_email",
  "book_demo_click",
]);

const SELLER_LEADS: ReadonlySet<LeadType> = new Set([
  "seller_listing_submit",
]);

const LEAD_DEDUPE_PREFIX = "matchrv_lead:";
const inMemoryLeadKeys = new Set<string>();

function claimLeadKey(key: string): boolean {
  if (inMemoryLeadKeys.has(key)) return false;
  inMemoryLeadKeys.add(key);
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // sessionStorage unavailable — the in-memory set still dedupes this page load
  }
  return true;
}

function leadAudience(leadType: LeadType): LeadAudience {
  if (DEALER_LEADS.has(leadType)) return "dealer";
  if (SELLER_LEADS.has(leadType)) return "seller";
  return "shopper";
}

export interface TrackLeadOptions {
  dedupeKey?: string | number | null;
  formId?: string;
  listingId?: number | string;
  dealerId?: number | string;
  source?: string;
  placement?: string;
  surface?: string;
  value?: number | string | null;
  currency?: string;
  metadata?: Record<string, unknown>;
}

/** Canonical, non-PII params sent with every lead event and with generate_lead. */
export function buildLeadParams(leadType: LeadType, options: TrackLeadOptions = {}): Record<string, unknown> {
  const audience = leadAudience(leadType);
  const verified = VERIFIED_LEADS.has(leadType);
  const value = asFiniteAmount(options.value ?? options.metadata?.value ?? options.metadata?.price);
  const params: Record<string, unknown> = {
    ...stripPii(options.metadata ?? {}),
    lead_type: leadType,
    lead_audience: audience,
    lead_verified: verified,
  };
  if (options.source) params.source = String(options.source).slice(0, 80);
  if (options.placement) params.placement = String(options.placement).slice(0, 80);
  if (options.formId) params.form_id = options.formId;
  if (options.listingId != null && options.listingId !== "") params.item_id = String(options.listingId);
  if (options.dealerId != null && options.dealerId !== "") params.dealer_id = String(options.dealerId);
  if (options.surface) params.surface = String(options.surface).slice(0, 80);
  if (value !== undefined) {
    params.value = value;
    params.currency = options.currency === "USD" || !options.currency ? "USD" : String(options.currency).slice(0, 8);
  }
  return stripPii(params);
}

/**
 * Record a conversion outcome once per browser session per (type, dedupeKey).
 * Call it only after the server has accepted the submission (except
 * book_demo_click, which is an outbound click). Returns false when the event
 * was a duplicate and nothing was sent.
 */
export function trackLead(
  leadType: LeadType,
  options: TrackLeadOptions = {},
): boolean {
  const key = `${LEAD_DEDUPE_PREFIX}${leadType}:${options.dedupeKey ?? "session"}`;
  if (!claimLeadKey(key)) return false;

  const params = buildLeadParams(leadType, options);

  sendInternalEvent(leadType, {
    listingId: options.listingId,
    dealerId: options.dealerId,
    metadata: params,
  });

  // GA4 enhanced measurement cannot see SPA forms that call preventDefault(),
  // so it logs form_start but never form_submit. Send it explicitly.
  if (options.formId) {
    fireGtag("form_submit", { form_id: options.formId, form_name: options.formId, lead_type: leadType });
  }
  fireGtag(leadType, params);
  if (VERIFIED_LEADS.has(leadType)) fireGtag("generate_lead", params);
  try {
    (window as unknown as { clarity?: (...a: unknown[]) => void }).clarity?.("event", leadType);
  } catch {
    // ignore
  }
  return true;
}

/**
 * Clerk (or other) account creation. This is a GA4 recommended event, not a
 * sales lead — it does not fire generate_lead.
 */
export function trackSignUp(options: { method?: string; dedupeKey?: string | number | null } = {}): boolean {
  const key = `${LEAD_DEDUPE_PREFIX}sign_up:${options.dedupeKey ?? "session"}`;
  if (!claimLeadKey(key)) return false;
  const params = stripPii({ method: options.method ?? "clerk" });
  sendInternalEvent("sign_up", { metadata: params });
  fireGtag("sign_up", params);
  return true;
}
