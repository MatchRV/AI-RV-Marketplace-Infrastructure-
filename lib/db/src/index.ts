/**
 * Database entry point with two modes:
 *
 *  - postgres  — DATABASE_URL is set: node-postgres Pool (production behavior,
 *                unchanged).
 *  - embedded  — no DATABASE_URL: PGlite (in-process WASM Postgres) with the
 *                schema bootstrapped from bootstrap/schema.sql. Lets the whole
 *                stack run with zero external services — `pnpm install &&
 *                pnpm dev` works on a fresh clone, which is how the WebMCP
 *                Challenge demo and tests run.
 *  - none      — DISABLE_DB=1: no database at all. PGlite is a WASM Postgres
 *                and costs hundreds of MB just to open, which does not fit a
 *                small (512 MB) instance. The WebMCP agent layer never reads
 *                the database — every tool serves from the in-memory
 *                inventory snapshot — so the demo runs fine without one.
 *                Touching `db` in this mode throws a clear error rather than
 *                failing obscurely.
 *
 * PGlite is imported dynamically, so its WASM module is never loaded in
 * postgres or none mode.
 *
 * No top-level await (the production server bundles to CJS): embedded-mode
 * schema bootstrap happens in `ensureDbReady()`, which the server awaits
 * before serving traffic.
 */

import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import pg from "pg";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

const { Pool } = pg;

export type DbMode = "postgres" | "embedded" | "none";
export const DB_MODE: DbMode = process.env.DATABASE_URL
  ? "postgres"
  : process.env.DISABLE_DB === "1"
    ? "none"
    : "embedded";

export class DatabaseUnavailableError extends Error {
  constructor() {
    super(
      "No database in this deployment (DISABLE_DB=1). The WebMCP agent tools " +
        "serve from the in-memory inventory snapshot and do not need one.",
    );
    this.name = "DatabaseUnavailableError";
  }
}

export type Database = NodePgDatabase<typeof schema>;

let realDb: Database | null = null;
let pool: pg.Pool | null = null;
let readyPromise: Promise<void> | null = null;

/**
 * Consumers import `db` at module load, but in embedded mode the real
 * instance is not built until ensureDbReady() (so PGlite's WASM stays
 * unloaded until it is actually wanted). Forward through a proxy.
 */
const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    if (!realDb) throw new DatabaseUnavailableError();
    return Reflect.get(realDb as object, prop, receiver);
  },
}) as Database;

// import.meta.dirname is defined under tsx/ESM and rewritten to __dirname in
// the CJS production bundle; probe both layouts for the bootstrap DDL.
function findBootstrapSql(): string {
  const here = import.meta.dirname;
  const candidates = [
    resolve(here, "../bootstrap/schema.sql"), // lib/db/src → lib/db/bootstrap
    resolve(here, "../../lib/db/bootstrap/schema.sql"), // bundled: artifacts/api-server/dist
    resolve(here, "../../../lib/db/bootstrap/schema.sql"),
    resolve(here, "../../../../lib/db/bootstrap/schema.sql"),
  ];
  for (const c of candidates) {
    try {
      readFileSync(c, "utf-8");
      return c;
    } catch {
      // keep probing
    }
  }
  throw new Error(`Could not locate lib/db/bootstrap/schema.sql (searched from ${here})`);
}

/**
 * One stable location for embedded-database state, whatever the code layout:
 * anchored beside the bootstrap DDL → always <repo>/lib/db/.data/pglite
 * (gitignored). Overridable with PGLITE_DATA_DIR for hosts with read-only
 * checkouts.
 */
function defaultDataDir(): string {
  return resolve(dirname(findBootstrapSql()), "../.data/pglite");
}

if (DB_MODE === "postgres") {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  realDb = drizzlePg(pool, { schema });
  readyPromise = Promise.resolve();
} else if (DB_MODE === "none") {
  readyPromise = Promise.resolve();
}

async function bootstrapEmbedded(): Promise<void> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = process.env.PGLITE_DATA_DIR ?? defaultDataDir();
  mkdirSync(dirname(dataDir), { recursive: true });
  realDb = drizzlePglite(new PGlite(dataDir), { schema }) as unknown as Database;

  const existing = await db.execute(
    sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'listings' LIMIT 1`,
  );
  if (existing.rows.length > 0) return;
  const ddl = readFileSync(findBootstrapSql(), "utf-8");
  for (const statement of ddl.split(/;\s*\n/)) {
    const trimmed = statement.trim();
    if (trimmed) await db.execute(sql.raw(trimmed));
  }
  console.log("[db] embedded PGlite database initialized (schema bootstrapped)");
}

/** Await before serving traffic. Idempotent; no-op in postgres mode. */
export function ensureDbReady(): Promise<void> {
  if (!readyPromise) readyPromise = bootstrapEmbedded();
  return readyPromise;
}

export { db, pool };
export * from "./schema";
