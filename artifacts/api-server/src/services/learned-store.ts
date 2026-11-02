/**
 * Outfitter memory for the API server — scoped, never shared between shoppers.
 *
 * Two layers:
 *
 *  1. CURATED (shared, read-only at runtime). Facts MatchRV staff have
 *     reviewed and committed to a JSON file (CURATED_FACTS_PATH, default
 *     ./data/curated-facts.json). Every shopper may read them; no MCP tool or
 *     HTTP route can write to them.
 *  2. SESSION (per shopper / per conversation, read-write only through the
 *     write-annotated `teach_outfitter` tool). Keyed by a session scope
 *     resolved from the MCP request (ChatGPT's anonymous `openai/subject`,
 *     the MCP session id, or an opaque `session_key` MatchRV issued earlier
 *     in the same conversation). Nothing one shopper teaches is visible to
 *     another scope. Scopes are stored under a SHA-256 hash of the key,
 *     expire after SESSION_TTL_DAYS of inactivity and are persisted next to
 *     LEARNED_FACTS_PATH (session-memory.json) so a returning shopper keeps
 *     their own facts across deploys.
 *
 * The pre-v2.1 shared file at LEARNED_FACTS_PATH (which mixed facts taught by
 * different shoppers) is intentionally NOT loaded for answers any more.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { LearnedStore, type CanonicalUnit, type LearnedVehicle } from "@workspace/agent-core";

const SESSION_TTL_MS = Number(process.env.SESSION_MEMORY_TTL_DAYS ?? 30) * 24 * 60 * 60 * 1000;
const MAX_SCOPES = 20_000;

function sessionFilePath(): string {
  if (process.env.SESSION_MEMORY_PATH) return resolve(process.env.SESSION_MEMORY_PATH);
  const legacy = resolve(process.env.LEARNED_FACTS_PATH ?? "data/learned-facts.json");
  return resolve(dirname(legacy), "session-memory.json");
}
const curatedPath = () => resolve(process.env.CURATED_FACTS_PATH ?? "data/curated-facts.json");

let curated: LearnedStore | null = null;
const scopes = new Map<string, { store: LearnedStore; touchedAt: number }>();
let scopesLoaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let persistenceEnabled = process.env.NODE_ENV !== "test" && !process.env.VITEST;

/** Shared, curated, read-only facts. */
export function getCuratedStore(): LearnedStore {
  if (curated) return curated;
  curated = new LearnedStore();
  try {
    const p = curatedPath();
    if (existsSync(p)) curated.restore(JSON.parse(readFileSync(p, "utf8")));
  } catch (err) {
    console.warn("[learning] could not load curated facts:", err instanceof Error ? err.message : err);
  }
  return curated;
}

export type ScopeSource = "openai_subject" | "openai_session" | "mcp_session" | "session_key" | "none";
export interface MemoryScope { id: string | null; source: ScopeSource; sessionKey: string | null }

const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex").slice(0, 40);

/**
 * Resolve which shopper scope a request belongs to. Host-provided identity
 * wins over a model-supplied key, so a key copied from another conversation
 * cannot read a ChatGPT user's memory.
 */
export function resolveScope(ctx: unknown, sessionKey?: string | null): MemoryScope {
  const c = (ctx ?? {}) as { sessionId?: string; mcpReq?: { _meta?: Record<string, unknown> }; http?: { req?: Request } };
  const meta = c.mcpReq?._meta ?? {};
  const subject = typeof meta["openai/subject"] === "string" ? (meta["openai/subject"] as string) : null;
  if (subject) return { id: hashKey(`oai:${subject}`), source: "openai_subject", sessionKey: null };
  const oaiSession = typeof meta["openai/session"] === "string" ? (meta["openai/session"] as string) : null;
  if (oaiSession) return { id: hashKey(`oais:${oaiSession}`), source: "openai_session", sessionKey: null };
  const sid = c.sessionId ?? c.http?.req?.headers?.get?.("mcp-session-id") ?? null;
  if (sid) return { id: hashKey(`mcp:${sid}`), source: "mcp_session", sessionKey: null };
  if (sessionKey && /^mrs_[A-Za-z0-9_-]{20,64}$/.test(sessionKey)) return { id: hashKey(`key:${sessionKey}`), source: "session_key", sessionKey };
  return { id: null, source: "none", sessionKey: null };
}

export function newSessionKey(): string {
  return `mrs_${randomBytes(18).toString("base64url")}`;
}

function loadScopes(): void {
  if (scopesLoaded) return;
  scopesLoaded = true;
  if (!persistenceEnabled) return;
  try {
    const p = sessionFilePath();
    if (!existsSync(p)) return;
    const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, { touchedAt: number; data: Parameters<LearnedStore["restore"]>[0] }>;
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [id, entry] of Object.entries(raw)) {
      if (entry.touchedAt < cutoff) continue;
      const store = new LearnedStore();
      store.restore(entry.data);
      scopes.set(id, { store, touchedAt: entry.touchedAt });
    }
  } catch (err) {
    console.warn("[learning] could not restore session memory:", err instanceof Error ? err.message : err);
  }
}

function sweep(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of scopes) if (s.touchedAt < cutoff) scopes.delete(id);
  if (scopes.size > MAX_SCOPES) {
    const oldest = [...scopes.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt).slice(0, scopes.size - MAX_SCOPES);
    for (const [id] of oldest) scopes.delete(id);
  }
}

/** Read-only view of a scope (null when nothing was taught there). Never creates state. */
export function peekScope(scope: MemoryScope): LearnedStore | null {
  if (!scope.id) return null;
  loadScopes();
  const s = scopes.get(scope.id);
  if (!s || s.touchedAt < Date.now() - SESSION_TTL_MS) return null;
  return s.store;
}

/** Writable store for a scope. ONLY write-annotated tools may call this. */
export function writableScope(scope: MemoryScope): LearnedStore {
  if (!scope.id) throw new Error("no_memory_scope");
  loadScopes();
  let s = scopes.get(scope.id);
  if (!s) { s = { store: new LearnedStore(), touchedAt: Date.now() }; scopes.set(scope.id, s); sweep(); }
  s.touchedAt = Date.now();
  persistSoon();
  return s.store;
}

/** Recall a vehicle: the shopper's own scope first, then curated facts. */
export function recallVehicle(scope: MemoryScope, vehicle: string): (LearnedVehicle & { layer: "session" | "curated" }) | null {
  const own = peekScope(scope)?.recallVehicle(vehicle);
  if (own) return { ...own, layer: "session" };
  const shared = getCuratedStore().recallVehicle(vehicle);
  return shared ? { ...shared, layer: "curated" } : null;
}

/** Overlay curated then the shopper's own unit facts (copy-on-write; inputs untouched). */
export function applyMemory(scope: MemoryScope, units: CanonicalUnit[]): CanonicalUnit[] {
  const own = peekScope(scope);
  const withCurated = getCuratedStore().applyToCorpus(units);
  return own ? own.applyToCorpus(withCurated) : withCurated;
}
/** Units whose facts memory can change for this scope (curated + the shopper's own). */
export function memoryTouchedUnitIds(scope: MemoryScope): string[] {
  const own = peekScope(scope);
  return [...new Set([...getCuratedStore().touchedUnitIds(), ...(own ? own.touchedUnitIds() : [])])];
}
export function applyMemoryToUnit(scope: MemoryScope, unit: CanonicalUnit): CanonicalUnit {
  return applyMemory(scope, [unit])[0];
}

/** Deterministic fingerprint of all memory, for tests asserting read-only tools change nothing. */
export function memoryFingerprint(): string {
  const parts = [JSON.stringify(getCuratedStore().serialize())];
  for (const [id, s] of [...scopes.entries()].sort(([a], [b]) => a.localeCompare(b))) parts.push(id, String(s.touchedAt), JSON.stringify(s.store.serialize()));
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

function persistSoon(): void {
  if (!persistenceEnabled || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const out: Record<string, unknown> = {};
    for (const [id, s] of scopes) out[id] = { touchedAt: s.touchedAt, data: s.store.serialize() };
    try {
      const p = sessionFilePath();
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, JSON.stringify(out));
    } catch (err) {
      console.warn("[learning] could not persist session memory:", err instanceof Error ? err.message : err);
    }
  }, 400);
}

/** Test hooks. */
export function __resetMemory(): void { scopes.clear(); curated = null; scopesLoaded = true; }
export function __setCurated(store: LearnedStore): void { curated = store; }
export function __enablePersistence(on: boolean): void { persistenceEnabled = on; }
