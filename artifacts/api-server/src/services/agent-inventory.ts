/**
 * Loads the committed inventory snapshot once and exposes the indexed
 * corpus to the agent routes. No database dependency — the agent tool layer
 * must work on a fresh clone with zero services.
 */

// Registers the lazy US ZIP → centroid table used by shopper search locations (no I/O until a ZIP is searched).
import "./zip-centroids";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import {
  indexSnapshot,
  type InventoryIndex,
  type InventorySnapshot,
} from "@workspace/agent-core";

let index: InventoryIndex | null = null;

/** Probe both the tsx layout (src/services) and the CJS bundle layout (dist). Plain JSON wins locally; committed form is .gz (GitHub's 100MB limit). */
function findSnapshot(): string {
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

function readSnapshotBuffer(path: string): Buffer {
  const raw = readFileSync(path);
  if (!path.endsWith(".gz")) return raw;
  // gunzipSync collects 16 KB chunks and then concatenates them, briefly holding the output twice
  // (~1 GB RSS for a ~500 MB snapshot). The gzip trailer states the decompressed size (mod 2^32), so one
  // output chunk of that size avoids the second copy. The size only sizes the buffer; zlib still checks the data.
  const isize = raw.length >= 18 ? raw.readUInt32LE(raw.length - 4) : 0;
  return isize > 0 && isize < 0x7fff0000 ? gunzipSync(raw, { chunkSize: Math.max(64 * 1024, isize + 1024) }) : gunzipSync(raw);
}

/**
 * Parses the snapshot one unit at a time straight from the decompressed bytes, so the whole
 * document never exists as one JS string next to its parsed objects (that pair was the load-time
 * RSS peak). Each unit's bytes are decoded and JSON.parse'd on their own and their repeated
 * string values interned as they arrive. Values are identical to JSON.parse of the whole text.
 */
export function parseSnapshotBuffer(buf: Buffer): InventorySnapshot {
  const Q = 0x22, BS = 0x5c, LB = 0x7b, RB = 0x7d, LS = 0x5b, RS = 0x5d, COLON = 0x3a;
  const n = buf.length;
  let depth = 0, i = 0, keyStart = -1, keyEnd = -1;
  let unitsOpen = -1, unitsClose = -1;
  const units: unknown[] = [];
  const pool = new Map<string, string>();
  while (i < n) {
    const c = buf[i];
    if (c === Q) {
      const s = i; i++;
      while (i < n && buf[i] !== Q) i += buf[i] === BS ? 2 : 1;
      if (depth === 1) { keyStart = s; keyEnd = i + 1; }
      i++; continue;
    }
    if (c === LB || c === LS) {
      if (depth === 1 && c === LS && keyEnd > 0 && buf.toString("latin1", keyStart, keyEnd) === '"units"') {
        // walk the units array element by element
        unitsOpen = i; i++;
        for (;;) {
          while (i < n && (buf[i] === 0x2c || buf[i] <= 0x20)) i++;
          if (buf[i] === RS) { unitsClose = i; i++; break; }
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
        }
        continue;
      }
      depth++; i++; continue;
    }
    if (c === RB || c === RS) { depth--; i++; continue; }
    if (c === COLON) { i++; continue; }
    i++;
  }
  if (unitsOpen < 0) return JSON.parse(buf.toString("utf8")) as InventorySnapshot;
  const head = buf.toString("utf8", 0, unitsOpen) + "[]" + buf.toString("utf8", unitsClose + 1);
  const snap = JSON.parse(head) as InventorySnapshot;
  (snap as { units: unknown[] }).units = units;
  return snap;
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

let warnedDbMode = false;

export function getInventory(): InventoryIndex {
  if (!index) {
    if (process.env.INVENTORY_SOURCE?.trim().toLowerCase() === "supabase" && !warnedDbMode) {
      // Every serving path goes through inventory-access in this mode; reaching here is a leak worth knowing about.
      warnedDbMode = true;
      console.warn("[agent] INVENTORY_SOURCE=supabase but a code path is loading the in-memory snapshot:", new Error().stack?.split("\n").slice(2, 6).join(" | "));
    }
    const path = findSnapshot();
    const t0 = performance.now();
    // Memory (2 GiB instance): units are parsed one at a time from the decompressed bytes (no whole-document
    // string), repeated string values are shared, and the buffer is dropped before indexing.
    let buf: Buffer | null = readSnapshotBuffer(path);
    const snapshot = parseSnapshotBuffer(buf);
    buf = null;
    index = indexSnapshot(snapshot);
    const ms = Math.round(performance.now() - t0);
    const e = index.enrichStats;
    console.log(
      `[agent] inventory snapshot loaded: ${index.units.length} units from ${index.snapshot.stats.dealers} dealers (built ${index.snapshot.builtAt}) in ${ms}ms` +
        (e
          ? `; geo+${e.geocoded}/stateFallback+${e.stateFallback}; sleeps known=${e.sleepsAlreadyKnown} vin=${e.sleepsFromVin} inferred=${e.sleepsInferred}`
          : ""),
    );
  }
  return index;
}

/** Warm the in-memory index at process start so the first MCP call is not a 49MB cold parse. */
export function warmInventory(): void {
  getInventory();
}
