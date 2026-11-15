/**
 * Product feed in OpenAI's product feed format (JSON Lines, one RV per row).
 * Schema: https://developers.openai.com/commerce/specs/file-upload/products
 *
 * Rules this file keeps:
 *   - Price and availability are what the dealer's site showed when MatchRV
 *     last saw the unit. Unknown availability is sent as `unknown`, never
 *     `in_stock`.
 *   - A row is left out, rather than padded, when a required field is missing.
 *   - Nothing in a row says how or where MatchRV got the record.
 *   - Checkout is never enabled: MatchRV does not sell RVs.
 */
import type { CanonicalUnit } from "@workspace/agent-core";
import { listingCanonicalUrl } from "./listing-seo";
import { dealerDisplayName } from "./unit-insights";

export type FeedSkipReason = "removed" | "no_price" | "no_image" | "no_brand" | "no_title";

export interface ProductFeedRow {
  item_id: string;
  title: string;
  description: string;
  url: string;
  brand: string;
  seller_name: string;
  image_url: string;
  availability: "in_stock" | "out_of_stock" | "unknown";
  price: string;
  condition?: "new" | "used";
  product_category?: string;
  seller_url?: string;
  additional_image_urls?: string[];
  weight?: string;
  item_weight_unit?: "lb";
  is_eligible_search: true;
  is_eligible_checkout: false;
  target_countries: ["US"];
  store_country: "US";
}

const CATEGORY: Record<string, string> = {
  travel_trailer: "RVs > Towable RVs > Travel Trailers",
  fifth_wheel: "RVs > Towable RVs > Fifth Wheels",
  toy_hauler: "RVs > Towable RVs > Toy Haulers",
  popup_camper: "RVs > Towable RVs > Pop-Up Campers",
  truck_camper: "RVs > Truck Campers",
  class_a: "RVs > Motorhomes > Class A",
  class_b: "RVs > Motorhomes > Class B",
  class_c: "RVs > Motorhomes > Class C",
};
const TYPE_WORDS: Record<string, string> = {
  travel_trailer: "travel trailer", fifth_wheel: "fifth wheel", toy_hauler: "toy hauler", popup_camper: "pop-up camper",
  truck_camper: "truck camper", class_a: "Class A motorhome", class_b: "Class B motorhome", class_c: "Class C motorhome",
};

const isHttpUrl = (u: unknown): u is string => typeof u === "string" && /^https?:\/\/[^\s<>"']+$/i.test(u) && u.length <= 2000;
/** Plain text: no tags, no control characters, single spaces. */
function plain(text: string, max: number): string {
  const t = text.replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** A short factual description from published fields, for units whose dealer wrote none. */
function factualDescription(unit: CanonicalUnit, seller: string): string {
  const type = TYPE_WORDS[unit.rvType] ?? "RV";
  const cond = unit.condition === "new" ? "New" : unit.condition === "used" ? "Used" : "";
  const where = [unit.dealer.city, unit.dealer.state].filter(Boolean).join(", ");
  const parts = [`${[cond, String(unit.year || "").trim(), unit.make, unit.model].filter(Boolean).join(" ")} ${type}`.trim() + ` offered by ${seller}${where ? ` in ${where}` : ""}.`];
  if (unit.lengthFt.value != null) parts.push(`Length ${unit.lengthFt.value} ft.`);
  if (unit.sleeps.value != null) parts.push(`Sleeps ${unit.sleeps.value}.`);
  if (unit.dryWeightLbs.value != null) parts.push(`Dry weight ${unit.dryWeightLbs.value.toLocaleString("en-US")} lbs.`);
  if (unit.gvwrLbs.value != null) parts.push(`GVWR ${unit.gvwrLbs.value.toLocaleString("en-US")} lbs.`);
  return parts.join(" ");
}

export function buildFeedRow(unit: CanonicalUnit): { row: ProductFeedRow } | { skip: FeedSkipReason } {
  if (unit.status === "removed") return { skip: "removed" };
  const title = plain(unit.title ?? "", 150);
  if (!title) return { skip: "no_title" };
  const brand = plain(unit.make ?? "", 70);
  if (!brand) return { skip: "no_brand" };
  const price = unit.priceUsd.value;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return { skip: "no_price" };
  const images = unit.images.filter(isHttpUrl);
  if (!images.length) return { skip: "no_image" };

  const seller = dealerDisplayName(unit);
  const description = unit.description && plain(unit.description, 5000).length >= 20 ? plain(unit.description, 5000) : factualDescription(unit, seller);
  const row: ProductFeedRow = {
    item_id: unit.id,
    title,
    description,
    url: listingCanonicalUrl(unit.id),
    brand,
    seller_name: seller,
    image_url: images[0],
    // "pending" means the dealer shows a sale pending or a hold: not buyable now.
    availability: unit.status === "available" ? "in_stock" : unit.status === "pending" ? "out_of_stock" : "unknown",
    price: `${price.toFixed(2)} USD`,
    is_eligible_search: true,
    is_eligible_checkout: false,
    target_countries: ["US"],
    store_country: "US",
  };
  if (unit.condition === "new" || unit.condition === "used") row.condition = unit.condition;
  if (CATEGORY[unit.rvType]) row.product_category = CATEGORY[unit.rvType];
  if (isHttpUrl(unit.dealer.website)) row.seller_url = unit.dealer.website;
  if (images.length > 1) row.additional_image_urls = images.slice(1, 6);
  if (unit.dryWeightLbs.value != null && unit.dryWeightLbs.value > 0) { row.weight = String(unit.dryWeightLbs.value); row.item_weight_unit = "lb"; }
  return { row };
}

export interface FeedStats { rows: number; skipped: Record<FeedSkipReason, number>; availability: Record<ProductFeedRow["availability"], number> }

/** Rows as JSON Lines, generated lazily so 130k units never sit in memory as one string. */
export function* feedLines(units: Iterable<CanonicalUnit>, stats?: FeedStats): Generator<string> {
  for (const unit of units) {
    const built = buildFeedRow(unit);
    if ("skip" in built) { if (stats) stats.skipped[built.skip]++; continue; }
    if (stats) { stats.rows++; stats.availability[built.row.availability]++; }
    yield `${JSON.stringify(built.row)}\n`;
  }
}

export function emptyFeedStats(): FeedStats {
  return { rows: 0, skipped: { removed: 0, no_price: 0, no_image: 0, no_brand: 0, no_title: 0 }, availability: { in_stock: 0, out_of_stock: 0, unknown: 0 } };
}

export function feedStats(units: Iterable<CanonicalUnit>): FeedStats {
  const stats = emptyFeedStats();
  for (const _line of feedLines(units, stats)) { /* count only */ }
  return stats;
}
