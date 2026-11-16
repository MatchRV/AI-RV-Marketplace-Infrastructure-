/**
 * Per-client attribution for agent traffic.
 *
 * Three tiers, never mixed:
 *
 *   verified_partner  the request carried a valid MatchRV API key. This is the
 *                     only billing-grade tier.
 *   unverified_host   the request looked like a known host (ChatGPT metadata or
 *                     user agent). Anyone can send those values, so this is a
 *                     hint for product analytics and nothing more.
 *   anonymous         neither.
 *
 * What is kept:
 *   - daily counters per tier, client, dealer and event (no per-request rows);
 *   - a 24-hour in-memory trail of which units a session touched, so an
 *     inquiry can say when that session first saw the unit. The trail is not
 *     written to disk and is lost on restart.
 *
 * What is never kept here: shopper names, contact details, messages, search
 * text, IP addresses, user agents, API keys or confirmation tokens. Sessions
 * are stored only as a salted SHA-256 prefix.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { dataDir, readJsonWithBackup, writeFileAtomic } from "./atomic-file";
import { dataDirAcceptsWrites, registerDataWriter } from "./data-dir-freeze";
import type { AgentClientLimits, AgentScope } from "./agent-clients";

export type AttributionTier = "verified_partner" | "unverified_host" | "anonymous";
export type AttributionSurface = "mcp" | "mcp_v1" | "website";

export interface AttributionContext {
  surface: AttributionSurface;
  tier: AttributionTier;
  /** Set only for verified_partner. */
  clientId: string | null;
  clientName: string | null;
  /** Set only for unverified_host, e.g. "chatgpt_app". A label, not an identity. */
  hostLabel: string | null;
  sessionHash: string | null;
  scopes: AgentScope[];
  limits: AgentClientLimits | null;
  /** A key was presented and rejected (malformed, unknown or revoked). */
  rejectedKey: boolean;
}

export const ANONYMOUS_CONTEXT: AttributionContext = Object.freeze({
  surface: "mcp", tier: "anonymous", clientId: null, clientName: null, hostLabel: null, sessionHash: null, scopes: [], limits: null, rejectedKey: false,
}) as AttributionContext;

const storage = new AsyncLocalStorage<AttributionContext>();
export function runWithAttribution<T>(ctx: AttributionContext, fn: () => T): T { return storage.run(ctx, fn); }
export function currentAttribution(): AttributionContext | null { return storage.getStore() ?? null; }

/** The identity a confirmation token is bound to: a verified client id, or null for everyone else. */
export function boundClientId(ctx: AttributionContext | null | undefined): string | null {
  return ctx && ctx.tier === "verified_partner" && ctx.clientId ? ctx.clientId : null;
}

export function hashSession(namespace: string, raw: string): string {
  return createHash("sha256").update(`attr:${namespace}:${raw}`).digest("hex").slice(0, 32);
}

// ── Events and counters ────────────────────────────────────────────────────

export const ATTRIBUTION_EVENTS = [
  "search", "impression", "detail_view", "compare", "tow_check", "inquiry_preview", "inquiry_client_mismatch", "rate_limited",
] as const;
export type AttributionEvent = typeof ATTRIBUTION_EVENTS[number];
const EVENT_SET = new Set<string>(ATTRIBUTION_EVENTS);

export const NO_DEALER = "-";
const OVERFLOW_DEALER = "(other)";
const MAX_KEYS_PER_DAY = 20_000;
const DEALER_RE = /^[A-Za-z0-9][A-Za-z0-9.:_-]{0,119}$/;

const retentionDays = () => {
  const n = Number(process.env.ATTRIBUTION_RETENTION_DAYS ?? 90);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 90;
};
const warnBytes = () => {
  const n = Number(process.env.ATTRIBUTION_WARN_BYTES ?? 20 * 1024 * 1024);
  return Number.isFinite(n) && n > 0 ? n : 20 * 1024 * 1024;
};

type Row = [tier: AttributionTier, client: string, dealer: string, event: AttributionEvent, count: number];
interface CounterFile { version: 1; days: Record<string, Row[]> }

const days = new Map<string, Map<string, number>>();
let loaded = false;
let loadedFrom: "main" | "backup" | "none" = "none";
let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let persistenceEnabled = process.env.NODE_ENV !== "test" && !process.env.VITEST;
let pathOverride: string | null = null;
let lastBackupDay: string | null = null;
let droppedKeys = 0;
let lastWriteBytes = 0;
let lastWriteError: string | null = null;
let warnedSizeAt = 0;
let warnedWriteAt = 0;
const SAVE_DELAY_MS = 5_000;

export function attributionPath(): string {
  if (pathOverride) return pathOverride;
  if (process.env.ATTRIBUTION_PATH) return resolve(process.env.ATTRIBUTION_PATH);
  return resolve(dataDir(), "agent-attribution.json");
}

const dayOf = (now: Date) => now.toISOString().slice(0, 10);
const keyOf = (tier: string, client: string, dealer: string, event: string) => `${tier}\t${client}\t${dealer}\t${event}`;

/** Counter label for a context: the client id for a partner, the host label for a host hint, "-" otherwise. */
export function clientLabel(ctx: AttributionContext): string {
  if (ctx.tier === "verified_partner") return ctx.clientId ?? "-";
  if (ctx.tier === "unverified_host") return ctx.hostLabel ?? "-";
  return "-";
}

function isCounterFile(value: unknown): value is CounterFile {
  return Boolean(value) && typeof value === "object" && typeof (value as CounterFile).days === "object" && (value as CounterFile).days !== null;
}

function load(): void {
  if (loaded) return;
  loaded = true;
  if (!persistenceEnabled) return;
  const read = readJsonWithBackup(attributionPath(), isCounterFile);
  loadedFrom = read.source;
  if (read.source === "backup") console.warn("[attribution] counter file unreadable; restored from its .bak copy");
  for (const [day, rows] of Object.entries(read.value?.days ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(rows)) continue;
    const map = new Map<string, number>();
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 5) continue;
      const [tier, client, dealer, event, count] = row;
      if (typeof count !== "number" || !Number.isFinite(count) || count <= 0 || !EVENT_SET.has(event)) continue;
      map.set(keyOf(tier, String(client), String(dealer), event), Math.floor(count));
    }
    if (map.size) days.set(day, map);
  }
  purgeAttribution();
}

/** Drop counter days older than the retention window. Returns how many days were removed. */
export function purgeAttribution(now = new Date()): number {
  const cutoff = dayOf(new Date(now.getTime() - retentionDays() * 86_400_000));
  let removed = 0;
  for (const day of [...days.keys()]) {
    if (day < cutoff) { days.delete(day); removed += 1; }
  }
  if (removed) dirty = true;
  return removed;
}

function serialize(): string {
  const out: CounterFile = { version: 1, days: {} };
  for (const [day, map] of [...days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    out.days[day] = [...map.entries()].map(([key, count]) => {
      const [tier, client, dealer, event] = key.split("\t");
      return [tier as AttributionTier, client, dealer, event as AttributionEvent, count];
    });
  }
  return JSON.stringify(out);
}

function persistSync(): void {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (!persistenceEnabled) { dirty = false; return; }
  try {
    purgeAttribution();
    const body = serialize();
    const today = dayOf(new Date());
    // One restore point per UTC day: the first write of a day keeps yesterday's file as .bak.
    const backup = lastBackupDay !== today;
    writeFileAtomic(attributionPath(), body, { backup });
    if (backup) lastBackupDay = today;
    dirty = false;
    lastWriteBytes = Buffer.byteLength(body);
    lastWriteError = null;
    if (lastWriteBytes > warnBytes() && Date.now() - warnedSizeAt > 3_600_000) {
      warnedSizeAt = Date.now();
      console.warn(`[attribution] counter file is ${lastWriteBytes} bytes, above the ${warnBytes()} byte warning line`);
    }
  } catch (err) {
    dirty = true;
    lastWriteError = err instanceof Error ? (err as NodeJS.ErrnoException).code ?? err.name : "error";
    if (Date.now() - warnedWriteAt > 600_000) {
      warnedWriteAt = Date.now();
      console.warn(`[attribution] could not persist counters: ${lastWriteError}`);
    }
  }
}

function persistSoon(): void {
  dirty = true;
  if (!persistenceEnabled || !dataDirAcceptsWrites() || saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; persistSync(); }, SAVE_DELAY_MS);
  saveTimer.unref?.();
}

registerDataWriter({ name: "agent-attribution", pending: () => persistenceEnabled && (dirty || saveTimer != null), flush: persistSync });

/** Count one event. Never throws: attribution must not change how a tool call is answered. */
export function recordAttributionEvent(ctx: AttributionContext | null, event: AttributionEvent, dealerId?: string | null, count = 1, now = new Date()): void {
  try {
    if (!EVENT_SET.has(event) || !(count > 0)) return;
    load();
    const c = ctx ?? ANONYMOUS_CONTEXT;
    const day = dayOf(now);
    let map = days.get(day);
    if (!map) { map = new Map(); days.set(day, map); purgeAttribution(now); }
    let dealer = dealerId && DEALER_RE.test(dealerId) ? dealerId : NO_DEALER;
    let key = keyOf(c.tier, clientLabel(c), dealer, event);
    if (!map.has(key) && map.size >= MAX_KEYS_PER_DAY) {
      droppedKeys += 1;
      dealer = OVERFLOW_DEALER;
      key = keyOf(c.tier, clientLabel(c), dealer, event);
    }
    map.set(key, (map.get(key) ?? 0) + Math.floor(count));
    persistSoon();
  } catch {
    /* fail open */
  }
}

export interface CounterRow { day: string; tier: AttributionTier; client: string; dealer: string; event: AttributionEvent; count: number }

/** Counter rows for an inclusive UTC day range. */
export function attributionRows(from: string, to: string): CounterRow[] {
  load();
  const out: CounterRow[] = [];
  for (const [day, map] of days) {
    if (day < from || day > to) continue;
    for (const [key, count] of map) {
      const [tier, client, dealer, event] = key.split("\t");
      out.push({ day, tier: tier as AttributionTier, client, dealer, event: event as AttributionEvent, count });
    }
  }
  return out;
}

// ── Session trail (memory only) ────────────────────────────────────────────

const TRAIL_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 5_000;
const MAX_UNITS_PER_SESSION = 200;
interface Trail { lastAt: number; units: Map<string, { firstAt: number; touches: number }> }
const trails = new Map<string, Trail>();

const trailKey = (ctx: AttributionContext) => (ctx.sessionHash ? `${ctx.tier}:${clientLabel(ctx)}:${ctx.sessionHash}` : null);

export function touchUnits(ctx: AttributionContext | null, unitIds: readonly string[], now = Date.now()): void {
  try {
    const key = ctx ? trailKey(ctx) : null;
    if (!key || unitIds.length === 0) return;
    let trail = trails.get(key);
    if (trail && now - trail.lastAt > TRAIL_TTL_MS) { trails.delete(key); trail = undefined; }
    if (!trail) {
      if (trails.size >= MAX_SESSIONS) {
        const oldest = [...trails.entries()].sort((a, b) => a[1].lastAt - b[1].lastAt).slice(0, Math.ceil(MAX_SESSIONS / 10));
        for (const [k] of oldest) trails.delete(k);
      }
      trail = { lastAt: now, units: new Map() };
      trails.set(key, trail);
    }
    trail.lastAt = now;
    for (const id of unitIds) {
      const seen = trail.units.get(id);
      if (seen) seen.touches += 1;
      else if (trail.units.size < MAX_UNITS_PER_SESSION) trail.units.set(id, { firstAt: now, touches: 1 });
    }
  } catch {
    /* fail open */
  }
}

export function unitTrail(ctx: AttributionContext | null, unitId: string, now = Date.now()): { firstTouchAt: string; touches: number } | null {
  const key = ctx ? trailKey(ctx) : null;
  const trail = key ? trails.get(key) : undefined;
  if (!trail || now - trail.lastAt > TRAIL_TTL_MS) return null;
  const seen = trail.units.get(unitId);
  return seen ? { firstTouchAt: new Date(seen.firstAt).toISOString(), touches: seen.touches } : null;
}

// ── What gets stamped on a stored inquiry ──────────────────────────────────

export interface InquiryAttribution {
  surface: AttributionSurface;
  tier: AttributionTier;
  clientId: string | null;
  clientName: string | null;
  hostLabel: string | null;
  /** True only for a valid API key. Host labels and anonymous traffic are never billing-grade. */
  billingGrade: boolean;
  sessionHash: string | null;
  firstTouchAt: string | null;
  touches: number;
}

export function inquiryAttribution(ctx: AttributionContext | null, unitId: string, now = Date.now()): InquiryAttribution {
  const c = ctx ?? ANONYMOUS_CONTEXT;
  const trail = unitTrail(c, unitId, now);
  return {
    surface: c.surface,
    tier: c.tier,
    clientId: c.tier === "verified_partner" ? c.clientId : null,
    clientName: c.tier === "verified_partner" ? c.clientName : null,
    hostLabel: c.tier === "unverified_host" ? c.hostLabel : null,
    billingGrade: c.tier === "verified_partner" && Boolean(c.clientId),
    sessionHash: c.sessionHash,
    firstTouchAt: trail?.firstTouchAt ?? null,
    touches: trail?.touches ?? 0,
  };
}

// ── Per-client request budget ──────────────────────────────────────────────

const windows = new Map<string, { start: number; count: number }>();
/** Fixed one-minute window per verified client. Unkeyed traffic is never limited here. */
export function allowClientRequest(clientId: string, perMinute: number, now = Date.now()): boolean {
  const w = windows.get(clientId);
  if (!w || now - w.start >= 60_000) { windows.set(clientId, { start: now, count: 1 }); return true; }
  w.count += 1;
  return w.count <= perMinute;
}

// ── Monitoring ─────────────────────────────────────────────────────────────

export function attributionStatus() {
  load();
  let keys = 0;
  for (const map of days.values()) keys += map.size;
  return {
    path: attributionPath(), days: days.size, counterKeys: keys, retentionDays: retentionDays(), pendingWrite: dirty || saveTimer != null,
    lastWriteBytes, lastWriteError, droppedKeys, loadedFrom, sessionsInMemory: trails.size, warnBytes: warnBytes(),
  };
}

/** Test hooks. */
export function __resetAttribution(): void {
  days.clear(); trails.clear(); windows.clear();
  loaded = true; loadedFrom = "none"; dirty = false; droppedKeys = 0; lastBackupDay = null; lastWriteBytes = 0; lastWriteError = null;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
}
export function __setAttributionPersistenceForTests(enabled: boolean, filePath?: string): void {
  persistenceEnabled = enabled;
  pathOverride = filePath ?? null;
}
export function __reloadAttribution(): void {
  days.clear(); loaded = false; dirty = false; lastBackupDay = null;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  load();
}
export function __flushAttribution(): void { persistSync(); }
export function __attributionSnapshot(): string { return serialize(); }
