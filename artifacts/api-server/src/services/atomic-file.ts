/**
 * Durable writes for the small private JSON files under the data directory
 * (agent key registry, attribution counters, the inquiry signing secret).
 *
 * - Atomic: the bytes go to a uniquely named temp file in the same directory,
 *   are fsynced, then renamed over the target. A reader sees the old file or
 *   the new one, never a torn one. Unique temp names mean two writers can
 *   never share a temp file.
 * - Private: files are created 0600 (owner read/write only). Windows ignores
 *   POSIX modes; production runs on Linux.
 * - Recoverable: with `backup`, the previous good file is kept as `<name>.bak`
 *   and `readJsonWithBackup` falls back to it when the main file is unreadable.
 */
import {
  chmodSync, closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, statSync, statfsSync, unlinkSync, writeSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, resolve } from "node:path";

export const PRIVATE_FILE_MODE = 0o600;

function tmpName(path: string): string {
  return `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
}

function tighten(path: string): void {
  try { chmodSync(path, PRIVATE_FILE_MODE); } catch { /* not supported on this filesystem */ }
}

export function backupPath(path: string): string {
  return `${path}.bak`;
}

export function writeFileAtomic(path: string, data: string, opts: { backup?: boolean } = {}): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = tmpName(path);
  let fd: number | undefined;
  try {
    fd = openSync(tmp, "wx", PRIVATE_FILE_MODE);
    writeSync(fd, data);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    if (opts.backup && existsSync(path)) {
      const bakTmp = tmpName(backupPath(path));
      copyFileSync(path, bakTmp);
      tighten(bakTmp);
      renameSync(bakTmp, backupPath(path));
    }
    renameSync(tmp, path);
    tighten(path);
  } catch (err) {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* already closed */ } }
    try { unlinkSync(tmp); } catch { /* never created, or already renamed */ }
    throw err;
  }
}

/** Parse the main file; when it is missing or unreadable, try the `.bak` copy. */
export function readJsonWithBackup<T>(path: string, accept: (value: unknown) => value is T): { value: T | null; source: "main" | "backup" | "none" } {
  for (const [candidate, source] of [[path, "main"], [backupPath(path), "backup"]] as const) {
    try {
      if (!existsSync(candidate)) continue;
      const parsed: unknown = JSON.parse(readFileSync(candidate, "utf8"));
      if (accept(parsed)) return { value: parsed, source };
    } catch { /* fall through to the backup */ }
  }
  return { value: null, source: "none" };
}

export interface DataFileStatus { file: string; exists: boolean; bytes: number; modifiedAt: string | null; mode: string | null; backupExists: boolean }

/** Size, age and mode of one data file. Reports the file name only, never its contents. */
export function dataFileStatus(path: string): DataFileStatus {
  const out: DataFileStatus = { file: basename(path), exists: false, bytes: 0, modifiedAt: null, mode: null, backupExists: existsSync(backupPath(path)) };
  try {
    const st = statSync(path);
    out.exists = true;
    out.bytes = st.size;
    out.modifiedAt = st.mtime.toISOString();
    out.mode = process.platform === "win32" ? null : (st.mode & 0o777).toString(8).padStart(3, "0");
  } catch { /* missing */ }
  return out;
}

export interface DiskStatus { freeBytes: number; totalBytes: number; freePct: number }

export function diskStatus(dir: string): DiskStatus | null {
  try {
    const s = statfsSync(resolve(dir));
    const total = Number(s.blocks) * Number(s.bsize);
    const free = Number(s.bavail) * Number(s.bsize);
    if (!(total > 0)) return null;
    return { freeBytes: free, totalBytes: total, freePct: Math.round((free / total) * 1000) / 10 };
  } catch {
    return null;
  }
}

/** Temp files left behind by a crash mid-write. Safe to delete; listed so monitoring can see them. */
export function strayTempFiles(path: string): string[] {
  try {
    const prefix = `${basename(path)}.`;
    return readdirSync(dirname(path)).filter((name) => name.startsWith(prefix) && name.endsWith(".tmp"));
  } catch {
    return [];
  }
}

/** Directory the durable JSON stores share (the Render disk in production). */
export function dataDir(): string {
  if (process.env.INQUIRIES_PATH) return dirname(resolve(process.env.INQUIRIES_PATH));
  if (process.env.LEARNED_FACTS_PATH) return dirname(resolve(process.env.LEARNED_FACTS_PATH));
  return resolve("data");
}
