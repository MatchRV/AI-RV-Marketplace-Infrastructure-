/**
 * Our own count of shopper visits sent to dealer sites (GET /api/out). A utm tag only shows up in the
 * dealer's analytics, which we can't see, so every click through the redirect is recorded here.
 *
 * Stored as JSON lines next to the dealer-inquiry store (INQUIRIES_PATH / LEARNED_FACTS_PATH directory, else
 * data/). Nothing about the shopper is kept: no IP, no user agent, no cookies — only which unit, which dealer,
 * where it was sent and from which MatchRV surface.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { dataDirAcceptsWrites } from "./data-dir-freeze";

export interface OutboundClick { at: string; unitId: string; dealerId: string; dealerName: string; host: string; from: string }

const recent: OutboundClick[] = [];
const byDealer = new Map<string, { dealerName: string; clicks: number }>();
let loaded = false;
let persistenceOverride: boolean | null = null;
const persistenceEnabled = () => persistenceOverride ?? (process.env.NODE_ENV !== "test" && !process.env.VITEST);

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
  console.log(`[out] ${click.from} ${click.unitId} -> ${click.host} (${click.dealerName})`);
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

/** Test helper. */
export function resetOutboundClicks() { recent.length = 0; byDealer.clear(); loaded = true; }
export function __setClickPersistenceForTests(on: boolean | null): void { persistenceOverride = on; }
