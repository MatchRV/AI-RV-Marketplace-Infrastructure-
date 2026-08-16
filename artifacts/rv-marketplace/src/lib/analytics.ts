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

// Map internal event names → GA4 recommended event names where applicable
const GA4_EVENT_MAP: Record<string, string> = {
  page_view: "page_view",
  listing_view: "view_item",
  listing_contact: "generate_lead",
  dealer_contact: "generate_lead",
  quiz_start: "begin_checkout",
  quiz_complete: "purchase",
  match_report_generated: "quiz_complete",
  match_report_email_save: "sign_up",
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
  const baseUrl = import.meta.env.BASE_URL || "/";
  const apiUrl = `${baseUrl}api/analytics/event`;

  // Fire to internal analytics API
  const shouldSendInternalAnalytics =
    !import.meta.env.DEV || import.meta.env.VITE_ENABLE_ANALYTICS_API === "true";

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

  // Fire to GA4
  const ga4EventName = GA4_EVENT_MAP[eventType] ?? eventType;
  const ga4Params: Record<string, unknown> = {
    ...(data.metadata ?? {}),
    ...(data.listingId ? { item_id: String(data.listingId) } : {}),
    ...(data.dealerId ? { dealer_id: String(data.dealerId) } : {}),
  };
  fireGtag(ga4EventName, ga4Params);
}

// Dedicated page_view tracker for the SPA router
export function trackPageView(path: string, title: string) {
  fireGtag("page_view", {
    page_path: path,
    page_title: title,
    page_location: window.location.href,
  });

  // Also record in internal analytics
  trackEvent("page_view", { metadata: { path, title } });
}
