/**
 * Our own count of shopper visits sent to dealer sites (GET /api/out). A utm tag only shows up in the
 * dealer's analytics, which we can't see, so every click through the redirect is recorded here.
 *
 * Stored as JSON lines next to the dealer-inquiry store (INQUIRIES_PATH / LEARNED_FACTS_PATH directory, else
 * data/). Nothing about the shopper is kept: no IP, no user agent, no cookies — only which unit, which dealer,
 * where it was sent and from which MatchRV surface. When the page passes its analytics session id (sid), only a
 * one-way hash of it is stored, so a later MatchRV inquiry from the same browser session can show "MatchRV sent
 * this shopper to the dealer at <time>" as lead-credit evidence (services/lead-credit.ts).
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { dataDirAcceptsWrites } from "./data-dir-freeze";

export interface OutboundClick {
  at: string; unitId: string; dealerId: string; dealerName: string; host: string; from: string;
  /** One-way hash of the page's analytics session id (outboundSessionHash). Present only when the page sent one. */
  session?: string;
  /** The shopper saved a price-drop alert on the "before you go" step right before leaving. */
  alert?: true;
  /** Dealer's state/province (for judging "same day" on the dealer's local calendar). Older clicks lack it. */
  dealerState?: string;
}

const SID_RE = /^[A-Za-z0-9_-]{8,128}$/;
/** Hash of an analytics session id as stored in the click log. Null for a missing or malformed id. */
export function outboundSessionHash(sessionId: string | null | undefined): string | null {
  if (typeof sessionId !== "string" || !SID_RE.test(sessionId)) return null;
  return createHash("sha256").update(`matchrv-out-session:${sessionId}`).digest("hex").slice(0, 32);
}

const recent: OutboundClick[] = [];
/** Clicks per hashed session, for lead-credit evidence. Bounded: oldest sessions dropped first. */
const bySession = new Map<string, OutboundClick[]>();
const MAX_SESSIONS = 50_000;
const MAX_CLICKS_PER_SESSION = 20;
const byDealer = new Map<string, { dealerName: string; clicks: number }>();
let loaded = false;
let persistenceOverride: boolean | null = null;
export const persistenceEnabled = () => persistenceOverride ?? (process.env.NODE_ENV !== "test" && !process.env.VITEST);

export function clicksPath(): string {
  if (process.env.OUTBOUND_CLICKS_PATH) return resolve(process.env.OUTBOUND_CLICKS_PATH);
  if (process.env.INQUIRIES_PATH) return resolve(dirname(resolve(process.env.INQUIRIES_PATH)), "outbound-clicks.jsonl");
  if (process.env.LEARNED_FACTS_PATH) return resolve(dirname(resolve(process.env.LEARNED_FACTS_PATH)), "outbound-clicks.jsonl");
  return resolve("data/outbound-clicks.jsonl");
}

function remember(c: OutboundClick) {
  recent.push(c);
  if (recent.length > 500) recent.shift();
  const row = byDealer.get(c.dealerId) ?? { dealerName: c.dealerName, clicks: 0 };
  row.clicks++;
  byDealer.set(c.dealerId, row);
  if (c.session) {
    const list = bySession.get(c.session) ?? [];
    if (list.length < MAX_CLICKS_PER_SESSION) list.push(c);
    bySession.delete(c.session);
    bySession.set(c.session, list);
    if (bySession.size > MAX_SESSIONS) bySession.delete(bySession.keys().next().value!);
  }
}

function load() {
  if (loaded) return;
  loaded = true;
  if (!persistenceEnabled()) return;
  try {
    const p = clicksPath();
    if (!existsSync(p)) return;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { remember(JSON.parse(line) as OutboundClick); } catch { /* skip a torn line */ }
    }
  } catch (err) { console.warn("[out] could not read click log:", err instanceof Error ? err.message : err); }
}

/** Never throws: a logging failure must not block the shopper's redirect. */
export function recordOutboundClick(c: Omit<OutboundClick, "at">, now = new Date()): OutboundClick {
  load();
  const click: OutboundClick = { at: now.toISOString(), ...c };
  if (!dataDirAcceptsWrites()) {
    console.log("[out] data dir frozen; click not recorded");
    return click;
  }
  remember(click);
  console.log(`[out] ${click.from} ${click.unitId || "(dealer home)"} -> ${click.host} (${click.dealerName})`);
  if (persistenceEnabled()) {
    try {
      const p = clicksPath();
      mkdirSync(dirname(p), { recursive: true });
      appendFileSync(p, JSON.stringify(click) + "\n");
    } catch (err) { console.warn("[out] could not persist click:", err instanceof Error ? err.message : err); }
  }
  return click;
}

export function outboundSummary() {
  load();
  return {
    total: [...byDealer.values()].reduce((n, r) => n + r.clicks, 0),
    byDealer: [...byDealer.entries()].map(([dealerId, r]) => ({ dealerId, ...r })).sort((a, b) => b.clicks - a.clicks),
    recent: recent.slice(-100).reverse(),
  };
}

/** Clicks recorded for one hashed session, oldest first. */
export function clicksForSession(sessionHash: string | null | undefined): OutboundClick[] {
  if (!sessionHash) return [];
  load();
  return [...(bySession.get(sessionHash) ?? [])].sort((a, b) => a.at.localeCompare(b.at));
}

/** Every click that carried a session id (bounded like the session index), oldest first. For click credits. */
export function allSessionClicks(): OutboundClick[] {
  load();
  return [...bySession.values()].flat().sort((a, b) => a.at.localeCompare(b.at));
}

/** Key of one click credit: the shopper session plus the RV (or the dealer home page). */
export function clickKey(c: Pick<OutboundClick, "session" | "unitId" | "dealerId">): string | null {
  return c.session ? `${c.session}|${c.unitId || `dealer:${c.dealerId.toLowerCase()}`}` : null;
}

/** The earliest click for one click key, or null. */
export function firstClickForKey(key: string): OutboundClick | null {
  const session = key.split("|")[0];
  return clicksForSession(session).find((c) => clickKey(c) === key) ?? null;
}

/** Test helper. */
export function resetOutboundClicks() { recent.length = 0; byDealer.clear(); bySession.clear(); loaded = true; }
export function __setClickPersistenceForTests(on: boolean | null): void { persistenceOverride = on; }
