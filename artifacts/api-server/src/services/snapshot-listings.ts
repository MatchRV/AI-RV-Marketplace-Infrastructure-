/**
 * Classic marketplace listings/filters backed by the inventory snapshot.
 * Used when DB_MODE === "none" (DISABLE_DB=1) so /browse and /api/listings
 * are not empty on the Render starter box that cannot run PGlite.
 */
import { resolveCatalogUnitId } from "../lib/listing-public-id";
import { perSnapshot } from "./agent-inventory";
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

/** Every query parameter matchesQuery() or sortRows() reads. limit and offset only page the result. */
const FILTER_KEYS = [
  "type", "make", "state", "condition", "dealer", "minPrice", "maxPrice", "minYear", "maxYear",
  "minSleeps", "minLength", "maxLength", "minSlides", "maxTowWeight", "petFriendly", "fourSeason",
  "outdoorKitchen", "generator", "washerDryer", "search",
] as const;

/** Sort keys sortRows() distinguishes; anything else sorts like "featured". */
const SORT_KEYS = new Set(["price_asc", "price_desc", "newest", "length_asc", "length_desc"]);
const sortKeyOf = (sort: string) => (SORT_KEYS.has(sort) ? sort : "featured");

/** Filtered + sorted results kept per snapshot (most recent first). */
const RESULT_CACHE_MAX = 32;

const isFiniteKey = (v: unknown) => Number.isFinite(Number(v));

/**
 * Per snapshot: the photo-bearing rows (the only rows any listing query can return) and,
 * per sort key, those rows already sorted. Filtering a stably pre-sorted list gives exactly
 * the order sortRows() gives the filtered list, as long as every sort key is a finite number
 * (then the comparators are consistent). If any is not, that sort falls back to sorting the
 * filtered rows per request, as before.
 */
const listingState = perSnapshot((inv) => {
  const photoRows = getListingRows(inv).filter(hasPhotos);
  const finite = {
    price: photoRows.every((r) => isFiniteKey(r.price)),
    year: photoRows.every((r) => isFiniteKey(r.year)),
    length: photoRows.every((r) => isFiniteKey(r.length ?? 0)),
  };
  const presortable = (key: string) =>
    key === "price_asc" || key === "price_desc" ? finite.price
      : key === "newest" ? finite.year
        : key === "length_asc" || key === "length_desc" ? finite.length
          : finite.year && finite.price;
  return {
    photoRows,
    presortable,
    sorted: new Map<string, ListingRow[]>(),
    results: new Map<string, ListingRow[]>(),
  };
});

function filteredSorted(q: ListingQuery, sort: string): ListingRow[] {
  const state = listingState();
  const key = sortKeyOf(sort);
  const cacheKey = JSON.stringify([key, ...FILTER_KEYS.map((k) => q[k] ?? null)]);
  const hit = state.results.get(cacheKey);
  if (hit) {
    // refresh recency
    state.results.delete(cacheKey);
    state.results.set(cacheKey, hit);
    return hit;
  }
  let out: ListingRow[];
  if (state.presortable(key)) {
    let sorted = state.sorted.get(key);
    if (!sorted) state.sorted.set(key, (sorted = sortRows(state.photoRows, key)));
    out = sorted.filter((r) => matchesQuery(r, q));
  } else {
    out = sortRows(state.photoRows.filter((r) => matchesQuery(r, q)), sort);
  }
  state.results.set(cacheKey, out);
  if (state.results.size > RESULT_CACHE_MAX) state.results.delete(state.results.keys().next().value!);
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
  const filtered = filteredSorted(q, sort);
  return {
    rows: filtered.slice(offset, offset + limit),
    total: filtered.length,
    offset,
    limit,
  };
}

/** The pre-cache implementation, kept so tests can prove the cached path returns the same thing. */
export function querySnapshotListingsUncached(q: ListingQuery): {
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

/** First row per id, as Array.prototype.find would return it. */
const rowsById = perSnapshot((inv) => {
  const map = new Map<string, ListingRow>();
  for (const r of getListingRows(inv)) {
    const id = String(r.id);
    if (!map.has(id)) map.set(id, r);
  }
  return map;
});

export function getSnapshotListingById(id: string): ListingRow | undefined {
  const resolved = resolveCatalogUnitId(id);
  return rowsById().get(resolved);
}

/** Types the marketing site asks for with GET /api/listings?type=. */
export const SNAPSHOT_COUNT_TYPES = [
  "class_a",
  "class_b",
  "class_c",
  "travel_trailer",
  "fifth_wheel",
  "toy_hauler",
  "popup_camper",
  "truck_camper",
] as const;

export type SnapshotInventoryCounts = {
  total: number;
  byType: Record<(typeof SNAPSHOT_COUNT_TYPES)[number], number>;
};

/**
 * One pass over the same photo-bearing rows GET /api/listings counts.
 * `total` matches `querySnapshotListings({ limit: "1" }).total`.
 * `byType[type]` matches `querySnapshotListings({ limit: "1", type }).total`.
 */
export function snapshotInventoryCounts(): SnapshotInventoryCounts {
  const counts = inventoryCounts();
  return { total: counts.total, byType: { ...counts.byType } };
}

/** Computed once per loaded snapshot. */
const inventoryCounts = perSnapshot((inv): SnapshotInventoryCounts => {
  const byType = Object.fromEntries(SNAPSHOT_COUNT_TYPES.map((type) => [type, 0])) as SnapshotInventoryCounts["byType"];
  let total = 0;
  for (const row of getListingRows(inv)) {
    if (!hasPhotos(row)) continue;
    total += 1;
    const type = String(row.type ?? "");
    if (Object.prototype.hasOwnProperty.call(byType, type)) {
      byType[type as keyof typeof byType] += 1;
    }
  }
  return { total, byType };
});

export function snapshotSearchFilters() {
  const f = searchFilters();
  return {
    types: f.types.slice(),
    makes: f.makes.slice(),
    states: f.states.slice(),
    priceRange: { ...f.priceRange },
    yearRange: { ...f.yearRange },
  };
}

/** Computed once per loaded snapshot. */
const searchFilters = perSnapshot((inv) => {
  const rows = listingState(inv).photoRows;
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
});

/** Fill this snapshot's listing caches now: rows, the default sort, counts, filters and the id map. */
export function warmSnapshotListings(): number {
  const total = querySnapshotListings({ limit: "1" }).total;
  snapshotInventoryCounts();
  snapshotSearchFilters();
  rowsById();
  return total;
}
