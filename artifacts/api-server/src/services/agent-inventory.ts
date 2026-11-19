/**
 * Loads the committed inventory snapshot once and exposes the indexed
 * corpus to the agent routes. No database dependency — the agent tool layer
 * must work on a fresh clone with zero services.
 */

// Registers the lazy US ZIP → centroid table used by shopper search locations (no I/O until a ZIP is searched).
import "./zip-centroids";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { gunzip, gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import {
  adoptIndexedInventory,
  buildInventoryIndex,
  type InventoryIndex,
  type InventorySnapshot,
} from "@workspace/agent-core";

let index: InventoryIndex | null = null;

/** Which snapshot file the current index came from. Exposed on the localhost-only status route. */
export interface SnapshotVersion {
  /** Short content id: the first 16 hex chars of the sha256 of the file bytes as read (compressed for .gz). */
  version: string;
  sha256: string;
  /** Path the loader opened (may be a symlink) and the file it resolved to. */
  path: string;
  resolvedPath: string;
  sizeBytes: number;
  mtime: string;
  units: number;
  dealers: number | null;
  builtAt: string | null;
  loadedAt: string;
  /** Wall time to read, parse and index (not counting derived caches). */
  loadMs: number;
}

let currentVersion: SnapshotVersion | null = null;

/**
 * Set only while the reloader prepares the next index. Code running inside that
 * preparation (and only there) sees the candidate from getInventory(), so every
 * per-snapshot cache can be filled before the swap. Requests never run inside it.
 */
const preparing = new AsyncLocalStorage<{ inv: InventoryIndex | null }>();

/** INVENTORY_SNAPSHOT_PATH wins; otherwise probe the tsx layout (src/services) and the CJS bundle layout (dist). Plain JSON wins locally; committed form is .gz (GitHub's 100MB limit). */
export function findSnapshot(): string {
  const override = process.env.INVENTORY_SNAPSHOT_PATH?.trim();
  if (override) {
    if (!existsSync(override)) throw new Error(`inventory snapshot not found at INVENTORY_SNAPSHOT_PATH (${override})`);
    return override;
  }
  const here = import.meta.dirname;
  const candidates = [
    resolve(here, "../../../../lib/agent-core/data/inventory.snapshot.json"), // src/services
    resolve(here, "../../lib/agent-core/data/inventory.snapshot.json"), // dist bundle
    resolve(here, "../../../lib/agent-core/data/inventory.snapshot.json"),
    resolve(here, "../../../../lib/agent-core/data/inventory.snapshot.json.gz"),
    resolve(here, "../../lib/agent-core/data/inventory.snapshot.json.gz"),
    resolve(here, "../../../lib/agent-core/data/inventory.snapshot.json.gz"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(`inventory snapshot not found (searched from ${here})`);
}

/** gunzip options sized from the gzip trailer (see readSnapshotBuffer). */
function gunzipOptions(raw: Buffer): { chunkSize: number } | undefined {
  // gunzipSync collects 16 KB chunks and then concatenates them, briefly holding the output twice
  // (~1 GB RSS for a ~500 MB snapshot). The gzip trailer states the decompressed size (mod 2^32), so one
  // output chunk of that size avoids the second copy. The size only sizes the buffer; zlib still checks the data.
  const isize = raw.length >= 18 ? raw.readUInt32LE(raw.length - 4) : 0;
  return isize > 0 && isize < 0x7fff0000 ? { chunkSize: Math.max(64 * 1024, isize + 1024) } : undefined;
}

function decompress(path: string, raw: Buffer): Buffer {
  if (!path.endsWith(".gz")) return raw;
  const opts = gunzipOptions(raw);
  return opts ? gunzipSync(raw, opts) : gunzipSync(raw);
}

/** Same bytes as decompress(), but zlib runs on the libuv threadpool so the event loop keeps serving. */
function decompressAsync(path: string, raw: Buffer): Promise<Buffer> {
  if (!path.endsWith(".gz")) return Promise.resolve(raw);
  const opts = gunzipOptions(raw) ?? {};
  return new Promise((ok, fail) => gunzip(raw, opts, (err, out) => (err ? fail(err) : ok(out))));
}

/**
 * Incremental form of the per-unit parser. step(deadline) parses until it is done or
 * performance.now() passes the deadline (checked between units), so a reload can yield to
 * requests. The values produced are identical to the one-shot parseSnapshotBuffer().
 */
function createSnapshotParser(buf: Buffer) {
  const Q = 0x22, BS = 0x5c, LB = 0x7b, RB = 0x7d, LS = 0x5b, RS = 0x5d, COLON = 0x3a;
  const n = buf.length;
  let depth = 0, i = 0, keyStart = -1, keyEnd = -1;
  let unitsOpen = -1, unitsClose = -1;
  let inUnits = false;
  const units: unknown[] = [];
  const pool = new Map<string, string>();
  let result: InventorySnapshot | null = null;

  function finish(): InventorySnapshot {
    if (unitsOpen < 0) return JSON.parse(buf.toString("utf8")) as InventorySnapshot;
    const head = buf.toString("utf8", 0, unitsOpen) + "[]" + buf.toString("utf8", unitsClose + 1);
    const snap = JSON.parse(head) as InventorySnapshot;
    (snap as { units: unknown[] }).units = units;
    return snap;
  }

  /** Returns true when the document is fully parsed. */
  function step(deadline = Infinity): boolean {
    if (result) return true;
    let sinceCheck = 0;
    while (i < n) {
      if (inUnits) {
        // walk the units array element by element
        while (i < n && (buf[i] === 0x2c || buf[i] <= 0x20)) i++;
        if (buf[i] === RS) { unitsClose = i; i++; inUnits = false; continue; }
        const s = i; let d = 0;
        while (i < n) {
          const b = buf[i];
          if (b === Q) { i++; while (i < n && buf[i] !== Q) i += buf[i] === BS ? 2 : 1; i++; continue; }
          if (b === LB || b === LS) d++;
          else if (b === RB || b === RS) { d--; if (d === 0) { i++; break; } }
          i++;
        }
        const u = JSON.parse(buf.toString("utf8", s, i));
        internStrings(u, pool);
        units.push(u);
        if (++sinceCheck >= 256) { sinceCheck = 0; if (performance.now() >= deadline) return false; }
        continue;
      }
      const c = buf[i];
      if (c === Q) {
        const s = i; i++;
        while (i < n && buf[i] !== Q) i += buf[i] === BS ? 2 : 1;
        if (depth === 1) { keyStart = s; keyEnd = i + 1; }
        i++; continue;
      }
      if (c === LB || c === LS) {
        if (depth === 1 && c === LS && keyEnd > 0 && buf.toString("latin1", keyStart, keyEnd) === '"units"') {
          unitsOpen = i; i++; inUnits = true;
          continue;
        }
        depth++; i++; continue;
      }
      if (c === RB || c === RS) { depth--; i++; continue; }
      if (c === COLON) { i++; continue; }
      i++;
    }
    result = finish();
    return true;
  }

  return { step, result: () => result };
}

/**
 * Parses the snapshot one unit at a time straight from the decompressed bytes, so the whole
 * document never exists as one JS string next to its parsed objects (that pair was the load-time
 * RSS peak). Each unit's bytes are decoded and JSON.parse'd on their own and their repeated
 * string values interned as they arrive. Values are identical to JSON.parse of the whole text.
 */
export function parseSnapshotBuffer(buf: Buffer): InventorySnapshot {
  const parser = createSnapshotParser(buf);
  parser.step();
  return parser.result()!;
}

/** parseSnapshotBuffer() in time slices (default 25 ms), yielding to the event loop between them. */
export async function parseSnapshotBufferAsync(buf: Buffer, sliceMs = 25): Promise<InventorySnapshot> {
  const parser = createSnapshotParser(buf);
  while (!parser.step(performance.now() + sliceMs)) await new Promise<void>((r) => setImmediate(r));
  return parser.result()!;
}

/** Replace repeated string values with one shared instance (dealer names, makes, notes, URLs prefixes are highly repeated). Values are unchanged. */
export function internStrings(root: unknown, pool: Map<string, string> = new Map<string, string>()): number {
  const stack: unknown[] = [root];
  while (stack.length) {
    const o = stack.pop();
    if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i++) {
        const v = o[i];
        if (typeof v === "string") { const p = pool.get(v); if (p !== undefined) o[i] = p; else pool.set(v, v); }
        else if (v && typeof v === "object") stack.push(v);
      }
    } else if (o && typeof o === "object") {
      const rec = o as Record<string, unknown>;
      for (const k in rec) {
        const v = rec[k];
        if (typeof v === "string") { const p = pool.get(v); if (p !== undefined) rec[k] = p; else pool.set(v, v); }
        else if (v && typeof v === "object") stack.push(v);
      }
    }
  }
  return pool.size;
}

function sha256(raw: Buffer): string {
  return createHash("sha256").update(raw).digest("hex");
}

function describe(path: string, raw: Buffer, inv: InventoryIndex, loadMs: number): SnapshotVersion {
  const hash = sha256(raw);
  let resolvedPath = path;
  let mtime = "";
  try { resolvedPath = realpathSync(path); } catch { /* keep the path as opened */ }
  try { mtime = statSync(path).mtime.toISOString(); } catch { /* unknown */ }
  return {
    version: hash.slice(0, 16),
    sha256: hash,
    path,
    resolvedPath,
    sizeBytes: raw.length,
    mtime,
    units: inv.units.length,
    dealers: inv.snapshot?.stats?.dealers ?? null,
    builtAt: inv.snapshot?.builtAt ?? null,
    loadedAt: new Date().toISOString(),
    loadMs: Math.round(loadMs),
  };
}

function logLoaded(prefix: string, inv: InventoryIndex, ms: number, version: SnapshotVersion): void {
  const e = inv.enrichStats;
  console.log(
    `${prefix}: ${inv.units.length} units from ${inv.snapshot.stats.dealers} dealers (built ${inv.snapshot.builtAt}) in ${ms}ms` +
      (e
        ? `; geo+${e.geocoded}/stateFallback+${e.stateFallback}; sleeps known=${e.sleepsAlreadyKnown} vin=${e.sleepsFromVin} inferred=${e.sleepsInferred}`
        : "") +
      `; version ${version.version}`,
  );
}

/** The current inventory index (loaded on first use). During a reload's preparation step only, the candidate. */
export function getInventory(): InventoryIndex {
  const pinned = preparing.getStore();
  if (pinned?.inv) return pinned.inv;
  if (!index) {
    const path = findSnapshot();
    const t0 = performance.now();
    // Memory (2 GiB instance): units are parsed one at a time from the decompressed bytes (no whole-document
    // string), repeated string values are shared, and the buffer is dropped before indexing.
    const raw = readFileSync(path);
    let buf: Buffer | null = decompress(path, raw);
    const snapshot = parseSnapshotBuffer(buf);
    buf = null;
    const next = buildInventoryIndex(snapshot);
    const ms = Math.round(performance.now() - t0);
    currentVersion = describe(path, raw, next, ms);
    index = next;
    adoptIndexedInventory(next);
    logLoaded("[agent] inventory snapshot loaded", next, ms, currentVersion);
  }
  return index;
}

/** Warm the in-memory index at process start so the first MCP call is not a 49MB cold parse. */
export function warmInventory(): void {
  getInventory();
}

/** Version of the snapshot currently served (null before the first load). */
export function currentSnapshotVersion(): SnapshotVersion | null {
  return currentVersion;
}

/**
 * Memoise a value derived from one inventory index. Computed once per loaded snapshot
 * (keyed on the index object, so a reload invalidates it and the old entry is collected
 * with the old snapshot). Pass `inv` to compute for a specific index.
 */
export function perSnapshot<T>(build: (inv: InventoryIndex) => T): ((inv?: InventoryIndex) => T) & { reset(): void } {
  let memo = new WeakMap<InventoryIndex, { value: T }>();
  const get = (inv: InventoryIndex = getInventory()) => {
    let hit = memo.get(inv);
    if (!hit) memo.set(inv, (hit = { value: build(inv) }));
    return hit.value;
  };
  /** Test hook: forget every memoised value. */
  get.reset = () => { memo = new WeakMap(); };
  return get;
}

/** A snapshot read, parsed and indexed off the request path, not yet serving. */
export interface PreparedSnapshot {
  index: InventoryIndex;
  version: SnapshotVersion;
}

/** Raw bytes and content hash of the snapshot path as it is now (async read). */
export async function readSnapshotFile(): Promise<{ path: string; raw: Buffer; sha256: string }> {
  const path = findSnapshot();
  const raw = await readFile(path);
  return { path, raw, sha256: sha256(raw) };
}

/**
 * Decompress (threadpool), parse (time-sliced) and index a snapshot already read by
 * readSnapshotFile(). Throws when the bytes do not parse. Does not change what is served.
 */
export async function prepareSnapshot(file: { path: string; raw: Buffer }): Promise<PreparedSnapshot> {
  const t0 = performance.now();
  let buf: Buffer | null = await decompressAsync(file.path, file.raw);
  const snapshot = await parseSnapshotBufferAsync(buf);
  buf = null;
  if (!snapshot || !Array.isArray((snapshot as { units?: unknown }).units)) throw new Error("snapshot has no units array");
  await new Promise<void>((r) => setImmediate(r));
  const next = buildInventoryIndex(snapshot);
  const ms = performance.now() - t0;
  return { index: next, version: describe(file.path, file.raw, next, ms) };
}

/**
 * Run fn with getInventory() returning `inv` inside fn (and its async continuations) only.
 * Used to fill per-snapshot caches for a candidate before it is swapped in.
 */
export async function withCandidateInventory<T>(inv: InventoryIndex, fn: () => Promise<T> | T): Promise<T> {
  const store = { inv: inv as InventoryIndex | null };
  try {
    return await preparing.run(store, fn);
  } finally {
    // Anything scheduled from inside fn that outlives it (a stray timer) falls back to the live index.
    store.inv = null;
  }
}

/** Atomically make a prepared snapshot the one every request reads. */
export function swapInSnapshot(prepared: PreparedSnapshot): void {
  index = prepared.index;
  currentVersion = prepared.version;
  adoptIndexedInventory(prepared.index);
}
