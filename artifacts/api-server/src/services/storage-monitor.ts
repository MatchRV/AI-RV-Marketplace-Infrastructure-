/**
 * Health of the private data files: sizes, modes, backups, free disk space and
 * where the inquiry signing secret comes from. Read by the ops storage
 * endpoint and by a slow background check that alerts MatchRV ops when
 * something needs a person. Reports names, sizes and counts only.
 */
import { dirname } from "node:path";
import { agentClientsPath, agentClientsStatus } from "./agent-clients";
import { dataFileStatus, diskStatus, strayTempFiles } from "./atomic-file";
import { attributionPath, attributionStatus } from "./attribution";
import { emitOpsAlert, signingSecretSource } from "./dealer-inquiries";
import { dataDirFreezeStatus } from "./data-dir-freeze";

const LOW_DISK_PCT = () => {
  const n = Number(process.env.DATA_DISK_WARN_FREE_PCT ?? 15);
  return Number.isFinite(n) && n > 0 && n < 100 ? n : 15;
};

export interface StorageWarning { code: string; critical: boolean; detail: string }

export function storageStatus() {
  const clients = agentClientsStatus();
  const attribution = attributionStatus();
  const files = [dataFileStatus(clients.path), dataFileStatus(attribution.path)];
  const disk = diskStatus(dirname(attribution.path));
  const secret = signingSecretSource();
  const warnings: StorageWarning[] = [];
  if (disk && disk.freePct < LOW_DISK_PCT()) warnings.push({ code: "disk_low", critical: true, detail: `${disk.freePct}% of the data disk is free (warning line ${LOW_DISK_PCT()}%).` });
  if (attribution.lastWriteError) warnings.push({ code: "attribution_write_failed", critical: true, detail: `Last attribution save failed (${attribution.lastWriteError}). Counters are held in memory until a save succeeds.` });
  if (clients.loadedFrom === "backup") warnings.push({ code: "clients_restored_from_backup", critical: true, detail: "The key registry was unreadable at startup and was loaded from its .bak copy. Keys created or revoked after that copy may be missing." });
  if (attribution.loadedFrom === "backup") warnings.push({ code: "attribution_restored_from_backup", critical: true, detail: "The attribution file was unreadable at startup and was loaded from its .bak copy." });
  if (attribution.lastWriteBytes > attribution.warnBytes) warnings.push({ code: "attribution_large", critical: false, detail: `The attribution file is ${attribution.lastWriteBytes} bytes.` });
  if (attribution.droppedKeys > 0) warnings.push({ code: "attribution_key_cap", critical: false, detail: `${attribution.droppedKeys} counter keys were folded into "(other)" after the daily cap.` });
  if (secret === "ephemeral") warnings.push({ code: "signing_secret_ephemeral", critical: false, detail: "The inquiry signing secret is per-process. Previews that have not been sent stop working at each restart." });
  for (const f of files) {
    if (f.exists && f.mode !== null && f.mode !== "600") warnings.push({ code: "file_mode", critical: false, detail: `${f.file} has mode ${f.mode}; expected 600.` });
  }
  const explicitDir = process.env.INQUIRIES_PATH || process.env.LEARNED_FACTS_PATH || (process.env.AGENT_CLIENTS_PATH && process.env.ATTRIBUTION_PATH);
  if (process.env.NODE_ENV === "production" && !explicitDir) {
    warnings.push({ code: "data_dir_default", critical: false, detail: "No data directory is configured (LEARNED_FACTS_PATH or INQUIRIES_PATH), so keys and attribution are written beside the app and may not survive a deploy." });
  }
  const stray = [...strayTempFiles(agentClientsPath()), ...strayTempFiles(attributionPath())];
  if (stray.length) warnings.push({ code: "stray_temp_files", critical: false, detail: `${stray.length} temp file(s) left by an interrupted write. Safe to delete.` });
  return {
    checkedAt: new Date().toISOString(),
    disk,
    files,
    agentClients: { count: clients.count, active: clients.active, loadedFrom: clients.loadedFrom },
    attribution: {
      days: attribution.days, counterKeys: attribution.counterKeys, retentionDays: attribution.retentionDays, pendingWrite: attribution.pendingWrite,
      lastWriteBytes: attribution.lastWriteBytes, loadedFrom: attribution.loadedFrom, sessionsInMemory: attribution.sessionsInMemory,
    },
    signingSecret: { source: secret },
    freeze: dataDirFreezeStatus(),
    warnings,
  };
}

let timer: ReturnType<typeof setInterval> | null = null;
let lastAlert = { codes: "", at: 0 };

/** One check: log every warning, and alert ops about critical ones at most once a day per set. */
export async function runStorageCheck(now = Date.now()): Promise<StorageWarning[]> {
  const { warnings } = storageStatus();
  for (const w of warnings) console.warn(`[storage] ${w.code}: ${w.detail}`);
  const critical = warnings.filter((w) => w.critical);
  const codes = critical.map((w) => w.code).sort().join(",");
  if (critical.length && (codes !== lastAlert.codes || now - lastAlert.at > 24 * 60 * 60 * 1000)) {
    lastAlert = { codes, at: now };
    await emitOpsAlert({ title: "MatchRV data storage needs attention", body: critical.map((w) => `${w.code}: ${w.detail}`).join("\n") }).catch(() => undefined);
  }
  return warnings;
}

/** Check shortly after startup, then every six hours. Does nothing in tests. */
export function startStorageMonitor(): void {
  if (timer || process.env.VITEST || process.env.NODE_ENV === "test") return;
  const first = setTimeout(() => { void runStorageCheck().catch(() => undefined); }, 60_000);
  first.unref?.();
  timer = setInterval(() => { void runStorageCheck().catch(() => undefined); }, 6 * 60 * 60 * 1000);
  timer.unref?.();
}

export function __resetStorageMonitorForTests(): void { lastAlert = { codes: "", at: 0 }; }
