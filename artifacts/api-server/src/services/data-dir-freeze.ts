/**
 * Quiesce durable writes under the data directory (Render disk /var/data, or
 * the env-selected files beside it) without exiting the process.
 *
 * Freeze flushes debounced JSON saves, waits for a durable write that already
 * passed its gate (an inquiry delivery in flight), then refuses new durable
 * writes. Shopper reads, search, and MCP tools keep running.
 *
 * Lead policy while frozen: a confirmed inquiry is refused before delivery
 * and before it is stored. The caller gets `writes_frozen` (HTTP 503,
 * Retry-After). Nothing is emailed and the confirmation token is left unused,
 * so the shopper retries the same send after unfreeze. The lead is not held
 * in memory: a held lead would be missing from the copy and would land on the
 * old disk if this process were unfrozen later.
 *
 * search_rvs fit updates and outbound-click lines are skipped once the freeze
 * has finished flushing. They are not lead submissions. SIGTERM and SIGINT
 * flush pending debounced writes, then exit. SIGKILL does not.
 */

export const DATA_DIR_FROZEN_GUIDANCE =
  "MatchRV is not saving changes while its data directory is frozen for a consistent copy. Nothing was sent and nothing new was stored. Retry this request after the freeze is lifted.";

export const DATA_DIR_FROZEN_RETRY_AFTER_SECONDS = 120;

export class DataDirFrozenError extends Error {
  readonly code = "writes_frozen" as const;
  readonly retryable = true;
  constructor() {
    super(DATA_DIR_FROZEN_GUIDANCE);
    this.name = "DataDirFrozenError";
  }
}

export interface DataWriter {
  name: string;
  pending: () => boolean;
  flush: () => void;
}

export interface DataDirFreezeStatus {
  frozen: boolean;
  pending: boolean;
  pendingWriters: string[];
}

const writers: DataWriter[] = [];
let frozen = false;
/** False only after a freeze has finished its flush. In-flight work may still schedule a save before that. */
let accepting = true;
let inflight = 0;
let shuttingDown = false;
const waiters: Array<() => void> = [];
let sigtermHandler: (() => void) | null = null;
let sigintHandler: (() => void) | null = null;

export function registerDataWriter(writer: DataWriter): void {
  const at = writers.findIndex((row) => row.name === writer.name);
  if (at >= 0) writers[at] = writer;
  else writers.push(writer);
}

export function isDataDirFrozen(): boolean {
  return frozen;
}

/** Debounced and immediate data-dir saves may proceed. False once freeze has flushed. */
export function dataDirAcceptsWrites(): boolean {
  return accepting;
}

/**
 * Call synchronously before a durable mutation that can outlive the current
 * turn (inquiry delivery). Returns false when frozen; the caller must not
 * send, store, or schedule a save.
 */
export function beginDurableWrite(): boolean {
  if (frozen || !accepting) return false;
  inflight += 1;
  return true;
}

export function endDurableWrite(): void {
  inflight = Math.max(0, inflight - 1);
  if (inflight === 0) releaseWaiters();
}

function releaseWaiters(): void {
  const pending = waiters.splice(0);
  for (const resolve of pending) resolve();
}

function waitForDurableWrites(): Promise<void> {
  if (inflight === 0) return Promise.resolve();
  return new Promise((resolve) => {
    waiters.push(resolve);
  });
}

export function dataDirFreezeStatus(): DataDirFreezeStatus {
  const pendingWriters = writers.filter((writer) => writer.pending()).map((writer) => writer.name).sort();
  return { frozen, pending: pendingWriters.length > 0, pendingWriters };
}

export function flushPendingDataWrites(): void {
  for (const writer of writers) {
    if (!writer.pending()) continue;
    try {
      writer.flush();
    } catch (err) {
      console.warn(`[data-dir] flush failed for ${writer.name}:`, err instanceof Error ? err.message : "error");
    }
  }
}

export async function freezeDataDir(): Promise<DataDirFreezeStatus> {
  frozen = true;
  if (inflight > 0) await waitForDurableWrites();
  flushPendingDataWrites();
  accepting = false;
  flushPendingDataWrites();
  const status = dataDirFreezeStatus();
  console.log(`[data-dir] frozen pending=${status.pending}${status.pendingWriters.length ? ` writers=${status.pendingWriters.join(",")}` : ""}`);
  return status;
}

export function unfreezeDataDir(): DataDirFreezeStatus {
  frozen = false;
  accepting = true;
  flushPendingDataWrites();
  const status = dataDirFreezeStatus();
  console.log(`[data-dir] unfrozen pending=${status.pending}`);
  return status;
}

type ExitFn = (code: number) => void;

async function shutdownDataDir(signal: string, exit: ExitFn): Promise<void> {
  if (shuttingDown) {
    exit(0);
    return;
  }
  shuttingDown = true;
  frozen = true;
  if (inflight > 0) await waitForDurableWrites();
  try {
    flushPendingDataWrites();
  } catch (err) {
    console.error("[shutdown] data flush failed:", err instanceof Error ? err.message : "error");
  }
  console.log(`[shutdown] ${signal}: flushed pending data writes`);
  exit(0);
}

/** SIGTERM and SIGINT flush debounced data-dir writes, then exit. Idempotent. */
export function installDataDirShutdownHandlers(exit: ExitFn = (code) => {
  process.exit(code);
}): void {
  removeDataDirShutdownHandlers();
  sigtermHandler = () => {
    void shutdownDataDir("SIGTERM", exit);
  };
  sigintHandler = () => {
    void shutdownDataDir("SIGINT", exit);
  };
  process.once("SIGTERM", sigtermHandler);
  process.once("SIGINT", sigintHandler);
}

export function removeDataDirShutdownHandlers(): void {
  if (sigtermHandler) process.removeListener("SIGTERM", sigtermHandler);
  if (sigintHandler) process.removeListener("SIGINT", sigintHandler);
  sigtermHandler = null;
  sigintHandler = null;
}

export function __runDataDirShutdownForTests(signal: "SIGTERM" | "SIGINT", exit: ExitFn): Promise<void> {
  return shutdownDataDir(signal, exit);
}

export function __resetDataDirFreezeForTests(): void {
  frozen = false;
  accepting = true;
  inflight = 0;
  shuttingDown = false;
  releaseWaiters();
  removeDataDirShutdownHandlers();
}
