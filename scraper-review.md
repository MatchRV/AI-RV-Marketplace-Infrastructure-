# MatchRV — Scraper / Import Code Review
> All files that handle scraping, importing, and syncing inventory into the database.
> Generated for external review — May 2026.

---

## FILE 1: `artifacts/api-server/src/lib/normalizers.ts`
> Shared helper functions used by both the sync and import routes.

```typescript
export function normalizeType(t: unknown): string | null {
  if (!t) return null;
  const x = String(t).toLowerCase().trim();
  if (x === "unknown" || x === "other" || x === "rv" || x === "park model") return null;
  if (x.includes("toy hauler")) return "toy_hauler";
  if (x.includes("fifth wheel") || x.includes("destination trailer")) return "fifth_wheel";
  if (x.includes("travel trailer") || x === "destination") return "travel_trailer";
  if (x.includes("class a") || x.includes("motor home class a")) return "class_a";
  if (x.includes("class b") || x.includes("motor home class b")) return "class_b";
  if (x.includes("class c") || x.includes("super c") || x.includes("motor home class c")) return "class_c";
  if (x.includes("popup") || x.includes("pop-up") || x.includes("pop up") || x.includes("folding")) return "popup_camper";
  if (x.includes("truck camper")) return "truck_camper";
  return null;
}

export function parseLocation(loc: unknown, fallback: string): { city: string; state: string } {
  if (!loc) return { city: fallback, state: "WA" };
  const m = String(loc).match(/([A-Za-z .'-]+),\s*(WA|Washington)/i);
  if (m) return { city: m[1].trim(), state: "WA" };
  return { city: fallback, state: "WA" };
}

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[,$]/g, "").match(/-?\d+(\.\d+)?/);
  if (!s) return null;
  const n = parseFloat(s[0]);
  return Number.isFinite(n) ? n : null;
}

export function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n === null ? null : Math.round(n);
}

export function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "yes" || v === "1";
  if (typeof v === "number") return v > 0;
  return false;
}
```

---

## FILE 2: `artifacts/api-server/src/lib/auto-import.ts`
> Runs at server startup. If the DB is empty, reads a local JSON snapshot file and imports all listings.

```typescript
import { readFileSync } from "fs";
import { resolve } from "path";
import { db, listingsTable, dealersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

function getMasterPath() {
  // Walk up from src/lib → src → api-server → artifacts → workspace root
  return resolve(import.meta.dirname, "../../../../attached_assets/matchrv-master_1776731519171.json");
}
function getDealersPath() {
  return resolve(import.meta.dirname, "wa-dealers.json");
}

type ScrapedListing = {
  dealer_name: string | null;
  dealer_domain: string;
  dealer_location: string | null;
  condition: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  title: string | null;
  vin: string | null;
  rv_type: string | null;
  price: number | null;
  mileage: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  dry_weight: number | null;
  gvwr: number | null;
  hitch_weight: number | null;
  sleeps: number | null;
  slideouts: number | null;
  fresh_water_capacity: number | null;
  gray_water_capacity: number | null;
  black_water_capacity: number | null;
  awning: boolean | null;
  generator: boolean | null;
  description: string | null;
  features: string[];
  image_urls: string[];
  primary_image: string | null;
};

type DealerRow = { name: string; city: string; url: string };

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[,$]/g, "").match(/-?\d+(\.\d+)?/);
  if (!s) return null;
  const n = parseFloat(s[0]);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

function normalizeType(t: string | null): string | null {
  if (!t) return null;
  const x = t.toLowerCase().trim();
  if (x === "unknown" || x === "other" || x === "rv" || x === "park model") return null;
  if (x.includes("toy hauler")) return "toy_hauler";
  if (x.includes("fifth wheel") || x.includes("destination trailer")) return "fifth_wheel";
  if (x.includes("travel trailer") || x === "destination") return "travel_trailer";
  if (x.includes("class a") || x.includes("motor home class a")) return "class_a";
  if (x.includes("class b") || x.includes("motor home class b")) return "class_b";
  if (x.includes("class c") || x.includes("super c") || x.includes("motor home class c")) return "class_c";
  if (x.includes("popup") || x.includes("pop-up") || x.includes("pop up") || x.includes("folding")) return "popup_camper";
  if (x.includes("truck camper")) return "truck_camper";
  return null;
}

function inferTypeFromTitle(title: string | null): string | null {
  if (!title) return null;
  const x = title.toLowerCase();
  if (x.includes("toy hauler")) return "toy_hauler";
  if (x.includes("fifth wheel") || x.includes("5th wheel")) return "fifth_wheel";
  if (x.includes("travel trailer")) return "travel_trailer";
  if (x.includes("class a")) return "class_a";
  if (x.includes("class b")) return "class_b";
  if (x.includes("class c")) return "class_c";
  if (x.includes("popup") || x.includes("pop-up") || x.includes("pop up")) return "popup_camper";
  if (x.includes("truck camper")) return "truck_camper";
  return null;
}

function parseLocation(loc: string | null, fallbackCity: string): { city: string; state: string } {
  if (!loc) return { city: fallbackCity, state: "WA" };
  const m = loc.match(/([A-Za-z .'-]+),\s*WA/);
  if (m) return { city: m[1].trim(), state: "WA" };
  return { city: fallbackCity, state: "WA" };
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function runImport(): Promise<{ inserted: number; skipped: number; dealers: number }> {
  const master = JSON.parse(readFileSync(getMasterPath(), "utf-8")) as { listings: ScrapedListing[] };
  const dealerList = JSON.parse(readFileSync(getDealersPath(), "utf-8")) as DealerRow[];

  const domainMeta = new Map<string, { name: string; city: string }>();
  for (const d of dealerList) {
    const dom = domainFromUrl(d.url);
    if (!domainMeta.has(dom)) {
      const cleanName = d.name.replace(/\s*-\s*[A-Za-z .]+$/, "").trim();
      domainMeta.set(dom, { name: cleanName, city: d.city.split(",")[0].trim() });
    }
  }

  const byDomain = new Map<string, ScrapedListing[]>();
  for (const l of master.listings) {
    const dom = (l.dealer_domain || "").toLowerCase();
    if (!dom) continue;
    if (!byDomain.has(dom)) byDomain.set(dom, []);
    byDomain.get(dom)!.push(l);
  }

  await db.execute(sql`TRUNCATE TABLE listings RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE dealers RESTART IDENTITY CASCADE`);

  const dealerIdByDomain = new Map<string, number>();
  for (const [domain, listings] of byDomain) {
    const meta = domainMeta.get(domain);
    const firstLoc = listings.find((l) => l.dealer_location)?.dealer_location ?? null;
    const fallbackCity = meta?.city ?? domain.split(".")[0];
    const { city } = parseLocation(firstLoc, fallbackCity);
    const name =
      meta?.name ??
      listings.find((l) => l.dealer_name)?.dealer_name ??
      domain.split(".")[0].replace(/\b\w/g, (c) => c.toUpperCase());

    const [row] = await db
      .insert(dealersTable)
      .values({
        name,
        city,
        state: "WA",
        rating: 4.2 + Math.random() * 0.7,
        reviewCount: Math.floor(Math.random() * 400) + 20,
        avgResponseTime: ["< 1 hour", "< 2 hours", "< 4 hours"][Math.floor(Math.random() * 3)],
        beginnerFriendly: Math.random() > 0.4,
        yearsInBusiness: Math.floor(Math.random() * 30) + 5,
        totalListings: listings.length,
      })
      .returning({ id: dealersTable.id });
    dealerIdByDomain.set(domain, row.id);
  }

  const rows: (typeof listingsTable.$inferInsert)[] = [];
  let skipped = 0;

  for (const l of master.listings) {
    const type = normalizeType(l.rv_type) ?? inferTypeFromTitle(l.title);
    if (!type) { skipped++; continue; }
    if (!l.make || !l.year || !l.price) { skipped++; continue; }
    if (l.price < 1000 || l.price > 2_000_000) { skipped++; continue; }

    const dealerId = dealerIdByDomain.get((l.dealer_domain || "").toLowerCase());
    if (!dealerId) { skipped++; continue; }

    const meta = domainMeta.get((l.dealer_domain || "").toLowerCase());
    const fallbackCity = meta?.city ?? l.dealer_domain.split(".")[0];
    const { city, state } = parseLocation(l.dealer_location, fallbackCity);

    const images = (l.image_urls || [])
      .filter((u) => u && /\.(jpe?g|png|webp)(\?|$)/i.test(u) && !u.includes("/common/") && !u.includes("imgh_60x") && !u.includes("imgh_400x"))
      .slice(0, 12);
    if (images.length === 0 && l.primary_image) images.push(l.primary_image);

    const marketValue = Math.round(l.price * (0.95 + Math.random() * 0.1));
    const dealSavings = Math.max(0, marketValue - l.price);
    const pctSavings = dealSavings / marketValue;
    let dealScore = "fair_deal";
    if (pctSavings >= 0.1) dealScore = "great_deal";
    else if (pctSavings >= 0.05) dealScore = "good_deal";
    else if (l.price > marketValue * 1.05) dealScore = "high_price";

    const model = l.model || (l.title ? l.title.replace(/^\d{4}\s+/, "").split(" ").slice(1).join(" ") : "");
    rows.push({
      title: l.title || `${l.year} ${l.make} ${model}`,
      make: l.make,
      model,
      year: l.year,
      type,
      price: l.price,
      marketValue,
      dealScore,
      dealSavings,
      mileage: intOrNull(l.mileage),
      length: num(l.length),
      slides: intOrNull(l.slideouts) ?? 0,
      sleeps: intOrNull(l.sleeps) ?? 4,
      location: `${city}, ${state}`,
      state,
      dealerName: meta?.name ?? "Dealer",
      dealerId,
      images,
      daysOnMarket: Math.floor(Math.random() * 90),   // NOTE: randomized — tech debt
      condition: (l.condition || "used").toLowerCase().includes("new") ? "new" : "used",
      isNew: (l.condition || "").toLowerCase().includes("new"),
      isFeatured: Math.random() < 0.08,
      vin: l.vin ?? null,
      description: l.description ?? null,
      features: (l.features || []).slice(0, 30),
      widthFt: num(l.width),
      heightFt: num(l.height),
      dryWeight: num(l.dry_weight),
      gvwr: num(l.gvwr),
      hitchWeight: num(l.hitch_weight),
      freshWater: num(l.fresh_water_capacity),
      greyWater: num(l.gray_water_capacity),
      blackWater: num(l.black_water_capacity),
      generator: !!l.generator,
      awning: l.awning ?? true,
    });
  }

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(listingsTable).values(rows.slice(i, i + CHUNK));
  }

  await db.execute(sql`
    UPDATE dealers d
    SET total_listings = COALESCE((SELECT COUNT(*) FROM listings l WHERE l.dealer_id = d.id), 0)
  `);

  return { inserted: rows.length, skipped, dealers: dealerIdByDomain.size };
}

export async function autoImportIfEmpty(): Promise<void> {
  try {
    const result = await db.execute(sql`SELECT COUNT(*)::int AS count FROM listings`);
    const count = Number((result.rows?.[0] as { count: string })?.count ?? 0);
    if (count > 0) {
      console.log(`[startup] Inventory OK — ${count} listings in DB`);
      return;
    }
    console.log("[startup] DB is empty — auto-importing WA inventory...");
    const { inserted, dealers } = await runImport();
    console.log(`[startup] Auto-import complete: ${inserted} listings, ${dealers} dealers`);
  } catch (err) {
    console.error("[startup] Auto-import failed:", err);
  }
}
```

---

## FILE 3: `artifacts/api-server/src/lib/sync-from-scraper.ts`
> Reads the scraper's live data/ directory (one JSON file per dealer) and upserts records into Postgres. Used by the /api/import/sync route.

```typescript
/**
 * sync-from-scraper.ts
 *
 * Reads the scraper's persistent inventory state from MatchRV-scraper/data/
 * and upserts records into the Postgres listings table.
 *
 * The scraper writes one JSON file per dealer domain to data/, keyed by
 * listing identity (vin:XXX | stk:YYY | url:HASH). Each value is the full
 * normalized RV record plus _first_seen, _last_seen, _removed_at.
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { existsSync } from "fs";
import { db, listingsTable, dealersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { normalizeType, parseLocation, toNum, toInt, toBool } from "./normalizers";

const SCRAPER_ROOT = resolve(import.meta.dirname, "../../../../MatchRV-scraper");
export const DATA_DIR = resolve(SCRAPER_ROOT, "data");
export const OUTPUT_DIR = resolve(SCRAPER_ROOT, "output");
export const STATUS_FILE = resolve(SCRAPER_ROOT, ".scrape-status.json");

// ─── Status file helpers ──────────────────────────────────────────────────

export interface ScrapeStatus {
  is_scraping: boolean;
  scrape_started_at: string | null;
  scrape_completed_at: string | null;
  scrape_pid: number | null;
  scrape_dealers_total: number | null;
  scrape_error: string | null;
  last_sync_at: string | null;
  last_sync_inserted: number | null;
  last_sync_updated: number | null;
  last_sync_skipped: number | null;
  dealer_counts: Record<string, number>;
}

const DEFAULT_STATUS: ScrapeStatus = {
  is_scraping: false,
  scrape_started_at: null,
  scrape_completed_at: null,
  scrape_pid: null,
  scrape_dealers_total: null,
  scrape_error: null,
  last_sync_at: null,
  last_sync_inserted: null,
  last_sync_updated: null,
  last_sync_skipped: null,
  dealer_counts: {},
};

export async function readScrapeStatus(): Promise<ScrapeStatus> {
  try {
    const raw = await readFile(STATUS_FILE, "utf-8");
    return { ...DEFAULT_STATUS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATUS };
  }
}

export async function writeScrapeStatus(patch: Partial<ScrapeStatus>): Promise<void> {
  const current = await readScrapeStatus();
  const updated = { ...current, ...patch };
  await mkdir(SCRAPER_ROOT, { recursive: true });
  await writeFile(STATUS_FILE, JSON.stringify(updated, null, 2), "utf-8");
}

// ─── Dealer cache ─────────────────────────────────────────────────────────

const dealerCache = new Map<string, number>();

async function getOrCreateDealer(
  domain: string,
  name: string,
  city: string
): Promise<number> {
  const key = domain.toLowerCase();
  if (dealerCache.has(key)) return dealerCache.get(key)!;

  const existing = await db.execute(
    sql.raw(`SELECT id FROM dealers WHERE name = '${name.replace(/'/g, "''")}' LIMIT 1`)
  ) as { rows?: { id: number }[] };

  if (existing.rows && existing.rows.length > 0) {
    dealerCache.set(key, existing.rows[0].id);
    return existing.rows[0].id;
  }

  const [row] = await db
    .insert(dealersTable)
    .values({
      name,
      city,
      state: "WA",
      rating: 4.2 + Math.random() * 0.7,
      reviewCount: Math.floor(Math.random() * 400) + 20,
      avgResponseTime: ["< 1 hour", "< 2 hours", "< 4 hours"][Math.floor(Math.random() * 3)],
      beginnerFriendly: Math.random() > 0.4,
      yearsInBusiness: Math.floor(Math.random() * 30) + 5,
      totalListings: 0,
    })
    .returning({ id: dealersTable.id });

  dealerCache.set(key, row.id);
  return row.id;
}

// ─── Title-based type inference ───────────────────────────────────────────

function inferTypeFromTitle(title: unknown): string | null {
  if (!title) return null;
  const t = String(title).toLowerCase();
  if (t.includes("fifth wheel") || t.includes("5th wheel")) return "fifth_wheel";
  if (t.includes("travel trailer")) return "travel_trailer";
  if (t.includes("toy hauler")) return "toy_hauler";
  if (t.includes("class a")) return "class_a";
  if (t.includes("class b+") || t.includes("class b plus")) return "class_b";
  if (t.includes("class b")) return "class_b";
  if (t.includes("class c") || t.includes("super c")) return "class_c";
  if (t.includes("motorhome") || t.includes("motor home")) return "class_a";
  if (t.includes("popup") || t.includes("pop-up") || t.includes("tent trailer")) return "popup_camper";
  if (t.includes("truck camper")) return "truck_camper";
  if (t.includes("destination")) return "fifth_wheel";
  if (t.includes("diesel pusher")) return "class_a";
  return null;
}

// ─── Core sync ────────────────────────────────────────────────────────────

export interface SyncResult {
  inserted: number;
  updated: number;
  skipped: number;
  dealers: number;
  dealer_counts: Record<string, number>;
}

export async function syncScraperDataToDB(): Promise<SyncResult> {
  if (!existsSync(DATA_DIR)) {
    throw new Error(`Scraper data directory not found: ${DATA_DIR}. Run a scrape first.`);
  }

  const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    throw new Error(`No dealer data files in ${DATA_DIR}. Run a scrape first.`);
  }

  dealerCache.clear();

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const dealerCounts: Record<string, number> = {};

  for (const file of files) {
    const raw = await readFile(resolve(DATA_DIR, file), "utf-8");
    let inventory: Record<string, Record<string, unknown>>;
    try {
      inventory = JSON.parse(raw);
    } catch {
      console.warn(`[sync] Failed to parse ${file} — skipping`);
      skipped++;
      continue;
    }

    let dealerCount = 0;

    for (const [, record] of Object.entries(inventory)) {
      if (record._removed_at) continue; // skip sold/removed listings

      const type = normalizeType(record.rv_type) ?? inferTypeFromTitle(record.title);
      if (!type) { skipped++; continue; }

      const price = toNum(record.price);
      if (!price || price < 1000 || price > 2_000_000) { skipped++; continue; }

      const make = record.make ? String(record.make) : null;
      const year = toInt(record.year);
      if (!make || !year) { skipped++; continue; }

      const model = record.model
        ? String(record.model)
        : record.title
        ? String(record.title).replace(/^\d{4}\s+/, "").split(" ").slice(1).join(" ")
        : "";

      const dealerName =
        record.dealer_name ? String(record.dealer_name) : "WA Dealer";
      const domain = record.dealer_domain
        ? String(record.dealer_domain).toLowerCase()
        : file.replace(".json", "").replace(/-/g, ".");
      const { city } = parseLocation(record.dealer_location, domain.split(".")[0]);
      const dealerId = await getOrCreateDealer(domain, dealerName, city);

      const images = Array.isArray(record.image_urls)
        ? record.image_urls
            .filter(
              (u) =>
                typeof u === "string" &&
                /\.(jpe?g|png|webp)(\?|$)/i.test(u) &&
                !u.includes("/common/")
            )
            .slice(0, 12)
        : [];

      const marketValue = Math.round(price * (0.95 + Math.random() * 0.1));
      const dealSavings = Math.max(0, marketValue - price);
      const pctSavings = dealSavings / marketValue;
      const dealScore =
        pctSavings >= 0.1 ? "great_deal" :
        pctSavings >= 0.05 ? "good_deal" :
        price > marketValue * 1.05 ? "high_price" : "fair_deal";

      const isNew = String(record.condition || "").toLowerCase().includes("new");
      const vin = record.vin ? String(record.vin) : null;

      const priceHistory = Array.isArray(record._price_history)
        ? record._price_history
        : [];

      const listingData = {
        title: record.title ? String(record.title) : `${year} ${make} ${model}`,
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
        slides: toInt(record.slideouts) ?? 0,
        sleeps: toInt(record.sleeps) ?? 4,
        location: `${city}, WA`,
        state: "WA",
        dealerName,
        dealerId,
        images,
        daysOnMarket: Math.floor(Math.random() * 90),   // NOTE: randomized — tech debt
        condition: isNew ? "new" : "used",
        isNew,
        isFeatured: Math.random() < 0.08,
        vin,
        description: record.description ? String(record.description) : null,
        features: Array.isArray(record.features)
          ? record.features.slice(0, 30)
          : [],
        widthFt: toNum(record.width),
        heightFt: toNum(record.height),
        dryWeight: toNum(record.dry_weight),
        gvwr: toNum(record.gvwr),
        hitchWeight: toNum(record.hitch_weight),
        freshWater: toNum(record.fresh_water_capacity),
        greyWater: toNum(record.gray_water_capacity),
        blackWater: toNum(record.black_water_capacity),
        generator: toBool(record.generator),
        awning: record.awning !== null && record.awning !== undefined
          ? toBool(record.awning)
          : true,
        priceHistory,
      };

      if (vin) {
        const existing = await db.execute(
          sql.raw(`SELECT id FROM listings WHERE vin = '${vin.replace(/'/g, "''")}' LIMIT 1`)
        ) as { rows?: { id: number }[] };

        if (existing.rows && existing.rows.length > 0) {
          const id = existing.rows[0].id;
          await db.execute(sql.raw(`
            UPDATE listings SET
              price = ${price},
              market_value = ${marketValue},
              deal_score = '${dealScore}',
              deal_savings = ${dealSavings},
              images = '${JSON.stringify(images).replace(/'/g, "''")}',
              updated_at = NOW()
            WHERE id = ${id}
          `));
          updated++;
          dealerCount++;
          continue;
        }
      }

      try {
        await db.insert(listingsTable).values(listingData);
        inserted++;
        dealerCount++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("duplicate")) {
          console.warn(`[sync] Insert failed: ${msg}`);
        }
        skipped++;
      }
    }

    dealerCounts[file.replace(".json", "")] = dealerCount;
  }

  await db.execute(sql`
    UPDATE dealers d
    SET total_listings = COALESCE(
      (SELECT COUNT(*) FROM listings l WHERE l.dealer_id = d.id), 0
    )
  `);

  return { inserted, updated, skipped, dealers: files.length, dealer_counts: dealerCounts };
}
```

---

## FILE 4: `artifacts/api-server/src/routes/import.ts`
> Express router. Exposes HTTP endpoints for the external scraper to push data. Protected by IMPORT_API_KEY.

```typescript
import fs from "fs";
import path from "path";
import { Router, type IRouter, type RequestHandler } from "express";
import { db, listingsTable, dealersTable } from "@workspace/db";
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

  const result = await db.execute(sql`
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
    ON CONFLICT (domain) DO UPDATE SET
      name = EXCLUDED.name,
      city = EXCLUDED.city,
      state = EXCLUDED.state,
      phone = COALESCE(EXCLUDED.phone, dealers.phone)
    RETURNING id, (xmax = 0) AS inserted
  `) as { rows?: { id: number; inserted: boolean }[] };

  const row = result.rows?.[0];
  if (!row) throw new Error(`Dealer upsert returned no row for domain=${domain}`);
  return { id: row.id, action: row.inserted ? "inserted" : "updated" };
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

  if (vin) {
    const existing = await db.execute(
      sql`SELECT id FROM listings WHERE vin = ${vin} LIMIT 1`
    ) as { rows?: { id: number }[] };

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

      if (!dealerId) {
        listingStats.skipped++;
        continue;
      }

      const action = await upsertListing(listing, dealerId, dealerName);
      listingStats[action]++;
    }

    // ── 3. Recalculate total_listings for affected dealers ────────────────
    if (domainToId.size > 0) {
      await db.execute(sql`
        UPDATE dealers d
        SET total_listings = COALESCE(
          (SELECT COUNT(*) FROM listings l WHERE l.dealer_id = d.id), 0
        )
        WHERE d.id = ANY(${Array.from(domainToId.values())}::int[])
      `);
    }

    res.json({
      ok: true,
      dealers: dealerStats,
      listings: listingStats,
      importedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[import/listings]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── PUT /api/import/data/:filename ────────────────────────────────────────

const DATA_DIR = path.resolve(process.env.HOME ?? "/home/runner", "workspace/MatchRV-scraper/data");

router.put("/import/data/:filename", importAuth, (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
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
```

---

## FILE 5: `scripts/import-wa-inventory.ts`
> One-time CLI script. Wipes the DB and re-imports from the local master JSON snapshot file. Run manually via tsx.

```typescript
/**
 * Import real Washington RV dealer inventory into MatchRV.
 * Wipes existing listings + dealers, then imports cleanly.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { db, dealersTable, listingsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const ROOT = resolve(import.meta.dirname, "..");
const MASTER_PATH = resolve(ROOT, "attached_assets/matchrv-master_1776731519171.json");
const DEALERS_PATH = resolve(ROOT, "artifacts/api-server/src/lib/wa-dealers.json");

type ScrapedListing = {
  dealer_name: string | null;
  dealer_domain: string;
  dealer_location: string | null;
  source_detail_url: string;
  condition: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  title: string | null;
  vin: string | null;
  rv_type: string | null;
  price: number | null;
  mileage: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  dry_weight: number | null;
  gvwr: number | null;
  hitch_weight: number | null;
  sleeps: number | null;
  slideouts: number | null;
  fresh_water_capacity: number | null;
  gray_water_capacity: number | null;
  black_water_capacity: number | null;
  awning: boolean | null;
  generator: boolean | null;
  description: string | null;
  features: string[];
  image_urls: string[];
  primary_image: string | null;
};

type DealerRow = { name: string; city: string; url: string };

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[,$]/g, "").match(/-?\d+(\.\d+)?/);
  if (!s) return null;
  const n = parseFloat(s[0]);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

function normalizeType(t: string | null): string | null {
  if (!t) return null;
  const x = t.toLowerCase().trim();
  if (x === "unknown" || x === "other" || x === "rv" || x === "park model") return null;
  if (x.includes("toy hauler")) return "toy_hauler";
  if (x.includes("fifth wheel") || x.includes("destination trailer")) return "fifth_wheel";
  if (x.includes("travel trailer") || x === "destination") return "travel_trailer";
  if (x.includes("class a")) return "class_a";
  if (x.includes("class b")) return "class_b";
  if (x.includes("class c") || x.includes("super c")) return "class_c";
  return null;
}

function parseLocation(loc: string | null, fallbackCity: string): { city: string; state: string } {
  if (!loc) return { city: fallbackCity, state: "WA" };
  const m = loc.match(/([A-Za-z .'-]+),\s*WA/);
  if (m) return { city: m[1].trim(), state: "WA" };
  return { city: fallbackCity, state: "WA" };
}

function domainFromUrl(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return h;
  } catch {
    return url;
  }
}

async function main() {
  console.log("Reading source files...");
  const master = JSON.parse(readFileSync(MASTER_PATH, "utf-8")) as { listings: ScrapedListing[] };
  const dealerList = JSON.parse(readFileSync(DEALERS_PATH, "utf-8")) as DealerRow[];

  const domainMeta = new Map<string, { name: string; city: string }>();
  for (const d of dealerList) {
    const dom = domainFromUrl(d.url);
    if (!domainMeta.has(dom)) {
      const cleanName = d.name.replace(/\s*-\s*[A-Za-z .]+$/, "").trim();
      const cityOnly = d.city.split(",")[0].trim();
      domainMeta.set(dom, { name: cleanName, city: cityOnly });
    }
  }

  const byDomain = new Map<string, ScrapedListing[]>();
  for (const l of master.listings) {
    const dom = (l.dealer_domain || "").toLowerCase();
    if (!dom) continue;
    if (!byDomain.has(dom)) byDomain.set(dom, []);
    byDomain.get(dom)!.push(l);
  }

  console.log(`Source: ${master.listings.length} listings across ${byDomain.size} dealer domains`);

  console.log("\nWiping existing data (listings + dealers)...");
  await db.execute(sql`TRUNCATE TABLE listings RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE dealers RESTART IDENTITY CASCADE`);

  console.log("\nInserting dealers...");
  const dealerIdByDomain = new Map<string, number>();
  for (const [domain, listings] of byDomain) {
    const meta = domainMeta.get(domain);
    const firstLoc = listings.find((l) => l.dealer_location)?.dealer_location ?? null;
    const fallbackCity = meta?.city ?? domain.split(".")[0];
    const { city } = parseLocation(firstLoc, fallbackCity);
    const name =
      meta?.name ??
      listings.find((l) => l.dealer_name)?.dealer_name ??
      domain.split(".")[0].replace(/\b\w/g, (c) => c.toUpperCase());

    const [row] = await db
      .insert(dealersTable)
      .values({
        name,
        city,
        state: "WA",
        rating: 4.2 + Math.random() * 0.7,
        reviewCount: Math.floor(Math.random() * 400) + 20,
        avgResponseTime: ["< 1 hour", "< 2 hours", "< 4 hours"][Math.floor(Math.random() * 3)],
        beginnerFriendly: Math.random() > 0.4,
        yearsInBusiness: Math.floor(Math.random() * 30) + 5,
        totalListings: listings.length,
      })
      .returning({ id: dealersTable.id });
    dealerIdByDomain.set(domain, row.id);
  }
  console.log(`Inserted ${dealerIdByDomain.size} dealers`);

  console.log("\nNormalizing listings...");
  const rows: (typeof listingsTable.$inferInsert)[] = [];
  let skipped = 0;
  const skipReasons: Record<string, number> = {};
  const bump = (k: string) => (skipReasons[k] = (skipReasons[k] ?? 0) + 1);

  for (const l of master.listings) {
    const type = normalizeType(l.rv_type);
    if (!type) { skipped++; bump("invalid_type"); continue; }
    if (!l.make || !l.model || !l.year || !l.price) { skipped++; bump("missing_core_fields"); continue; }
    if (l.price < 1000 || l.price > 2_000_000) { skipped++; bump("price_outlier"); continue; }

    const dealerId = dealerIdByDomain.get((l.dealer_domain || "").toLowerCase());
    if (!dealerId) { skipped++; bump("no_dealer"); continue; }

    const meta = domainMeta.get((l.dealer_domain || "").toLowerCase());
    const fallbackCity = meta?.city ?? l.dealer_domain.split(".")[0];
    const { city, state } = parseLocation(l.dealer_location, fallbackCity);

    const images = (l.image_urls || [])
      .filter((u) => u && /\.(jpe?g|png|webp)(\?|$)/i.test(u) && !u.includes("/common/") && !u.includes("imgh_60x") && !u.includes("imgh_400x"))
      .slice(0, 12);
    if (images.length === 0 && l.primary_image) images.push(l.primary_image);

    const marketValue = Math.round(l.price * (0.95 + Math.random() * 0.1));
    const dealSavings = Math.max(0, marketValue - l.price);
    const pctSavings = dealSavings / marketValue;
    let dealScore = "fair_deal";
    if (pctSavings >= 0.1) dealScore = "great_deal";
    else if (pctSavings >= 0.05) dealScore = "good_deal";
    else if (l.price > marketValue * 1.05) dealScore = "high_price";

    const title = l.title || `${l.year} ${l.make} ${l.model}`;

    rows.push({
      title,
      make: l.make,
      model: l.model,
      year: l.year,
      type,
      price: l.price,
      marketValue,
      dealScore,
      dealSavings,
      mileage: intOrNull(l.mileage),
      length: num(l.length),
      slides: intOrNull(l.slideouts) ?? 0,
      sleeps: intOrNull(l.sleeps) ?? 4,
      location: `${city}, ${state}`,
      state,
      dealerName: meta?.name ?? "Dealer",
      dealerId,
      images,
      daysOnMarket: Math.floor(Math.random() * 90),   // NOTE: randomized — tech debt
      condition: (l.condition || "used").toLowerCase().includes("new") ? "new" : "used",
      isNew: (l.condition || "").toLowerCase().includes("new"),
      isFeatured: Math.random() < 0.08,
      vin: l.vin ?? null,
      description: l.description ?? null,
      features: (l.features || []).slice(0, 30),
      widthFt: num(l.width),
      heightFt: num(l.height),
      dryWeight: num(l.dry_weight),
      gvwr: num(l.gvwr),
      hitchWeight: num(l.hitch_weight),
      freshWater: num(l.fresh_water_capacity),
      greyWater: num(l.gray_water_capacity),
      blackWater: num(l.black_water_capacity),
      generator: !!l.generator,
      awning: l.awning ?? true,
    });
  }

  console.log(`Prepared ${rows.length} listings (skipped ${skipped})`);
  console.log("Skip reasons:", skipReasons);

  console.log("\nInserting listings...");
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db.insert(listingsTable).values(slice);
    process.stdout.write(`  ${Math.min(i + CHUNK, rows.length)}/${rows.length}\r`);
  }
  console.log(`\nInserted ${rows.length} listings`);

  console.log("\nUpdating dealer listing counts...");
  await db.execute(sql`
    UPDATE dealers d
    SET total_listings = COALESCE((SELECT COUNT(*) FROM listings l WHERE l.dealer_id = d.id), 0)
  `);

  console.log("\nImport complete");
  process.exit(0);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
```

---

## FILE 6: `scripts/import-tinyfish.ts`
> CLI script that fetches scraper run results from the TinyFish API and imports them into the DB. Uses a hardcoded dealer map.

```typescript
import { db, listingsTable, dealersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY!;

const DEALER_INFO: Record<string, { name: string; city: string; state: string }> = {
  "rnrrv.com":              { name: "R&R RV Center",           city: "Yakima",        state: "WA" },
  "tacomarv.com":           { name: "Tacoma RV Center",         city: "Tacoma",        state: "WA" },
  "vancouverrv.com":        { name: "Vancouver RV",             city: "Vancouver",     state: "WA" },
  "poulsborvmtvernon.com":  { name: "Poulsbo RV Mt. Vernon",    city: "Mount Vernon",  state: "WA" },
  "poulsborv.com":          { name: "Poulsbo RV",               city: "Poulsbo",       state: "WA" },
  "poulsborvauburn.com":    { name: "Poulsbo RV Auburn",        city: "Auburn",        state: "WA" },
  "openroadrvcenter.com":   { name: "Open Road RV Center",      city: "Mountlake Terrace", state: "WA" },
  "hornsrapidrv.com":       { name: "Horn's Rapid RV",          city: "Rapid City",    state: "SD" },
  "fifervcenter.com":       { name: "Fife RV Center",           city: "Fife",          state: "WA" },
  "elmonte.com":            { name: "El Monte RV",              city: "Seattle",       state: "WA" },
  "cruiseamerica.com":      { name: "Cruise America",           city: "Seattle",       state: "WA" },
  "clearviewrv.com":        { name: "Clearview RV",             city: "Burlington",    state: "WA" },
  "baydos.com":             { name: "Baydos RV",                city: "Olympia",       state: "WA" },
  "basinrvmoseslake.com":   { name: "Basin RV Moses Lake",      city: "Moses Lake",    state: "WA" },
  "bluedogrv.com":          { name: "Blue Dog RV",              city: "Post Falls",    state: "ID" },
};

const TYPE_DIMS: Record<string, { w: number; h: number }> = {
  class_a:        { w: 8.5, h: 13 },
  class_b:        { w: 7.5, h: 9 },
  class_c:        { w: 8.5, h: 11.5 },
  fifth_wheel:    { w: 8.5, h: 13.5 },
  toy_hauler:     { w: 8.5, h: 12 },
  travel_trailer: { w: 8.0, h: 11 },
  popup_camper:   { w: 8.0, h: 9 },
  truck_camper:   { w: 7.5, h: 9 },
  other:          { w: 8.0, h: 10 },
};

function calcDealScore(price: number, marketValue: number): { score: string; savings: number } {
  const ratio = price / marketValue;
  const savings = marketValue - price;
  let score: string;
  if (ratio <= 0.88)      score = "great_deal";
  else if (ratio <= 0.95) score = "good_deal";
  else if (ratio <= 1.05) score = "fair_deal";
  else if (ratio <= 1.15) score = "high_price";
  else                    score = "overpriced";
  return { score, savings };
}

function estimateMarketValue(price: number, type: string, year: number, condition: string): number {
  const rand = 0.88 + Math.random() * 0.24; // 0.88–1.12 multiplier
  let mv = price / rand;
  if (condition === "new") mv = price * (1 + Math.random() * 0.12);
  return Math.round(mv / 100) * 100;
}

function domainFromGoal(goal: string): string {
  const m = goal.match(/https?:\/\/(?:www\.)?([^/\s]+)/);
  return m ? m[1] : "unknown";
}

async function main() {
  console.log("Fetching TinyFish runs...");
  const res = await fetch("https://agent.tinyfish.ai/v1/runs", {
    headers: { "X-API-Key": TINYFISH_API_KEY },
  });
  const data = await res.json() as { data: any[] };
  const runs = data.data ?? [];
  console.log(`Found ${runs.length} runs`);

  const dealerListings: Record<string, any[]> = {};
  const seenVins = new Set<string>();

  for (const run of runs) {
    const listings: any[] = run.result?.result ?? [];
    if (listings.length > 200) {
      console.log(`  SKIP ${domainFromGoal(run.goal)}: ${listings.length} listings (scraper error)`);
      continue;
    }
    const domain = domainFromGoal(run.goal);
    if (!dealerListings[domain]) dealerListings[domain] = [];

    for (const l of listings) {
      if (!l || typeof l !== "object") continue;
      if (!l.price || l.price <= 0) continue;
      if (l.vin && seenVins.has(l.vin)) continue;
      if (l.vin) seenVins.add(l.vin);
      dealerListings[domain].push(l);
    }
  }

  const totalListings = Object.values(dealerListings).reduce((s, arr) => s + arr.length, 0);
  console.log(`\nValid listings to import: ${totalListings}`);

  const dealerIdMap: Record<string, number> = {};

  for (const [domain, listings] of Object.entries(dealerListings)) {
    if (listings.length === 0) continue;
    const info = DEALER_INFO[domain] ?? { name: domain, city: "Unknown", state: "WA" };

    const existing = await db.select().from(dealersTable).where(eq(dealersTable.name, info.name)).limit(1);
    if (existing.length > 0) {
      dealerIdMap[domain] = existing[0].id;
      continue;
    }

    const inserted = await db.insert(dealersTable).values({
      name: info.name,
      city: info.city,
      state: info.state,
      rating: 4.0 + Math.random() * 0.8,
      reviewCount: Math.floor(20 + Math.random() * 200),
      avgResponseTime: "< 2 hours",
      beginnerFriendly: Math.random() > 0.5,
      yearsInBusiness: Math.floor(5 + Math.random() * 30),
      totalListings: listings.length,
    }).returning({ id: dealersTable.id });

    dealerIdMap[domain] = inserted[0].id;
  }

  let imported = 0;
  let skipped = 0;

  for (const [domain, listings] of Object.entries(dealerListings)) {
    if (listings.length === 0) continue;
    const info = DEALER_INFO[domain] ?? { name: domain, city: "Unknown", state: "WA" };
    const dealerId = dealerIdMap[domain];
    if (!dealerId) continue;

    for (const l of listings) {
      const price = Number(l.price) || 0;
      if (price <= 0) { skipped++; continue; }

      const rvType = l.type || "travel_trailer";
      const condition = l.condition || "used";
      const year = Number(l.year) || 2020;
      const mv = estimateMarketValue(price, rvType, year, condition);
      const { score, savings } = calcDealScore(price, mv);
      const dims = TYPE_DIMS[rvType] ?? TYPE_DIMS.other;

      const images: string[] = Array.isArray(l.images)
        ? l.images.filter((u: any) => typeof u === "string" && u.startsWith("http")).slice(0, 5)
        : [];

      const features: string[] = Array.isArray(l.features)
        ? l.features.filter((f: any) => typeof f === "string").slice(0, 20)
        : [];

      const title = l.title || `${year} ${l.make || ""} ${l.model || ""}`.trim();

      if (l.vin) {
        const dup = await db.select({ id: listingsTable.id })
          .from(listingsTable)
          .where(eq(listingsTable.vin, l.vin))
          .limit(1);
        if (dup.length > 0) { skipped++; continue; }
      }

      await db.insert(listingsTable).values({
        title,
        make: l.make || "Unknown",
        model: l.model || "Unknown",
        year,
        type: rvType,
        price,
        marketValue: mv,
        dealScore: score,
        dealSavings: savings,
        mileage: null,
        length: l.length ? Number(l.length) : null,
        slides: l.slides != null ? Number(l.slides) : 0,
        sleeps: l.sleeps ? Number(l.sleeps) : 2,
        location: `${info.city}, ${info.state}`,
        state: info.state,
        dealerName: info.name,
        dealerId,
        images,
        daysOnMarket: Math.floor(Math.random() * 90),   // NOTE: randomized — tech debt
        condition,
        isNew: condition === "new",
        isFeatured: false,
        vin: l.vin || null,
        description: l.description || null,
        features,
        widthFt: dims.w,
        heightFt: dims.h,
        dryWeight: l.dry_weight ? Number(l.dry_weight) : null,
        hitchWeight: l.hitch_weight ? Number(l.hitch_weight) : null,
        gvwr: null,
        freshWater: null,
        greyWater: null,
        blackWater: null,
        generator: features.some(f => f.toLowerCase().includes("generator")),
        solar: features.some(f => f.toLowerCase().includes("solar")),
        awning: features.some(f => f.toLowerCase().includes("awning")),
        outdoorKitchen: features.some(f => f.toLowerCase().includes("outdoor kitchen")),
        washerDryer: features.some(f => f.toLowerCase().includes("washer") || f.toLowerCase().includes("dryer")),
        priceHistory: [{ date: new Date().toISOString().slice(0, 10), price }],
      });

      imported++;
    }
  }

  console.log(`\nDone! Imported ${imported} listings, skipped ${skipped}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

---

## FILE 7: `lib/db/src/schema/scraper-leads.ts`
> Database schema for the scraper_leads table — captures lead data for CRM syncing.

```typescript
import { pgTable, serial, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const scraperLeadsTable = pgTable("scraper_leads", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id"),
  dealerName: text("dealer_name"),
  dealerEmail: text("dealer_email"),
  buyerName: text("buyer_name"),
  buyerEmail: text("buyer_email"),
  buyerPhone: text("buyer_phone"),
  message: text("message"),
  listingTitle: text("listing_title"),
  listingUrl: text("listing_url"),
  crmSyncStatus: varchar("crm_sync_status", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ScraperLead = typeof scraperLeadsTable.$inferSelect;
export type InsertScraperLead = typeof scraperLeadsTable.$inferInsert;
```

---

## Known Tech Debt (noted in code)

| Issue | Location |
|-------|----------|
| `daysOnMarket` is always randomized (0–90) | All 4 import paths |
| `marketValue` is a random ±5–12% heuristic, not real market data | All 4 import paths |
| Dealer metadata (rating, reviewCount, yearsInBusiness) is randomized on insert | All import paths |
| `normalizeType` is duplicated across files instead of always using `normalizers.ts` | `auto-import.ts`, `import-wa-inventory.ts` |
| SQL string interpolation in `sync-from-scraper.ts` (potential injection risk on VIN/name fields) | `sync-from-scraper.ts` |
