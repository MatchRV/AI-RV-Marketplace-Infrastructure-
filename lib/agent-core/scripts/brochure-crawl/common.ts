/**
 * Shared plumbing for the per-maker brochure/spec crawlers.
 *
 * Rules: first-party manufacturer pages only; robots.txt is read and obeyed
 * (User-agent: * rules, Disallow prefixes); one request at a time with a
 * polite delay; a bot challenge (Cloudflare "Just a moment...", captcha, 403/429)
 * is recorded as BLOCKED and the crawler moves on. It never retries around a
 * challenge, rotates identity or drives a browser.
 *
 * Pages are cached under CRAWL_CACHE (default /workspace/sleeps-audit/crawl-cache)
 * so a rerun re-parses without re-fetching.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";

export const USER_AGENT = "MatchRV-SpecBot/1.0 (+https://matchrv.com; manufacturer spec facts with source links)";
export const DELAY_MS = Number(process.env.CRAWL_DELAY_MS ?? 1500);
export const CACHE_DIR = process.env.CRAWL_CACHE ?? "/workspace/sleeps-audit/crawl-cache";

export class BlockedError extends Error {
  constructor(public url: string, public reason: string) { super(`BLOCKED ${url}: ${reason}`); }
}

interface Robots { disallow: string[]; allow: string[]; contentSignal?: string; crawlDelayS?: number }
const robotsCache = new Map<string, Robots>();
let last = 0;

async function politeFetch(url: string): Promise<Response> {
  const wait = last + DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  return fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xml;q=0.9,*/*;q=0.8" }, redirect: "follow" });
}

/** Parse the `User-agent: *` group of a robots.txt. */
export function parseRobots(txt: string): Robots {
  const out: Robots = { disallow: [], allow: [] };
  let inStar = false, sawRule = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") { if (sawRule) { inStar = false; sawRule = false; } if (v === "*") inStar = true; continue; }
    sawRule = true;
    if (!inStar) continue;
    if (k === "disallow" && v) out.disallow.push(v);
    else if (k === "allow" && v) out.allow.push(v);
    else if (k === "content-signal") out.contentSignal = v;
    else if (k === "crawl-delay") out.crawlDelayS = Number(v);
  }
  return out;
}

const ruleMatches = (path: string, rule: string) => {
  const re = new RegExp("^" + rule.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*").replace(/\\\$$/, "$"));
  return re.test(path);
};

export async function robotsFor(origin: string): Promise<Robots> {
  const hit = robotsCache.get(origin);
  if (hit) return hit;
  const res = await politeFetch(`${origin}/robots.txt`);
  const txt = res.ok ? await res.text() : "";
  if (looksLikeChallenge(txt)) throw new BlockedError(`${origin}/robots.txt`, "bot challenge on robots.txt");
  const r = parseRobots(txt);
  robotsCache.set(origin, r);
  return r;
}

export async function allowedByRobots(url: string): Promise<boolean> {
  const u = new URL(url);
  const r = await robotsFor(u.origin);
  const path = u.pathname + u.search;
  const longest = (rules: string[]) => Math.max(-1, ...rules.filter((x) => ruleMatches(path, x)).map((x) => x.length));
  return longest(r.allow) >= longest(r.disallow);
}

export function looksLikeChallenge(body: string): boolean {
  return /<title>\s*(Just a moment|Attention Required|Access denied)/i.test(body) || /challenges\.cloudflare\.com\/turnstile|cf-chl-|captcha-delivery|px-captcha/i.test(body);
}

const cachePath = (url: string) => join(CACHE_DIR, new URL(url).hostname, createHash("sha1").update(url).digest("hex") + ".html");

/** Fetch a first-party page politely. Throws BlockedError on a bot check; returns null on 404/robots-disallowed. */
export async function getPage(url: string): Promise<{ html: string; fromCache: boolean } | null> {
  const p = cachePath(url);
  if (existsSync(p)) return { html: readFileSync(p, "utf8"), fromCache: true };
  if (!(await allowedByRobots(url))) { console.warn(`robots.txt disallows ${url}; skipped`); return null; }
  const res = await politeFetch(url);
  const body = await res.text();
  if (res.status === 403 || res.status === 429 || looksLikeChallenge(body)) throw new BlockedError(url, `HTTP ${res.status}${looksLikeChallenge(body) ? " bot challenge" : ""}`);
  if (!res.ok) return null;
  mkdirSync(join(CACHE_DIR, new URL(url).hostname), { recursive: true });
  writeFileSync(p, body);
  return { html: body, fromCache: false };
}

export function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
}

export const decodeEntities = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export const stripTags = (html: string) => decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "\n"))
  .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");

export const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Inventory demand per (year, floorplan code) for one brand, from the committed snapshot. */
export interface Demand { units: number; noSleeps: number; bunkUnknown: number }
export async function inventoryDemand(brand: string): Promise<Map<string, Demand>> {
  const core = await import("../../src/index.js");
  const snap = JSON.parse(gunzipSync(readFileSync(new URL("../../data/inventory.snapshot.json.gz", import.meta.url))).toString());
  const idx = core.indexSnapshot(snap);
  const out = new Map<string, Demand>();
  for (const u of idx.units) {
    const b = core.canonicalBrand(core.unitMakeModel(u).brand) ?? core.canonicalBrand(u.make);
    if (b !== brand) continue;
    for (const code of core.titleFloorplanCodes(u.title ?? "")) {
      const k = `${u.year}|${code}`;
      const d = out.get(k) ?? { units: 0, noSleeps: 0, bunkUnknown: 0 };
      d.units++; if (u.sleeps.value === null) d.noSleeps++; if (u.bunkhouse.value === null) d.bunkUnknown++;
      out.set(k, d);
    }
  }
  return out;
}

/** DB/DBS/QB codes first (bunkhouse status unconfirmed), then by units missing sleeps, then total units. */
export function priority(code: string, d: Demand): number {
  const bunkCode = /(DBS|DB|QB)/.test(code.replace(/^\d+/, "")) ? 1 : 0;
  return bunkCode * 1e9 + d.noSleeps * 1e4 + d.units;
}

export const today = () => new Date().toISOString().slice(0, 10);
