/**
 * Who sent a request, for analytics only: client IP, user agent, bot tags and
 * a stable anonymous distinct id. Never used for access control.
 *
 * Client IP. Production runs behind Caddy on the same VM, so the socket peer
 * is loopback and Caddy writes the visitor's address into X-Forwarded-For.
 * X-Forwarded-For is honored only when the socket peer is a local proxy
 * (loopback or a private/link-local address); the left-most valid entry is
 * taken as the client. A direct connection from the internet uses the socket
 * address and its X-Forwarded-For is ignored, so it cannot spoof $ip.
 *
 * Anonymous ids. Hashes use HMAC-SHA256 keyed with ANALYTICS_ID_SALT (falls
 * back to the PostHog project token) and, for IP-based ids, the UTC day, so a
 * raw IP or user agent never appears in a distinct id and an IP id cannot be
 * joined across days.
 */
import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { botDistinctId, classifyUserAgent, type UaClassification } from "./bot-detect";

/** Header the Express MCP wrapper stamps with the resolved client IP. Any inbound copy is removed first. */
export const ANALYTICS_CLIENT_IP_HEADER = "x-matchrv-analytics-client-ip";

const MAX_UA = 512;

export interface AnalyticsClient {
  ip?: string;
  userAgent?: string;
}

function stripMapped(ip: string): string {
  return ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

/** Loopback, RFC 1918, CGNAT-free private ranges, IPv6 ULA and link-local. */
export function isLocalProxyAddress(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const ip = stripMapped(raw.trim());
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  }
  return false;
}

function cleanForwardedEntry(entry: string): string | undefined {
  let value = entry.trim();
  if (!value) return undefined;
  // "[2001:db8::1]:443" or "203.0.113.7:51234"
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracket) value = bracket[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) value = value.replace(/:\d+$/, "");
  value = stripMapped(value);
  return isIP(value) ? value : undefined;
}

/** Resolve the client IP from the socket peer and X-Forwarded-For. */
export function resolveClientIp(remoteAddress: string | null | undefined, forwardedFor: string | string[] | null | undefined): string | undefined {
  const remote = remoteAddress ? stripMapped(remoteAddress.trim()) : "";
  if (isLocalProxyAddress(remote) && forwardedFor) {
    const joined = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor;
    for (const entry of joined.split(",")) {
      const ip = cleanForwardedEntry(entry);
      if (ip) return ip;
    }
  }
  return isIP(remote) ? remote : undefined;
}

/** For an Express/Node request. */
export function clientFromNodeRequest(req: { socket?: { remoteAddress?: string | null }; headers: Record<string, string | string[] | undefined> }): AnalyticsClient {
  const ua = req.headers["user-agent"];
  return {
    ip: resolveClientIp(req.socket?.remoteAddress, req.headers["x-forwarded-for"]),
    userAgent: typeof ua === "string" && ua.trim() ? ua.slice(0, MAX_UA) : undefined,
  };
}

/** Express middleware for /mcp: stamps the resolved IP into a private header the fetch-level observer reads. */
export function stampAnalyticsClientIp(req: { socket?: { remoteAddress?: string | null }; headers: Record<string, string | string[] | undefined> }, _res: unknown, next: () => void): void {
  try {
    delete req.headers[ANALYTICS_CLIENT_IP_HEADER];
    const ip = resolveClientIp(req.socket?.remoteAddress, req.headers["x-forwarded-for"]);
    if (ip) req.headers[ANALYTICS_CLIENT_IP_HEADER] = ip;
  } catch {
    /* fail open */
  }
  next();
}

let processSalt: string | undefined;

function salt(): string {
  const configured = process.env.ANALYTICS_ID_SALT?.trim() || process.env.POSTHOG_PROJECT_API_KEY?.trim();
  if (configured) return configured;
  processSalt ??= randomBytes(32).toString("hex");
  return processSalt;
}

export function opaqueHash(...parts: string[]): string {
  return createHmac("sha256", salt()).update(parts.join("\u0000")).digest("hex").slice(0, 24);
}

function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Daily-rotating hashed IP + UA. Undefined when neither is known. */
export function hashedIpUaId(prefix: string, client: AnalyticsClient, now = Date.now()): string | undefined {
  if (!client.ip && !client.userAgent) return undefined;
  return `${prefix}${opaqueHash("ipua", utcDay(now), client.ip ?? "", client.userAgent ?? "")}`;
}

export interface BotTags {
  is_bot: boolean;
  bot_name?: string;
  bot_category?: string;
}

export function botTags(classification: UaClassification): BotTags {
  return classification.is_bot
    ? { is_bot: true, bot_name: classification.bot_name, bot_category: classification.bot_category }
    : { is_bot: false };
}

export { botDistinctId, classifyUserAgent };

/**
 * PostHog's sessions model wants a UUIDv7 $session_id whose timestamp is the
 * session start. A key we already have (MCP session hash, website session id)
 * is mapped to one UUIDv7 minted on first sight, held in a bounded LRU.
 */
const SESSION_CAP = 20_000;
const SESSION_IDLE_MS = 30 * 60_000;
const sessions = new Map<string, { id: string; at: number }>();

export function uuidv7(now = Date.now()): string {
  const bytes = randomBytes(16);
  let ts = BigInt(now);
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = Number(ts & 0xffn);
    ts >>= 8n;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sessionUuidFor(key: string, now = Date.now()): string {
  const row = sessions.get(key);
  if (row && now - row.at < SESSION_IDLE_MS) {
    row.at = now;
    sessions.delete(key);
    sessions.set(key, row);
    return row.id;
  }
  const id = uuidv7(now);
  sessions.delete(key);
  sessions.set(key, { id, at: now });
  if (sessions.size > SESSION_CAP) {
    const oldest = sessions.keys().next().value;
    if (oldest !== undefined) sessions.delete(oldest);
  }
  return id;
}

export function resetAnalyticsClientForTests(): void {
  sessions.clear();
  processSalt = undefined;
}
