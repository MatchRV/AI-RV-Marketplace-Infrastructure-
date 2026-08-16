import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import { resolve } from "path";
import { existsSync } from "fs";
import { readdir } from "fs/promises";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { runImport } from "../lib/auto-import";
import { enrichBatch } from "../services/listing-enrichment";
import {
  syncScraperDataToDB,
  readScrapeStatus,
  writeScrapeStatus,
  DATA_DIR,
} from "../lib/sync-from-scraper";

const router: IRouter = Router();
const ADMIN_KEY = process.env.ADMIN_KEY;
const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../../..");

function adminAuth(req: { headers: Record<string, string | string[] | undefined> }, res: { status: (n: number) => { json: (o: unknown) => void } }, next: () => void) {
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

// ─── Push-to-prod in-memory state ─────────────────────────────────────────

interface PushStatus {
  isPushing: boolean;
  startedAt: string | null;
  completedAt: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

let pushStatus: PushStatus = {
  isPushing: false,
  startedAt: null,
  completedAt: null,
  result: null,
  error: null,
};

// ─── Existing inventory import ────────────────────────────────────────────

router.post("/admin/import-inventory", async (req, res) => {
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const { inserted, skipped, dealers } = await runImport();
    res.json({ ok: true, inserted, skipped, dealers });
  } catch (err) {
    console.error("[admin/import-inventory]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── AI Enrichment ────────────────────────────────────────────────────────

router.post("/admin/enrich", async (req, res) => {
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) { res.status(403).json({ error: "Forbidden" }); return; }
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  try {
    console.log(`[admin/enrich] Starting batch enrichment, limit=${limit}`);
    const result = await enrichBatch(limit);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[admin/enrich]", err);
    res.status(500).json({ error: String(err) });
  }
});

router.get("/admin/enrich-status", async (req, res) => {
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const pending = await db.execute(sql.raw(`SELECT COUNT(*) AS cnt FROM listings WHERE (enrichment_version IS NULL OR enrichment_version < 1)`));
    const enriched = await db.execute(sql.raw(`SELECT COUNT(*) AS cnt FROM listings WHERE enrichment_version >= 1`));
    const total = await db.execute(sql.raw(`SELECT COUNT(*) AS cnt FROM listings`));
    type CntRows = { rows?: { cnt: string }[] };
    res.json({
      total: Number(((total as unknown as CntRows).rows ?? [])[0]?.cnt ?? 0),
      enriched: Number(((enriched as unknown as CntRows).rows ?? [])[0]?.cnt ?? 0),
      pending: Number(((pending as unknown as CntRows).rows ?? [])[0]?.cnt ?? 0),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── General stats ────────────────────────────────────────────────────────

router.get("/admin/stats", async (req, res) => {
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const listingCount = await db.execute(sql`SELECT COUNT(*) AS count FROM listings`);
    const dealerCount = await db.execute(sql`SELECT COUNT(*) AS count FROM dealers`);
    res.json({
      listings: Number((listingCount.rows?.[0] as { count: string })?.count ?? 0),
      dealers: Number((dealerCount.rows?.[0] as { count: string })?.count ?? 0),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Scraper endpoints ────────────────────────────────────────────────────

/**
 * POST /api/admin/scrape
 * Launches the Python scraper for all dealers.
 * Runs asynchronously — returns immediately. Check /api/admin/scrape-status for progress.
 */
router.post("/admin/scrape", async (req, res) => {
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) { res.status(403).json({ error: "Forbidden" }); return; }

  const status = await readScrapeStatus();
  if (status.is_scraping) {
    res.json({ ok: false, message: "Scraper is already running", status });
    return;
  }

  await writeScrapeStatus({
    is_scraping: true,
    scrape_started_at: new Date().toISOString(),
    scrape_completed_at: null,
    scrape_error: null,
  });

  const child = spawn("python3", ["-m", "rv_inventory_scraper.scraper"], {
    cwd: WORKSPACE_ROOT,
    env: { ...process.env },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  await writeScrapeStatus({ scrape_pid: child.pid ?? null });

  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(`[scraper] ${chunk}`);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[scraper] ${chunk}`);
  });

  child.on("close", async (code) => {
    await writeScrapeStatus({
      is_scraping: false,
      scrape_completed_at: new Date().toISOString(),
      scrape_pid: null,
      scrape_error: code !== 0 ? `Exited with code ${code}` : null,
    });

    if (code === 0) {
      console.log("[scraper] Run complete — auto-syncing to DB");
      try {
        const result = await syncScraperDataToDB();
        await writeScrapeStatus({
          last_sync_at: new Date().toISOString(),
          last_sync_inserted: result.inserted,
          last_sync_updated: result.updated,
          last_sync_skipped: result.skipped,
          dealer_counts: result.dealer_counts,
        });
        console.log(`[scraper] DB sync complete: ${result.inserted} inserted, ${result.updated} updated`);
      } catch (syncErr) {
        console.error("[scraper] DB sync failed:", syncErr);
        await writeScrapeStatus({ scrape_error: `Sync failed: ${String(syncErr)}` });
      }
    }
  });

  child.unref();

  res.json({
    ok: true,
    message: "Scraper started — check status tab for progress",
    pid: child.pid,
  });
});

/**
 * POST /api/admin/sync
 * Syncs the existing scraper data/ state to the DB without re-scraping.
 */
router.post("/admin/sync", async (req, res) => {
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) { res.status(403).json({ error: "Forbidden" }); return; }

  try {
    console.log("[admin/sync] Starting DB sync from scraper data...");
    const result = await syncScraperDataToDB();
    await writeScrapeStatus({
      last_sync_at: new Date().toISOString(),
      last_sync_inserted: result.inserted,
      last_sync_updated: result.updated,
      last_sync_skipped: result.skipped,
      dealer_counts: result.dealer_counts,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[admin/sync]", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/admin/scrape-status
 * Returns the current scrape status plus per-dealer listing counts from data/.
 */
router.get("/admin/scrape-status", async (req, res) => {
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) { res.status(403).json({ error: "Forbidden" }); return; }

  try {
    const scrapeStatus = await readScrapeStatus();

    const dealerStats = await db.execute(sql.raw(`
      SELECT d.name, d.city, l.cnt, d.total_listings
      FROM dealers d
      LEFT JOIN (
        SELECT dealer_id, COUNT(*) AS cnt FROM listings GROUP BY dealer_id
      ) l ON l.dealer_id = d.id
      ORDER BY COALESCE(l.cnt, 0) DESC
    `)) as { rows?: { name: string; city: string; cnt: string; total_listings: string }[] };

    let dataFileCount = 0;
    if (existsSync(DATA_DIR)) {
      const files = await readdir(DATA_DIR);
      dataFileCount = files.filter((f) => f.endsWith(".json")).length;
    }

    const totalListings = await db.execute(sql.raw(`SELECT COUNT(*) AS cnt FROM listings`)) as { rows?: { cnt: string }[] };

    res.json({
      ...scrapeStatus,
      push_status: pushStatus,
      data_files: dataFileCount,
      total_listings_in_db: Number(totalListings.rows?.[0]?.cnt ?? 0),
      dealer_stats: (dealerStats.rows ?? []).map((r) => ({
        name: r.name,
        city: r.city,
        listing_count: Number(r.cnt ?? 0),
      })),
    });
  } catch (err) {
    console.error("[admin/scrape-status]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── Push to production ───────────────────────────────────────────────────

/**
 * POST /api/admin/push-to-prod
 * Pushes all dev DB listings to production via the import API.
 * Runs asynchronously — returns immediately. Poll /api/admin/scrape-status for pushStatus.
 */
router.post("/admin/push-to-prod", async (req, res) => {
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) { res.status(403).json({ error: "Forbidden" }); return; }

  if (pushStatus.isPushing) {
    res.json({ ok: false, message: "Push already in progress", status: pushStatus });
    return;
  }

  pushStatus = {
    isPushing: true,
    startedAt: new Date().toISOString(),
    completedAt: null,
    result: null,
    error: null,
  };

  const child = spawn("python3", ["-m", "rv_inventory_scraper.push_to_prod"], {
    cwd: WORKSPACE_ROOT,
    env: { ...process.env },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(`[push-to-prod] ${text}`);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[push-to-prod] ${chunk}`);
  });

  child.on("close", (code) => {
    pushStatus.isPushing = false;
    pushStatus.completedAt = new Date().toISOString();
    if (code === 0) {
      try {
        const lines = stdout.trim().split("\n");
        const lastLine = lines[lines.length - 1];
        pushStatus.result = JSON.parse(lastLine);
      } catch {
        pushStatus.result = { message: "Completed successfully" };
      }
    } else {
      pushStatus.error = `Process exited with code ${code}`;
    }
    console.log(`[push-to-prod] Done — code=${code}`, pushStatus.result ?? pushStatus.error);
  });

  child.unref();

  res.json({ ok: true, message: "Push to production started", status: pushStatus });
});

/**
 * POST /api/admin/dedup-listings
 * Removes duplicate no-VIN listings, keeping the one with the highest ID
 * (most recently inserted) per (title, dealer_id) pair.
 */
router.post("/admin/dedup-listings", async (req, res) => {
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const result = await db.execute(sql`
      DELETE FROM listings
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY title, dealer_id ORDER BY id DESC) AS rn
          FROM listings
          WHERE vin IS NULL OR vin = ''
        ) ranked
        WHERE rn > 1
      )
    `) as { rowCount?: number };
    const deleted = result.rowCount ?? 0;
    res.json({ ok: true, deleted });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Import run history ───────────────────────────────────────────────────

router.get("/admin/import-runs", async (req, res) => {
  if (!ADMIN_KEY || req.headers["x-admin-key"] !== ADMIN_KEY) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const rows = await db.execute(sql`
      SELECT id, imported_at, source_ip, dealers_inserted, dealers_updated,
             listings_inserted, listings_updated, listings_skipped, duration_ms, error
      FROM import_runs
      ORDER BY imported_at DESC
      LIMIT 20
    `) as { rows?: Record<string, unknown>[] };
    res.json({ runs: rows.rows ?? [] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── External read-only data endpoints ───────────────────────────────────────

/**
 * GET /api/admin/data/listings
 * Returns paginated listings rows.
 * Query params: limit (default 100, max 1000), offset (default 0), status (condition value e.g. "new"/"used")
 */
router.get("/admin/data/listings", adminAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 1000);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const status = req.query.status as string | undefined;

    let whereClause = "";
    if (status) {
      // status maps to the condition column ("new" or "used")
      whereClause = `WHERE condition = '${status.replace(/'/g, "''")}'`;
    }

    const rows = await db.execute(
      sql.raw(`
        SELECT id, title, make, model, year, type, price, market_value, deal_score,
               mileage, length, slides, sleeps, location, state,
               dealer_name, dealer_id, days_on_market, condition, is_new,
               is_featured, vin, enrichment_version, created_at, updated_at
        FROM listings
        ${whereClause}
        ORDER BY id DESC
        LIMIT ${limit} OFFSET ${offset}
      `)
    ) as { rows?: Record<string, unknown>[] };

    const total = await db.execute(
      sql.raw(`SELECT COUNT(*) AS cnt FROM listings ${whereClause}`)
    ) as { rows?: { cnt: string }[] };

    res.json({
      data: rows.rows ?? [],
      meta: {
        total: Number(total.rows?.[0]?.cnt ?? 0),
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error("[admin/data/listings]", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/admin/data/leads
 * Returns paginated scraper_leads rows.
 * Query params: limit (default 100, max 1000), offset (default 0),
 *               startDate (ISO date), endDate (ISO date)
 */
router.get("/admin/data/leads", adminAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 1000);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const conditions: string[] = [];
    if (startDate) conditions.push(`created_at >= '${startDate.replace(/'/g, "''")}'`);
    if (endDate) conditions.push(`created_at <= '${endDate.replace(/'/g, "''")}'`);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await db.execute(
      sql.raw(`
        SELECT id, listing_id, dealer_name, dealer_email,
               buyer_name, buyer_email, buyer_phone,
               message, listing_title, listing_url,
               crm_sync_status, created_at
        FROM scraper_leads
        ${whereClause}
        ORDER BY id DESC
        LIMIT ${limit} OFFSET ${offset}
      `)
    ) as { rows?: Record<string, unknown>[] };

    const total = await db.execute(
      sql.raw(`SELECT COUNT(*) AS cnt FROM scraper_leads ${whereClause}`)
    ) as { rows?: { cnt: string }[] };

    res.json({
      data: rows.rows ?? [],
      meta: {
        total: Number(total.rows?.[0]?.cnt ?? 0),
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error("[admin/data/leads]", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/admin/data/stats
 * Returns aggregate counts for use in dashboards.
 */
router.get("/admin/data/stats", adminAuth, async (req, res) => {
  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [totalListings, totalLeads, leadsThisMonth, crmSyncs] = await Promise.all([
      db.execute(sql.raw(`SELECT COUNT(*) AS cnt FROM listings`)) as Promise<{ rows?: { cnt: string }[] }>,
      db.execute(sql.raw(`SELECT COUNT(*) AS cnt FROM scraper_leads`)) as Promise<{ rows?: { cnt: string }[] }>,
      db.execute(sql.raw(`SELECT COUNT(*) AS cnt FROM scraper_leads WHERE created_at >= '${firstOfMonth}'`)) as Promise<{ rows?: { cnt: string }[] }>,
      db.execute(sql.raw(`
        SELECT
          SUM(CASE WHEN crm_sync_status = 'synced' THEN 1 ELSE 0 END) AS success,
          SUM(CASE WHEN crm_sync_status = 'failed'  THEN 1 ELSE 0 END) AS failure
        FROM scraper_leads
      `)) as Promise<{ rows?: { success: string; failure: string }[] }>,
    ]);

    res.json({
      total_listings: Number(totalListings.rows?.[0]?.cnt ?? 0),
      total_leads: Number(totalLeads.rows?.[0]?.cnt ?? 0),
      leads_this_month: Number(leadsThisMonth.rows?.[0]?.cnt ?? 0),
      crm_sync_success: Number(crmSyncs.rows?.[0]?.success ?? 0),
      crm_sync_failure: Number(crmSyncs.rows?.[0]?.failure ?? 0),
    });
  } catch (err) {
    console.error("[admin/data/stats]", err);
    res.status(500).json({ error: String(err) });
  }
});

router.post("/admin/test-notification", async (req, res) => {
  try {
    const { notifyLead } = await import("../lib/notify-lead.js");
    await notifyLead({
      leadSource: "test",
      contactName: "Test Buyer",
      contactEmail: req.body?.testEmail ?? "test@example.com",
      contactPhone: "555-555-5555",
      message: "This is a test notification from the MatchRV admin panel.",
      listingTitle: "2024 Test RV Model",
      listingSnapshot: { price: 49999, dealerName: "Test Dealer" },
    });
    res.json({ ok: true, message: "Test notification sent — check sales@matchrv.com" });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
