/**
 * Runtime access to the committed inventory snapshot.
 * Pure data module — usable on the server and in the browser bundle.
 */

import type { CanonicalUnit } from "./types.js";
import { enrichSnapshotUnits, type EnrichStats } from "./enrich-snapshot.js";

export interface InventorySnapshot {
  schemaVersion: number;
  builtAt: string;
  datasetNote: string;
  stats: {
    rawRecords: number;
    units: number;
    dealers: number;
    rejections: Record<string, number>;
    uniqueVins?: number;
    withLength?: number;
    withSleeps?: number;
  };
  units: CanonicalUnit[];
}

let cache: InventoryIndex | null = null;

export interface InventoryIndex {
  snapshot: InventorySnapshot;
  units: CanonicalUnit[];
  byId: Map<string, CanonicalUnit>;
  /** Units grouped by dealer.state for fast geo prefilter. */
  byState: Map<string, CanonicalUnit[]>;
  enrichStats?: EnrichStats;
}

/** Index a parsed snapshot (loaders differ per runtime; indexing doesn't). */
export function indexSnapshot(snapshot: InventorySnapshot): InventoryIndex {
  // Enrich once at load: geocode dealers + backfill/infer sleeps.
  const enrichStats = enrichSnapshotUnits(snapshot.units);

  const byId = new Map<string, CanonicalUnit>();
  const byState = new Map<string, CanonicalUnit[]>();
  for (const u of snapshot.units) {
    byId.set(u.id, u);
    const st = (u.dealer.state || "").toUpperCase() || "??";
    let bucket = byState.get(st);
    if (!bucket) {
      bucket = [];
      byState.set(st, bucket);
    }
    bucket.push(u);
  }
  cache = { snapshot, units: snapshot.units, byId, byState, enrichStats };
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
