/**
 * Hostname split for the one MatchRV server.
 *
 * matchrv.com is the consumer marketplace. dealer.matchrv.com is the dealer
 * site. Both are this process. /api/*, /mcp, /.well-known/*, and /ops/* are
 * not pages: they never redirect, on either host.
 *
 * Cross-host 301s run only for the public production names. Localhost and
 * *.local serve whichever page you asked for so development does not bounce
 * to production.
 */

export const CONSUMER_ORIGIN = "https://matchrv.com";
export const DEALER_ORIGIN = "https://dealer.matchrv.com";

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

/** Served on both hosts. Each host canonicalizes to itself. */
const SHARED_PATHS = new Set(["/about", "/contact", "/privacy", "/terms"]);

/** Old dealer URLs that should land on one dealer path, in a single hop. */
const DEALER_ALIASES: Record<string, string> = {
  "/advertising": "/visibility-solution",
  "/dealer-login": "/dealers/login",
  "/dealers/ai": "/for-dealers",
};

export function stripHostname(hostname: string): string {
  return hostname.split(":")[0].toLowerCase().replace(/\.$/, "");
}

export function classifyHost(hostname: string): HostKind {
  const host = stripHostname(hostname);
  if (host === "dealer.matchrv.com" || host === "dealer.localhost" || host === "dealer.matchrv.local") return "dealer";
  if (host === "matchrv.com" || host === "www.matchrv.com" || host === "matchrv.local") return "consumer";
  return "local";
}

/** Public names that should 301 migrated pages. Preview hosts do not. */
export function crossHostRedirectsEnabled(hostname: string): boolean {
  const host = stripHostname(hostname);
  return host === "matchrv.com" || host === "www.matchrv.com" || host === "dealer.matchrv.com";
}

export function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  const noSlash = path.length > 1 && path.endsWith("/") ? path.replace(/\/+$/, "") : path;
  return noSlash.startsWith("/") ? noSlash : `/${noSlash}`;
}

/** Infrastructure and files. Never a marketing redirect. */
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

export type PathOwner = "consumer" | "dealer" | "shared" | "both-home";

export function pathOwner(path: string): PathOwner {
  const p = normalizePath(path);
  if (p === "/") return "both-home";
  if (DEALER_ALIASES[p]) return "dealer";
  if (SHARED_PATHS.has(p)) return "shared";
  if (DEALER_PATHS.has(p)) return "dealer";
  return "consumer";
}

/**
 * Absolute or same-host Location for a 301, or null when this request should
 * be served. `search` includes the leading "?" when present.
 */
export function migrationTarget(hostname: string, path: string, search = ""): string | null {
  if (!crossHostRedirectsEnabled(hostname)) return null;
  if (isInfraPath(path)) return null;
  const kind = classifyHost(hostname);
  const normalized = normalizePath(path);
  const alias = DEALER_ALIASES[normalized];
  const destPath = alias ?? normalized;
  const owner = pathOwner(destPath);
  const q = search && !search.startsWith("?") ? `?${search}` : search;

  if (owner === "both-home" || owner === "shared") {
    if (alias && kind !== "dealer") return `${DEALER_ORIGIN}${destPath}${q}`;
    if (alias && kind === "dealer") return `${destPath}${q}`;
    return null;
  }
  if (owner === "dealer" && kind !== "dealer") return `${DEALER_ORIGIN}${destPath}${q}`;
  if (owner === "consumer" && kind === "dealer") return `${CONSUMER_ORIGIN}${destPath}${q}`;
  return null;
}

export function siteSurfaceFromHost(hostname: string): SiteSurface {
  return classifyHost(hostname) === "dealer" ? "dealer" : "consumer";
}
