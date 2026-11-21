/**
 * Lead attribution the website sends with a dealer inquiry (docs/lead-tracking/ATTRIBUTION_CONTRACT.md).
 *
 * The first page of a browser session records where the visitor came from (utm_* tags,
 * referrer host, landing path) in sessionStorage. A dealer inquiry then sends that, plus
 * the surface it was sent from and the analytics session id, as an optional
 * `attribution` object. The server validates and whitelists every value and ignores the
 * object entirely while LEAD_TRACKING_ENABLED is off. Never contains contact details.
 */
import { getAnalyticsSessionId } from "./analytics";

const LANDING_KEY = "mrv_lead_landing_v1";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export type WebsiteLeadSurface = "swipe" | "grid" | "ask_ai" | "favorites" | "compare" | "tow_fit" | "unit_detail" | "other";

export interface WebsiteLeadAttribution {
  client: "website";
  platform: "web";
  surface?: WebsiteLeadSurface;
  session_id?: string;
  utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_term?: string; utm_content?: string;
  referrer?: string;
  landing_page?: string;
}

type Landing = Partial<Pick<WebsiteLeadAttribution, "utm_source" | "utm_medium" | "utm_campaign" | "utm_term" | "utm_content" | "referrer" | "landing_page">>;

const tag = (v: string | null): string | undefined => {
  const t = (v ?? "").trim().toLowerCase();
  return t && t.length <= 80 && /^[a-z0-9][a-z0-9._+~-]*$/.test(t) ? t : undefined;
};

/** Pure: what a landing URL + referrer say. Referrer is reduced to its host; the landing page to its path. */
export function landingFrom(href: string, referrer: string): Landing {
  const out: Landing = {};
  try {
    const u = new URL(href);
    for (const k of UTM_KEYS) { const v = tag(u.searchParams.get(k)); if (v) out[k] = v; }
    if (/^\/[A-Za-z0-9/_.~-]{0,159}$/.test(u.pathname)) out.landing_page = u.pathname;
    if (referrer) {
      const r = new URL(referrer);
      if ((r.protocol === "https:" || r.protocol === "http:") && r.host !== u.host) out.referrer = r.hostname;
    }
  } catch {
    /* keep what we have */
  }
  return out;
}

/** Call once at startup. Keeps the first landing of this browser session only. */
export function captureLandingAttribution(): void {
  try {
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
    if (sessionStorage.getItem(LANDING_KEY)) return;
    sessionStorage.setItem(LANDING_KEY, JSON.stringify(landingFrom(window.location.href, document.referrer)));
  } catch {
    /* storage blocked: attribution is optional */
  }
}

function storedLanding(): Landing {
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(LANDING_KEY) : null;
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? (v as Landing) : {};
  } catch {
    return {};
  }
}

export function websiteLeadAttribution(surface?: WebsiteLeadSurface): WebsiteLeadAttribution {
  const out: WebsiteLeadAttribution = { client: "website", platform: "web", ...storedLanding() };
  if (surface) out.surface = surface;
  try { out.session_id = getAnalyticsSessionId(); } catch { /* no sessionStorage */ }
  return out;
}
