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
 */

import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import pg from "pg";
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

const { Pool } = pg;

export type DbMode = "postgres" | "embedded";
export const DB_MODE: DbMode = process.env.DATABASE_URL ? "postgres" : "embedded";

export type Database = NodePgDatabase<typeof schema>;

let db: Database;
let pool: pg.Pool | null = null;

if (DB_MODE === "postgres") {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzlePg(pool, { schema });
} else {
  const here = dirname(fileURLToPath(import.meta.url));
  const dataDir = process.env.PGLITE_DATA_DIR ?? resolve(here, "../.data/pglite");
  mkdirSync(dirname(dataDir), { recursive: true });

  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(dataDir);
  // PGlite and node-postgres drizzle instances expose the same query-builder
  // surface for our schema; the cast keeps one exported type for consumers.
  const embedded = drizzlePglite(client, { schema }) as unknown as Database;

  const existing = await embedded.execute(
    sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'listings' LIMIT 1`,
  );
  if (existing.rows.length === 0) {
    const ddl = readFileSync(resolve(here, "../bootstrap/schema.sql"), "utf-8");
    // Statements are separated by blank lines in the generated file; execute
    // one at a time (PGlite handles multi-statement, but errors localize better).
    for (const statement of ddl.split(/;\s*\n/)) {
      const trimmed = statement.trim();
      if (trimmed) await embedded.execute(sql.raw(trimmed));
    }
    console.log("[db] embedded PGlite database initialized (schema bootstrapped)");
  }
  db = embedded;
}

export { db, pool };
export * from "./schema";
