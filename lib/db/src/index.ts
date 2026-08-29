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
 *
 * No top-level await (the production server bundles to CJS): embedded-mode
 * schema bootstrap happens in `ensureDbReady()`, which the server awaits
 * before serving traffic.
 */

import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

const { Pool } = pg;

export type DbMode = "postgres" | "embedded";
export const DB_MODE: DbMode = process.env.DATABASE_URL ? "postgres" : "embedded";

export type Database = NodePgDatabase<typeof schema>;

let db: Database;
let pool: pg.Pool | null = null;
let readyPromise: Promise<void> | null = null;

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
  db = drizzlePg(pool, { schema });
  readyPromise = Promise.resolve();
} else {
  const dataDir = process.env.PGLITE_DATA_DIR ?? defaultDataDir();
  mkdirSync(dirname(dataDir), { recursive: true });

  const client = new PGlite(dataDir);
  // Drizzle's pglite driver queues queries until the instance is ready; the
  // schema bootstrap itself runs in ensureDbReady() before traffic.
  db = drizzlePglite(client, { schema }) as unknown as Database;

  readyPromise = null; // created lazily in ensureDbReady()
}

async function bootstrapEmbedded(): Promise<void> {
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
