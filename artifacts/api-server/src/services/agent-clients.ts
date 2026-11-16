/**
 * Agent client registry: the API keys MatchRV issues to third-party AI
 * integrations.
 *
 * A key is the only thing that makes traffic "verified". Host metadata and
 * user agents are hints anyone can forge; see services/attribution.ts.
 *
 * - The full key is shown once, when it is created. Only its SHA-256 is
 *   stored, so the registry file cannot be used to call the API.
 * - Keys look like `mrv_<12 hex id>_<secret>`. The id part is public
 *   (`agc_<id>` is the client id used in reports); the secret is 32 random
 *   bytes.
 * - Revoking is immediate and permanent. Rotation is "create a new key, then
 *   revoke the old one".
 * - The registry is one small JSON file in the data directory, written
 *   atomically with a `.bak` of the previous version.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { dataDir, readJsonWithBackup, writeFileAtomic } from "./atomic-file";
import { DataDirFrozenError, isDataDirFrozen } from "./data-dir-freeze";

export type AgentScope = "read" | "inquiry";
export const AGENT_SCOPES: readonly AgentScope[] = ["read", "inquiry"];

export interface AgentClientLimits {
  requestsPerMinute: number;
  inquiriesPerHour: number;
  /** Unit records (search rows, details, compared units) served per UTC day on /mcp/v1. */
  unitsPerDay: number;
}
export const DEFAULT_AGENT_LIMITS: AgentClientLimits = { requestsPerMinute: 120, inquiriesPerHour: 30, unitsPerDay: 5000 };

export interface AgentClient {
  id: string;
  name: string;
  keyHash: string;
  /** Last four characters of the key, so an operator can tell two keys apart. */
  keyHint: string;
  scopes: AgentScope[];
  status: "active" | "revoked";
  createdAt: string;
  revokedAt: string | null;
  limits: AgentClientLimits;
}

/** What ops endpoints return: everything except the key hash. */
export type PublicAgentClient = Omit<AgentClient, "keyHash"> & { lastUsedOn: string | null };

interface RegistryFile { version: 1; clients: AgentClient[] }

const KEY_RE = /^mrv_([a-f0-9]{12})_([A-Za-z0-9_-]{40,64})$/;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .&'()_-]{1,59}$/u;

const clients = new Map<string, AgentClient>();
const lastUsed = new Map<string, string>();
let loaded = false;
let loadedFrom: "main" | "backup" | "none" = "none";
let persistenceEnabled = process.env.NODE_ENV !== "test" && !process.env.VITEST;
let pathOverride: string | null = null;

export function agentClientsPath(): string {
  if (pathOverride) return pathOverride;
  if (process.env.AGENT_CLIENTS_PATH) return resolve(process.env.AGENT_CLIENTS_PATH);
  return resolve(dataDir(), "agent-clients.json");
}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

function isRegistry(value: unknown): value is RegistryFile {
  return Boolean(value) && typeof value === "object" && Array.isArray((value as RegistryFile).clients)
    && (value as RegistryFile).clients.every((c) => c && typeof c.id === "string" && typeof c.keyHash === "string");
}

function load(): void {
  if (loaded) return;
  loaded = true;
  if (!persistenceEnabled) return;
  const read = readJsonWithBackup(agentClientsPath(), isRegistry);
  loadedFrom = read.source;
  if (read.source === "backup") console.warn("[agent-clients] registry file unreadable; restored from its .bak copy");
  for (const c of read.value?.clients ?? []) clients.set(c.id, c);
}

function persist(): void {
  if (!persistenceEnabled) return;
  const body: RegistryFile = { version: 1, clients: [...clients.values()] };
  writeFileAtomic(agentClientsPath(), JSON.stringify(body, null, 1), { backup: true });
}

function toPublic(c: AgentClient): PublicAgentClient {
  const { keyHash: _keyHash, ...rest } = c;
  // Keys stored before a limit existed get its default.
  return { ...rest, limits: { ...DEFAULT_AGENT_LIMITS, ...rest.limits }, lastUsedOn: lastUsed.get(c.id) ?? null };
}

function cleanLimits(raw: unknown): AgentClientLimits {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const int = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
  return {
    requestsPerMinute: int(r.requestsPerMinute, 1, 6000, DEFAULT_AGENT_LIMITS.requestsPerMinute),
    inquiriesPerHour: int(r.inquiriesPerHour, 0, 1000, DEFAULT_AGENT_LIMITS.inquiriesPerHour),
    unitsPerDay: int(r.unitsPerDay, 0, 1_000_000, DEFAULT_AGENT_LIMITS.unitsPerDay),
  };
}

export type CreateClientResult =
  | { ok: true; client: PublicAgentClient; key: string }
  | { ok: false; code: "invalid_name" | "invalid_scopes" | "name_taken" };

/**
 * Issue a key. The returned `key` is never stored and cannot be shown again.
 * Throws DataDirFrozenError while the data directory is frozen, and rethrows a
 * failed write so the caller never hands out a key that was not saved.
 */
export function createAgentClient(input: { name?: unknown; scopes?: unknown; limits?: unknown }, now = new Date()): CreateClientResult {
  if (isDataDirFrozen()) throw new DataDirFrozenError();
  load();
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (!NAME_RE.test(name)) return { ok: false, code: "invalid_name" };
  const rawScopes = input.scopes === undefined ? ["read"] : input.scopes;
  if (!Array.isArray(rawScopes) || rawScopes.length === 0 || !rawScopes.every((s) => (AGENT_SCOPES as readonly unknown[]).includes(s))) {
    return { ok: false, code: "invalid_scopes" };
  }
  const lower = name.toLowerCase();
  if ([...clients.values()].some((c) => c.status === "active" && c.name.toLowerCase() === lower)) return { ok: false, code: "name_taken" };
  let idPart = randomBytes(6).toString("hex");
  while (clients.has(`agc_${idPart}`)) idPart = randomBytes(6).toString("hex");
  const key = `mrv_${idPart}_${randomBytes(32).toString("base64url")}`;
  const client: AgentClient = {
    id: `agc_${idPart}`,
    name,
    keyHash: hashKey(key),
    keyHint: key.slice(-4),
    scopes: [...new Set(rawScopes as AgentScope[])],
    status: "active",
    createdAt: now.toISOString(),
    revokedAt: null,
    limits: cleanLimits(input.limits),
  };
  clients.set(client.id, client);
  try {
    persist();
  } catch (err) {
    clients.delete(client.id);
    throw err;
  }
  console.log(`[agent-clients] created ${client.id} scopes=${client.scopes.join(",")}`);
  return { ok: true, client: toPublic(client), key };
}

export function revokeAgentClient(id: string, now = new Date()): PublicAgentClient | null {
  if (isDataDirFrozen()) throw new DataDirFrozenError();
  load();
  const client = clients.get(id);
  if (!client) return null;
  if (client.status === "revoked") return toPublic(client);
  client.status = "revoked";
  client.revokedAt = now.toISOString();
  try {
    persist();
  } catch (err) {
    // Stay revoked in memory: a key an operator revoked must stop working even
    // if the disk is full. The caller is told the save failed.
    console.warn(`[agent-clients] ${id} revoked in memory but not saved`);
    throw err;
  }
  console.log(`[agent-clients] revoked ${client.id}`);
  return toPublic(client);
}

export function listAgentClients(): PublicAgentClient[] {
  load();
  return [...clients.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(toPublic);
}

export function getAgentClient(id: string): PublicAgentClient | null {
  load();
  const c = clients.get(id);
  return c ? toPublic(c) : null;
}

export type KeyCheck =
  | { status: "none" }
  | { status: "invalid"; reason: "malformed" | "unknown" | "revoked" }
  | { status: "ok"; client: PublicAgentClient };

/** Check a presented key. `none` means nothing key-shaped was presented at all. */
export function checkAgentKey(raw: string | null | undefined, now = new Date()): KeyCheck {
  const key = (raw ?? "").trim();
  if (!key) return { status: "none" };
  const m = KEY_RE.exec(key);
  if (!m) return { status: "invalid", reason: "malformed" };
  load();
  const client = clients.get(`agc_${m[1]}`);
  // Hash and compare even for an unknown id so both paths cost the same.
  const presented = Buffer.from(hashKey(key), "hex");
  const stored = Buffer.from(client?.keyHash ?? "0".repeat(64), "hex");
  const match = presented.length === stored.length && timingSafeEqual(presented, stored);
  if (!client || !match) return { status: "invalid", reason: "unknown" };
  if (client.status !== "active") return { status: "invalid", reason: "revoked" };
  lastUsed.set(client.id, now.toISOString().slice(0, 10));
  return { status: "ok", client: toPublic(client) };
}

/** Pull a MatchRV key out of request headers. Other bearer tokens are ignored, not rejected. */
export function agentKeyFromHeaders(headers: { get(name: string): string | null }): string | null {
  const explicit = headers.get("x-matchrv-key");
  if (explicit && explicit.trim()) return explicit.trim();
  const bearer = /^Bearer\s+(\S+)$/i.exec(headers.get("authorization") ?? "");
  return bearer && bearer[1].startsWith("mrv_") ? bearer[1] : null;
}

export function agentClientsStatus(): { path: string; count: number; active: number; loadedFrom: "main" | "backup" | "none" } {
  load();
  const all = [...clients.values()];
  return { path: agentClientsPath(), count: all.length, active: all.filter((c) => c.status === "active").length, loadedFrom };
}

/** Test hooks. */
export function __resetAgentClients(): void { clients.clear(); lastUsed.clear(); loaded = true; loadedFrom = "none"; }
export function __setAgentClientPersistenceForTests(enabled: boolean, filePath?: string): void {
  persistenceEnabled = enabled;
  pathOverride = filePath ?? null;
}
export function __reloadAgentClients(): void { clients.clear(); lastUsed.clear(); loaded = false; load(); }
