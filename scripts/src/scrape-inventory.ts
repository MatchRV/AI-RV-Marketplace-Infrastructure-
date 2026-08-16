import { db, dealersTable, listingsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { readFileSync } from "fs";
import { resolve } from "path";

const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY;
const TINYFISH_URL = "https://agent.tinyfish.ai/v1/automation/run-sse";
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "4", 10);
const TIMEOUT_MS = 300_000;

if (!TINYFISH_API_KEY) {
  console.error("ERROR: TINYFISH_API_KEY environment variable is not set.");
  process.exit(1);
}

interface DealerInput {
  name: string;
  city: string;
  state: string;
  phone: string | null;
  website: string | null;
}

interface ScrapedListing {
  title?: string;
  make?: string;
  model?: string;
  year?: number;
  condition?: string;
  type?: string;
  price?: number | null;
  length?: number | null;
  sleeps?: number | null;
  slides?: number | null;
  dry_weight?: number | null;
  hitch_weight?: number | null;
  vin?: string | null;
  description?: string | null;
  features?: string[];
  images?: string[];
  listing_url?: string;
}

const RV_TYPE_MAP: Record<string, string> = {
  class_a: "class_a",
  class_b: "class_b",
  class_c: "class_c",
  travel_trailer: "travel_trailer",
  fifth_wheel: "fifth_wheel",
  toy_hauler: "toy_hauler",
  popup_camper: "popup_camper",
  truck_camper: "truck_camper",
  "class a": "class_a",
  "class b": "class_b",
  "class c": "class_c",
  "travel trailer": "travel_trailer",
  "fifth wheel": "fifth_wheel",
  "toy hauler": "toy_hauler",
  "popup camper": "popup_camper",
  "truck camper": "truck_camper",
  other: "travel_trailer",
};

function normalizeType(raw: string | undefined): string {
  if (!raw) return "travel_trailer";
  const key = raw.toLowerCase().trim();
  return RV_TYPE_MAP[key] ?? "travel_trailer";
}

function estimateMarketValue(
  price: number,
  year: number,
  type: string,
  condition: string
): number {
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;
  const isNew = condition === "new";

  const typeMultiplier: Record<string, number> = {
    class_a: 1.12,
    class_b: 1.08,
    class_c: 1.06,
    fifth_wheel: 1.07,
    toy_hauler: 1.06,
    travel_trailer: 1.05,
    truck_camper: 1.04,
    popup_camper: 1.03,
  };

  const multiplier = typeMultiplier[type] ?? 1.05;
  const depreciation = isNew ? 1 : Math.max(0.4, 1 - age * 0.04);
  const variance = 0.9 + Math.random() * 0.2;

  return Math.round(price * multiplier * depreciation * variance);
}

function calcDealScore(
  price: number,
  marketValue: number
): { score: string; savings: number } {
  const ratio = price / marketValue;
  const savings = Math.round(marketValue - price);

  if (ratio <= 0.88) return { score: "great_deal", savings };
  if (ratio <= 0.95) return { score: "good_deal", savings };
  if (ratio <= 1.05) return { score: "fair_deal", savings: 0 };
  if (ratio <= 1.15) return { score: "high_price", savings };
  return { score: "overpriced", savings };
}

function fingerprint(listing: ScrapedListing): string {
  if (listing.vin) return `vin:${listing.vin.trim().toUpperCase()}`;
  const make = (listing.make ?? "").toLowerCase().trim();
  const model = (listing.model ?? "").toLowerCase().trim();
  const year = listing.year ?? 0;
  const price = listing.price ?? 0;
  return `title:${year}-${make}-${model}-${price}`;
}

async function runTinyfish(url: string, goal: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(TINYFISH_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "X-API-Key": TINYFISH_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, goal }),
    });

    if (!response.ok) {
      console.error(`  TinyFish HTTP ${response.status}: ${await response.text()}`);
      return null;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let resultJson: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "COMPLETE" && event.status === "COMPLETED") {
            resultJson =
              typeof event.resultJson === "string"
                ? event.resultJson
                : JSON.stringify(event.resultJson);
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    return resultJson;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error(`  TinyFish timed out after ${TIMEOUT_MS / 1000}s`);
    } else {
      console.error(`  TinyFish error:`, err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseListings(raw: string | null): ScrapedListing[] {
  if (!raw) return [];
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      const key = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
      if (key) return parsed[key];
    }
  } catch {
    console.error("  Failed to parse TinyFish JSON output");
  }
  return [];
}

async function syncDealer(
  dealer: DealerInput,
  dealerId: number
): Promise<{ added: number; removed: number; kept: number }> {
  if (!dealer.website) {
    console.log(`  Skipping ${dealer.name} — no website`);
    return { added: 0, removed: 0, kept: 0 };
  }

  const goal = `Go to this RV dealership website's inventory or "RVs for sale" page. Scrape the first page of RV listings you find (do not paginate). For each listing return a JSON array:

[
  {
    "title": "year make model as a string",
    "make": "string",
    "model": "string",
    "year": number,
    "condition": "new" or "used",
    "type": "class_a" or "class_b" or "class_c" or "travel_trailer" or "fifth_wheel" or "toy_hauler" or "popup_camper" or "truck_camper" or "other",
    "price": number or null,
    "length": number or null,
    "sleeps": number or null,
    "slides": number or null,
    "dry_weight": number or null,
    "hitch_weight": number or null,
    "vin": "string or null",
    "description": "string or null",
    "features": [],
    "images": ["up to 3 image urls"],
    "listing_url": "full url"
  }
]

Return only the JSON array. Set unknown fields to null.`;

  console.log(`  Scraping ${dealer.website}...`);
  const raw = await runTinyfish(dealer.website, goal);
  const scraped = parseListings(raw);

  if (scraped.length === 0) {
    console.log(`  No listings returned — skipping sync to avoid wiping good data`);
    return { added: 0, removed: 0, kept: 0 };
  }

  const existing = await db
    .select({ id: listingsTable.id, vin: listingsTable.vin, title: listingsTable.title, price: listingsTable.price, make: listingsTable.make, model: listingsTable.model, year: listingsTable.year })
    .from(listingsTable)
    .where(eq(listingsTable.dealerId, dealerId));

  const existingByFingerprint = new Map<string, number>();
  for (const row of existing) {
    const fp = row.vin
      ? `vin:${row.vin.trim().toUpperCase()}`
      : `title:${row.year}-${(row.make ?? "").toLowerCase().trim()}-${(row.model ?? "").toLowerCase().trim()}-${row.price ?? 0}`;
    existingByFingerprint.set(fp, row.id);
  }

  const scrapedFingerprints = new Set<string>();
  let added = 0;

  for (const listing of scraped) {
    if (!listing.price || !listing.year || !listing.make || !listing.model) continue;

    const images = (listing.images ?? []).filter(Boolean).slice(0, 8);
    if (images.length === 0) continue;

    const fp = fingerprint(listing);
    scrapedFingerprints.add(fp);

    if (existingByFingerprint.has(fp)) continue;

    const type = normalizeType(listing.type);
    const condition = listing.condition === "new" ? "new" : "used";
    const marketValue = estimateMarketValue(listing.price, listing.year, type, condition);
    const { score, savings } = calcDealScore(listing.price, marketValue);
    const title = listing.title ?? `${listing.year} ${listing.make} ${listing.model}`;

    try {
      await db.insert(listingsTable).values({
        title,
        make: listing.make,
        model: listing.model,
        year: listing.year,
        type,
        price: listing.price,
        marketValue,
        dealScore: score,
        dealSavings: savings,
        condition,
        isNew: condition === "new",
        length: listing.length ?? null,
        sleeps: listing.sleeps ?? 2,
        slides: listing.slides ?? 0,
        dryWeight: listing.dry_weight ?? null,
        hitchWeight: listing.hitch_weight ?? null,
        vin: listing.vin ?? null,
        description: listing.description ?? null,
        features: listing.features ?? [],
        images,
        location: dealer.city,
        state: dealer.state,
        dealerName: dealer.name,
        dealerId,
        daysOnMarket: 0,
        isFeatured: false,
      });
      added++;
    } catch (err) {
      console.error(`  Failed to insert: ${title}`, err);
    }
  }

  const staleIds = [...existingByFingerprint.entries()]
    .filter(([fp]) => !scrapedFingerprints.has(fp))
    .map(([, id]) => id);

  let removed = 0;
  if (staleIds.length > 0) {
    await db.delete(listingsTable).where(inArray(listingsTable.id, staleIds));
    removed = staleIds.length;
  }

  const kept = existing.length - staleIds.length;

  console.log(
    `  +${added} new  -${removed} removed  =${kept} unchanged  [${dealer.name}]`
  );

  return { added, removed, kept };
}

async function upsertDealer(dealer: DealerInput): Promise<number> {
  const existing = await db
    .select()
    .from(dealersTable)
    .where(eq(dealersTable.name, dealer.name))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const [inserted] = await db
    .insert(dealersTable)
    .values({
      name: dealer.name,
      city: dealer.city,
      state: dealer.state,
      phone: dealer.phone ?? null,
      rating: parseFloat((3.5 + Math.random() * 1.5).toFixed(1)),
      reviewCount: Math.floor(Math.random() * 300) + 10,
      avgResponseTime: "< 2 hours",
      beginnerFriendly: Math.random() > 0.5,
      yearsInBusiness: Math.floor(Math.random() * 30) + 2,
      totalListings: 0,
    })
    .returning({ id: dealersTable.id });

  return inserted.id;
}

async function runConcurrent<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const taskIndex = index++;
      results[taskIndex] = await tasks[taskIndex]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function main() {
  const dealersFile =
    process.argv[2] ?? resolve(import.meta.dirname, "dealers.json");

  let dealers: DealerInput[];
  try {
    const raw = readFileSync(dealersFile, "utf-8");
    const parsed = JSON.parse(raw);
    dealers = Array.isArray(parsed) ? parsed : parsed.dealers ?? parsed.result ?? [];
    if (!Array.isArray(dealers)) throw new Error("Expected an array of dealers");
  } catch (err) {
    console.error(`Failed to read dealer list from ${dealersFile}:`, err);
    process.exit(1);
  }

  const withWebsite = dealers.filter((d) => d.website);
  console.log(
    `\nSyncing ${withWebsite.length} dealers with ${CONCURRENCY} concurrent agents.\n`
  );

  let totalAdded = 0;
  let totalRemoved = 0;
  let totalKept = 0;

  const tasks = withWebsite.map((dealer) => async () => {
    console.log(`\n[${dealer.name}] — ${dealer.city}, ${dealer.state}`);
    try {
      const dealerId = await upsertDealer(dealer);
      const { added, removed, kept } = await syncDealer(dealer, dealerId);
      totalAdded += added;
      totalRemoved += removed;
      totalKept += kept;

      const total = kept + added;
      if (total > 0) {
        await db
          .update(dealersTable)
          .set({ totalListings: total })
          .where(eq(dealersTable.id, dealerId));
      }
    } catch (err) {
      console.error(`  Error processing ${dealer.name}:`, err);
    }
  });

  await runConcurrent(tasks, CONCURRENCY);

  console.log(`\n✓ Sync complete`);
  console.log(`  Added:   ${totalAdded}`);
  console.log(`  Removed: ${totalRemoved}`);
  console.log(`  Kept:    ${totalKept}`);
  process.exit(0);
}

main();
