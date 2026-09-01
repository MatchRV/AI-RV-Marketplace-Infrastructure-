/**
 * The AI Outfitter's database-free candidate source.
 *
 * The deployed demo runs with DISABLE_DB=1, so the Outfitter selects
 * candidates from the committed inventory snapshot instead of the `listings`
 * table. These tests pin the two properties that matter: the projected rows
 * carry the columns the ranking pipeline reads, and the snapshot corpus can
 * actually answer the demo conversation.
 */

import { describe, expect, it } from "vitest";
import { getListingRows } from "../src/services/outfitter-inventory";

const rows = getListingRows();

/** Columns the rerank + response mapping read off a listings row. */
const REQUIRED_COLUMNS = [
  "id", "title", "make", "model", "year", "type", "price", "market_value",
  "deal_score", "deal_savings", "location", "state", "dealer_name", "dealer_id",
  "images", "days_on_market", "sleeps", "length", "condition", "is_new",
  "is_featured", "slides", "fresh_water", "generator", "solar", "awning",
  "outdoor_kitchen", "washer_dryer", "latitude", "longitude",
  "gvwr", "dry_weight", "boondocking_score", "solar_installed",
];

describe("outfitter snapshot inventory", () => {
  it("projects the whole snapshot", () => {
    expect(rows.length).toBe(1056);
  });

  it("is cached — repeated calls return the same array", () => {
    expect(getListingRows()).toBe(rows);
  });

  it("exposes every column the ranking pipeline reads", () => {
    for (const column of REQUIRED_COLUMNS) {
      expect(Object.keys(rows[0])).toContain(column);
    }
  });

  it("never offers a unit without a photo", () => {
    // The SQL path enforces this with jsonb_array_length(images) > 0.
    expect(rows.every((r) => Array.isArray(r.images) && r.images.length > 0)).toBe(true);
  });

  it("carries the column defaults the database would have applied", () => {
    expect(rows.every((r) => r.deal_score === "fair_deal")).toBe(true);
    expect(rows.every((r) => r.days_on_market === 0)).toBe(true);
    expect(rows.every((r) => r.is_featured === false)).toBe(true);
  });

  it("does not fabricate a market value or savings", () => {
    // marketValue mirrors the asking price; nothing claims a discount.
    expect(rows.every((r) => r.market_value === r.price)).toBe(true);
    expect(rows.every((r) => r.deal_savings === 0)).toBe(true);
  });

  it("gives every unit a dealer with coordinates, so distance ranking works", () => {
    expect(rows.every((r) => typeof r.latitude === "number" && typeof r.longitude === "number")).toBe(true);
    expect(rows.every((r) => typeof r.dealer_name === "string" && (r.dealer_name as string).length > 0)).toBe(true);
  });

  it("has candidates for the demo conversation", () => {
    // "bunkhouse travel trailer under $45,000, preferably under 30 feet"
    const matches = rows.filter(
      (r) =>
        r.type === "travel_trailer" &&
        Number(r.price) <= 45_000 &&
        r.length != null &&
        Number(r.length) <= 30,
    );
    expect(matches.length).toBeGreaterThan(20);
  });
});
