/**
 * Database-free candidate source for the AI Outfitter.
 *
 * The Outfitter normally selects candidates with a raw SQL query against the
 * `listings` table. On a deployment that runs without a database
 * (DISABLE_DB=1 — see lib/db DB_MODE), that table does not exist, so the
 * chat would 503 the moment the conversation reached the matching stage.
 *
 * The listings table is itself seeded from the committed inventory snapshot
 * (see lib/seed-embedded.ts), so the honest fix is to read the same snapshot
 * directly and project it into the exact snake_case row shape the raw query
 * returns. The mapping below mirrors seed-embedded's `toRow` field for field,
 * plus the column defaults the database would have applied — so both paths
 * feed the ranking pipeline identical data.
 *
 * Honesty rules carried over unchanged: no fabricated market values, deal
 * scores, or days-on-market. Every unit in the snapshot has photos, which is
 * what the SQL path's `jsonb_array_length(images) > 0` guard enforces.
 */

import type { CanonicalUnit } from "@workspace/agent-core";
import { getInventory } from "./agent-inventory";

/** A row shaped like `SELECT * FROM listings` returns it. */
export type ListingRow = Record<string, unknown>;

let rows: ListingRow[] | null = null;

function toRow(u: CanonicalUnit, dealerId: number): ListingRow {
  return {
    // Canonical snapshot id (a string) rather than a serial — this deployment
    // has no listings table for a numeric id to refer to.
    id: u.id,
    title: u.title,
    make: u.make,
    model: u.model,
    year: u.year,
    type: u.rvType,
    price: u.priceUsd.value ?? 0,
    market_value: u.priceUsd.value ?? 0,
    deal_savings: 0,
    length: u.lengthFt.value,
    slides: u.slideouts.value ?? 0,
    sleeps: u.sleeps.value ?? 2,
    location: `${u.dealer.city}, ${u.dealer.state}`,
    state: u.dealer.state,
    dealer_name: u.dealer.name,
    dealer_id: dealerId,
    images: u.images,
    condition: u.condition,
    is_new: u.condition === "new",
    vin: u.vin,
    description: u.description,
    features: u.features,
    dry_weight: u.dryWeightLbs.value,
    gvwr: u.gvwrLbs.value,
    hitch_weight: u.hitchWeightLbs.value,
    fresh_water: u.freshWaterGal.value,
    grey_water: u.greyWaterGal.value,
    black_water: u.blackWaterGal.value,
    generator: u.generator.value === true,
    solar: u.solar.value === "installed",
    solar_installed: u.solar.value === null ? null : u.solar.value === "installed",
    solar_ready: u.solar.value === null ? null : u.solar.value !== "none",
    four_season: u.fourSeason.value,
    outdoor_kitchen: u.outdoorKitchen.value === true,
    boondocking_score: u.boondocking.score,
    latitude: u.dealer.lat,
    longitude: u.dealer.lng,
    // Column defaults the database would supply (schema/listings.ts).
    deal_score: "fair_deal",
    days_on_market: 0,
    is_featured: false,
    awning: true,
    washer_dryer: false,
  };
}

/** The snapshot projected into listing rows, built once and cached. */
export function getListingRows(): ListingRow[] {
  if (!rows) {
    const inv = getInventory();
    // Dealer ids mirror seed-embedded: 1-based order of first appearance.
    const dealerIds = new Map<string, number>();
    rows = inv.units.map((u) => {
      let id = dealerIds.get(u.dealer.id);
      if (id === undefined) {
        id = dealerIds.size + 1;
        dealerIds.set(u.dealer.id, id);
      }
      return toRow(u, id);
    });
    console.log(
      `[outfitter] no database — matching against ${rows.length} snapshot listings`,
    );
  }
  return rows;
}
