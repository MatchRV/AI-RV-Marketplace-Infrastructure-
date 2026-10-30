/**
 * Rebuild the snapshot from the committed one plus a fresh harvest (MarketCheck
 * + dealer websites), facts only.
 *
 *   tsx scripts/build-harvest-snapshot.ts <raw_records.ndjson> <stats_out.json>
 *
 * Input rows are RawScrapeRecord-shaped with a `_meta` block (see
 * /workspace/harvest-2026-10-30/prepare_raw.py): origin, harvest_method,
 * listing_url, dealer {name, city, state, lat, lng, domain}.
 *
 * Admission (fresh rows): VIN or stock number AND a listing-page URL; an RV
 * (resolvable RV category; cargo/utility/boat/vehicle rows dropped); year,
 * make, model and at least one photo. Rows without a dealer-stated price are
 * admitted with price unknown and counted. Nothing is estimated: a value is
 * copied from the listing or left blank; the runtime facts-only pass
 * (enforceFactsOnly) still applies at load.
 *
 * Dedupe: VIN first (across every dealer), then dealer domain + stock number.
 * The most recently seen copy wins. Fresh copies replace matching units in the
 * committed snapshot (refresh); committed units not seen again keep their old
 * lastSeenAt — freshness is never fabricated.
 */
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRecord, normalizeRvType, type RawScrapeRecord } from "../src/normalize.js";
import type { CanonicalUnit, Fact } from "../src/types.js";
import { MANUFACTURER_SPEC_RECORDS } from "../src/manufacturer-spec-records.js";

const here = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = resolve(here, "../data/inventory.snapshot.json");
const [rawPath, statsPath] = process.argv.slice(2);
if (!rawPath || !statsPath) { console.log("Usage: tsx scripts/build-harvest-snapshot.ts <raw.ndjson> <stats.json>"); process.exit(1); }

type Meta = { page_category?: string; page_category_quote?: string; luna_fields?: Record<string, string>; origin: string; harvest_method: string; listing_url?: string | null; mc_class?: string | null; harvested_at?: string;
  dealer: { name?: string | null; city?: string | null; state?: string | null; lat?: number | null; lng?: number | null; domain: string } };
type Row = RawScrapeRecord & { _meta: Meta; url?: string | null };

const STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));
const NON_RV = /\b(cargo|utility|enclosed trailer|car hauler|dump trailer|flatbed|flat deck|deckover|equipment trailer|landscape|horse trailer|livestock|stock trailer|boat|pontoon|jet ?ski|atv|utv|side[- ]by[- ]side|motorcycle|golf cart|snowmobile|tractor|mower|gooseneck flatbed|tilt deck|concession|vending|food truck|dump body)\b/i;
const RV_WORDS = /\b(travel trailer|fifth wheel|5th wheel|toy hauler|motorhome|motor home|class [abc]|camper|bunkhouse|rv)\b/i;
const URL_TYPE: [RegExp, string][] = [
  [/fifth[-_ ]?wheel|5th[-_ ]?wheel/i, "fifth_wheel"], [/toy[-_ ]?hauler/i, "toy_hauler"], [/travel[-_ ]?trailer/i, "travel_trailer"],
  [/class[-_ ]?a(?![a-z])/i, "class_a"], [/class[-_ ]?b(?![a-z])/i, "class_b"], [/class[-_ ]?c(?![a-z])/i, "class_c"],
  [/truck[-_ ]?camper/i, "truck_camper"], [/pop[-_ ]?up|folding[-_ ]?camper|tent[-_ ]?trailer/i, "popup_camper"],
];
const urlType = (u: string | null | undefined) => { for (const [re, t] of URL_TYPE) if (u && re.test(u)) return t; return null; };
const bare = (d: string) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
const inc = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const slug = (s: string) => s.toLowerCase().trim().replace(/\s+/g, "-");

// ── Committed snapshot ──────────────────────────────────────────────────────
const old = JSON.parse(gunzipSync(readFileSync(`${SNAPSHOT}.gz`)).toString("utf-8"));
const oldUnits = old.units as CanonicalUnit[];
const oldDomains = new Set(oldUnits.map(u => bare(u.provenance.dealerDomain || u.dealer.website || "")));

// Model → category votes from units whose category the dealer published.
const votes = new Map<string, Map<string, number>>();
// Series-level votes: first word of the make + first one/two words of the model
// ("heartland|prowler"), so "Prowler 17BHLX" and "Prowler" share evidence.
const seriesVotes = new Map<string, Map<string, number>>();
const words = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean);
const seriesKeys = (make: unknown, model: unknown) => {
  const mk = words(make)[0], md = words(model).filter(w => !/^\d/.test(w));
  if (!mk || !md.length) return [] as string[];
  return [md.length > 1 ? `${mk}|${md[0]} ${md[1]}` : null, `${mk}|${md[0]}`].filter((k): k is string => !!k);
};
const vote = (make: string, model: string, t: string) => {
  const k = `${make.toLowerCase().trim()}|${model.toLowerCase().trim()}`;
  const m = votes.get(k) ?? new Map(); m.set(t, (m.get(t) ?? 0) + 1); votes.set(k, m);
  for (const sk of seriesKeys(make, model)) { const v = seriesVotes.get(sk) ?? new Map(); v.set(t, (v.get(t) ?? 0) + 1); seriesVotes.set(sk, v); }
};
const seriesConsensus = (make: unknown, model: unknown) => {
  for (const sk of seriesKeys(make, model)) {
    const m = seriesVotes.get(sk); if (!m) continue;
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [top, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n >= 5 && n === total) return top; // unanimous only
  }
  return null;
};
for (const u of oldUnits) if (u.make && u.model) vote(u.make, u.model, u.rvType);
const consensus = (make: unknown, model: unknown) => {
  const m = votes.get(`${String(make ?? "").toLowerCase().trim()}|${String(model ?? "").toLowerCase().trim()}`);
  if (!m) return null;
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  const [top, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  return n >= 3 && n === total ? top : null; // unanimous only
};

// Manufacturer-published category: the brochure page URL names the category
// (e.g. jayco.com/rvs/class-a-motorhomes/...). Used only on an exact match:
// same make, the series named in the listing, and the same floorplan code as a
// token in the listing title (brochure-crawl records: Jayco, Keystone, Grand Design).
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const brochureRecs: { mk: string; series: RegExp; fp: RegExp; type: string; len: number }[] = [];
for (const rec of MANUFACTURER_SPEC_RECORDS as any[]) {
  const ty = urlType(rec.sourceUrl); if (!ty || !rec.floorplanCode || !rec.series) continue;
  const series = String(rec.series).toLowerCase().trim();
  brochureRecs.push({ mk: words(rec.make)[0], series: new RegExp(`(^|[^a-z0-9])${esc(series)}([^a-z0-9]|$)`), fp: new RegExp(`(^|[^A-Za-z0-9])${esc(String(rec.floorplanCode))}([^A-Za-z0-9]|$)`, "i"), type: ty, len: series.length });
}
const brochureType = (make: unknown, model: unknown, title: string) => {
  const mk = words(make)[0]; if (!mk) return null;
  const hay = ` ${String(model ?? "").toLowerCase()} ${title.toLowerCase()} `;
  const hits = brochureRecs.filter(r => r.mk === mk && r.series.test(hay) && r.fp.test(title));
  if (!hits.length) return null;
  const top = Math.max(...hits.map(h => h.len));
  const types = new Set(hits.filter(h => h.len === top).map(h => h.type));
  return types.size === 1 ? [...types][0] : null;
};

// ── Fresh rows ──────────────────────────────────────────────────────────────
const rejects = new Map<string, number>();
const byOrigin = new Map<string, number>();
const fresh: CanonicalUnit[] = [];
const typeVia = new Map<string, number>();
const noPrice = new Set<string>();
const rows: Row[] = [];
const rl = createInterface({ input: createReadStream(rawPath), crlfDelay: Infinity });
for await (const line of rl) if (line.trim()) rows.push(JSON.parse(line));
// Same physical unit (same VIN, or same dealer + stock number) whose category a
// dealer stated in another listing: the Oct 14 snapshot or another fresh row.
const unitType = new Map<string, string>();
const unitKey = (vin: unknown, dom: unknown, stock: unknown) => vin ? `vin:${String(vin).toUpperCase()}` : stock ? `stk:${bare(String(dom ?? ""))}:${String(stock).toLowerCase()}` : null;
for (const u of oldUnits) { const k = unitKey(u.vin, u.provenance.dealerDomain, u.stockNumber); if (k) unitType.set(k, u.rvType); }
const oldUnitType = new Map(unitType);
// Dealer-stated categories in the Oct 14 snapshot by make + first model word.
const oldVotes = new Map<string, Map<string, number>>();
const mmKey = (make: unknown, model: unknown) => { const a = words(make)[0], b = words(model)[0]; return a && b ? `${a}|${b}` : null; };
for (const u of oldUnits) { const k = mmKey(u.make, u.model); if (!k) continue; const v = oldVotes.get(k) ?? new Map(); v.set(u.rvType, (v.get(u.rvType) ?? 0) + 1); oldVotes.set(k, v); }
const oldMajority = (make: unknown, model: unknown) => {
  const k = mmKey(make, model); const v = k ? oldVotes.get(k) : null; if (!v) return null;
  const total = [...v.values()].reduce((a, b) => a + b, 0); const [top, n] = [...v.entries()].sort((a, b) => b[1] - a[1])[0];
  return total >= 3 && n / total >= 0.8 ? top : null;
};
for (const r of rows) {
  const t = (r._meta.harvest_method.startsWith("marketcheck") ? null : normalizeRvType(r.rv_type, String(r.title ?? ""))) ?? (r._meta.page_category || null);
  const k = unitKey(r.vin, r._meta.dealer.domain, r.stock_number);
  if (t && k && !unitType.has(k)) unitType.set(k, t);
}
// Second-chance category votes from fresh rows that state their category.
for (const r of rows) { if (r._meta.harvest_method.startsWith("marketcheck")) continue; const t = normalizeRvType(r.rv_type, String(r.title ?? "")); if (t && r.make && r.model) vote(String(r.make), String(r.model), t); }

const TYPE_STRICT = process.env.TYPE_STRICT !== "0";
const REFRESH_ONLY = process.env.REFRESH_ONLY === "1";
// Units whose listing page at the same dealer is gone (404/410), marked sold / sale pending, or no longer shows the unit ("<key>|<domain>").
const GONE = new Set<string>(process.env.GONE_KEYS ? JSON.parse(readFileSync(process.env.GONE_KEYS, "utf-8")) : []);
const MC_NOTE = "Copied from MarketCheck's crawl of this dealer listing (see sourceUrl); confirm with the dealer.";
for (const r of rows) {
  const m = r._meta; inc(byOrigin, m.origin);
  const rej = (why: string) => { inc(rejects, why); };
  const listingUrl = m.listing_url && /^https?:\/\//.test(m.listing_url) ? m.listing_url : null;
  if (!r.vin && !r.stock_number) { rej("no_vin_or_stock"); continue; }
  if (!listingUrl) { rej("no_listing_url"); continue; }
  if (/(^|\.)archive\.org\//i.test(listingUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "") + "/")) { rej("archive_org_url"); continue; }
  const title = String(r.title ?? "");
  const pageTitle = String(m.page_title ?? title);
  if (NON_RV.test(`${pageTitle} ${title} ${r.model ?? ""}`) && !RV_WORDS.test(`${pageTitle} ${m.mc_class ?? ""}`)) { rej("not_an_rv"); continue; }
  // New/used only from the dealer's own condition field (or the listing title's leading New/Used).
  if (!r.condition || !/\b(new|used)\b/i.test(String(r.condition))) { rej("no_dealer_condition"); continue; }
  if (/^\s*(park model|fish house)\b/i.test(String(m.mc_class ?? ""))) { rej("not_an_rv_park_model_or_fish_house"); continue; }
  const d = m.dealer;
  if (!d.state || !STATES.has(String(d.state).toUpperCase()) || !d.city) { rej("no_dealer_location"); continue; }
  let t: string | null, via: string;
  if (m.harvest_method.startsWith("marketcheck")) {
    // MarketCheck's class field is not the dealer's: checked against the Oct 14 dealer-stated categories it
    // was wrong for ~20% of units (towables labelled Class C). Use what the dealer's own page/URL says first,
    // and accept MarketCheck's class only when the dealer-stated categories for that make+model agree (>=80%, n>=3).
    t = m.page_category || null; via = "dealer_page_category_quote";
    if (!t) { t = urlType(listingUrl); via = "listing_url_path"; }
    if (!t) { const k = unitKey(r.vin, d.domain, r.stock_number); t = k ? oldUnitType.get(k) ?? null : null; via = "same_unit_other_listing"; }
    if (!t) {
      const mcT = normalizeRvType(m.mc_class, ""); const maj = oldMajority(r.make, r.model);
      if (mcT && maj && maj === mcT) { t = mcT; via = "marketcheck_class_corroborated"; }
      else if (mcT) { rej(maj ? "marketcheck_class_contradicted" : "marketcheck_class_uncorroborated"); continue; }
    }
  } else {
    t = normalizeRvType(r.rv_type, title); via = "dealer_category";
    if (!t && m.page_category) { t = m.page_category; via = "dealer_page_category_quote"; }
    if (!t) { t = urlType(listingUrl); via = "listing_url_path"; }
    if (!t) { const k = unitKey(r.vin, d.domain, r.stock_number); t = k ? unitType.get(k) ?? null : null; via = "same_unit_other_listing"; }
  }
  // TYPE_STRICT (default): the category comes only from what the dealer published for this unit. Brochure and
  // make/model consensus are used only as a veto: a stated category they contradict is rejected.
  const evidence = brochureType(r.make, r.model, title) ?? consensus(r.make, r.model) ?? seriesConsensus(r.make, r.model);
  if (t && evidence && evidence !== t) { rej("type_conflicts_model_evidence"); continue; }
  if (!TYPE_STRICT) {
    if (!t) { t = brochureType(r.make, r.model, title); via = "manufacturer_brochure_series"; }
    if (!t) { t = consensus(r.make, r.model); via = "make_model_consensus"; }
    if (!t) { t = seriesConsensus(r.make, r.model); via = "series_consensus"; }
  }
  if (!t) { rej(TYPE_STRICT ? "no_dealer_stated_rv_type" : "unresolvable_rv_type"); continue; }
  const hasPrice = r.price !== null && r.price !== undefined && Number(r.price) >= 1000;
  const raw: RawScrapeRecord = { ...r, rv_type: t, price: hasPrice ? r.price : 99_999 };
  const res = normalizeRecord(`url:${listingUrl}`, raw);
  if ("reject" in res) { rej(res.reject.reason); continue; }
  const u = res.unit;
  if (!u.model || /^(unknown|other|n\/a)$/i.test(u.model.trim())) { rej("no_model"); continue; }
  if (!hasPrice) { u.priceUsd = { value: null, source: null, confidence: null, note: "Price not stated by the dealer; call for price." } as Fact<number>; }
  else if (u.priceUsd.value !== null) {
    u.priceUsd.sourceUrl = listingUrl;
    const PRICE_NOTE: Record<string, string> = {
      harvested_price_matches_page: "Dealer's current asking price; matches the price on the listing page (read 2026-10-30).",
      page_schema_offer_price: "Dealer's current asking price from the listing page's offer price (read 2026-10-30); not MSRP.",
      page_sale_price_label: "Dealer's current sale/our price as labeled on the listing page (read 2026-10-30); not MSRP.",
      marketcheck_price_below_msrp: "Dealer's asking price as crawled by MarketCheck (below MSRP); listing page not re-read.",
    };
    if (m.price_basis && PRICE_NOTE[m.price_basis]) u.priceUsd.note = PRICE_NOTE[m.price_basis];
  }
  const dom = bare(d.domain);
  const city = String(d.city).trim();
  u.dealer = { id: `${dom}:${slug(city)}`, name: String(d.name ?? dom).trim(), city, state: String(d.state).toUpperCase(),
    lat: typeof d.lat === "number" ? d.lat : null, lng: typeof d.lng === "number" ? d.lng : null, website: `https://${dom}` };
  if (u.vin) u.id = `vin:${u.vin}`; else u.id = `stk:${u.dealer.id}:${u.stockNumber}`;
  const isMc = m.harvest_method.startsWith("marketcheck");
  // Values read from the unit's own listing page by the LLM extractor (quote verified on the page).
  const RAW_TO_FIELD: Record<string, keyof CanonicalUnit> = { sleeps: "sleeps", length: "lengthFt", dry_weight: "dryWeightLbs", gvwr: "gvwrLbs", hitch_weight: "hitchWeightLbs",
    slideouts: "slideouts", fresh_water_capacity: "freshWaterGal", gray_water_capacity: "greyWaterGal", black_water_capacity: "blackWaterGal" };
  const pageRead = new Set<string>();
  for (const [rawKey, quote] of Object.entries(m.luna_fields ?? {})) {
    const k = RAW_TO_FIELD[rawKey]; if (!k) continue;
    const f = u[k] as Fact<number>; if (f.value === null) continue;
    f.source = "dealer_listing"; f.confidence = "medium"; f.sourceUrl = listingUrl;
    f.note = `Stated on the dealer's listing page ("${quote.slice(0, 120)}"); read by LLM-assisted extraction (GPT-6 Luna), quote verified on the page.`;
    pageRead.add(k as string);
  }
  for (const k of ["msrpUsd", "lengthFt", "dryWeightLbs", "gvwrLbs", "hitchWeightLbs", "sleeps", "slideouts", "freshWaterGal", "greyWaterGal", "blackWaterGal"] as const) {
    const f = u[k] as Fact<number>;
    if (f.value === null || pageRead.has(k)) continue;
    f.sourceUrl = listingUrl;
    if (isMc && f.source === "dealer_listing") {
      // BLANK_MC_SPECS=1: serve only values read from the dealer's own page or a brochure.
      if (process.env.BLANK_MC_SPECS === "1" && k !== "msrpUsd") { (u as any)[k] = { value: null, source: null, confidence: null, note: "Not read from the dealer's own page; confirm with the dealer." }; continue; }
      f.confidence = "medium"; f.note = MC_NOTE;
    }
  }
  u.provenance = { ...u.provenance, dealerDomain: dom, listingUrl, harvestMethod: m.harvest_method,
    lastSeenBasis: m.last_seen_basis ?? (isMc ? "marketcheck_last_seen_at" : "harvested_at") };
  inc(typeVia, via);
  if (!hasPrice) noPrice.add(u.id);
  fresh.push(u);
}

// ── Dedupe fresh (VIN, then domain+stock); most recently seen wins ──────────
const t = (u: CanonicalUnit) => Date.parse(u.provenance.lastSeenAt) || 0;
const better = (a: CanonicalUnit, b: CanonicalUnit) =>
  t(a) !== t(b) ? t(a) > t(b) : (a.priceUsd.value !== null) !== (b.priceUsd.value !== null) ? a.priceUsd.value !== null : a.images.length >= b.images.length;
const keyOf = (u: CanonicalUnit) => u.vin ? `vin:${u.vin.toUpperCase()}` : `stk:${bare(u.provenance.dealerDomain)}:${String(u.stockNumber).toLowerCase()}`;
const freshBy = new Map<string, CanonicalUnit>();
let freshDupes = 0;
for (const u of fresh) {
  const k = keyOf(u); const cur = freshBy.get(k);
  if (cur) { freshDupes++; if (better(u, cur)) freshBy.set(k, u); } else freshBy.set(k, u);
}

// Units without a dealer-stated price are counted and written to a sidecar
// file, not served: the app's invariant is that every unit an assistant sees
// has a price (test/snapshot.test.ts). Set INCLUDE_NO_PRICE=1 once the app
// supports "call for price" units.
const INCLUDE_NO_PRICE = process.env.INCLUDE_NO_PRICE === "1";
const noPriceHeld: CanonicalUnit[] = [];
if (!INCLUDE_NO_PRICE) for (const [k, u] of [...freshBy]) if (u.priceUsd.value === null) { noPriceHeld.push(u); freshBy.delete(k); }

// ── Merge with committed units ──────────────────────────────────────────────
const out = new Map<string, CanonicalUnit>();
let refreshed = 0, sep17Seen = 0, oldDupes = 0;
const SPEC = ["lengthFt", "dryWeightLbs", "gvwrLbs", "hitchWeightLbs", "sleeps", "slideouts", "freshWaterGal", "greyWaterGal", "blackWaterGal"] as const;
let goneDropped = 0, refreshOtherDomainSkipped = 0;
for (const u of oldUnits) {
  const k = u.vin ? `vin:${u.vin.toUpperCase()}` : `stk:${bare(u.provenance.dealerDomain)}:${String(u.stockNumber ?? u.id).toLowerCase()}`;
  const fk = freshBy.get(k);
  const liveCopy = !!fk && (!REFRESH_ONLY || bare(fk.provenance.dealerDomain) === bare(u.provenance.dealerDomain));
  if (GONE.has(`${k}|${bare(u.provenance.dealerDomain)}`) && !liveCopy) { goneDropped++; continue; }
  let f = freshBy.get(k);
  // Refresh-only: a fresh copy refreshes an existing unit only at the same dealer domain.
  if (f && REFRESH_ONLY && bare(f.provenance.dealerDomain) !== bare(u.provenance.dealerDomain)) { refreshOtherDomainSkipped++; f = undefined; }
  if (f) {
    refreshed++;
    if (u.provenance.lastSeenAt.startsWith("2026-09-17")) sep17Seen++;
    // Keep the committed dealer-listing value only where the fresh copy is blank.
    for (const s of SPEC) if ((f[s] as Fact<number>).value === null && (u[s] as Fact<number>).value !== null && (u[s] as Fact<number>).source === "dealer_listing") (f as any)[s] = u[s];
    f.provenance.firstSeenAt = [u.provenance.firstSeenAt, f.provenance.firstSeenAt].sort()[0];
    freshBy.delete(k); out.set(k, f); continue;
  }
  if (out.has(k)) { oldDupes++; continue; }
  out.set(k, u);
}
const newDomainUnits = REFRESH_ONLY ? [] : [...freshBy.values()];
const notAddedRefreshOnly = REFRESH_ONLY ? freshBy.size : 0;
if (!REFRESH_ONLY) for (const [k, u] of freshBy) out.set(k, u);
const units = [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
// Unique ids (two dealers can share a stock number pattern only via different dealer ids, but guard anyway).
const seenIds = new Set<string>(); let idCollisions = 0;
for (const u of units) { if (seenIds.has(u.id)) { u.id = `${u.id}~${bare(u.provenance.dealerDomain)}`; idCollisions++; } seenIds.add(u.id); }

const MAX_IMAGES = 5, MAX_FEATURES = 15, MAX_DESCRIPTION = 500;
for (const u of units) {
  if (u.images.length > MAX_IMAGES) u.images = u.images.slice(0, MAX_IMAGES);
  if (u.features.length > MAX_FEATURES) u.features = u.features.slice(0, MAX_FEATURES);
  if (u.description && u.description.length > MAX_DESCRIPTION) u.description = u.description.slice(0, MAX_DESCRIPTION).trimEnd() + "…";
}
const dealers = new Set(units.map(u => bare(u.provenance.dealerDomain)));
const states = new Map<string, number>(); for (const u of units) inc(states, u.dealer.state);
const known = (k: keyof CanonicalUnit) => units.filter(u => (u[k] as any)?.value != null).length;
const builtAt = new Date().toISOString();
const stats = {
  builtAt, oldUnits: oldUnits.length, freshRows: rows.length, freshByOrigin: Object.fromEntries(byOrigin),
  freshAdmitted: fresh.length, freshDupes, freshUnique: fresh.length - freshDupes, rejects: Object.fromEntries(rejects), typeVia: Object.fromEntries(typeVia),
  mode: REFRESH_ONLY ? "refresh_only_existing_units" : "refresh_and_add", typeStrict: TYPE_STRICT,
  oldUnitsDroppedGoneOrSold: goneDropped, refreshOtherDomainSkipped, freshUnitsNotAddedRefreshOnly: notAddedRefreshOnly,
  refreshedOldUnits: refreshed, sep17UnitsSeenAgain: sep17Seen, oldDupesDropped: oldDupes, idCollisions,
  addedUnits: newDomainUnits.length, addedFromNewDealerDomains: newDomainUnits.filter(u => !oldDomains.has(bare(u.provenance.dealerDomain))).length,
  noPriceUnitsHeldInSidecar: noPriceHeld.length, noPriceUnitsHeldFromNewDealers: noPriceHeld.filter(u => !oldDomains.has(bare(u.provenance.dealerDomain))).length,
  addedNoPrice: newDomainUnits.filter(u => u.priceUsd.value === null).length, addedWithPrice: newDomainUnits.filter(u => u.priceUsd.value !== null).length,
  finalUnits: units.length, dealerDomains: dealers.size, locations: new Set(units.map(u => u.dealer.id)).size, states: states.size,
  byState: Object.fromEntries([...states].sort((a, b) => b[1] - a[1])),
  coverage: { length: known("lengthFt"), sleeps: known("sleeps"), dryWeight: known("dryWeightLbs"), gvwr: known("gvwrLbs"), price: known("priceUsd") },
};
console.log(JSON.stringify(stats, null, 1));
const payload = JSON.stringify({
  schemaVersion: 1, builtAt,
  datasetNote: "MatchRV nationwide dealer inventory snapshot: the Oct 14 dealer-website snapshot, refreshed and extended with a 2026-10-25..30 harvest (MarketCheck active RV listings + dealer websites). Each harvested unit has a VIN or stock number and a listing URL; specs are copied from the listing or left blank. Units not seen again keep their earlier lastSeenAt.",
  stats: { rawRecords: oldUnits.length + rows.length, units: units.length, dealers: dealers.size,
    rejections: Object.fromEntries(rejects), uniqueVins: units.filter(u => u.vin).length, withLength: known("lengthFt"), withSleeps: known("sleeps") },
  units,
});
// ASCII-only JSON (non-ASCII as \uXXXX escapes): identical parsed values, but the text decodes to a
// one-byte string at load, halving the transient memory of JSON.parse on the server.
const asciiPayload = payload.replace(/[\u007f-\uffff]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
writeFileSync(`${SNAPSHOT}.gz`, gzipSync(Buffer.from(asciiPayload, "latin1"), { level: 9 }));
writeFileSync(statsPath, JSON.stringify(stats, null, 1));
if (noPriceHeld.length) writeFileSync(statsPath.replace(/\.json$/, "") + ".no-price-units.ndjson.gz", gzipSync(noPriceHeld.map(u => JSON.stringify(u)).join("\n")));
console.log(`wrote ${SNAPSHOT}.gz (${(payload.length / 1e6).toFixed(0)} MB raw)`);
