/**
 * Indexable HTML pages, split by host.
 *
 * A URL belongs here when that host returns HTTP 200, the page is meant to
 * be indexed, and the server-rendered HTML has a title, description, and a
 * canonical on the same host. Unit pages (/listing/{id}) and state hubs stay
 * on the consumer sitemap only. They are the public inventory URLs.
 *
 * Dealer marketing pages are listed on https://dealer.matchrv.com only.
 * Shared company pages (about, contact, terms, privacy) are listed on both
 * hosts, each canonical to itself.
 *
 * Leave out account, admin, login, saved, messages, alerts, searches,
 * sign-in, and dealer dashboards. Leave out pages marked noindex (such as
 * /swipe) and demo-only reports (/browse). Redirects stay redirects:
 * advertise the destination, not the old path.
 */
import { CONSUMER_ORIGIN, DEALER_ORIGIN, type SiteSurface } from "./site-host";

const CONSUMER_PATHS = [
  "/",
  "/shop",
  "/mcp-setup",
  "/mcp-docs",
  "/about",
  "/contact",
  "/terms",
  "/privacy",
  "/tow-guide",
  "/answers",
  "/outfitter",
  "/match",
  "/find-the-right-rv-for-your-tow-vehicle",
  "/guides/best-rvs-for-full-time-living",
  "/guides/rv-cost-guide",
  "/guides/tow-vehicle-guide",
  "/guides/travel-trailer-vs-fifth-wheel",
  "/rv-financing",
  "/rv-financing/what-credit-score-do-you-need-to-buy-an-rv",
  "/rv-financing/bad-credit-rv-financing",
  "/rv-financing/rv-loan-calculator",
  "/rv-financing/find-rvs-by-monthly-payment",
  "/rv-financing/rv-pre-approval-before-shopping",
  "/rv-financing/used-rv-financing",
];

const DEALER_PATHS = [
  "/",
  "/visibility-report",
  "/for-dealers",
  "/visibility-solution",
  "/lotai",
  "/book",
  "/about",
  "/contact",
  "/terms",
  "/privacy",
  "/dealer-tools",
  "/dealers/chatgpt-advertising",
];

function abs(origin: string, paths: string[]): string[] {
  return paths.map((path) => (path === "/" ? `${origin}/` : `${origin}${path}`));
}

export const CONSUMER_CORE_URLS: string[] = abs(CONSUMER_ORIGIN, CONSUMER_PATHS);
export const DEALER_CORE_URLS: string[] = abs(DEALER_ORIGIN, DEALER_PATHS);

/** Consumer core. Existing callers that render "the" core sitemap get the shopper site. */
export const CORE_SITEMAP_URLS: string[] = CONSUMER_CORE_URLS;

export function coreUrlsFor(site: SiteSurface): string[] {
  return site === "dealer" ? DEALER_CORE_URLS : CONSUMER_CORE_URLS;
}
