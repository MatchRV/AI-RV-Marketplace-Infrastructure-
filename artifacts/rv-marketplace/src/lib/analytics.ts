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

function fireGtag(eventName: string, params: Record<string, unknown> = {}) {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", eventName, { ...params, send_to: GA_ID });
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
const GA4_EVENT_MAP: Record<string, string> = {
  page_view: "page_view",
  listing_view: "view_item",
  match_report_generated: "quiz_complete",
  outfitter_session: "outfitter_chat_start",
  return_visit: "session_start",
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
    listingId?: number;
    dealerId?: number;
    metadata?: Record<string, unknown>;
  } = {}
) {
  sendInternalEvent(eventType, data);

  // Fire to GA4
  const ga4EventName = GA4_EVENT_MAP[eventType] ?? eventType;
  const ga4Params: Record<string, unknown> = {
    ...(data.metadata ?? {}),
    ...(data.listingId ? { item_id: String(data.listingId) } : {}),
    ...(data.dealerId ? { dealer_id: String(data.dealerId) } : {}),
  };
  fireGtag(ga4EventName, ga4Params);
}

function sendInternalEvent(
  eventType: string,
  data: { listingId?: number; dealerId?: number; metadata?: Record<string, unknown> },
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
          metadata: data.metadata ?? {},
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
  trackEvent("page_view", { metadata: { page_path: path, page_title: title, page_location: window.location.href } });
}

/**
 * Conversion outcomes, each reported to GA4 as its own event so they can be
 * marked as separate key events:
 *  - dealer_contact_form   /contact form accepted by the server        (verified)
 *  - snapshot_request      free Visibility Snapshot generated          (verified)
 *  - snapshot_pdf_email    snapshot PDF emailed                        (verified)
 *  - buyer_dealer_inquiry  shopper inquiry about a listing saved       (verified)
 *  - buyer_email_capture   shopper saved a Match Report by email       (verified)
 *  - book_demo_click       opened the booking calendar                 (intent only —
 *                          the booking itself happens on Google Calendar)
 */
export type LeadType =
  | "dealer_contact_form"
  | "snapshot_request"
  | "snapshot_pdf_email"
  | "buyer_dealer_inquiry"
  | "buyer_email_capture"
  | "book_demo_click";

const VERIFIED_LEADS: ReadonlySet<LeadType> = new Set([
  "dealer_contact_form",
  "snapshot_request",
  "snapshot_pdf_email",
  "buyer_dealer_inquiry",
  "buyer_email_capture",
]);

const DEALER_LEADS: ReadonlySet<LeadType> = new Set([
  "dealer_contact_form",
  "snapshot_request",
  "snapshot_pdf_email",
  "book_demo_click",
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

/**
 * Record a conversion outcome once per browser session per (type, dedupeKey).
 * Call it only after the server has accepted the submission (except
 * book_demo_click, which is an outbound click). Returns false when the event
 * was a duplicate and nothing was sent.
 */
export function trackLead(
  leadType: LeadType,
  options: {
    dedupeKey?: string | number | null;
    formId?: string;
    listingId?: number;
    dealerId?: number;
    metadata?: Record<string, unknown>;
  } = {},
): boolean {
  const key = `${LEAD_DEDUPE_PREFIX}${leadType}:${options.dedupeKey ?? "session"}`;
  if (!claimLeadKey(key)) return false;

  const audience = DEALER_LEADS.has(leadType) ? "dealer" : "shopper";
  const verified = VERIFIED_LEADS.has(leadType);
  const params: Record<string, unknown> = {
    ...(options.metadata ?? {}),
    lead_type: leadType,
    lead_audience: audience,
    lead_verified: verified,
    ...(options.listingId ? { item_id: String(options.listingId) } : {}),
    ...(options.dealerId ? { dealer_id: String(options.dealerId) } : {}),
  };

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
  if (verified) fireGtag("generate_lead", params);
  try {
    (window as unknown as { clarity?: (...a: unknown[]) => void }).clarity?.("event", leadType);
  } catch {
    // ignore
  }
  return true;
}
