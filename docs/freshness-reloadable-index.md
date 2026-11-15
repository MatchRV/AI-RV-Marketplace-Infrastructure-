# Reloadable inventory index (design only)

Status: design. This document does not create cloud resources, change DNS, deploy, or turn on a flag. No new paid service is part of this change.

The request-time recheck reads inventory through one interface and screens that read. Today the interface returns the committed in-repo snapshot. A later short-TTL index can replace that source without rewriting the recheck.

## Why

`getScreenedInventory()` screens the snapshot once for the life of the process. A conversation can keep recommending a unit from that first read after the unit has sold, changed price, or moved lots. The recheck exists so a later turn reads InventoryState again. It does not fetch the dealer page.

The live process is on Render. A move to Google Cloud is planned for project `main-business-514122` in `us-west1`. Render's filesystem is ephemeral, and the data-directory freeze (#95) is about shopper writes, not this read path. The index must not be a file the request writes on the instance disk.

## The interface the recheck calls

```ts
export interface InventoryIndexSource {
  readIndex(): InventoryIndex;
}
```

`recheckForRecommend()` in `artifacts/api-server/src/services/inventory-state-freshness.ts` calls `readInventoryIndex()` (`artifacts/api-server/src/services/inventory-index-source.ts`) every time a listing tool is about to use a unit. That function delegates to the installed `InventoryIndexSource`. The MCP handlers do not know whether the bytes came from the repo snapshot, a GCS object, or a database row.

Rules for every implementation:

- `readIndex()` returns the current `InventoryIndex`. It does not fetch a dealer listing page.
- It does not write `retrieved_at`, `freshness`, or `stale` onto a unit. Those are projections in the recheck.
- It does not write the data directory.
- Swapping the source is `useInventoryIndexSource(next)`. The recheck function stays the same.

## What is implemented now

`RepoSnapshotInventoryIndex` is the default. `readIndex()` returns `getInventory()`, the committed snapshot loaded once by `artifacts/api-server/src/services/agent-inventory.ts`. There is no network call and no TTL, because that file does not change until a deploy. The recheck still calls `readIndex()` on each recommend so a test, or a future source, can show a newer index on the next call.

Flags stay off. With `INVENTORY_STATE_FRESHNESS` unset, listing tools keep using the memoized screened snapshot and never call `readIndex()`.

## Later source (not built here)

Two shapes fit the same interface. Neither is created in this change.

1. **GCS object.** One object in the existing project `main-business-514122`, region `us-west1`, holding the same snapshot JSON the process already understands. A harvest or recheck job publishes a new object. The source caches it with a short TTL (about 60 seconds) and reloads when the TTL expires. `readIndex()` parses that object into an `InventoryIndex`.
2. **One DB row.** A single row (or document) that already exists in a database the migration runs, holding the same JSON. Same TTL. Do not add a new database product for this index.

The TTL is inside the source. Callers still just call `readIndex()`. A 60-second TTL is long enough to avoid a download on every tool call and short enough that a later turn in the same chat can see a republished index. It is not a live dealer check.

Publish path, bucket name, IAM, and billing stay a separate approval. This design does not create a bucket, a database, a service account, or an object. It does not change the Render service.

## What this design does not do

- It does not re-home the Lazydays Vancouver units. The replay fixture that corrects one synthetic Lazydays lot is not those 737 real corrections.
- It does not turn on `INVENTORY_STATE_FRESHNESS` or `INVENTORY_FRESHNESS_WALL_CLOCK`.
- It does not add an MCP tool. The 11-tool contract stays as it is when the flag is off.
