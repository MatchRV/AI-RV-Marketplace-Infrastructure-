/**
 * In-process inventory snapshot reload (no restart).
 *
 * Triggers: SIGHUP to the node process, or POST /internal/reload-snapshot from
 * loopback only (see internal-routes.ts). Both call reloadSnapshot().
 *
 * Steps, all off the request path (requests keep being served from the current
 * snapshot the whole time):
 *   1. read the snapshot path again (async) and hash it; same bytes => "unchanged";
 *   2. check memory headroom for holding two snapshots at once;
 *   3. gunzip on the threadpool, parse in ~25 ms slices;
 *   4. validate: it parsed, units > 0, and no more than a 10% drop vs the current count;
 *   5. index it, then fill every per-snapshot cache for the candidate (inside
 *      withCandidateInventory, so only the warm sees it);
 *   6. swap: one assignment makes the new index current; the per-snapshot caches are
 *      keyed on the index object, so the swap invalidates the old ones at once.
 * If any step fails, nothing is swapped, the old snapshot keeps serving, and the
 * error is logged. Concurrent triggers coalesce: one reload runs at a time and every
 * trigger that arrives meanwhile shares a single follow-up run, which re-reads the
 * file so a snapshot replaced mid-reload is not missed.
 *
 * Shopper and lead state (inquiries, previews, sessions, learned memory) lives in
 * other modules and is never touched here.
 */
import { freemem } from "node:os";
import { getHeapStatistics } from "node:v8";
import {
  currentSnapshotVersion,
  getInventory,
  prepareSnapshot,
  readSnapshotFile,
  swapInSnapshot,
  withCandidateInventory,
  type SnapshotVersion,
} from "./agent-inventory";
import { getScreenedInventory } from "./screened-inventory";
import { getListingRows } from "./outfitter-inventory";
import { warmSnapshotListings } from "./snapshot-listings";
import { readyUnits } from "./search-ready";
import { warmListingPublicIds } from "../lib/listing-public-id";
import { warmUnitIndexability } from "../lib/unit-insights";
import { listHubUrls, warmHubs } from "../lib/inventory-hubs";
import { unitSitemapPageCount } from "../lib/sitemap";
import { warmCardPhotoOrigins } from "../mcp";

/** Largest allowed drop in unit count versus the snapshot being served. */
export const MAX_RELOAD_DROP = 0.1;

/**
 * Peak extra memory a reload needs, as a multiple of the decompressed snapshot size
 * (decompressed buffer + the parsed and indexed candidate while the old one still serves).
 * Measured on the 137,405-unit production snapshot (574 MB decompressed, Node 24): RSS rose
 * 1,596 -> 2,229 MB at peak, ~1.1x. 1.5x leaves margin. If there is not enough room the
 * reload is refused (old data keeps serving) and the caller should fall back to a restart.
 */
const DEFAULT_RELOAD_MEMORY_FACTOR = 1.5;

export type ReloadTrigger = "SIGHUP" | "http" | "test" | string;

export type ReloadOutcome =
  | { status: "swapped"; trigger: ReloadTrigger; previous: SnapshotVersion | null; current: SnapshotVersion; ms: number; prepareMs: number; warmMs: number; finishedAt: string }
  | { status: "unchanged"; trigger: ReloadTrigger; current: SnapshotVersion | null; ms: number; finishedAt: string }
  | { status: "rejected"; trigger: ReloadTrigger; reason: string; current: SnapshotVersion | null; ms: number; finishedAt: string };

let inFlight: Promise<ReloadOutcome> | null = null;
let queued: Promise<ReloadOutcome> | null = null;
let lastOutcome: ReloadOutcome | null = null;
const counters = { swapped: 0, unchanged: 0, rejected: 0 };

/**
 * Re-read the snapshot path and swap it in if it is valid and different.
 * Never rejects: failures resolve to { status: "rejected" } and the old data keeps serving.
 */
export function reloadSnapshot(trigger: ReloadTrigger = "http"): Promise<ReloadOutcome> {
  if (!inFlight) {
    inFlight = runReload(trigger).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }
  if (!queued) {
    console.log(`[snapshot-reload] ${trigger}: a reload is already running; queued one follow-up run`);
    queued = inFlight
      .catch(() => undefined)
      .then(() => {
        queued = null;
        return reloadSnapshot(trigger);
      });
  } else {
    console.log(`[snapshot-reload] ${trigger}: coalesced into the queued follow-up run`);
  }
  return queued;
}

/** Fill every per-snapshot cache for the inventory getInventory() returns (startup and reload). */
export async function warmSnapshotCaches(log = true): Promise<{ indexable: number; hubs: number; ms: number }> {
  const t0 = performance.now();
  const yieldNow = () => new Promise<void>((r) => setImmediate(r));
  getScreenedInventory();
  await yieldNow();
  getListingRows();
  warmSnapshotListings();
  await yieldNow();
  readyUnits();
  warmListingPublicIds();
  warmCardPhotoOrigins();
  await yieldNow();
  const indexable = await warmUnitIndexability();
  warmHubs();
  const hubs = listHubUrls().length;
  unitSitemapPageCount();
  const ms = Math.round(performance.now() - t0);
  if (log) console.log(`[seo] ${indexable} indexable unit pages, ${hubs} shopping hubs`);
  return { indexable, hubs, ms };
}

function memoryFactor(): number {
  const raw = Number(process.env.SNAPSHOT_RELOAD_MEMORY_FACTOR);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_RELOAD_MEMORY_FACTOR;
}

/** Null when there is room; otherwise why not. */
function memoryHeadroomProblem(decompressedBytes: number): string | null {
  const factor = memoryFactor();
  if (factor === 0) return null;
  const rss = process.memoryUsage.rss();
  const need = decompressedBytes * factor;
  const cgroup = typeof process.constrainedMemory === "function" ? process.constrainedMemory() : 0;
  const hostRoom = freemem();
  // constrainedMemory() is the cgroup limit (e.g. systemd MemoryMax) or 0/host total when unlimited.
  const cgroupRoom = cgroup > 0 && cgroup < Number.MAX_SAFE_INTEGER ? cgroup - rss : Infinity;
  // The candidate lives on the V8 heap too, so the heap limit must have room as well.
  const heap = getHeapStatistics();
  const heapRoom = heap.heap_size_limit - heap.used_heap_size;
  const room = Math.min(hostRoom, cgroupRoom, heapRoom);
  if (need <= room) return null;
  const mb = (n: number) => `${Math.round(n / 1048576)} MB`;
  return `insufficient memory headroom: reload needs ~${mb(need)} (${factor}x the ${mb(decompressedBytes)} decompressed snapshot), only ${mb(room)} available (rss ${mb(rss)}${Number.isFinite(cgroupRoom) ? `, cgroup limit ${mb(cgroup)}` : ""}, host free ${mb(hostRoom)}, heap free ${mb(heapRoom)} of ${mb(heap.heap_size_limit)})`;
}

function gzipDecompressedSize(path: string, raw: Buffer): number {
  if (!path.endsWith(".gz")) return raw.length;
  return raw.length >= 18 ? raw.readUInt32LE(raw.length - 4) : raw.length;
}

async function runReload(trigger: ReloadTrigger): Promise<ReloadOutcome> {
  const t0 = performance.now();
  const done = <T extends Omit<ReloadOutcome, "ms" | "finishedAt">>(o: T) => {
    const outcome = { ...o, ms: Math.round(performance.now() - t0), finishedAt: new Date().toISOString() } as unknown as ReloadOutcome;
    lastOutcome = outcome;
    counters[outcome.status] += 1;
    return outcome;
  };
  let before: SnapshotVersion | null = null;
  try {
    // The served index (loads it if this process never has).
    const served = getInventory();
    before = currentSnapshotVersion();
    const file = await readSnapshotFile();
    console.log(`[snapshot-reload] ${trigger}: reading ${file.path} (${file.raw.length} bytes); serving version ${before?.version ?? "none"} (${served.units.length} units)`);
    if (before && file.sha256 === before.sha256) {
      console.log(`[snapshot-reload] unchanged: version ${before.version} (${before.units} units); nothing to swap`);
      return done({ status: "unchanged", trigger, current: before });
    }
    const memoryProblem = memoryHeadroomProblem(gzipDecompressedSize(file.path, file.raw));
    if (memoryProblem) throw new Error(memoryProblem);

    const tPrep = performance.now();
    const prepared = await prepareSnapshot(file);
    const count = prepared.index.units.length;
    const currentCount = served.units.length;
    if (!(count > 0)) throw new Error(`snapshot has ${count} units`);
    if (currentCount > 0 && count < currentCount * (1 - MAX_RELOAD_DROP)) {
      const pct = Math.round((1 - count / currentCount) * 1000) / 10;
      throw new Error(`unit count would drop ${pct}% (${currentCount} -> ${count}), more than the ${MAX_RELOAD_DROP * 100}% limit`);
    }
    const prepareMs = Math.round(performance.now() - tPrep);

    const tWarm = performance.now();
    await withCandidateInventory(prepared.index, () => warmSnapshotCaches(false));
    const warmMs = Math.round(performance.now() - tWarm);

    // A reload that finished while this one ran must not be overwritten by an older read.
    if (currentSnapshotVersion() !== before) throw new Error("the served snapshot changed during this reload; not swapping");
    swapInSnapshot(prepared);
    const after = prepared.version;
    console.log(
      `[snapshot-reload] swapped: version ${before?.version ?? "none"} (${currentCount} units) -> ${after.version} (${count} units, built ${after.builtAt}) ` +
        `in ${Math.round(performance.now() - t0)}ms (read+parse+index ${prepareMs}ms, caches ${warmMs}ms)`,
    );
    return done({ status: "swapped", trigger, previous: before, current: after, prepareMs, warmMs });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const cur = currentSnapshotVersion();
    console.error(`[snapshot-reload] rejected: ${reason}; still serving version ${cur?.version ?? "none"} (${cur?.units ?? 0} units)`);
    return done({ status: "rejected", trigger, reason, current: cur });
  }
}

/** Snapshot + reload state for the localhost-only status route. */
export function snapshotStatus() {
  const v = currentSnapshotVersion();
  return {
    snapshot: v,
    units: v?.units ?? null,
    reload: {
      inProgress: inFlight !== null,
      queued: queued !== null,
      counts: { ...counters },
      last: lastOutcome,
    },
  };
}

/** SIGHUP => reload. Without this handler Node's default for SIGHUP is to exit. */
export function installSnapshotReloadSignal(): void {
  process.on("SIGHUP", () => {
    console.log("[snapshot-reload] SIGHUP received");
    void reloadSnapshot("SIGHUP");
  });
}

/** Test hook. */
export function resetSnapshotReloadState(): void {
  lastOutcome = null;
  counters.swapped = counters.unchanged = counters.rejected = 0;
}
