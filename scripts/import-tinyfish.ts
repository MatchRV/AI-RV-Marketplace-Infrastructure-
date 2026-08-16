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
  // New RVs: market is typically closer to MSRP
  if (condition === "new") mv = price * (1 + Math.random() * 0.12);
  return Math.round(mv / 100) * 100;
}

function domainFromGoal(goal: string): string {
  const m = goal.match(/https?:\/\/(?:www\.)?([^/\s]+)/);
  return m ? m[1] : "unknown";
}

async function main() {
  console.log("Fetching TinyFish runs…");
  const res = await fetch("https://agent.tinyfish.ai/v1/runs", {
    headers: { "X-API-Key": TINYFISH_API_KEY },
  });
  const data = await res.json() as { data: any[] };
  const runs = data.data ?? [];
  console.log(`Found ${runs.length} runs`);

  // Aggregate listings per dealer, dedupe by VIN
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
  for (const [d, ls] of Object.entries(dealerListings)) {
    if (ls.length > 0) console.log(`  ${d}: ${ls.length}`);
  }

  // Upsert dealers and collect IDs
  const dealerIdMap: Record<string, number> = {};

  for (const [domain, listings] of Object.entries(dealerListings)) {
    if (listings.length === 0) continue;
    const info = DEALER_INFO[domain] ?? { name: domain, city: "Unknown", state: "WA" };

    // Check if dealer already exists
    const existing = await db.select().from(dealersTable).where(eq(dealersTable.name, info.name)).limit(1);
    if (existing.length > 0) {
      dealerIdMap[domain] = existing[0].id;
      console.log(`  Dealer exists: ${info.name} (id=${existing[0].id})`);
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
    console.log(`  Created dealer: ${info.name} (id=${inserted[0].id})`);
  }

  // Insert listings
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

      // Check for dupe VIN
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
        daysOnMarket: Math.floor(Math.random() * 90),
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
