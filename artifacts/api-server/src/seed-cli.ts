/**
 * Build-time seeding for the embedded database.
 *
 * PGlite is a WASM Postgres: seeding 1,056 listings peaks around 715 MB,
 * which does not fit a small production instance, while simply *opening*
 * an already-seeded database peaks around 380 MB. Rather than pay for a
 * bigger box to survive a one-time import, we do the import during the
 * build (which runs on a larger builder) and ship the populated data
 * directory with the deploy. At boot the server then finds a non-empty
 * database and skips seeding entirely.
 *
 * The WebMCP agent layer never reads this database — every tool serves
 * from the in-memory snapshot — so this only backs the classic
 * marketplace pages and the buyer_leads table.
 *
 * Safe to run repeatedly: seeding is a no-op once listings exist. Not
 * used when DATABASE_URL points at a real Postgres.
 */

import { ensureDbReady, DB_MODE } from "@workspace/db";
import { seedEmbeddedFromSnapshot } from "./lib/seed-embedded";

async function main(): Promise<void> {
  if (DB_MODE !== "embedded") {
    console.log("[seed-cli] DATABASE_URL set — skipping embedded seed.");
    return;
  }
  await ensureDbReady();
  await seedEmbeddedFromSnapshot();
  console.log("[seed-cli] embedded database ready; it ships with the build.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("[seed-cli] failed:", err);
    process.exit(1);
  },
);
