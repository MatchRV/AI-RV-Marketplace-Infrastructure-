/**
 * Postgres access for INVENTORY_SOURCE=supabase. Read-only at runtime; the
 * loader (scripts/load-inventory-db.ts) is the only writer.
 *
 * Connection: INVENTORY_DATABASE_URL (server-side secret; never sent to a
 * browser). Use Supabase's pooler URL. TLS is on unless the URL says
 * sslmode=disable (local dev). INVENTORY_DATABASE_CA may hold the PEM of
 * Supabase's CA to verify the server certificate.
 */
import pg from "pg";
import { inflateRawSync } from "node:zlib";
import { INVENTORY_DB_COLUMNS_VERSION, type CanonicalUnit } from "@workspace/agent-core";

let pool: pg.Pool | null = null;

export function inventoryDbConfigured(): boolean {
  return Boolean(process.env.INVENTORY_DATABASE_URL);
}

export function poolConfig(url: string, overrides: Partial<pg.PoolConfig> = {}): pg.PoolConfig {
  const u = new URL(url);
  const sslMode = u.searchParams.get("sslmode");
  u.searchParams.delete("sslmode");
  const ca = process.env.INVENTORY_DATABASE_CA;
  return {
    connectionString: u.toString(),
    ssl: sslMode === "disable" ? false : ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    max: Number(process.env.INVENTORY_DATABASE_POOL_MAX) || 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 20_000,
    application_name: "matchrv-api",
    ...overrides,
  };
}

export function inventoryPool(overrides: Partial<pg.PoolConfig> = {}): pg.Pool {
  if (!pool) {
    const url = process.env.INVENTORY_DATABASE_URL;
    if (!url) throw new Error("INVENTORY_SOURCE=supabase needs INVENTORY_DATABASE_URL (server-side Postgres connection string).");
    pool = new pg.Pool(poolConfig(url, overrides));
    pool.on("error", (err) => console.error("[inventory-db] idle client error:", err.message));
  }
  return pool;
}

export async function closeInventoryPool(): Promise<void> {
  const p = pool;
  pool = null;
  if (p) await p.end();
}

export async function q<T extends pg.QueryResultRow = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await inventoryPool().query<T>(text, params)).rows;
}

export interface ActiveSnapshot {
  version: string;
  builtAt: string;
  loadedAt: string;
  columnsVersion: number;
  units: number;
  mcpEligible: number;
  searchReady: number;
  dealers: number | null;
  meta: { datasetNote?: string; stats?: Record<string, unknown>; inventoryQuality?: Record<string, unknown> } & Record<string, unknown>;
}

let activeCache: { at: number; value: ActiveSnapshot } | null = null;
const ACTIVE_TTL_MS = 60_000;

/** The active snapshot row (cached for a minute so a reload shows up without a restart). */
export async function activeSnapshot(): Promise<ActiveSnapshot> {
  if (activeCache && Date.now() - activeCache.at < ACTIVE_TTL_MS) return activeCache.value;
  const rows = await q<Record<string, any>>(
    "select version, built_at, loaded_at, columns_version, units, mcp_eligible, search_ready, dealers, meta from inventory.snapshots where is_active limit 1",
  );
  const r = rows[0];
  if (!r) throw new Error("inventory database has no active snapshot — run load-inventory-db first");
  const value: ActiveSnapshot = {
    version: r.version,
    builtAt: new Date(r.built_at).toISOString(),
    loadedAt: new Date(r.loaded_at).toISOString(),
    columnsVersion: r.columns_version,
    units: r.units,
    mcpEligible: r.mcp_eligible,
    searchReady: r.search_ready,
    dealers: r.dealers,
    meta: r.meta ?? {},
  };
  activeCache = { at: Date.now(), value };
  if (unitCache.size && unitCacheVersion !== value.version) unitCache.clear();
  unitCacheVersion = value.version;
  return value;
}

export function resetInventoryDbCaches(): void {
  activeCache = null;
  dicts.clear();
  unitCache.clear();
}

// Small LRU for get_rv / compare / inquiry lookups (bounded; values are full units).
const UNIT_CACHE_MAX = 500;
const unitCache = new Map<string, UnitRow | null>();
let unitCacheVersion: string | null = null;

// Preset dictionaries (inventory.zdicts) — a few 32 KB buffers, cached forever.
const dicts = new Map<number, Buffer>();

async function ensureDicts(ids: Iterable<number>): Promise<void> {
  const missing = [...new Set(ids)].filter((id) => !dicts.has(id));
  if (!missing.length) return;
  const rows = await q<{ id: number; dict: Buffer }>("select id, dict from inventory.zdicts where id = any($1::int[])", [missing]);
  for (const r of rows) dicts.set(r.id, r.dict);
}

/** Decode one stored unit (raw deflate with a preset dictionary). */
export function decodeUnit(z: Buffer, dictId: number): CanonicalUnit {
  const dict = dicts.get(dictId);
  if (!dict) throw new Error(`inventory zdict ${dictId} not loaded`);
  return JSON.parse(inflateRawSync(z, { dictionary: dict }).toString("utf-8")) as CanonicalUnit;
}

export async function decodeRows<T extends { unit_z: Buffer; zdict_id: number }>(rows: T[]): Promise<CanonicalUnit[]> {
  await ensureDicts(rows.map((r) => r.zdict_id));
  return rows.map((r) => decodeUnit(r.unit_z, r.zdict_id));
}

export interface UnitRow { unit: CanonicalUnit; mcpEligible: boolean; quarantine: string[] | null; searchReady: boolean; dealerSeq: number }

export async function fetchUnits(ids: string[]): Promise<Map<string, UnitRow>> {
  const out = new Map<string, UnitRow>();
  const missing: string[] = [];
  for (const id of ids) {
    const hit = unitCache.get(id);
    if (hit !== undefined) {
      unitCache.delete(id);
      unitCache.set(id, hit);
      if (hit) out.set(id, hit);
    } else missing.push(id);
  }
  if (missing.length) {
    const rows = await q<{ id: string; unit_z: Buffer; zdict_id: number; mcp_eligible: boolean; quarantine: string[] | null; search_ready: boolean; dealer_seq: number }>(
      "select id, unit_z, zdict_id, mcp_eligible, quarantine, search_ready, dealer_seq from inventory.units where id = any($1::text[])",
      [missing],
    );
    const decoded = await decodeRows(rows);
    const found = new Map(rows.map((r, i) => [r.id, { unit: decoded[i], mcpEligible: r.mcp_eligible, quarantine: r.quarantine, searchReady: r.search_ready, dealerSeq: r.dealer_seq } as UnitRow]));
    for (const id of missing) {
      const row = found.get(id) ?? null;
      unitCache.set(id, row);
      if (row) out.set(id, row);
    }
    while (unitCache.size > UNIT_CACHE_MAX) unitCache.delete(unitCache.keys().next().value as string);
  }
  return out;
}

/**
 * Stream rows matching `where` in snapshot order (ord, id) with keyset
 * pagination, `batchSize` at a time. Only the current batch is in memory.
 */
export async function streamUnits(
  where: string,
  params: unknown[],
  onBatch: (units: CanonicalUnit[]) => void,
  batchSize = 1000,
): Promise<number> {
  let lastOrd = -1;
  let lastId = "";
  let total = 0;
  const n = params.length;
  for (;;) {
    const rows = await q<{ ord: number; id: string; unit_z: Buffer; zdict_id: number }>(
      `select ord, id, unit_z, zdict_id from inventory.units where (${where}) and (ord, id) > ($${n + 1}::int, $${n + 2}::text) order by ord, id limit ${batchSize}`,
      [...params, lastOrd, lastId],
    );
    if (!rows.length) break;
    total += rows.length;
    onBatch(await decodeRows(rows));
    const last = rows[rows.length - 1];
    lastOrd = last.ord;
    lastId = last.id;
    if (rows.length < batchSize) break;
  }
  return total;
}

/** Startup check for INVENTORY_SOURCE=supabase: reachable, an active snapshot, matching column version. Never throws. */
export async function warmInventoryDb(): Promise<boolean> {
  const t0 = performance.now();
  try {
    const a = await activeSnapshot();
    if (a.columnsVersion !== INVENTORY_DB_COLUMNS_VERSION) {
      console.error(`[inventory-db] active snapshot ${a.version} was loaded with columns v${a.columnsVersion}, this server expects v${INVENTORY_DB_COLUMNS_VERSION} — reload it with load-inventory-db before serving (or set INVENTORY_SOURCE=snapshot).`);
      return false;
    }
    console.log(`[inventory-db] serving snapshot ${a.version} from Postgres: ${a.units} units, ${a.mcpEligible} MCP-eligible, ${a.searchReady} search-ready (built ${a.builtAt}, loaded ${a.loadedAt}) in ${Math.round(performance.now() - t0)}ms`);
    return true;
  } catch (err) {
    console.error("[inventory-db] INVENTORY_SOURCE=supabase but the inventory database is not usable — inventory requests will fail until it is (set INVENTORY_SOURCE=snapshot to roll back):", err instanceof Error ? err.message : err);
    return false;
  }
}
