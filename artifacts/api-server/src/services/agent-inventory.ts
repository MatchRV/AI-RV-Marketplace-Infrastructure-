/**
 * Loads the committed inventory snapshot once and exposes the indexed
 * corpus to the agent routes. No database dependency — the agent tool layer
 * must work on a fresh clone with zero services.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  indexSnapshot,
  type InventoryIndex,
  type InventorySnapshot,
} from "@workspace/agent-core";

let index: InventoryIndex | null = null;

/** Probe both the tsx layout (src/services) and the CJS bundle layout (dist). */
function findSnapshot(): string {
  const here = import.meta.dirname;
  const candidates = [
    resolve(here, "../../../../lib/agent-core/data/inventory.snapshot.json"), // src/services
    resolve(here, "../../lib/agent-core/data/inventory.snapshot.json"), // dist bundle
    resolve(here, "../../../lib/agent-core/data/inventory.snapshot.json"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(`inventory snapshot not found (searched from ${here})`);
}

export function getInventory(): InventoryIndex {
  if (!index) {
    const path = findSnapshot();
    const t0 = performance.now();
    const snapshot = JSON.parse(readFileSync(path, "utf-8")) as InventorySnapshot;
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
