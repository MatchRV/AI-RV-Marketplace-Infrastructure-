import fs from "fs";
import path from "path";
import { Router, type IRouter, type RequestHandler } from "express";
import { db, listingsTable, dealersTable, importRunsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { normalizeType, parseLocation, toNum, toInt, toBool } from "../lib/normalizers";
import { syncScraperDataToDB, writeScrapeStatus } from "../lib/sync-from-scraper";

const router: IRouter = Router();

const IMPORT_API_KEY = process.env.IMPORT_API_KEY;

// ─── Auth middleware ───────────────────────────────────────────────────────

const importAuth: RequestHandler = (req, res, next) => {
  if (!IMPORT_API_KEY) {
    res.status(503).json({ error: "IMPORT_API_KEY not configured on server" });
    return;
  }
  if (req.headers["x-api-key"] !== IMPORT_API_KEY) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
};


// ─── Dealer upsert ─────────────────────────────────────────────────────────

interface DealerInput {
  domain: string;
  name?: string;
  city?: string;
  state?: string;
  phone?: string;
  rating?: number;
  reviewCount?: number;
  avgResponseTime?: string;
  beginnerFriendly?: boolean;
  yearsInBusiness?: number;
}

async function upsertDealer(d: DealerInput): Promise<{ id: number; action: "inserted" | "updated" }> {
  const domain = d.domain.toLowerCase().trim();
  const name = d.name ?? domain.split(".")[0];
  const city = d.city ?? domain.split(".")[0];
  const state = d.state ?? "WA";

  // SELECT first to avoid ON CONFLICT issues with partial unique indexes.
  const existing = await db.execute(
    sql`SELECT id FROM dealers WHERE domain = ${domain} LIMIT 1`
  ) as { rows?: { id: number }[] };

  if (existing.rows && existing.rows.length > 0) {
    const id = existing.rows[0].id;
    await db.execute(sql`
      UPDATE dealers SET
        name = ${name},
        city = ${city},
        state = ${state},
        phone = COALESCE(${d.phone ?? null}, phone)
      WHERE id = ${id}
    `);
    return { id, action: "updated" };
  }

  // Not found — insert a new dealer row.
  const inserted = await db.execute(sql`
    INSERT INTO dealers (name, domain, city, state, phone, rating, review_count, avg_response_time, beginner_friendly, years_in_business, total_listings)
    VALUES (
      ${name}, ${domain}, ${city}, ${state},
      ${d.phone ?? null},
      ${d.rating ?? (4.2 + Math.random() * 0.7)},
      ${d.reviewCount ?? Math.floor(Math.random() * 400) + 20},
      ${d.avgResponseTime ?? "< 2 hours"},
      ${d.beginnerFriendly ?? Math.random() > 0.4},
      ${d.yearsInBusiness ?? Math.floor(Math.random() * 30) + 5},
      0
    )
    RETURNING id
  `) as { rows?: { id: number }[] };

  const row = inserted.rows?.[0];
  if (!row) throw new Error(`Dealer insert returned no row for domain=${domain}`);
  return { id: row.id, action: "inserted" };
}

// ─── Listing upsert ────────────────────────────────────────────────────────

interface ListingInput {
  vin?: string;
  title?: string;
  make: string;
  model?: string;
  year: number;
  type: string;
  price: number;
  mileage?: number;
  length?: number;
  slides?: number;
  sleeps?: number;
  location?: string;
  condition?: string;
  description?: string;
  features?: string[];
  images?: string[];
  dealer_name?: string;
  dealer_domain?: string;
  dealer_location?: string;
  dealer_id?: number;
  width?: number;
  height?: number;
  dry_weight?: number;
  gvwr?: number;
  hitch_weight?: number;
  fresh_water_capacity?: number;
  gray_water_capacity?: number;
  black_water_capacity?: number;
  generator?: boolean;
  solar?: boolean;
  awning?: boolean;
  outdoor_kitchen?: boolean;
  washer_dryer?: boolean;
  price_history?: { date: string; price: number }[];
}

async function upsertListing(
  record: ListingInput,
  dealerId: number,
  dealerName: string
): Promise<"inserted" | "updated" | "skipped"> {
  const type = normalizeType(record.type);
  if (!type) return "skipped";

  const price = toNum(record.price);
  if (!price || price < 1000 || price > 2_000_000) return "skipped";

  const make = record.make ? String(record.make) : null;
  const year = toInt(record.year);
  if (!make || !year) return "skipped";

  const model = record.model ?? "";
  const vin = record.vin ? String(record.vin) : null;
  const isNew = String(record.condition ?? "").toLowerCase().includes("new");

  const images = Array.isArray(record.images)
    ? record.images
        .filter((u) => typeof u === "string" && /\.(jpe?g|png|webp)(\?|$)/i.test(u) && !u.includes("/common/"))
        .slice(0, 12)
    : [];

  const marketValue = Math.round(price * (0.95 + Math.random() * 0.1));
  const dealSavings = Math.max(0, marketValue - price);
  const pctSavings = dealSavings / marketValue;
  const dealScore =
    pctSavings >= 0.1 ? "great_deal" :
    pctSavings >= 0.05 ? "good_deal" :
    price > marketValue * 1.05 ? "high_price" : "fair_deal";

  const { city } = parseLocation(record.location, dealerName);
  const location = `${city}, WA`;

  // For VIN listings: upsert by VIN.
  // For no-VIN listings: upsert by (title, dealer_id) to prevent duplicates.
  const lookupTitle = record.title ?? `${year} ${make} ${model}`;
  const existingQuery = vin
    ? sql`SELECT id FROM listings WHERE vin = ${vin} LIMIT 1`
    : sql`SELECT id FROM listings WHERE title = ${lookupTitle} AND dealer_id = ${dealerId} LIMIT 1`;

  const existing = await db.execute(existingQuery) as { rows?: { id: number }[] };

  if (existing.rows && existing.rows.length > 0) {
    await db.execute(sql`
      UPDATE listings SET
        price = ${price},
        market_value = ${marketValue},
        deal_score = ${dealScore},
        deal_savings = ${dealSavings},
        images = ${JSON.stringify(images)}::jsonb,
        updated_at = NOW()
      WHERE id = ${existing.rows[0].id}
    `);
    return "updated";
  }

  try {
    await db.insert(listingsTable).values({
      title: record.title ?? `${year} ${make} ${model}`,
      make,
      model,
      year,
      type,
      price,
      marketValue,
      dealScore,
      dealSavings,
      mileage: toInt(record.mileage),
      length: toNum(record.length),
      slides: toInt(record.slides) ?? 0,
      sleeps: toInt(record.sleeps) ?? 4,
      location,
      state: "WA",
      dealerName,
      dealerId,
      images,
      daysOnMarket: 0,
      condition: isNew ? "new" : "used",
      isNew,
      isFeatured: false,
      vin,
      description: record.description ?? null,
      features: Array.isArray(record.features) ? record.features.slice(0, 30) : [],
      widthFt: toNum(record.width),
      heightFt: toNum(record.height),
      dryWeight: toNum(record.dry_weight),
      gvwr: toNum(record.gvwr),
      hitchWeight: toNum(record.hitch_weight),
      freshWater: toNum(record.fresh_water_capacity),
      greyWater: toNum(record.gray_water_capacity),
      blackWater: toNum(record.black_water_capacity),
      generator: toBool(record.generator),
      solar: toBool(record.solar),
      awning: record.awning !== null && record.awning !== undefined ? toBool(record.awning) : true,
      outdoorKitchen: toBool(record.outdoor_kitchen),
      washerDryer: toBool(record.washer_dryer),
      priceHistory: Array.isArray(record.price_history) ? record.price_history : [],
    });
    return "inserted";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[import] Listing insert failed: ${msg}`);
    return "skipped";
  }
}

// ─── POST /api/import/listings ─────────────────────────────────────────────

router.post("/import/listings", importAuth, async (req, res) => {
  const startedAt = Date.now();
  const sourceIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? null;

  try {
    const { dealers = [], listings = [] } = req.body as {
      dealers?: DealerInput[];
      listings?: (ListingInput & { dealer_domain?: string })[];
    };

    if (!Array.isArray(dealers) || !Array.isArray(listings)) {
      res.status(400).json({ error: "Body must be { dealers: [...], listings: [...] }" });
      return;
    }

    // ── 1. Upsert dealers ────────────────────────────────────────────────
    const dealerStats = { inserted: 0, updated: 0 };
    const domainToId = new Map<string, number>();
    const domainToName = new Map<string, string>();

    for (const d of dealers) {
      if (!d.domain) continue;
      try {
        const { id, action } = await upsertDealer(d);
        domainToId.set(d.domain.toLowerCase(), id);
        domainToName.set(d.domain.toLowerCase(), d.name ?? d.domain);
        if (action === "inserted") dealerStats.inserted++;
        else dealerStats.updated++;
      } catch (err) {
        console.warn(`[import] Dealer upsert failed for ${d.domain}: ${err}`);
      }
    }

    // ── 2. Upsert listings ───────────────────────────────────────────────
    const listingStats = { inserted: 0, updated: 0, skipped: 0 };

    for (const listing of listings) {
      const domain = listing.dealer_domain?.toLowerCase();
      let dealerId = domain ? domainToId.get(domain) : undefined;
      let dealerName = domain ? (domainToName.get(domain) ?? domain) : "WA Dealer";

      if (!dealerId && domain) {
        try {
          const result = await db.execute(
            sql`SELECT id, name FROM dealers WHERE domain = ${domain} LIMIT 1`
          ) as { rows?: { id: number; name: string }[] };
          if (result.rows?.[0]) {
            dealerId = result.rows[0].id;
            dealerName = result.rows[0].name;
            domainToId.set(domain, dealerId);
            domainToName.set(domain, dealerName);
          }
        } catch { /* skip */ }
      }

      // Fallback: match by dealer_name when domain lookup fails.
      // This handles existing DB rows that were imported before the domain
      // column was populated (e.g. the initial production seed).
      if (!dealerId && listing.dealer_name) {
        const fallbackName = listing.dealer_name.trim();
        try {
          const result = await db.execute(
            sql`SELECT id, name FROM dealers WHERE name ILIKE ${fallbackName} LIMIT 1`
          ) as { rows?: { id: number; name: string }[] };
          if (result.rows?.[0]) {
            dealerId = result.rows[0].id;
            dealerName = result.rows[0].name;
            if (domain) {
              domainToId.set(domain, dealerId);
              domainToName.set(domain, dealerName);
            }
          }
        } catch { /* skip */ }
      }

      if (!dealerId) {
        listingStats.skipped++;
        continue;
      }

      const action = await upsertListing(listing, dealerId, dealerName);
      listingStats[action]++;
    }

    // ── 3. Recalculate total_listings for all dealers ────────────────────
    // Update all dealers rather than a filtered subset to avoid Drizzle
    // array-binding issues with ANY($1::int[]) and to keep counts accurate.
    if (domainToId.size > 0) {
      await db.execute(sql`
        UPDATE dealers d
        SET total_listings = COALESCE(
          (SELECT COUNT(*) FROM listings l WHERE l.dealer_id = d.id), 0
        )
      `);
    }

    const durationMs = Date.now() - startedAt;

    // ── 4. Log this run to import_runs ───────────────────────────────────
    try {
      await db.insert(importRunsTable).values({
        sourceIp,
        dealersInserted: dealerStats.inserted,
        dealersUpdated: dealerStats.updated,
        listingsInserted: listingStats.inserted,
        listingsUpdated: listingStats.updated,
        listingsSkipped: listingStats.skipped,
        durationMs,
      });
    } catch (logErr) {
      console.warn("[import/listings] Failed to log import run:", logErr);
    }

    res.json({
      ok: true,
      dealers: dealerStats,
      listings: listingStats,
      importedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[import/listings]", err);

    // Log failed runs too
    try {
      await db.insert(importRunsTable).values({
        sourceIp,
        dealersInserted: 0,
        dealersUpdated: 0,
        listingsInserted: 0,
        listingsUpdated: 0,
        listingsSkipped: 0,
        durationMs: Date.now() - startedAt,
        error: String(err),
      });
    } catch { /* ignore log failures */ }

    res.status(500).json({ error: String(err) });
  }
});

// ─── PUT /api/import/data/:filename ────────────────────────────────────────

const DATA_DIR = path.resolve(process.env.HOME ?? "/home/runner", "workspace/MatchRV-scraper/data");

router.put("/import/data/:filename", importAuth, (req, res) => {
  try {
    const filename = path.basename(String(req.params.filename));
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(req.body));
    res.json({ ok: true, file: filename });
  } catch (err) {
    console.error("[import/data]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/import/sync ─────────────────────────────────────────────────

let syncInProgress = false;

router.post("/import/sync", importAuth, async (req, res) => {
  if (syncInProgress) {
    res.status(409).json({ error: "Sync already in progress" });
    return;
  }
  syncInProgress = true;
  try {
    const stats = await syncScraperDataToDB();
    await writeScrapeStatus({
      last_sync_at: new Date().toISOString(),
      last_sync_inserted: stats.inserted,
      last_sync_updated: stats.updated,
      last_sync_skipped: stats.skipped,
      dealer_counts: stats.dealer_counts,
    });
    res.json({ ok: true, stats });
  } catch (err) {
    console.error("[import/sync]", err);
    res.status(500).json({ error: String(err) });
  } finally {
    syncInProgress = false;
  }
});

export default router;


