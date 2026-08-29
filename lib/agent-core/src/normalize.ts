/**
 * Normalization: raw dealer-website scrape records → CanonicalUnit.
 *
 * The raw records mirror what dealer sites actually publish, which is messy
 * and inconsistent. This module is the semantic layer: parse defensively,
 * validate ranges, tag provenance, and let unknown stay unknown.
 */

import type { CanonicalUnit, Condition, DealerRef, Fact, RvType } from "./types.js";
import {
  buildCorpus,
  computeBoondocking,
  extractBunkhouse,
  extractEntryDoors,
  extractFloorplanCode,
  extractFourSeason,
  extractGenerator,
  extractLithium,
  extractOutdoorKitchen,
  extractSolar,
  extractSpecsFromText,
  fact,
  unknown,
} from "./enrich.js";
import { resolvePlace, scanForCity } from "./geo.js";
import { lookupDealer } from "./dealer-registry.js";

/** Shape of one value in MatchRV-scraper/data/*.json (dealer-site scrape). */
export interface RawScrapeRecord {
  dealer_name?: unknown;
  dealer_domain?: unknown;
  dealer_location?: unknown;
  scraped_at?: unknown;
  last_seen_at?: unknown;
  _first_seen?: unknown;
  _last_seen?: unknown;
  _removed_at?: unknown;
  inventory_status?: unknown;
  condition?: unknown;
  year?: unknown;
  make?: unknown;
  model?: unknown;
  trim?: unknown;
  title?: unknown;
  stock_number?: unknown;
  vin?: unknown;
  rv_type?: unknown;
  price?: unknown;
  sale_price?: unknown;
  msrp?: unknown;
  length?: unknown;
  dry_weight?: unknown;
  gvwr?: unknown;
  hitch_weight?: unknown;
  sleeps?: unknown;
  slideouts?: unknown;
  fresh_water_capacity?: unknown;
  gray_water_capacity?: unknown;
  black_water_capacity?: unknown;
  bunkhouse?: unknown;
  toy_hauler?: unknown;
  generator?: unknown;
  description?: unknown;
  features?: unknown;
  image_urls?: unknown;
  url?: unknown;
}

// ── Primitive parsers (defensive) ──────────────────────────────────────────

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/[,$]/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

export function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n === null ? null : Math.round(n);
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function inRange(n: number | null, min: number, max: number): number | null {
  return n !== null && n >= min && n <= max ? n : null;
}

// ── RV type normalization (mirrors the legacy normalizer's vocabulary) ─────

const CANONICAL_TYPES = new Set<RvType>([
  "toy_hauler",
  "fifth_wheel",
  "travel_trailer",
  "class_a",
  "class_b",
  "class_c",
  "popup_camper",
  "truck_camper",
]);

export function normalizeRvType(t: unknown, title: string): RvType | null {
  const candidates = [t ? String(t) : "", title];
  for (const raw of candidates) {
    const x = raw.toLowerCase().trim();
    if (!x || x === "unknown" || x === "other" || x === "rv" || x === "park model") continue;
    if (CANONICAL_TYPES.has(x as RvType)) return x as RvType;
    if (x.includes("toy hauler")) return "toy_hauler";
    if (x.includes("fifth wheel") || x.includes("5th wheel") || x.includes("destination trailer")) return "fifth_wheel";
    if (x.includes("travel trailer") || x === "destination") return "travel_trailer";
    if (x.includes("class a") || x.includes("diesel pusher")) return "class_a";
    if (x.includes("class b")) return "class_b";
    if (x.includes("class c") || x.includes("super c")) return "class_c";
    if (x.includes("popup") || x.includes("pop-up") || x.includes("pop up") || x.includes("folding") || x.includes("tent trailer")) return "popup_camper";
    if (x.includes("truck camper")) return "truck_camper";
    if (x.includes("motorhome") || x.includes("motor home")) return "class_a";
  }
  return null;
}

// ── Feature-list sanitization ──────────────────────────────────────────────
// Dealer sites leak UI junk into scraped feature lists ("+31", "View More »").

const JUNK_FEATURE =
  /^(\+?\d+|view more.*|show more.*|more.*»|«.*|see all.*|\.{2,})$|sale price|list price|msrp|discount|payment|per month|\/mo|financ|pre-?approved|value my trade|get pre|call (us|now)|click|apply now|request|schedule|-{2,}|\$\s?\d/i;

function cleanFeatures(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const s = item.replace(/\s+/g, " ").trim();
    if (!s || s.length > 80 || JUNK_FEATURE.test(s)) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 40) break;
  }
  return out;
}

function cleanImages(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (u): u is string =>
        typeof u === "string" &&
        /^https:\/\//.test(u) &&
        /\.(jpe?g|png|webp)(\?|$)/i.test(u) &&
        !u.includes("/common/"),
    )
    .slice(0, 12);
}

function cleanDescription(v: unknown): string | null {
  const s = toStr(v);
  if (!s) return null;
  // Scrapes truncate mid-word; trim to the last full sentence when possible.
  const t = s.replace(/\s+/g, " ").slice(0, 1200);
  const lastStop = t.lastIndexOf(". ");
  return (lastStop > 200 ? t.slice(0, lastStop + 1) : t).trim();
}

// ── Dealer resolution ──────────────────────────────────────────────────────

export function buildDealerRef(rec: RawScrapeRecord): DealerRef {
  const domain = (toStr(rec.dealer_domain) ?? "unknown-dealer").toLowerCase();
  const registry = lookupDealer(domain);
  const rawLoc = toStr(rec.dealer_location) ?? "";

  // Branch city: the record's own location string when it names a known city
  // (multi-location dealers), else the registry's default city.
  const scanned = rawLoc ? (resolvePlace(rawLoc.split(",")[0]) ?? scanForCity(rawLoc)) : null;
  const fromRegistry = registry ? resolvePlace(registry.city) : null;
  const resolved = scanned ?? fromRegistry;

  const name = registry?.name ?? toStr(rec.dealer_name) ?? domain;
  const city = resolved?.canonical ?? registry?.city ?? "Unknown";
  return {
    id: `${domain}:${city.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    city,
    state: registry?.state ?? "WA",
    lat: resolved?.lat ?? null,
    lng: resolved?.lng ?? null,
    website: `https://${domain}`,
  };
}

// ── Main conversion ────────────────────────────────────────────────────────

export interface NormalizeRejection {
  key: string;
  reason: string;
}

export function normalizeRecord(
  key: string,
  rec: RawScrapeRecord,
): { unit: CanonicalUnit } | { reject: NormalizeRejection } {
  if (rec._removed_at) return { reject: { key, reason: "removed_from_dealer_site" } };

  const title = toStr(rec.title) ?? "";
  const rvType = normalizeRvType(rec.rv_type, title);
  if (!rvType) return { reject: { key, reason: "unresolvable_rv_type" } };

  const year = inRange(toInt(rec.year), 1990, 2028);
  if (!year) return { reject: { key, reason: "missing_or_invalid_year" } };

  const make = toStr(rec.make);
  if (!make) return { reject: { key, reason: "missing_make" } };
  const model = toStr(rec.model) ?? "";

  // Price: prefer an advertised sale price when it's a plausible discount.
  const listPrice = inRange(toNum(rec.price), 1_000, 2_000_000);
  const salePrice = inRange(toNum(rec.sale_price), 1_000, 2_000_000);
  const effective =
    salePrice !== null && (listPrice === null || salePrice <= listPrice) ? salePrice : listPrice;
  if (effective === null) return { reject: { key, reason: "missing_or_implausible_price" } };

  const images = cleanImages(rec.image_urls);
  if (images.length === 0) return { reject: { key, reason: "no_usable_photos" } };

  const vin = toStr(rec.vin);
  const stock = toStr(rec.stock_number);
  const dealer = buildDealerRef(rec);
  const id = vin ? `vin:${vin}` : stock ? `stk:${dealer.id}:${stock}` : `key:${key.replace(/^url:/, "u:")}`;

  const features = cleanFeatures(rec.features);
  const description = cleanDescription(rec.description);
  const corpus = buildCorpus(title, description, features);
  const floorplanCode = extractFloorplanCode(model, title);

  const structBool = (v: unknown): boolean | null =>
    typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : null;

  const solar = extractSolar(corpus);
  const lithium = extractLithium(corpus);
  const generator = extractGenerator(structBool(rec.generator), corpus);
  const fourSeason = extractFourSeason(corpus);
  const textSpecs = extractSpecsFromText(corpus);

  // Structured dealer field first; explicitly-labeled text value second.
  const withTextFallback = (structured: number | null, fromText: number | null): Fact<number> =>
    structured !== null
      ? fact(structured, "dealer_listing", "high")
      : fromText !== null
        ? fact(fromText, "derived_text", "medium", "Parsed from a labeled value in the dealer's listing text.")
        : unknown<number>();

  const freshWaterGal = withTextFallback(inRange(toNum(rec.fresh_water_capacity), 5, 300), textSpecs.freshWaterGal);
  const greyWaterGal = numFact(inRange(toNum(rec.gray_water_capacity), 5, 300), "gal");
  const blackWaterGal = numFact(inRange(toNum(rec.black_water_capacity), 5, 300), "gal");

  const boondocking = computeBoondocking({
    solar,
    generator,
    freshWaterGal,
    greyWaterGal,
    blackWaterGal,
    fourSeason,
    lithium,
  });

  const condition: Condition = String(rec.condition ?? "").toLowerCase().includes("new")
    ? "new"
    : "used";

  const statusRaw = String(rec.inventory_status ?? "").toLowerCase();
  const status: CanonicalUnit["status"] =
    statusRaw === "available" ? "available" : statusRaw === "pending" ? "pending" : "unknown";

  const lastSeen = toStr(rec._last_seen) ?? toStr(rec.last_seen_at) ?? toStr(rec.scraped_at);
  const firstSeen = toStr(rec._first_seen) ?? lastSeen;
  if (!lastSeen || !firstSeen) return { reject: { key, reason: "missing_provenance_timestamps" } };

  const unit: CanonicalUnit = {
    id,
    vin,
    stockNumber: stock,
    title: title || `${year} ${make} ${model}`.trim(),
    year,
    make,
    model,
    trim: toStr(rec.trim),
    floorplanCode,
    rvType,
    condition,
    status,

    priceUsd: fact(effective, "dealer_listing", "high", salePrice !== null && salePrice === effective && listPrice !== null && salePrice < listPrice ? `Dealer sale price (list ${Math.round(listPrice).toLocaleString()} USD).` : undefined),
    msrpUsd: numFact(inRange(toNum(rec.msrp), 1_000, 2_000_000), "USD"),
    lengthFt: withTextFallback(inRange(toNum(rec.length), 8, 60), textSpecs.lengthFt),
    dryWeightLbs: withTextFallback(inRange(toNum(rec.dry_weight), 500, 40_000), textSpecs.dryWeightLbs),
    gvwrLbs: withTextFallback(inRange(toNum(rec.gvwr), 1_000, 60_000), textSpecs.gvwrLbs),
    hitchWeightLbs: withTextFallback(inRange(toNum(rec.hitch_weight), 50, 6_000), textSpecs.hitchWeightLbs),
    sleeps: withTextFallback(inRange(toInt(rec.sleeps), 1, 14), textSpecs.sleeps),
    slideouts: withTextFallback(inRange(toInt(rec.slideouts), 0, 6), textSpecs.slideouts),
    freshWaterGal,
    greyWaterGal,
    blackWaterGal,

    bunkhouse: extractBunkhouse(structBool(rec.bunkhouse), corpus, floorplanCode),
    entryDoors: extractEntryDoors(corpus),
    solar,
    lithiumBattery: lithium,
    generator,
    fourSeason,
    outdoorKitchen: extractOutdoorKitchen(corpus),

    boondocking,

    dealer,
    images,
    description,
    features,

    provenance: {
      sourceKind: "dealer_website_snapshot",
      dealerDomain: dealer.id.split(":")[0],
      firstSeenAt: firstSeen,
      lastSeenAt: lastSeen,
    },
  };

  return { unit };
}

function numFact(n: number | null, _unit: string): Fact<number> {
  return n === null ? unknown<number>() : fact(n, "dealer_listing", "high");
}
