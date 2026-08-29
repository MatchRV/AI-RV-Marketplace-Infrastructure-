import { spawn } from "child_process";
import { resolve } from "path";
import { existsSync } from "fs";
import { DB_MODE, ensureDbReady } from "@workspace/db";
import { isAnthropicConfigured } from "@workspace/integrations-anthropic-ai";
import app from "./app";
import { autoImportIfEmpty } from "./lib/auto-import";
import { seedEmbeddedFromSnapshot } from "./lib/seed-embedded";
import { startEnrichmentCron } from "./services/listing-enrichment";
import { syncScraperDataToDB, writeScrapeStatus, readScrapeStatus } from "./lib/sync-from-scraper";

// Default the port in development so `pnpm dev` works on a fresh clone.
const rawPort = process.env["PORT"] ?? (process.env.NODE_ENV !== "production" ? "8080" : undefined);

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const SCRAPER_ROOT = resolve(import.meta.dirname, "../../../MatchRV-scraper");
const SIX_HOURS = 6 * 60 * 60 * 1000;

async function runScheduledScrape() {
  if (!existsSync(SCRAPER_ROOT)) return;

  const status = await readScrapeStatus();
  if (status.is_scraping) {
    console.log("[cron] Scraper already running — skipping scheduled run");
    return;
  }

  console.log("[cron] Starting scheduled scrape...");
  await writeScrapeStatus({
    is_scraping: true,
    scrape_started_at: new Date().toISOString(),
    scrape_completed_at: null,
    scrape_error: null,
  });

  const child = spawn("node", ["scraper/scheduled-run.js"], {
    cwd: SCRAPER_ROOT,
    env: { ...process.env, HEADLESS: "true" },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(`[scraper] ${chunk}`));
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[scraper] ${chunk}`));

  child.on("close", async (code) => {
    await writeScrapeStatus({
      is_scraping: false,
      scrape_completed_at: new Date().toISOString(),
      scrape_pid: null,
      scrape_error: code !== 0 ? `Exited with code ${code}` : null,
    });

    if (code === 0) {
      console.log("[cron] Scrape complete — syncing to DB");
      try {
        const result = await syncScraperDataToDB();
        await writeScrapeStatus({
          last_sync_at: new Date().toISOString(),
          last_sync_inserted: result.inserted,
          last_sync_updated: result.updated,
          last_sync_skipped: result.skipped,
          dealer_counts: result.dealer_counts,
        });
        console.log(`[cron] Sync complete: +${result.inserted} new, ~${result.updated} updated`);
      } catch (err) {
        console.error("[cron] DB sync failed:", err);
      }
    }
  });

  child.unref();
}

function startScraperCron() {
  if (!existsSync(SCRAPER_ROOT)) {
    console.log("[cron] MatchRV-scraper not found — scrape cron disabled");
    return;
  }
  console.log("[cron] Scrape scheduler active — will run every 6 hours");
  setInterval(runScheduledScrape, SIX_HOURS);
}

async function start() {
  await ensureDbReady();
  if (DB_MODE === "embedded") {
    // Zero-service mode: seed the embedded DB from the committed snapshot.
    await seedEmbeddedFromSnapshot();
  } else {
    await autoImportIfEmpty();
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port} (db: ${DB_MODE})`);
    if (isAnthropicConfigured()) {
      startEnrichmentCron();
    } else {
      console.log("[startup] Anthropic integration not configured — AI chat/enrichment disabled; WebMCP agent tools unaffected");
    }
    if (DB_MODE === "postgres" && existsSync(resolve(SCRAPER_ROOT, "scraper/scheduled-run.js"))) {
      startScraperCron();
    } else {
      console.log("[startup] scraper cron disabled (embedded db or scraper script not present)");
    }
  });
}

start();
