/**
 * Rebuild the committed snapshot from (a) the existing snapshot, minus records
 * an assistant can't use, and (b) fresh dealer-website scrapes.
 *
 * Dropped as unusable: no photos, no model ("Unknown"/blank), no price.
 * Freshly scraped dealers replace their older snapshot records entirely.
 *
 * Run: tsx scripts/build-national-snapshot.ts <scrape_out_dir> <dealers.national.json>
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRecord, type RawScrapeRecord } from "../src/normalize.js";
import type { CanonicalUnit, Fact } from "../src/types.js";
import { fact } from "../src/enrich.js";
import { emptyPowertrain, isMotorized } from "../src/motorhome.js";

const here = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = resolve(here, "../data/inventory.snapshot.json");
const [outDir, dealersPath] = process.argv.slice(2);
if (!outDir || !dealersPath) {
  console.log("Usage: tsx scripts/build-national-snapshot.ts <scrape_out_dir> <dealers.national.json>");
  process.exit(1);
}

const bare = (d: string) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
const usable = (u: CanonicalUnit) =>
  u.images.length > 0 && u.priceUsd.value !== null && !!u.model && !/^(unknown|other|n\/a)$/i.test(u.model.trim());

// ── Dealer directory (name/city/state for fresh scrapes) ────────────────────
type DealerInfo = { name: string; city: string; state: string };
const dealerDir = new Map<string, DealerInfo>();
for (const d of JSON.parse(readFileSync(dealersPath, "utf-8")).dealers) {
  for (const u of [d.website, d.final_url, d.url]) if (u) dealerDir.set(bare(u), { name: d.name, city: d.city, state: d.state });
}

// ── Fresh scrape records ────────────────────────────────────────────────────
type Rec = Record<string, any>;
const freshByDomain = new Map<string, Rec[]>();
const completeDomains = new Set<string>();
const latestFile = new Map<string, string>();
for (const f of readdirSync(outDir).filter(f => f.endsWith(".json")).sort()) latestFile.set(f.split("_")[0], f);
for (const f of latestFile.values()) {
  const doc = JSON.parse(readFileSync(join(outDir, f), "utf-8"));
  const dom = bare(doc.source_meta?.dealer_domain ?? doc.listings?.[0]?.dealer_domain ?? "");
  completeDomains.add(dom);
  freshByDomain.set(dom, doc.listings ?? []);
}
const partialDir = join(outDir, "partial");
if (existsSync(partialDir)) {
  for (const f of readdirSync(partialDir).filter(f => f.endsWith(".ndjson"))) {
    const recs = readFileSync(join(partialDir, f), "utf-8").split("\n").filter(Boolean).map(l => JSON.parse(l));
    if (!recs.length) continue;
    const dom = bare(recs[0].dealer_domain ?? "");
    if (!completeDomains.has(dom)) freshByDomain.set(dom, recs);
  }
}

/** Map the scraper's cleaned values onto the raw field names normalize expects. */
function toRaw(r: Rec): RawScrapeRecord {
  const c = r.clean ?? {};
  return {
    ...r,
    rv_type: c.rv_type ?? r.rv_type,
    year: c.year ?? r.year,
    make: c.make ?? r.make,
    model: c.model ?? r.model,
    vin: c.vin ?? r.vin,
    stock_number: c.stock_number ?? r.stock_number,
    condition: c.condition ?? r.condition,
    price: c.price_usd ?? null,
    sale_price: null,
    msrp: c.msrp_usd ?? null,
    length: c.length_ft ?? null,
    dry_weight: c.dry_weight_lbs ?? null,
    gvwr: c.gvwr_lbs ?? null,
    hitch_weight: c.hitch_weight_lbs ?? null,
    sleeps: c.sleeps ?? null,
    slideouts: c.slideouts ?? null,
    fresh_water_capacity: c.fresh_water_gal ?? r.fresh_water_capacity,
    gray_water_capacity: c.gray_water_gal ?? r.gray_water_capacity,
    black_water_capacity: c.black_water_gal ?? r.black_water_capacity,
    bunkhouse: c.bunkhouse?.source === "listing_text" || c.bunk_count > 0 ? true : r.bunkhouse,
    inventory_status: r.inventory_status ?? "available",
  };
}

/** Scraper powertrain block ({field: {value, source: "spec"|"text"}}) → Powertrain & Towing facts. */
function powertrainFacts(c: Rec): Pick<CanonicalUnit, "powertrain" | "towing"> {
  const p = c.powertrain ?? {};
  const fct = <T,>(key: string): Fact<T> => {
    const e = p[key];
    if (!e || e.value == null) return { value: null, source: null, confidence: null };
    return e.source === "spec"
      ? fact<T>(e.value, "dealer_listing", "high", "Stated in the dealer's spec table for this unit; not manufacturer-verified.")
      : fact<T>(e.value, "derived_text", "medium", "Stated in the dealer's description for this unit; confirm with the dealer.");
  };
  return {
    powertrain: {
      fuelType: fct("fuel_type"), engine: fct("engine"), horsepower: fct("horsepower"), horsepowerRpm: fct("horsepower_rpm"),
      torqueLbFt: fct("torque_lb_ft"), torqueRpm: fct("torque_rpm"), transmission: fct("transmission"), chassis: fct("chassis"), engineBrake: fct("engine_brake"),
    },
    towing: {
      cargoCapacityLbs: fct("cargo_capacity_lbs"), gcwrLbs: fct("gcwr_lbs"), frontAxleRatingLbs: fct("front_axle_rating_lbs"),
      rearAxleRatingLbs: fct("rear_axle_rating_lbs"), hitchTowRatingLbs: fct("tow_capacity_lbs"), tongueWeightLimitLbs: fct("tongue_weight_limit_lbs"),
    },
  };
}

const fresh: CanonicalUnit[] = [];
const freshRejects = new Map<string, number>();
const freshPerDealer = new Map<string, number>();
for (const [dom, recs] of freshByDomain) {
  const info = dealerDir.get(dom);
  for (const r of recs) {
    const res = normalizeRecord(`url:${r.source_detail_url ?? r.url ?? Math.random()}`, toRaw(r));
    if ("reject" in res) {
      freshRejects.set(res.reject.reason, (freshRejects.get(res.reject.reason) ?? 0) + 1);
      continue;
    }
    const u = res.unit;
    if (info) {
      const city = (info.city || "Unknown").split(",")[0].trim();
      u.dealer = { ...u.dealer, id: `${dom}:${city.toLowerCase().replace(/\s+/g, "-")}`, name: info.name, city, state: info.state, lat: null, lng: null, website: `https://${dom}` };
    }
    u.provenance.dealerDomain = dom;
    if (isMotorized(u)) Object.assign(u, powertrainFacts(r.clean ?? {}));
    if (!usable(u)) {
      freshRejects.set("unusable_model_photo_price", (freshRejects.get("unusable_model_photo_price") ?? 0) + 1);
      continue;
    }
    fresh.push(u);
    freshPerDealer.set(dom, (freshPerDealer.get(dom) ?? 0) + 1);
  }
}

// ── Existing snapshot, cleaned ──────────────────────────────────────────────
const old = JSON.parse(readFileSync(SNAPSHOT, "utf-8"));
const oldDrops = { unusable: 0, replacedByFresh: 0 };
const byId = new Map<string, CanonicalUnit>();
for (const u of old.units as CanonicalUnit[]) {
  if (!usable(u)) { oldDrops.unusable++; continue; }
  if (completeDomains.has(bare(u.provenance.dealerDomain || u.dealer.website || ""))) { oldDrops.replacedByFresh++; continue; }
  // Older records carry no powertrain data; only an explicit "diesel" in the dealer's title counts.
  if (isMotorized(u) && !u.powertrain && /\bdiesel\b/i.test(u.title)) {
    u.powertrain = { ...emptyPowertrain(), fuelType: fact("diesel", "derived_text", "medium", "Dealer listing title says diesel; confirm with the dealer.") };
  }
  byId.set(u.id, u);
}
for (const u of fresh) byId.set(u.id, u);
const units = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));

const dealers = new Set(units.map(u => bare(u.provenance.dealerDomain || u.dealer.website || u.dealer.name)));
const states = new Map<string, number>();
for (const u of units) states.set(u.dealer.state, (states.get(u.dealer.state) ?? 0) + 1);
const known = (k: keyof CanonicalUnit) => units.filter(u => (u[k] as any)?.value != null).length;

console.log(`old snapshot: ${old.units.length}  dropped unusable: ${oldDrops.unusable}  replaced by fresh: ${oldDrops.replacedByFresh}`);
console.log(`fresh scraped units kept: ${fresh.length} from ${freshPerDealer.size} dealers  rejects: ${JSON.stringify(Object.fromEntries(freshRejects))}`);
console.log(`FINAL units: ${units.length}  dealers: ${dealers.size}  states: ${states.size}`);
console.log(`by state: ${[...states].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}=${n}`).join(" ")}`);
const mh = units.filter(isMotorized);
const ptKnown = (k: string) => mh.filter(u => (u.powertrain as any)?.[k]?.value != null || (u.towing as any)?.[k]?.value != null).length;
console.log(`motorhomes: ${mh.length}  fuel ${ptKnown("fuelType")}  hp ${ptKnown("horsepower")}  torque ${ptKnown("torqueLbFt")}  engine ${ptKnown("engine")}  chassis ${ptKnown("chassis")}  hitchTow ${ptKnown("hitchTowRatingLbs")}  gcwr ${ptKnown("gcwrLbs")}`);
console.log(`coverage: length ${known("lengthFt")}  sleeps ${known("sleeps")}  dryWeight ${known("dryWeightLbs")}  gvwr ${known("gvwrLbs")}  hitch ${known("hitchWeightLbs")}  bunkhouse ${known("bunkhouse")}`);

const payload = JSON.stringify({
  schemaVersion: 1,
  builtAt: new Date().toISOString(),
  datasetNote: "MatchRV nationwide dealer inventory snapshot: prior MarketCheck/Replit records with photos, model and price, plus fresh dealer-website scrapes (which replace older records for the same dealer). Records without photos, a model or a price were removed.",
  stats: {
    rawRecords: old.units.length + [...freshByDomain.values()].reduce((n, r) => n + r.length, 0),
    units: units.length,
    dealers: dealers.size,
    rejections: { ...Object.fromEntries(freshRejects), old_unusable: oldDrops.unusable, old_replaced_by_fresh: oldDrops.replacedByFresh },
    withLength: known("lengthFt"),
    withSleeps: known("sleeps"),
  },
  units,
});
writeFileSync(SNAPSHOT, payload);
writeFileSync(`${SNAPSHOT}.gz`, gzipSync(payload, { level: 9 }));
console.log(`wrote ${SNAPSHOT} (+ .gz)`);
