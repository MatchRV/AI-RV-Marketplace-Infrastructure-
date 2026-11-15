/**
 * Where request-time recheck reads inventory.
 *
 * The MCP tools call `readInventoryIndex()` and nothing else. Swapping this
 * for a short-TTL GCS object or DB row is a source change, not a recheck
 * change. See docs/freshness-reloadable-index.md.
 *
 * This module does not fetch dealer pages and does not write the data directory.
 */
import type { InventoryIndex } from "@workspace/agent-core";
import { getInventory } from "./agent-inventory";

export interface InventoryIndexSource {
  /**
   * Current inventory index. Implementations may cache, but a call is a fresh
   * read of that cache's source. No live dealer fetch.
   */
  readIndex(): InventoryIndex;
}

/** The committed in-repo snapshot, loaded once by `getInventory()`. */
export class RepoSnapshotInventoryIndex implements InventoryIndexSource {
  readIndex(): InventoryIndex {
    return getInventory();
  }
}

let source: InventoryIndexSource = new RepoSnapshotInventoryIndex();

/** The index the recheck reads. Does not screen, project, or persist anything. */
export function readInventoryIndex(): InventoryIndex {
  return source.readIndex();
}

/**
 * Install a different index source. Production stays on the repo snapshot.
 * Tests use this so fixtures never touch the data directory or the committed snapshot.
 */
export function useInventoryIndexSource(next: InventoryIndexSource): void {
  source = next;
}

export function resetInventoryIndexSource(): void {
  source = new RepoSnapshotInventoryIndex();
}
