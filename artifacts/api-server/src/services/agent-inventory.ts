/**
 * Loads the committed inventory snapshot once and exposes the indexed
 * corpus to the agent routes. No database dependency — the agent tool layer
 * must work on a fresh clone with zero services.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  indexSnapshot,
  type InventoryIndex,
  type InventorySnapshot,
} from "@workspace/agent-core";

let index: InventoryIndex | null = null;

export function getInventory(): InventoryIndex {
  if (!index) {
    const require = createRequire(import.meta.url);
    const path = require.resolve("@workspace/agent-core/snapshot");
    const snapshot = JSON.parse(readFileSync(path, "utf-8")) as InventorySnapshot;
    index = indexSnapshot(snapshot);
    console.log(
      `[agent] inventory snapshot loaded: ${index.units.length} units from ${index.snapshot.stats.dealers} dealers (built ${index.snapshot.builtAt})`,
    );
  }
  return index;
}
