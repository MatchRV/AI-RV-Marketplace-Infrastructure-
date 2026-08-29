/**
 * Seed the embedded (PGlite) database from the agent-core inventory
 * snapshot so the classic marketplace pages (home, browse, listing detail)
 * work on a fresh clone with zero services.
 *
 * Honesty rules carried over from the agent layer: no fabricated market
 * values, deal scores, ratings, or days-on-market — marketValue mirrors the
 * asking price and dealer stats stay at schema defaults.
 */

import { sql } from "drizzle-orm";
import { db, dealersTable, listingsTable } from "@workspace/db";
import type { CanonicalUnit } from "@workspace/agent-core";
import { getInventory } from "../services/agent-inventory";

export async function seedEmbeddedFromSnapshot(): Promise<void> {
  const count = (await db.execute(sql`SELECT count(*)::int AS n FROM listings`)) as {
    rows: { n: number }[];
  };
  if (count.rows[0].n > 0) return;

  const inv = getInventory();
  console.log(`[seed] embedded DB empty — seeding ${inv.units.length} listings from snapshot`);

  const dealerIds = new Map<string, number>();
  for (const u of inv.units) {
    if (dealerIds.has(u.dealer.id)) continue;
    const [row] = await db
      .insert(dealersTable)
      .values({
        name: `${u.dealer.name}${u.dealer.city !== "Unknown" ? ` - ${u.dealer.city}` : ""}`,
        domain: u.dealer.id,
        city: u.dealer.city,
        state: u.dealer.state,
      })
      .returning({ id: dealersTable.id });
    dealerIds.set(u.dealer.id, row.id);
  }

  const toRow = (u: CanonicalUnit) => ({
    title: u.title,
    make: u.make,
    model: u.model,
    year: u.year,
    type: u.rvType,
    price: u.priceUsd.value ?? 0,
    marketValue: u.priceUsd.value ?? 0,
    dealSavings: 0,
    length: u.lengthFt.value,
    slides: u.slideouts.value ?? 0,
    sleeps: u.sleeps.value ?? 2,
    location: `${u.dealer.city}, ${u.dealer.state}`,
    state: u.dealer.state,
    dealerName: u.dealer.name,
    dealerId: dealerIds.get(u.dealer.id) ?? 0,
    images: u.images,
    condition: u.condition,
    isNew: u.condition === "new",
    vin: u.vin,
    description: u.description,
    features: u.features,
    dryWeight: u.dryWeightLbs.value,
    gvwr: u.gvwrLbs.value,
    hitchWeight: u.hitchWeightLbs.value,
    freshWater: u.freshWaterGal.value,
    greyWater: u.greyWaterGal.value,
    blackWater: u.blackWaterGal.value,
    generator: u.generator.value === true,
    solar: u.solar.value === "installed",
    solarInstalled: u.solar.value === null ? null : u.solar.value === "installed",
    solarReady: u.solar.value === null ? null : u.solar.value !== "none",
    fourSeason: u.fourSeason.value,
    outdoorKitchen: u.outdoorKitchen.value === true,
    boondockingScore: u.boondocking.score,
    latitude: u.dealer.lat,
    longitude: u.dealer.lng,
  });

  const CHUNK = 200;
  for (let i = 0; i < inv.units.length; i += CHUNK) {
    await db.insert(listingsTable).values(inv.units.slice(i, i + CHUNK).map(toRow));
  }

  await db.execute(sql`
    UPDATE dealers d
    SET total_listings = COALESCE((SELECT COUNT(*) FROM listings l WHERE l.dealer_id = d.id), 0)
  `);
  console.log(`[seed] done: ${inv.units.length} listings, ${dealerIds.size} dealer branches`);
}
