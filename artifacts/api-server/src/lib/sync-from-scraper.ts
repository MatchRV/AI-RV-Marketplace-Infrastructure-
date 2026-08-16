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

// ─── Field normalizers (shared via ./normalizers) ─────────────────────────

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

// ─── Title-based make inference ───────────────────────────────────────────

const KNOWN_MAKES = [
  "Airstream", "Alliance", "Aliner", "Amerigo", "Arbor", "Arcadia",
  "CrossRoads", "Coachmen", "Cruiser", "Cougar", "Challenger",
  "DRV", "Dutchmen",
  "East to West", "Eclipse", "Entegra", "Evolve",
  "Fleetwood", "Forest River", "Freedom Elite", "Fuzion",
  "Genesis", "Grand Design", "Gulf Stream",
  "Heartland", "Highland Ridge",
  "ICON", "Impact",
  "Jayco", "Jet", "Journey",
  "KZ", "Keystone",
  "Lance", "Latitude", "Lance", "Leisure Travel",
  "Montana", "Momentum",
  "Newmar", "Nexus", "Nordic",
  "Outdoors RV", "Open Range",
  "Palomino", "Passport", "Prime Time", "Puma",
  "Redwood", "Renegade", "Rockwood", "Reflection", "Reatta",
  "Shasta", "Solitude", "Starcraft", "Springdale", "Sundance",
  "Thor", "Tiffin", "Torque", "Transcend",
  "Venture", "Vilano",
  "Winnebago", "Wildcat", "Wildwood",
  "XLR",
  "Yukon",
  "Zinger",
];

function inferMakeFromTitle(title: unknown): string | null {
  if (!title) return null;
  const t = String(title);
  const tLower = t.toLowerCase();
  for (const make of KNOWN_MAKES) {
    if (tLower.includes(make.toLowerCase())) return make;
  }
  return null;
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

      const make = record.make ? String(record.make) : inferMakeFromTitle(record.title);
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
        daysOnMarket: Math.floor(Math.random() * 90),
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
