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

function readSnapshotText(path: string): string {
  const raw = readFileSync(path);
  return path.endsWith(".gz") ? gunzipSync(raw).toString("utf-8") : raw.toString("utf-8");
}

/** Replace repeated string values with one shared instance (dealer names, makes, notes, URLs prefixes are highly repeated). Values are unchanged. */
export function internStrings(root: unknown): number {
  const pool = new Map<string, string>();
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

export function getInventory(): InventoryIndex {
  if (!index) {
    const path = findSnapshot();
    const t0 = performance.now();
    // Memory: keep only one copy of the JSON text alive and drop it before indexing, so the
    // decompressed buffer and the text can be collected while the index is built (peak RSS on a 2 GiB
    // instance). Repeated string values are shared (same values, one copy each).
    let text: string | null = readSnapshotText(path);
    const snapshot = JSON.parse(text) as InventorySnapshot;
    text = null;
    internStrings(snapshot.units);
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
