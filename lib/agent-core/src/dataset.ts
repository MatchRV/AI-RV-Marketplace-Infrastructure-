/**
 * Runtime access to the committed inventory snapshot.
 * Pure data module — usable on the server and in the browser bundle.
 */

import type { CanonicalUnit } from "./types.js";

export interface InventorySnapshot {
  schemaVersion: number;
  builtAt: string;
  datasetNote: string;
  stats: {
    rawRecords: number;
    units: number;
    dealers: number;
    rejections: Record<string, number>;
  };
  units: CanonicalUnit[];
}

let cache: InventoryIndex | null = null;

export interface InventoryIndex {
  snapshot: InventorySnapshot;
  units: CanonicalUnit[];
  byId: Map<string, CanonicalUnit>;
}

/** Index a parsed snapshot (loaders differ per runtime; indexing doesn't). */
export function indexSnapshot(snapshot: InventorySnapshot): InventoryIndex {
  const byId = new Map<string, CanonicalUnit>();
  for (const u of snapshot.units) byId.set(u.id, u);
  cache = { snapshot, units: snapshot.units, byId };
  return cache;
}

export function getIndexedInventory(): InventoryIndex {
  if (!cache) throw new Error("Inventory snapshot not loaded — call indexSnapshot() first.");
  return cache;
}

/** Hours between the unit's last verification and now. */
export function freshnessHours(unit: CanonicalUnit, now = new Date()): number {
  const seen = new Date(unit.provenance.lastSeenAt).getTime();
  return Math.max(0, (now.getTime() - seen) / 36e5);
}
