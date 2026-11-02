/**
 * Load an inventory snapshot (.json or .json.gz) into the inventory schema.
 *
 *   INVENTORY_DATABASE_URL=postgres://... \
 *     pnpm --filter @workspace/api-server run load-inventory-db -- \
 *       --snapshot lib/agent-core/data/inventory.snapshot.json.gz --version e9a11db
 *
 * Runs the exact boot pipeline the snapshot server uses (indexSnapshot:
 * dealer geocode, manufacturer spec fill, facts-only; then the MCP quality
 * screen and the website search-ready gate), so every stored record is what
 * the in-memory server would serve. Idempotent: rows are upserted by id and
 * only rewritten when their content hash changes; rows missing from the
 * snapshot are deleted and the snapshot row is activated in one final
 * transaction. Re-run after any deploy that changes enrichment code.
 */
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import {
  indexSnapshot,
  unitSearchColumns,
  INVENTORY_DB_COLUMNS_VERSION,
  type CanonicalUnit,
  type InventorySnapshot,
} from "@workspace/agent-core";
import { screenMcpInventory } from "../services/mcp-inventory-quality";
import { isSearchReady } from "../services/search-ready";
import { closeInventoryPool, inventoryPool } from "../services/inventory-db";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const COLUMNS = [
  "id", "ord", "snapshot_version", "content_hash", "mcp_eligible", "quarantine", "search_ready",
  "rv_type", "is_motorized", "condition", "title_says_used", "year", "make", "brand_key", "model", "title",
  "price_usd", "length_ft", "weight_lbs", "gvwr_lbs", "sleeps", "sleeps_servable", "fresh_water_gal", "slideouts",
  "f_bunkhouse", "f_solar", "f_solar_prep", "f_lithium", "f_generator", "f_four_season", "f_outdoor_kitchen", "f_two_entry_doors",
  "dealer_id", "dealer_seq", "dealer_name", "dealer_city", "dealer_state", "lat", "lng", "coords_ok", "has_photos", "last_seen_at",
  "description", "unit_z", "zdict_id",
] as const;
const CASTS: Partial<Record<(typeof COLUMNS)[number], string>> = { quarantine: "jsonb", last_seen_at: "timestamptz", unit_z: "bytea" };
/** Columns that decide whether a stored row is stale (the compressed bytes depend on the dictionary, so they don't). */
const HASHED = COLUMNS.filter((c) => !["snapshot_version", "content_hash", "unit_z", "zdict_id"].includes(c));

/**
 * Deterministic 32 KB preset dictionary from the snapshot itself: an even
 * sample of records, most recent bytes kept (deflate weighs the tail most).
 */
export function buildDictionary(units: CanonicalUnit[]): Buffer {
  const step = Math.max(1, Math.floor(units.length / 400));
  const parts: string[] = [];
  for (let i = 0; i < units.length; i += step) parts.push(JSON.stringify(units[i]));
  return Buffer.from(parts.join("")).subarray(-32768);
}

export interface LoadResult { version: string; units: number; mcpEligible: number; searchReady: number; written: number; unchanged: number; deleted: number; ms: number }

export function parseSnapshotFile(path: string): InventorySnapshot {
  const raw = readFileSync(path);
  return JSON.parse((path.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf-8")) as InventorySnapshot;
}

export async function loadSnapshotIntoDb(snapshot: InventorySnapshot, version: string, opts: { batchSize?: number; newDictionary?: boolean; log?: (s: string) => void } = {}): Promise<LoadResult> {
  const log = opts.log ?? ((s: string) => console.log(s));
  const t0 = performance.now();
  const index = indexSnapshot(snapshot);
  const screened = screenMcpInventory(index);
  const units: CanonicalUnit[] = index.units;
  const dealerSeq = new Map<string, number>();
  const batchSize = opts.batchSize ?? 500;
  const pool = inventoryPool({ statement_timeout: 600_000, application_name: "matchrv-inventory-loader" });
  let written = 0;
  let readyCount = 0;

  // Reuse the newest dictionary unless asked for a fresh one (or none exists).
  let dictRow = opts.newDictionary ? undefined : (await pool.query<{ id: number; dict: Buffer }>("select id, dict from inventory.zdicts order by id desc limit 1")).rows[0];
  if (!dictRow) {
    const dict = buildDictionary(units);
    const sha = createHash("sha256").update(dict).digest("hex");
    dictRow = (await pool.query<{ id: number; dict: Buffer }>(
      "insert into inventory.zdicts (sha256, dict) values ($1, $2) on conflict (sha256) do update set sha256 = excluded.sha256 returning id, dict",
      [sha, dict],
    )).rows[0];
    log(`[load] dictionary ${dictRow.id} (${dict.length} bytes)`);
  }
  const dictionary = dictRow.dict;
  const dictId = dictRow.id;

  const rowFor = (u: CanonicalUnit, ord: number) => {
    let seq = dealerSeq.get(u.dealer.id);
    if (seq === undefined) { seq = dealerSeq.size + 1; dealerSeq.set(u.dealer.id, seq); }
    const issues = screened.quarantined.get(u.id) ?? null;
    const ready = isSearchReady(u);
    if (ready) readyCount++;
    const unitJson = JSON.stringify(u);
    const cols = unitSearchColumns(u);
    const base: Record<string, unknown> = {
      ...cols, id: u.id, ord, snapshot_version: version, mcp_eligible: issues === null,
      quarantine: issues ? JSON.stringify(issues) : null, search_ready: ready, dealer_seq: seq,
      description: u.description ?? null, zdict_id: dictId,
    };
    base.content_hash = createHash("md5").update(JSON.stringify(HASHED.map((c) => base[c] ?? null))).update(unitJson).digest("hex");
    base.unit_z = deflateRawSync(Buffer.from(unitJson), { level: 9, dictionary });
    return COLUMNS.map((c) => base[c] ?? null);
  };

  const updates = COLUMNS.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
  for (let i = 0; i < units.length; i += batchSize) {
    const slice = units.slice(i, i + batchSize);
    const params: unknown[] = [];
    const tuples = slice.map((u, j) => {
      const row = rowFor(u, i + j);
      const ph = row.map((v, k) => { params.push(v); const cast = CASTS[COLUMNS[k]]; return `$${params.length}${cast ? `::${cast}` : ""}`; });
      return `(${ph.join(", ")})`;
    });
    const res = await pool.query(
      `insert into inventory.units (${COLUMNS.join(", ")}) values ${tuples.join(", ")}
       on conflict (id) do update set ${updates}, updated_at = now()
       where inventory.units.content_hash is distinct from excluded.content_hash`,
      params,
    );
    written += res.rowCount ?? 0;
    if ((i / batchSize) % 20 === 0) log(`[load] ${Math.min(i + batchSize, units.length)}/${units.length} (written ${written})`);
  }

  const client = await pool.connect();
  let deleted = 0;
  try {
    await client.query("begin");
    const del = await client.query("delete from inventory.units u where not exists (select 1 from unnest($1::text[]) as k(id) where k.id = u.id)", [units.map((u) => u.id)]);
    deleted = del.rowCount ?? 0;
    const meta = {
      datasetNote: snapshot.datasetNote,
      stats: snapshot.stats,
      schemaVersion: snapshot.schemaVersion,
      inventoryQuality: screened.inventoryQuality,
      enrichStats: index.enrichStats ?? null,
      specStats: index.specStats ?? null,
    };
    await client.query("update inventory.snapshots set is_active = false where is_active and version <> $1", [version]);
    await client.query(
      `insert into inventory.snapshots (version, built_at, columns_version, units, mcp_eligible, search_ready, dealers, meta, is_active, loaded_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, true, now())
       on conflict (version) do update set built_at = excluded.built_at, columns_version = excluded.columns_version, units = excluded.units,
         mcp_eligible = excluded.mcp_eligible, search_ready = excluded.search_ready, dealers = excluded.dealers, meta = excluded.meta, is_active = true, loaded_at = now()`,
      [version, snapshot.builtAt, INVENTORY_DB_COLUMNS_VERSION, units.length, screened.units.length, readyCount, snapshot.stats?.dealers ?? dealerSeq.size, JSON.stringify(meta)],
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
  const result: LoadResult = { version, units: units.length, mcpEligible: screened.units.length, searchReady: readyCount, written, unchanged: units.length - written, deleted, ms: Math.round(performance.now() - t0) };
  log(`[load] done ${JSON.stringify(result)}`);
  return result;
}

async function main() {
  const snapshotPath = arg("snapshot") ?? resolve(import.meta.dirname, "../../../../lib/agent-core/data/inventory.snapshot.json.gz");
  const version = arg("version");
  if (!version) throw new Error("--version <label> is required (e.g. the git sha of the snapshot commit)");
  if (!process.env.INVENTORY_DATABASE_URL) throw new Error("INVENTORY_DATABASE_URL is not set");
  const snapshot = parseSnapshotFile(snapshotPath);
  console.log(`[load] ${snapshotPath}: ${snapshot.units.length} units, builtAt ${snapshot.builtAt}, version ${version}`);
  await loadSnapshotIntoDb(snapshot, version, { batchSize: Number(arg("batch")) || 500, newDictionary: process.argv.includes("--new-dictionary") });
  await closeInventoryPool();
}

if (process.argv[1] && /load-inventory-db\.(ts|js|cjs|mjs)$/.test(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
