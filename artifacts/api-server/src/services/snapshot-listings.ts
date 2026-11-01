/**
 * Classic marketplace listings/filters backed by the inventory snapshot.
 * Used when DB_MODE === "none" (DISABLE_DB=1) so /browse and /api/listings
 * are not empty on the Render starter box that cannot run PGlite.
 */
import { getListingRows, toRow, type ListingRow } from "./outfitter-inventory";
import { usingInventoryDb } from "./inventory-source";
import { decodeRows, q as dbq } from "./inventory-db";
import { listingRowById } from "./inventory-access";

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

// ── Inventory-source aware variants (INVENTORY_SOURCE=supabase answers from Postgres) ──


/** SQL equivalent of matchesQuery over inventory.units typed columns (website corpus: every loaded record). */
export function listingQuerySql(q: ListingQuery): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const c: string[] = ["has_photos"];
  const num = (raw: string | undefined) => (raw ? Number(raw) : NaN);
  if (q.type) {
    const types = q.type.split(",").map((t) => t.trim()).filter(Boolean);
    if (types.length) c.push(`rv_type = any(${p(types)}::text[])`);
  }
  if (q.make) {
    const makes = q.make.split(",").map((m) => m.trim().toLowerCase()).filter(Boolean);
    if (makes.length) c.push(`lower(coalesce(make, '')) = any(${p(makes)}::text[])`);
  }
  if (q.state) c.push(`coalesce(dealer_state, '') = ${p(q.state.toUpperCase())}`);
  if (q.condition && q.condition !== "all") c.push(`condition = ${p(q.condition)}`);
  if (q.dealer) c.push(`strpos(lower(coalesce(dealer_name, '')), ${p(q.dealer.toLowerCase())}) > 0`);
  // Each JS check excludes only when the comparison is true; NaN never excludes.
  const keep = (raw: string | undefined, expr: string, op: string) => { const v = num(raw); if (raw && !Number.isNaN(v)) c.push(`${expr} ${op} ${p(v)}`); };
  keep(q.minPrice, "coalesce(price_usd, 0)", ">=");
  keep(q.maxPrice, "coalesce(price_usd, 0)", "<=");
  keep(q.minYear, "year", ">=");
  keep(q.maxYear, "year", "<=");
  keep(q.minSleeps, "coalesce(sleeps, 2)", ">=");
  keep(q.minLength, "coalesce(length_ft, 0)", ">=");
  if (q.maxLength && !Number.isNaN(num(q.maxLength))) c.push(`(length_ft is null or length_ft <= ${p(num(q.maxLength))})`);
  keep(q.minSlides, "coalesce(slideouts, 0)", ">=");
  if (q.maxTowWeight && !Number.isNaN(num(q.maxTowWeight))) c.push(`(gvwr_lbs is null or gvwr_lbs <= ${p(num(q.maxTowWeight))})`);
  if (q.petFriendly === "true") c.push("false");
  if (q.fourSeason === "true") c.push("f_four_season is true");
  if (q.outdoorKitchen === "true") c.push("f_outdoor_kitchen is true");
  if (q.generator === "true") c.push("f_generator is true");
  if (q.washerDryer === "true") c.push("false");
  if (q.search) c.push(`strpos(lower(coalesce(title, '') || ' ' || coalesce(make, '') || ' ' || coalesce(model, '') || ' ' || coalesce(description, '')), ${p(q.search.toLowerCase())}) > 0`);
  return { where: c.join(" and "), params };
}

function listingOrderSql(sort: string): string {
  switch (sort) {
    case "price_asc": return "coalesce(price_usd, 0) asc, ord, id";
    case "price_desc": return "coalesce(price_usd, 0) desc, ord, id";
    case "newest": return "year desc, ord, id";
    case "length_asc": return "coalesce(length_ft, 0) asc, ord, id";
    case "length_desc": return "coalesce(length_ft, 0) desc, ord, id";
    default: return "year desc, coalesce(price_usd, 0) desc, ord, id";
  }
}

export async function queryListings(q: ListingQuery): Promise<{ rows: ListingRow[]; total: number; offset: number; limit: number }> {
  if (!usingInventoryDb()) return querySnapshotListings(q);
  const limit = Math.min(Number(q.limit) || 24, 100);
  const offset = Number(q.offset) || 0;
  const { where, params } = listingQuerySql(q);
  const n = params.length;
  const [countRows, pageRows] = await Promise.all([
    dbq<{ n: string }>(`select count(*) n from inventory.units where ${where}`, params),
    dbq<{ unit_z: Buffer; zdict_id: number; dealer_seq: number }>(
      `select unit_z, zdict_id, dealer_seq from inventory.units where ${where} order by ${listingOrderSql(q.sort || "featured")} offset $${n + 1} limit $${n + 2}`,
      [...params, Math.max(0, offset), limit],
    ),
  ]);
  const units = await decodeRows(pageRows);
  return { rows: units.map((u, i) => toRow(u, pageRows[i].dealer_seq)), total: Number(countRows[0]?.n ?? 0), offset, limit };
}

export async function getListingById(id: string): Promise<ListingRow | undefined> {
  return usingInventoryDb() ? listingRowById(id) : getSnapshotListingById(id);
}

export async function searchFilters(): Promise<ReturnType<typeof snapshotSearchFilters>> {
  if (!usingInventoryDb()) return snapshotSearchFilters();
  const [types, makes, states, ranges] = await Promise.all([
    dbq<{ v: string }>("select distinct rv_type v from inventory.units where has_photos and rv_type <> ''"),
    dbq<{ v: string }>("select distinct make v from inventory.units where has_photos and coalesce(make, '') <> ''"),
    dbq<{ v: string }>("select distinct (unit_state) v from (select coalesce(dealer_state, '') unit_state from inventory.units where has_photos) s where unit_state <> ''"),
    dbq<{ minp: number | null; maxp: number | null; miny: number | null; maxy: number | null }>(
      "select min(coalesce(price_usd, 0)) minp, max(coalesce(price_usd, 0)) maxp, min(year) miny, max(year) maxy from inventory.units where has_photos",
    ),
  ]);
  const r = ranges[0] ?? { minp: null, maxp: null, miny: null, maxy: null };
  const sorted = (rows: { v: string }[]) => rows.map((x) => x.v).sort();
  return {
    types: sorted(types),
    makes: sorted(makes),
    states: sorted(states),
    priceRange: { min: r.minp ?? 5000, max: r.maxp != null ? Math.max(0, r.maxp) : 500000 },
    yearRange: { min: r.miny ?? 2010, max: r.maxy != null ? Math.max(0, r.maxy) : 2026 },
  };
}
