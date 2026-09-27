/**
 * Classic marketplace listings/filters backed by the inventory snapshot.
 * Used when DB_MODE === "none" (DISABLE_DB=1) so /browse and /api/listings
 * are not empty on the Render starter box that cannot run PGlite.
 */
import { getListingRows, type ListingRow } from "./outfitter-inventory";

export type ListingQuery = Record<string, string | undefined>;

function hasPhotos(row: ListingRow): boolean {
  const images = row.images;
  return Array.isArray(images) && images.length > 0;
}

function matchesQuery(row: ListingRow, q: ListingQuery): boolean {
  if (!hasPhotos(row)) return false;

  if (q.type) {
    const types = q.type.split(",").map((t) => t.trim()).filter(Boolean);
    if (types.length && !types.includes(String(row.type))) return false;
  }
  if (q.make) {
    const makes = q.make.split(",").map((m) => m.trim().toLowerCase()).filter(Boolean);
    if (makes.length && !makes.includes(String(row.make ?? "").toLowerCase())) return false;
  }
  if (q.state && String(row.state ?? "").toUpperCase() !== q.state.toUpperCase()) return false;
  if (q.condition && q.condition !== "all" && String(row.condition) !== q.condition) return false;
  if (q.dealer) {
    const d = q.dealer.toLowerCase();
    if (!String(row.dealer_name ?? "").toLowerCase().includes(d)) return false;
  }
  if (q.minPrice && Number(row.price) < Number(q.minPrice)) return false;
  if (q.maxPrice && Number(row.price) > Number(q.maxPrice)) return false;
  if (q.minYear && Number(row.year) < Number(q.minYear)) return false;
  if (q.maxYear && Number(row.year) > Number(q.maxYear)) return false;
  if (q.minSleeps && Number(row.sleeps ?? 0) < Number(q.minSleeps)) return false;
  if (q.minLength && Number(row.length ?? 0) < Number(q.minLength)) return false;
  if (q.maxLength && row.length != null && Number(row.length) > Number(q.maxLength)) return false;
  if (q.minSlides && Number(row.slides ?? 0) < Number(q.minSlides)) return false;
  if (q.maxTowWeight && row.gvwr != null && Number(row.gvwr) > Number(q.maxTowWeight)) return false;
  if (q.petFriendly === "true" && !row.pet_friendly && !row.petFriendly) return false;
  if (q.fourSeason === "true" && !row.four_season) return false;
  if (q.outdoorKitchen === "true" && !row.outdoor_kitchen) return false;
  if (q.generator === "true" && !row.generator) return false;
  if (q.washerDryer === "true" && !row.washer_dryer) return false;
  if (q.search) {
    const s = q.search.toLowerCase();
    const blob = [row.title, row.make, row.model, row.description]
      .map((x) => String(x ?? "").toLowerCase())
      .join(" ");
    if (!blob.includes(s)) return false;
  }
  return true;
}

function sortRows(rows: ListingRow[], sort: string): ListingRow[] {
  const out = rows.slice();
  switch (sort) {
    case "price_asc":
      out.sort((a, b) => Number(a.price) - Number(b.price));
      break;
    case "price_desc":
      out.sort((a, b) => Number(b.price) - Number(a.price));
      break;
    case "newest":
      out.sort((a, b) => Number(b.year) - Number(a.year));
      break;
    case "length_asc":
      out.sort((a, b) => Number(a.length ?? 0) - Number(b.length ?? 0));
      break;
    case "length_desc":
      out.sort((a, b) => Number(b.length ?? 0) - Number(a.length ?? 0));
      break;
    default:
      // featured / just_listed — prefer higher price as a weak proxy for "featured" inventory
      out.sort((a, b) => Number(b.year) - Number(a.year) || Number(b.price) - Number(a.price));
  }
  return out;
}

export function querySnapshotListings(q: ListingQuery): {
  rows: ListingRow[];
  total: number;
  offset: number;
  limit: number;
} {
  const limit = Math.min(Number(q.limit) || 24, 100);
  const offset = Number(q.offset) || 0;
  const sort = q.sort || "featured";
  const filtered = sortRows(getListingRows().filter((r) => matchesQuery(r, q)), sort);
  return {
    rows: filtered.slice(offset, offset + limit),
    total: filtered.length,
    offset,
    limit,
  };
}

export function getSnapshotListingById(id: string): ListingRow | undefined {
  return getListingRows().find((r) => String(r.id) === id);
}

export function snapshotSearchFilters() {
  const rows = getListingRows().filter(hasPhotos);
  const types = new Set<string>();
  const makes = new Set<string>();
  const states = new Set<string>();
  let minP = Infinity;
  let maxP = 0;
  let minY = Infinity;
  let maxY = 0;
  for (const r of rows) {
    if (r.type) types.add(String(r.type));
    if (r.make) makes.add(String(r.make));
    if (r.state) states.add(String(r.state));
    const p = Number(r.price);
    const y = Number(r.year);
    if (Number.isFinite(p)) {
      minP = Math.min(minP, p);
      maxP = Math.max(maxP, p);
    }
    if (Number.isFinite(y)) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return {
    types: [...types].sort(),
    makes: [...makes].sort(),
    states: [...states].sort(),
    priceRange: {
      min: Number.isFinite(minP) ? minP : 5000,
      max: Number.isFinite(maxP) ? maxP : 500000,
    },
    yearRange: {
      min: Number.isFinite(minY) ? minY : 2010,
      max: Number.isFinite(maxY) ? maxY : 2026,
    },
  };
}
