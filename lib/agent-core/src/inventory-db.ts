/**
 * Database-backed inventory search (INVENTORY_SOURCE=supabase).
 *
 * The database never decides a match. It stores each unit's full canonical
 * record (jsonb) plus typed columns for the fields hard constraints test, and
 * the server asks it only for CANDIDATES: rows that cannot certainly fail a
 * hard constraint. Every candidate then goes through the same evaluateUnit /
 * ranking code as the in-memory path (createSearchAccumulator), in snapshot
 * order, so results, scores and ordering are identical by construction.
 *
 * Every predicate built here must be a SUPERSET of "passes or is unknown" for
 * its check in match.ts: a row may be dropped only when the in-memory engine
 * would mark that check "fail". Unknown (null) values are always kept.
 *
 * Pure: builds SQL text + params; executing it is the server's job.
 */

import type { CanonicalUnit, FeatureKey } from "./types.js";
import { TOWABLE_TYPES } from "./types.js";
import { featureValue, type SearchContext } from "./match.js";
import { isServableFact } from "./manufacturer-specs.js";
import { coordsMatchState } from "./enrich-snapshot.js";
import { oldestNewModelYear, titleSaysUsed } from "./listing-reconcile.js";
import { brandKey, unitMakeModel } from "./brands.js";

/** Bump when the derived columns' meaning changes; the loader records it and the server refuses a mismatched table. */
export const INVENTORY_DB_COLUMNS_VERSION = 1;

export const FEATURE_COLUMNS: Record<FeatureKey, string> = {
  bunkhouse: "f_bunkhouse",
  solar: "f_solar",
  solar_prep: "f_solar_prep",
  lithium: "f_lithium",
  generator: "f_generator",
  four_season: "f_four_season",
  outdoor_kitchen: "f_outdoor_kitchen",
  two_entry_doors: "f_two_entry_doors",
};

/** Typed search columns for one (already enriched + facts-only) unit. Keys are inventory.units column names. */
export function unitSearchColumns(u: CanonicalUnit): Record<string, string | number | boolean | null> {
  const lat = u.dealer.lat;
  const lng = u.dealer.lng;
  const coordsOk = lat !== null && lng !== null && coordsMatchState({ lat, lng }, u.dealer.state);
  const cols: Record<string, string | number | boolean | null> = {
    rv_type: u.rvType,
    is_motorized: !TOWABLE_TYPES.includes(u.rvType),
    condition: u.condition,
    title_says_used: titleSaysUsed(u.title),
    year: u.year,
    make: u.make,
    brand_key: brandKey(unitMakeModel(u).brand),
    model: u.model,
    title: u.title,
    price_usd: u.priceUsd.value,
    length_ft: u.lengthFt.value,
    weight_lbs: u.gvwrLbs.value ?? u.dryWeightLbs.value,
    gvwr_lbs: u.gvwrLbs.value,
    sleeps: u.sleeps.value,
    sleeps_servable: u.sleeps.value !== null && isServableFact(u.sleeps) ? u.sleeps.value : null,
    fresh_water_gal: u.freshWaterGal.value,
    slideouts: u.slideouts.value,
    dealer_id: u.dealer.id,
    dealer_name: u.dealer.name,
    dealer_city: u.dealer.city,
    dealer_state: (u.dealer.state ?? "").toUpperCase() || null,
    lat,
    lng,
    coords_ok: coordsOk,
    has_photos: Array.isArray(u.images) && u.images.length > 0,
    last_seen_at: u.provenance?.lastSeenAt ?? null,
  };
  for (const [f, col] of Object.entries(FEATURE_COLUMNS) as [FeatureKey, string][]) cols[col] = featureValue(u, f);
  return cols;
}

const SLIM = Symbol.for("matchrv.slimUnit");

/**
 * The fields ranking (finishSearch), the MCP shortlist (shortlistOrder,
 * diversifyShortlist, makeModelCount) and the area rules read from a kept
 * match. A database search keeps these for every match and re-fetches the
 * full record only for the matches it actually shows (see isSlimUnit).
 */
export function slimUnitForRanking(u: CanonicalUnit): CanonicalUnit {
  const slim = {
    id: u.id, vin: u.vin, stockNumber: u.stockNumber, title: u.title, year: u.year, make: u.make, model: u.model,
    trim: u.trim, floorplanCode: u.floorplanCode, rvType: u.rvType, condition: u.condition, status: u.status,
    priceUsd: u.priceUsd, sleeps: u.sleeps, dealer: u.dealer,
  } as unknown as CanonicalUnit;
  Object.defineProperty(slim, SLIM, { value: true, enumerable: false });
  return slim;
}

export const isSlimUnit = (u: CanonicalUnit): boolean => Boolean((u as unknown as Record<symbol, unknown>)[SLIM]);

export interface CandidateQuery {
  /** SQL boolean expression over inventory.units (no leading WHERE). */
  where: string;
  params: unknown[];
  /** Bounding box + radius used for the area count (null when not a radius search). */
  radius: { lat: number; lng: number; radiusMiles: number; box: GeoBox | null } | null;
}

export interface GeoBox { minLat: number; maxLat: number; minLng: number | null; maxLng: number | null }

/** Haversine in SQL with the exact constants of geo.ts haversineMiles (R = 3959 mi). */
export function sqlHaversine(latParam: string, lngParam: string): string {
  return `(3959 * 2 * atan2(sqrt(power(sin(radians(lat - ${latParam}) / 2), 2) + cos(radians(${latParam})) * cos(radians(lat)) * power(sin(radians(lng - ${lngParam}) / 2), 2)), sqrt(1 - (power(sin(radians(lat - ${latParam}) / 2), 2) + cos(radians(${latParam})) * cos(radians(lat)) * power(sin(radians(lng - ${lngParam}) / 2), 2)))))`;
}

/** A generous lat/lng box around a point (index-friendly). Longitude bounds are dropped when they'd wrap. */
export function geoBox(lat: number, lng: number, radiusMiles: number): GeoBox {
  const r = radiusMiles + 2;
  const dLat = r / 68.7; // ≤ true miles per degree of latitude, so the box only gets wider
  const minLat = lat - dLat;
  const maxLat = lat + dLat;
  const worstLat = Math.min(89.9, Math.max(Math.abs(minLat), Math.abs(maxLat)));
  const dLng = r / (69.17 * Math.cos((worstLat * Math.PI) / 180));
  const wraps = !Number.isFinite(dLng) || dLng >= 180 || lng - dLng < -180 || lng + dLng > 180 || maxLat >= 89.9 || minLat <= -89.9;
  return { minLat, maxLat, minLng: wraps ? null : lng - dLng, maxLng: wraps ? null : lng + dLng };
}

/**
 * Candidate predicate for a search context. `touchedIds` are units with a
 * learned/curated memory overlay; they are always fetched because memory can
 * change the facts the typed columns were derived from.
 */
export function buildCandidateQuery(ctx: SearchContext, opts: { touchedIds?: string[]; now?: Date } = {}): CandidateQuery {
  const c = ctx.constraints;
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const clauses: string[] = [];

  // Make: brandMatches compares brandKey of the unit's reconciled brand with the wanted name's.
  if (c.makes?.length) clauses.push(`brand_key = ANY(${p(c.makes.map(brandKey))}::text[])`);
  if (c.excludeMakes?.length) clauses.push(`NOT (brand_key = ANY(${p(c.excludeMakes.map(brandKey))}::text[]))`);

  if (c.rvTypes && c.rvTypes.length > 0) clauses.push(`rv_type = ANY(${p(c.rvTypes)}::text[])`);

  if (c.condition && c.condition !== "any") {
    const isNew = `(condition = 'new' AND year >= ${p(oldestNewModelYear(opts.now ?? new Date()))} AND NOT title_says_used)`;
    if (c.condition === "new") clauses.push(isNew);
    else if (c.condition === "used") clauses.push(`(condition = 'used' OR (condition = 'new' AND NOT ${isNew}))`);
    else clauses.push(`condition = ${p(c.condition)}`);
  }

  if (c.priceMaxUsd != null) clauses.push(`(price_usd IS NULL OR price_usd <= ${p(c.priceMaxUsd)})`);
  if (c.priceMinUsd != null) clauses.push(`(price_usd IS NULL OR price_usd >= ${p(c.priceMinUsd)})`);
  if (c.lengthMaxFt != null) clauses.push(`(length_ft IS NULL OR length_ft <= ${p(c.lengthMaxFt)})`);
  if (c.lengthMinFt != null) clauses.push(`(length_ft IS NULL OR length_ft >= ${p(c.lengthMinFt)})`);
  if (c.maxWeightLbs != null) clauses.push(`(weight_lbs IS NULL OR weight_lbs <= ${p(c.maxWeightLbs)})`);
  if (c.sleepsMin != null) clauses.push(`(sleeps_servable IS NULL OR sleeps_servable >= ${p(c.sleepsMin)})`);
  if (c.freshWaterMinGal != null) clauses.push(`(fresh_water_gal IS NULL OR fresh_water_gal >= ${p(c.freshWaterMinGal)})`);
  for (const f of c.mustHave ?? []) clauses.push(`${FEATURE_COLUMNS[f]} IS DISTINCT FROM false`);

  // Fuel / power minimums / towing a trailer: a towable always fails them.
  if (c.fuelType || c.horsepowerMin != null || c.torqueMinLbFt != null || c.trailerWeightLbs != null) clauses.push("is_motorized");

  // Tow vehicle: a towable heavier than the verdict's "exceeds" line fails (tow.ts evaluateTowFit).
  if (ctx.tow && ctx.tow.filterCapLbs !== null) {
    const t = ctx.tow;
    const exceedsAbove = t.statedRatingLbs != null ? t.statedRatingLbs : t.learned != null ? t.filterCapLbs : t.rangeLbs != null ? t.rangeLbs.max : null;
    if (exceedsAbove != null) clauses.push(`(is_motorized OR weight_lbs IS NULL OR weight_lbs <= ${p(exceedsAbove)})`);
  }

  let radius: CandidateQuery["radius"] = null;
  if (ctx.location) {
    if (ctx.location.state) clauses.push(`dealer_state = ${p(ctx.location.state)}`);
    else {
      const { lat, lng, radiusMiles } = ctx.location;
      const box = geoBox(lat, lng, radiusMiles);
      radius = { lat, lng, radiusMiles, box };
      clauses.push(radiusClause(p, lat, lng, radiusMiles, box));
    }
  }

  let where = clauses.length ? clauses.join(" AND ") : "true";
  if (opts.touchedIds && opts.touchedIds.length) where = `((${where}) OR id = ANY(${p(opts.touchedIds)}::text[]))`;
  return { where: `mcp_eligible AND ${where}`, params, radius };
}

/** coords_ok + box + haversine ≤ radius + 1 (the engine keeps Math.round(d) ≤ radius, i.e. d < radius + 0.5). */
export function radiusClause(p: (v: unknown) => string, lat: number, lng: number, radiusMiles: number, box: GeoBox | null): string {
  const b = box ?? geoBox(lat, lng, radiusMiles);
  const parts = ["coords_ok", `lat BETWEEN ${p(b.minLat)} AND ${p(b.maxLat)}`];
  if (b.minLng !== null && b.maxLng !== null) parts.push(`lng BETWEEN ${p(b.minLng)} AND ${p(b.maxLng)}`);
  const latP = p(lat);
  const lngP = p(lng);
  parts.push(`${sqlHaversine(`${latP}::float8`, `${lngP}::float8`)} <= ${p(radiusMiles + 1)}`);
  return `(${parts.join(" AND ")})`;
}
