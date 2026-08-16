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
      daysOnMarket: Math.floor(Math.random() * 90),
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
