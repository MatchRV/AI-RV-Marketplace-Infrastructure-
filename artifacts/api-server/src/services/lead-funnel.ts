/**
 * Shopper funnel counters for lead tracking: impression -> view -> favorite -> inquiry
 * (plus swipe, search and compare), counted per UTC day, source, surface and
 * traffic class.
 *
 * Inputs: POST /api/funnel/events (apps, website), the existing website beacon
 * (POST /api/analytics/product), MCP tool results (search_rvs impressions,
 * get_rv views, compare_rvs) and the lead store (inquiry).
 *
 * Bots: traffic classified as a bot (lead-attribution classifyTraffic, on
 * #109's bot-detect categories) is never a funnel step. It only increments a
 * per-category excluded tally so the dashboard can show how much was dropped.
 * AI agents acting for a person (ai_agent_user, every MCP caller that is not
 * a named crawler) are counted, under traffic=ai_agent_user, never as human.
 *
 * Journey: a bounded in-memory trail per session (24 h, 5,000 sessions, 25
 * events each) so a lead can carry the steps that led to it. Memory only: a
 * restart clears it. Unit ids, surfaces, event types and times only.
 *
 * Storage: <data dir>/lead-funnel.json (LEAD_FUNNEL_PATH), counts only, no
 * ids at all. Written only when LEAD_TRACKING_ENABLED, atomically, debounced
 * 5 s, flushed and then stopped by the data-dir freeze.
 */
import { createHash } from "node:crypto";
import { readJsonWithBackup, writeFileAtomic } from "./atomic-file";
import { dataDirAcceptsWrites, isDataDirFrozen, registerDataWriter } from "./data-dir-freeze";
import {
  MAX_JOURNEY_EVENTS, emptyJourney,
  type JourneyEventType, type JourneySummary, type LeadRequestContext, type LeadSource, type LeadSurface, type TrafficClass,
} from "./lead-attribution";
import { funnelPath, funnelRetentionDays, leadTrackingEnabled } from "./lead-tracking-config";
import { captureLeadAnalyticsEvent } from "./product-analytics";

export const FUNNEL_STEPS = ["impression", "view", "swipe", "favorite", "search", "compare", "inquiry_start", "inquiry"] as const;
export type FunnelStep = typeof FUNNEL_STEPS[number];
const STEP_SET = new Set<string>(FUNNEL_STEPS);

/** The four headline steps, in order. */
export const HEADLINE_FUNNEL: readonly FunnelStep[] = ["impression", "view", "favorite", "inquiry"];

interface FunnelFile { schema_version: 1; days: Record<string, Array<[source: string, surface: string, step: string, traffic: string, count: number]>>; bots: Record<string, Record<string, number>> }

const days = new Map<string, Map<string, number>>();
const bots = new Map<string, Map<string, number>>();
let loaded = false;
let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let persistenceEnabled = process.env.NODE_ENV !== "test" && !process.env.VITEST;
let pathOverride: string | null = null;
const MAX_KEYS_PER_DAY = 5_000;

const file = () => pathOverride ?? funnelPath();
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const keyOf = (source: string, surface: string, step: string, traffic: string) => `${source}\t${surface}\t${step}\t${traffic}`;

function isFunnelFile(v: unknown): v is FunnelFile {
  return Boolean(v) && typeof v === "object" && typeof (v as FunnelFile).days === "object";
}

function load(): void {
  if (loaded) return;
  loaded = true;
  if (!persistenceEnabled) return;
  const read = readJsonWithBackup(file(), isFunnelFile);
  for (const [day, rows] of Object.entries(read.value?.days ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(rows)) continue;
    const m = new Map<string, number>();
    for (const r of rows) if (Array.isArray(r) && r.length === 5 && typeof r[4] === "number" && r[4] > 0 && STEP_SET.has(String(r[2]))) m.set(keyOf(String(r[0]), String(r[1]), String(r[2]), String(r[3])), Math.floor(r[4]));
    days.set(day, m);
  }
  for (const [day, cats] of Object.entries(read.value?.bots ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !cats || typeof cats !== "object") continue;
    bots.set(day, new Map(Object.entries(cats).filter(([, n]) => typeof n === "number" && n > 0) as Array<[string, number]>));
  }
  purge();
}

function purge(now = Date.now()): void {
  const cutoff = dayOf(now - funnelRetentionDays() * 86_400_000);
  for (const d of [...days.keys()]) if (d < cutoff) { days.delete(d); dirty = true; }
  for (const d of [...bots.keys()]) if (d < cutoff) { bots.delete(d); dirty = true; }
}

function serialize(): string {
  const out: FunnelFile = { schema_version: 1, days: {}, bots: {} };
  for (const [d, m] of [...days.entries()].sort()) out.days[d] = [...m.entries()].map(([k, n]) => { const [a, b, c, e] = k.split("\t"); return [a, b, c, e, n]; });
  for (const [d, m] of [...bots.entries()].sort()) out.bots[d] = Object.fromEntries(m);
  return JSON.stringify(out);
}

function persistSync(): void {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (!persistenceEnabled) { dirty = false; return; }
  // Nothing changed since the last write (always the case while LEAD_TRACKING_ENABLED is off): never create or touch the file.
  if (!dirty) return;
  try {
    purge();
    writeFileAtomic(file(), serialize());
    dirty = false;
  } catch (err) {
    dirty = true;
    console.warn(`[lead-tracking] could not persist funnel counters: ${err instanceof Error ? (err as NodeJS.ErrnoException).code ?? err.name : "error"}`);
  }
}

function persistSoon(): void {
  dirty = true;
  if (!persistenceEnabled || !dataDirAcceptsWrites() || saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; persistSync(); }, 5_000);
  saveTimer.unref?.();
}

registerDataWriter({ name: "lead-funnel", pending: () => persistenceEnabled && (dirty || saveTimer != null), flush: persistSync });

// ── Session journey (memory only) ──────────────────────────────────────────

const TRAIL_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 5_000;
interface Trail { lastAt: number; journey: JourneySummary }
const trails = new Map<string, Trail>();

/** Hashed key for a session/device/agent session. Raw ids are never used as map keys or logged. */
export function sessionKeyFor(ctx: Pick<LeadRequestContext, "attribution" | "agent"> | null | undefined): string | null {
  if (!ctx) return null;
  const a = ctx.attribution;
  const raw = a.session_id ? `s:${a.session_id}` : a.device_id ? `d:${a.device_id}` : a.anonymous_id ? `a:${a.anonymous_id}` : ctx.agent?.sessionHash ? `m:${ctx.agent.sessionHash}` : null;
  return raw ? createHash("sha256").update(`lead-journey:${raw}`).digest("hex").slice(0, 32) : null;
}

const COUNT_FOR: Partial<Record<JourneyEventType, keyof JourneySummary["counts"]>> = {
  view: "views", swipe: "swipes", favorite: "favorites", search: "searches", impression: "impressions", compare: "compares",
};

function noteJourney(key: string, type: JourneyEventType, surface: LeadSurface | null, unitId: string | null, now: number): void {
  let t = trails.get(key);
  if (t && now - t.lastAt > TRAIL_TTL_MS) { trails.delete(key); t = undefined; }
  if (!t) {
    if (trails.size >= MAX_SESSIONS) {
      const oldest = [...trails.entries()].sort((a, b) => a[1].lastAt - b[1].lastAt).slice(0, Math.ceil(MAX_SESSIONS / 10));
      for (const [k] of oldest) trails.delete(k);
    }
    t = { lastAt: now, journey: { ...emptyJourney(), source: "server" } };
    trails.set(key, t);
  }
  t.lastAt = now;
  const at = new Date(now).toISOString();
  const j = t.journey;
  const c = COUNT_FOR[type];
  if (c) j.counts[c] += 1;
  j.first_at ??= at;
  j.last_at = at;
  // Impressions are frequent and low-signal: counted, not listed.
  if (type !== "impression") {
    j.events.push({ type, at, surface, unit_id: unitId });
    if (j.events.length > MAX_JOURNEY_EVENTS) j.events.splice(0, j.events.length - MAX_JOURNEY_EVENTS);
  }
}

export function journeyForSession(key: string, now = Date.now()): JourneySummary | null {
  const t = trails.get(key);
  if (!t || now - t.lastAt > TRAIL_TTL_MS) return null;
  return structuredClone(t.journey);
}

// ── Recording ──────────────────────────────────────────────────────────────

export interface FunnelStepInput {
  step: FunnelStep;
  source: LeadSource;
  surface: LeadSurface | null;
  traffic: TrafficClass;
  botCategory?: string;
  sessionKey?: string | null;
  unitId?: string | null;
  count?: number;
  now?: number;
  /** Forward to PostHog. Off for high-volume server-side impressions. */
  forward?: boolean;
}

/** Count one funnel step. Bot traffic only increments the excluded tally. Never throws. */
export function recordFunnelStep(input: FunnelStepInput): void {
  try {
    if (!leadTrackingEnabled() || !STEP_SET.has(input.step)) return;
    if (isDataDirFrozen() || !dataDirAcceptsWrites()) return;
    load();
    const now = input.now ?? Date.now();
    const day = dayOf(now);
    const count = Math.max(1, Math.min(1_000, Math.floor(input.count ?? 1)));
    if (input.traffic === "bot") {
      let m = bots.get(day);
      if (!m) { m = new Map(); bots.set(day, m); }
      const cat = /^[a-z_]{1,40}$/.test(input.botCategory ?? "") ? input.botCategory! : "other_crawler";
      m.set(cat, (m.get(cat) ?? 0) + count);
      persistSoon();
      return;
    }
    let m = days.get(day);
    if (!m) { m = new Map(); days.set(day, m); purge(now); }
    let key = keyOf(input.source, input.surface ?? "other", input.step, input.traffic);
    if (!m.has(key) && m.size >= MAX_KEYS_PER_DAY) key = keyOf("unknown", "other", input.step, input.traffic);
    m.set(key, (m.get(key) ?? 0) + count);
    persistSoon();
    if (input.sessionKey && input.step !== "inquiry") noteJourney(input.sessionKey, input.step as JourneyEventType, input.surface, input.unitId ?? null, now);
    if (input.forward !== false && input.step !== "inquiry") {
      captureLeadAnalyticsEvent("lead_funnel_step", { funnel_step: input.step, lead_source: input.source, lead_surface: input.surface ?? "other", traffic: input.traffic, ...(count > 1 ? { step_count: count } : {}), ...(input.unitId ? { listing_id: input.unitId } : {}) }, input.sessionKey ?? null);
    }
  } catch {
    /* fail open */
  }
}

export interface FunnelRow { day: string; source: string; surface: string; step: FunnelStep; traffic: string; count: number }

export function funnelRows(from: string, to: string): FunnelRow[] {
  load();
  const out: FunnelRow[] = [];
  for (const [day, m] of days) {
    if (day < from || day > to) continue;
    for (const [k, count] of m) {
      const [source, surface, step, traffic] = k.split("\t");
      out.push({ day, source, surface, step: step as FunnelStep, traffic, count });
    }
  }
  return out;
}

export function botExclusions(from: string, to: string): Record<string, number> {
  load();
  const out: Record<string, number> = {};
  for (const [day, m] of bots) {
    if (day < from || day > to) continue;
    for (const [cat, n] of m) out[cat] = (out[cat] ?? 0) + n;
  }
  return out;
}

// ── Test hooks ─────────────────────────────────────────────────────────────

export function __resetLeadFunnel(): void {
  days.clear(); bots.clear(); trails.clear();
  loaded = true; dirty = false;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
}
export function __setFunnelPersistenceForTests(enabled: boolean, filePath?: string): void {
  persistenceEnabled = enabled;
  pathOverride = filePath ?? null;
}
export function __flushLeadFunnel(): void { persistSync(); }
export function __reloadLeadFunnel(): void {
  days.clear(); bots.clear(); loaded = false; dirty = false;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  load();
}
