/**
 * Browser twin of artifacts/api-server/src/lib/site-host.ts.
 * Keep the path lists and redirect rules the same. The server is what
 * crawlers follow; this module only steers client-side navigations and
 * which chrome a page renders.
 */

export const CONSUMER_ORIGIN = "https://matchrv.com";
export const DEALER_ORIGIN = "https://dealer.matchrv.com";
export const OUTFITTER_PROMPT_KEY = "matchrv-outfitter-prompt";

export type HostKind = "consumer" | "dealer" | "local";
export type SiteSurface = "consumer" | "dealer";

const DEALER_PATHS = new Set([
  "/visibility-report",
  "/visibility-solution",
  "/lotai",
  "/for-dealers",
  "/book",
  "/dealer-tools",
  "/dealer-visibility",
  "/dealers/login",
  "/dealers/chatgpt-advertising",
]);

const SHARED_PATHS = new Set(["/about", "/contact", "/privacy", "/terms"]);

const DEALER_ALIASES: Record<string, string> = {
  "/advertising": "/visibility-solution",
  "/dealer-login": "/dealers/login",
  "/dealers/ai": "/for-dealers",
};

let prerenderSite: SiteSurface | null = null;

/** Prerender sets this before rendering a page. Tests leave it unset. */
export function setPrerenderSite(site: SiteSurface | null): void {
  prerenderSite = site;
}

export function stripHostname(hostname: string): string {
  return hostname.split(":")[0].toLowerCase().replace(/\.$/, "");
}

export function classifyHost(hostname: string): HostKind {
  const host = stripHostname(hostname);
  if (host === "dealer.matchrv.com" || host === "dealer.localhost" || host === "dealer.matchrv.local") return "dealer";
  if (host === "matchrv.com" || host === "www.matchrv.com" || host === "matchrv.local") return "consumer";
  return "local";
}

export function crossHostRedirectsEnabled(hostname: string): boolean {
  const host = stripHostname(hostname);
  return host === "matchrv.com" || host === "www.matchrv.com" || host === "dealer.matchrv.com";
}

export function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  const noQuery = path.split("?")[0].split("#")[0];
  const noSlash = noQuery.length > 1 && noQuery.endsWith("/") ? noQuery.replace(/\/+$/, "") : noQuery;
  return noSlash.startsWith("/") ? noSlash : `/${noSlash}`;
}

export function isInfraPath(path: string): boolean {
  const p = normalizePath(path);
  if (p === "/mcp" || p.startsWith("/mcp/")) return true;
  if (p === "/api" || p.startsWith("/api/")) return true;
  if (p.startsWith("/.well-known/") || p.startsWith("/ops/") || p === "/ops") return true;
  if (p === "/sitemap.xml" || p.startsWith("/sitemaps/")) return true;
  if (p === "/robots.txt" || p === "/llms.txt") return true;
  if (p.startsWith("/assets/") || p.startsWith("/images/") || p.startsWith("/videos/") || p.startsWith("/fonts/") || p.startsWith("/visibility/")) return true;
  return /\.(css|js|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|mp4|webm|json|txt|xml)$/i.test(p);
}

export function migrationTarget(hostname: string, path: string, search = ""): string | null {
  if (!crossHostRedirectsEnabled(hostname)) return null;
  if (isInfraPath(path)) return null;
  const kind = classifyHost(hostname);
  const normalized = normalizePath(path);
  const alias = DEALER_ALIASES[normalized];
  const destPath = alias ?? normalized;
  const shared = SHARED_PATHS.has(destPath);
  const dealer = Boolean(DEALER_ALIASES[normalized] || DEALER_PATHS.has(destPath) || alias);
  const home = destPath === "/";
  const q = search && !search.startsWith("?") ? `?${search}` : search;

  if (home || shared) {
    if (alias && kind !== "dealer") return `${DEALER_ORIGIN}${destPath}${q}`;
    if (alias && kind === "dealer") return `${destPath}${q}`;
    return null;
  }
  if (dealer && kind !== "dealer") return `${DEALER_ORIGIN}${destPath}${q}`;
  if (!dealer && kind === "dealer") return `${CONSUMER_ORIGIN}${destPath}${q}`;
  return null;
}

/** Dealer chrome when the prerender or the hostname says so. Node tests default to dealer so existing dealer pages keep their shell. */
export function currentSite(): SiteSurface {
  if (prerenderSite) return prerenderSite;
  if (typeof window !== "undefined" && window.location?.hostname) {
    return classifyHost(window.location.hostname) === "dealer" ? "dealer" : "consumer";
  }
  return "dealer";
}

export function currentOrigin(): string {
  return currentSite() === "dealer" ? DEALER_ORIGIN : CONSUMER_ORIGIN;
}

export function siteSurface(): SiteSurface {
  if (typeof window !== "undefined" && window.location?.hostname) {
    return classifyHost(window.location.hostname) === "dealer" ? "dealer" : "consumer";
  }
  return currentSite();
}
