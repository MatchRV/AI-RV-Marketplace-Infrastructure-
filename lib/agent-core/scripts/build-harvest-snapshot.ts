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
import { titleModelYear } from "../src/listing-reconcile.js";
import { BRANDS, canonicalBrand } from "../src/brands.js";

const here = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = resolve(here, "../data/inventory.snapshot.json");
const [rawPath, statsPath] = process.argv.slice(2);
if (!rawPath || !statsPath) { console.log("Usage: tsx scripts/build-harvest-snapshot.ts <raw.ndjson> <stats.json>"); process.exit(1); }

type Meta = { page_category?: string; page_category_quote?: string; luna_fields?: Record<string, string>; origin: string; harvest_method: string; listing_url?: string | null; mc_class?: string | null; harvested_at?: string; sleeps_from_page?: boolean; page_title?: string | null; price_basis?: string | null; last_seen_basis?: string | null;
  dealer: { name?: string | null; city?: string | null; state?: string | null; lat?: number | null; lng?: number | null; domain: string } };
type Row = RawScrapeRecord & { _meta: Meta; url?: string | null };

const NON_RV_MAKES_BASE = new Set(["u.s. rack", "us rack", "u s rack", "curt", "roadmaster", "baja designs", "we do consignments", "blue ox", "demco", "continental cargo"]);
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
      page_price_2026_10_31: "Dealer's current asking price from the listing page (read 2026-10-31); not MSRP.",
      harvested_price_matches_page_2026_10_31: "Dealer's current asking price; matches the price on the listing page (read 2026-10-31).",
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
  if (m.sleeps_from_page && u.sleeps.value !== null) {
    u.sleeps.confidence = "high"; u.sleeps.sourceUrl = listingUrl;
    u.sleeps.note = "Stated on the dealer's listing page (re-read 2026-10-30); MarketCheck's crawl had dropped a digit (11 -> 1).";
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
// KEEP_BASE=1 (2026-10-31 append build): the committed snapshot already passed the v3.3 QA (template prices,
// year from title, stitched records, VIN/type, lot city). Its units are carried as they are; the QA passes below
// run only on fresh units (re-running the base-record passes on an already-fixed snapshot is not idempotent).
const KEEP_BASE = process.env.KEEP_BASE === "1";
const baseKept = new Set<CanonicalUnit>();
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
  if (out.has(k) && !KEEP_BASE) { oldDupes++; continue; }
  // KEEP_BASE: committed records sharing a key (Camping World copies of one listing, handled by the page-pass
  // branch) are carried unchanged under their own id.
  out.set(out.has(k) ? `${k}#${u.id}` : k, u); if (KEEP_BASE) baseKept.add(u);
}
const newDomainUnits = REFRESH_ONLY ? [] : [...freshBy.values()];
const notAddedRefreshOnly = REFRESH_ONLY ? freshBy.size : 0;
if (!REFRESH_ONLY) for (const [k, u] of freshBy) out.set(k, u);
// ── Hold-backs (CSO QA v2, 2026-10-30): dealers whose listing pages we cannot parse reliably yet are excluded
// entirely (old and fresh units). valleyrvsupercenter.com: year read from the "similar units" JSON; atozrvs.com:
// year read from the brochure "Introduction Year"; wilderrvs.com: series ("19SERIES") stored as the floorplan.
const HOLDBACK = new Set((process.env.HOLDBACK_DOMAINS ?? "valleyrvsupercenter.com,atozrvs.com,wilderrvs.com").split(",").map(x => bare(x.trim())).filter(Boolean));
const heldBackByDomain = new Map<string, number>();
for (const [k, u] of [...out]) { const dd = bare(u.provenance.dealerDomain); if (HOLDBACK.has(dd)) { inc(heldBackByDomain, dd); out.delete(k); } }
// ── Template prices (Oct 14 base units not re-read in this harvest): on some dealer sites the Oct 14 scraper
// copied one featured unit's price onto most of the inventory (hwhrv.com: 528 of 580 units at $54,995; the 6
// listing pages re-read 2026-10-30 all show a different price). A price shared by >=25 units that is >=25% of
// the dealer's base units (or >=100 units and >=10%) is not that unit's price, so those units are held back.
// PRICE_TEMPLATE_HOLDBACK=0 disables this.
const priceTemplateHeld = new Map<string, number>(); const priceTemplateValues: Record<string, number[]> = {};
if (process.env.PRICE_TEMPLATE_HOLDBACK !== "0") {
  const base = [...out].filter(([, u]) => !u.provenance.harvestMethod && !baseKept.has(u));
  const perDom = new Map<string, number>(); const perPrice = new Map<string, number>();
  for (const [, u] of base) { const dd = bare(u.provenance.dealerDomain); inc(perDom, dd); if (u.priceUsd.value !== null) inc(perPrice, `${dd}|${u.priceUsd.value}`); }
  const tmpl = new Set<string>();
  for (const [k, n] of perPrice) { const dd = k.split("|")[0]; const share = n / (perDom.get(dd) ?? 1); if (n >= 25 && (share >= 0.25 || (n >= 100 && share >= 0.1))) { tmpl.add(k); (priceTemplateValues[dd] ??= []).push(Number(k.split("|")[1])); } }
  for (const [k, u] of base) { const dd = bare(u.provenance.dealerDomain); if (u.priceUsd.value !== null && tmpl.has(`${dd}|${u.priceUsd.value}`)) { inc(priceTemplateHeld, dd); out.delete(k); } }
}
// ── Model year = the year the dealer's own listing states (CSO QA v2). The Oct 14 base scraper filled the
// structured year (and stock number) from a different unit on Camping World, hwhrv.com, meyersrvsuperstores.com
// and others; the listing title it captured is the unit's own (40 of 40 sampled pages re-read 2026-10-30: page
// heading year == captured title year; stored year differed from the page in 34). So when the captured title
// states a year that differs from the structured field, the title's year wins (yearSource "dealer_title").
// A VIN-decoded year is never applied here: a title with no year has no page evidence either way, and a
// dealer-stated year that disagrees with the VIN is left as stated (listed for review, not changed).
const yearFix = { fromTitle: 0, fromTitleVinAgreedWithOld: 0, byDomain: new Map<string, number>() };
const VIN_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";
const vinYear = (v: string | null) => { if (!v || v.length !== 17) return null; const i = VIN_CODES.indexOf(v[9].toUpperCase()); if (i < 0) return null; let y = 1980 + i; while (y + 30 <= new Date().getFullYear() + 1) y += 30; return y; };
// A title with a year range ("2007-2024 Silverado", "2016 - 2019 GM", "2019-20") is a fitment/coverage range,
// not the unit's model year: the title year is not applied and the prior value is kept.
const YEAR_RANGE = /\b(?:19|20)\d{2}\s*[-\u2013\u2014\/]\s*(?:(?:19|20)\d{2}|\d{2})\b/;
let yearRangeSkipped = 0;
for (const u of out.values()) {
  if (baseKept.has(u)) continue;
  const ty = titleModelYear(u.title);
  if (ty === null || ty === u.year) continue;
  if (YEAR_RANGE.test(u.title)) { yearRangeSkipped++; continue; }
  if (vinYear(u.vin) === u.year) yearFix.fromTitleVinAgreedWithOld++;
  u.year = ty; u.yearSource = "dealer_title"; yearFix.fromTitle++; inc(yearFix.byDomain, bare(u.provenance.dealerDomain));
}
// ── Stitched Oct 14 base records (CSO QA "yearfix", 2026-10-30). The Oct 14 scraper joined two units of the
// same dealer: title, VIN, photos, description and price belong to one unit, while stock number and often make,
// model, trim/floorplan and condition came from another (CW 2018 Unity U24FX, VIN WDAPF4CC3H9710756, carried
// stock 2598243 = a 2027 Thor Coleman; its own stock 2738473P is in its photo paths and description). Those
// fields are re-read from the unit's own title/photos/description; a field that cannot be confirmed there is
// blanked (condition "unknown"), never kept from the other unit. Camping World: a record is stitched when its
// stock number is not the one in its own photo path / description. STITCHED_DOMAINS: every base record of
// these dealers is treated as stitched (QA-confirmed or field-vs-title disagreement on >=20% of base units).
const tnorm = (x: string) => x.toLowerCase().replace(/&#39;/g, "'").replace(/[^a-z0-9]+/g, " ").trim();
const makeCounts = new Map<string, number>();
for (const u of out.values()) { const m = tnorm(u.make); if (m && ` ${tnorm(u.title)} `.includes(` ${m} `)) inc(makeCounts, m); }
for (const r of rows) { const m = tnorm(String(r.make ?? "")); if (m) inc(makeCounts, m, 2); }
const aliasSet = new Set([...makeCounts].filter(([m, n]) => n >= 2 && m.length >= 2 && !/^\d+$/.test(m) && !NON_RV_MAKES_BASE.has(m)).map(([m]) => m));
for (const b of BRANDS) for (const a of b.aliases) aliasSet.add(tnorm(a));
const aliasList = [...aliasSet].sort((a, b) => b.length - a.length);
type TitleParse = { make: string; model: string; floorplan: string | null; condition: "new" | "used" | null };
function parseTitle(title: string): TitleParse | null {
  const toks = title.replace(/&#39;/g, "'").trim().split(/\s+/);
  let i = 0, condition: TitleParse["condition"] = null;
  const condWord = (w: string) => /^(new)$/i.test(w) ? "new" : /^(used|pre-owned|preowned)$/i.test(w) ? "used" : null;
  if (toks[i] && condWord(toks[i])) condition = condWord(toks[i++]);
  if (toks[i] && /^\d+'$/.test(toks[i])) i++; // "36' 2017 Crossroads …" length prefix
  if (!toks[i] || !/^(19|20)\d{2}$/.test(toks[i])) return null;
  i++;
  if (toks[i] && condWord(toks[i])) condition = condWord(toks[i++]);
  const rest = toks.slice(i); const restN = tnorm(rest.join(" "));
  for (const alias of aliasList) {
    if (restN !== alias && !restN.startsWith(alias + " ")) continue;
    let k = 0; while (k < rest.length && tnorm(rest.slice(0, k + 1).join(" ")).length <= alias.length && tnorm(rest.slice(0, k + 1).join(" ")) !== alias) k++;
    if (tnorm(rest.slice(0, k + 1).join(" ")) !== alias) return null;
    const makeText = rest.slice(0, k + 1).join(" ");
    let remainder = rest.slice(k + 1);
    // Marketing tails ("30DC RV W/ Full Body Paint, King Bed …", "… - Bunk House") are not part of the model.
    const cut = remainder.findIndex((w, j) => j > 0 && (/^(at|\||w\/|with|-|\u2013)$/i.test(w) || (/^rv$/i.test(w) && /^(w\/|with)$/i.test(remainder[j + 1] ?? ""))));
    if (cut >= 0) remainder = remainder.slice(0, cut);
    remainder = remainder.map(w => w.replace(/,$/, "")).filter(Boolean);
    const comma = remainder.findIndex(w => /,/.test(w)); if (comma > 0) remainder = remainder.slice(0, comma);
    if (!remainder.length) return null;
    let floorplan: string | null = null;
    const last = remainder[remainder.length - 1];
    if (remainder.length >= 2 && /\d/.test(last) && /^[A-Za-z0-9.\-+]{2,12}$/.test(last)) { floorplan = last; remainder = remainder.slice(0, -1); }
    return { make: canonicalBrand(makeText) ?? makeText, model: remainder.join(" "), floorplan, condition };
  }
  return null;
}
const STITCHED_DOMAINS = new Set((process.env.STITCHED_DOMAINS ?? "meyersrvsuperstores.com,bestrv.com,hwhrv.com,theranchrv.com,clickitrv.com,broadmoorrv.com,olathefordrv.com,adventuremotorhomes.net,rvsrfun.com,bayareaairstream.com,carvilla.com,coastalrv.net,brewbakers.com,coloniadelreyrv.com,trailersourceinc.com").split(",").map(x => bare(x.trim())).filter(Boolean));
const stitch = { records: 0, heldUnconfirmable: 0, titleNotUnit: 0, chassisMakeFixed: 0, chassisByDomain: new Map<string, number>(), byDomain: new Map<string, number>(), heldByDomain: new Map<string, number>(),
  fieldChanged: { stockNumber: 0, make: 0, model: 0, trim: 0, floorplanCode: 0, condition: 0 } as Record<string, number>,
  fieldChangedByDomain: new Map<string, Record<string, number>>(), examples: [] as string[] };
const CW_IMG = /images\.rvs\.com\/[^/]+\/([^/]+)\//;
for (const [k, u] of [...out]) {
  if (u.provenance.harvestMethod || baseKept.has(u)) continue; // page-verified harvest records are not stitched
  const dd = bare(u.provenance.dealerDomain);
  const isCw = dd === "rv.campingworld.com";
  if (!isCw && !STITCHED_DOMAINS.has(dd)) {
    // Not a stitched dealer. Two own-title checks still apply to every base record:
    //  - a title that names no model year is the dealer's site name ("Kunes RV"), not this unit: nothing about
    //    the unit can be confirmed from it, so the record is held back;
    //  - a make field that is the chassis maker (Ford, Mercedes-Benz …) while the title names the RV brand:
    //    make/model/floorplan are re-read from the title (stock and condition are kept: not stitched).
    if (titleModelYear(u.title) === null && !/^(19|20)\d{2}\b/.test(u.title.replace(/^(new|used)\s+/i, ""))) { stitch.titleNotUnit++; inc(stitch.heldByDomain, dd); out.delete(k); continue; }
    if (/^(ford|mercedes|mercedes-benz|ram|dodge|chevrolet|chevy|gmc|freightliner|isuzu|spartan|workhorse|volkswagen|vw)$/i.test(u.make.trim().split(/\s+/)[0] ?? "")) {
      const p = parseTitle(u.title);
      if (p && !/^(ford|mercedes|ram|dodge|chevrolet|gmc|freightliner|isuzu)/i.test(p.make)) {
        stitch.chassisMakeFixed++; inc(stitch.chassisByDomain, dd);
        u.make = p.make; u.model = p.model; u.floorplanCode = p.floorplan ?? u.floorplanCode; u.trim = null;
      }
    }
    continue;
  }
  const desc = u.description ?? "";
  const descStock = (desc.match(/Stock #(\S+?)\.(?:\s|$)/) ?? [])[1] ?? null;
  const imgStock = isCw ? (u.images.map(im => (im.match(CW_IMG) ?? [])[1]).find(Boolean) ?? null) : null;
  let ownStock: string | null;
  if (isCw) {
    const st = (u.stockNumber ?? "").toLowerCase();
    if (st && (st === (imgStock ?? "").toLowerCase() || st === (descStock ?? "").toLowerCase())) continue; // not stitched
    ownStock = imgStock && descStock ? (imgStock.toLowerCase() === descStock.toLowerCase() ? imgStock : null) : (imgStock ?? descStock);
  } else {
    const hay = `${u.title} ${desc} ${u.images.join(" ")}`.toLowerCase();
    ownStock = u.stockNumber && new RegExp(`(^|[^a-z0-9])${u.stockNumber.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(hay) ? u.stockNumber : (descStock ?? null);
  }
  const p = parseTitle(u.title);
  if (!p) { stitch.heldUnconfirmable++; inc(stitch.heldByDomain, dd); out.delete(k); continue; }
  stitch.records++; inc(stitch.byDomain, dd);
  const next = { stockNumber: ownStock, make: p.make, model: p.model, trim: null as string | null, floorplanCode: p.floorplan, condition: (p.condition ?? "unknown") as CanonicalUnit["condition"] };
  const fc = stitch.fieldChangedByDomain.get(dd) ?? {}; let changedAny = false;
  for (const f of Object.keys(next) as (keyof typeof next)[]) {
    const before = (u as any)[f] ?? null, after = next[f] ?? null;
    const same = f === "make" ? tnorm(String(before ?? "")) === tnorm(String(after ?? "")) || canonicalBrand(String(before ?? "")) === canonicalBrand(String(after ?? "")) && !!canonicalBrand(String(after ?? ""))
      : String(before ?? "").toLowerCase() === String(after ?? "").toLowerCase();
    if (!same) { stitch.fieldChanged[f]++; fc[f] = (fc[f] ?? 0) + 1; changedAny = true; }
    (u as any)[f] = after;
  }
  stitch.fieldChangedByDomain.set(dd, fc);
  if (changedAny && stitch.examples.length < 10) stitch.examples.push(`${u.id} | ${u.title} | stock ${next.stockNumber} make ${next.make} model ${next.model} fp ${next.floorplanCode} cond ${next.condition}`);
}
// ── Not an RV (CSO QA v3.1): accessories, parts, tow gear and cargo/utility trailers that reached the base
// snapshot (e.g. Camping World's U.S. Rack over-cab racks typed fifth_wheel, Curt hitches, Roadmaster sway bars,
// Forest River's Continental Cargo trailers). Deny-list by make and by title/model wording.
const NON_RV_MAKES = new Set(["u.s. rack", "us rack", "curt", "roadmaster", "baja designs", "we do consignments", "blue ox", "demco", "continental cargo"]);
const NON_RV_TEXT = /\b(continental cargo|cargo trailers?|enclosed (?:cargo )?trailers?|utility trailers?|car hauler|dump trailer|equipment trailer|landscape trailer|sway bar kit|(?:5th|fifth) wheel hitch|over-cab rack|truck rack|a-pillar kit|tow bar|base ?plate kit)\b/i;
const nonRvDropped = new Map<string, number>(); const nonRvExamples: string[] = [];
for (const [k, u] of [...out]) {
  if (baseKept.has(u)) continue;
  const mk = u.make.trim().toLowerCase();
  if (NON_RV_MAKES.has(mk) || NON_RV_TEXT.test(`${u.title} ${u.model}`)) {
    inc(nonRvDropped, u.make); if (nonRvExamples.length < 12) nonRvExamples.push(`${u.id} | ${u.make} | ${u.title}`); out.delete(k);
  }
}
// ── Low-price sanity check: under $5,000 is plausible only for an older used RV. A model year 2020+ RV under
// $5,000, a 2010-2019 motorhome under $3,000, or a price equal to a 2010+ model year is not the unit's asking price
// (monthly payments, deposits or rebates read as the price), so the unit is held back. LOW_PRICE_HOLDBACK=0 disables.
const MOTORIZED = new Set(["class_a", "class_b", "class_c", "super_c", "motorhome"]);
const lowPriceHeld = new Map<string, number>(); const lowPriceExamples: string[] = []; let lowPriceKept = 0; const lowPriceKeptByMake = new Map<string, number>();
for (const [k, u] of [...out]) {
  if (baseKept.has(u)) continue;
  const p = u.priceUsd.value; if (p === null || p >= 5000) continue;
  if (process.env.LOW_PRICE_HOLDBACK !== "0" && (u.year >= 2020 || (MOTORIZED.has(u.rvType) && u.year >= 2010 && p < 3000) || (Math.round(p) === u.year && u.year >= 2010))) {
    inc(lowPriceHeld, u.make); if (lowPriceExamples.length < 12) lowPriceExamples.push(`${u.id} | ${u.year} ${u.make} | $${p} | ${u.title}`); out.delete(k);
  } else { lowPriceKept++; inc(lowPriceKeptByMake, u.make); }
}
// ── Stock numbers shared by different units of one dealer (the Oct 14 scraper copied one unit's stock onto
// others, e.g. meyersrvsuperstores.com stock 25153 on two different units): blank stockNumber on every unit of
// such a (domain, stock) pair. Ids are left as they are (already unique; checked below).
const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const byStock = new Map<string, CanonicalUnit[]>();
for (const u of out.values()) if (u.stockNumber && !baseKept.has(u)) { const sk = `${bare(u.provenance.dealerDomain)}|${u.stockNumber.toLowerCase()}`; const a = byStock.get(sk) ?? []; a.push(u); byStock.set(sk, a); }
let dupStockPairs = 0, dupStockUnitsBlanked = 0; const dupStockByDomain = new Map<string, number>(); const dupStockExamples: string[] = [];
for (const [sk, us] of byStock) {
  if (us.length < 2) continue;
  const vins = new Set(us.map(u => u.vin).filter(Boolean)); const titles = new Set(us.map(u => normTitle(u.title)));
  const differentTitles = [...titles].some(a => [...titles].some(b => a !== b && !a.startsWith(b) && !b.startsWith(a)));
  if (vins.size < 2 && !differentTitles) continue;
  dupStockPairs++; inc(dupStockByDomain, sk.split("|")[0]);
  if (dupStockExamples.length < 8) dupStockExamples.push(`${sk}: ${us.slice(0, 3).map(u => `${u.id} (${u.title})`).join("; ")}`);
  for (const u of us) { u.stockNumber = null; dupStockUnitsBlanked++; }
}
// ── Dealer city that is a state code or missing: filled only from a dealer-stated location we hold
// (MarketCheck dealer rows / dealer-site location data via DEALER_LOCATIONS json {domain: {city, state}}, a
// single location for the domain, same state); otherwise left blank. Nothing is derived from names.
const STATE_CODES = STATES;
const DEALER_LOC: Record<string, { city?: string | null; state?: string | null }> = process.env.DEALER_LOCATIONS ? JSON.parse(readFileSync(process.env.DEALER_LOCATIONS, "utf-8")) : {};
let cityFilled = 0, cityBlanked = 0; const cityBlankedByDomain = new Map<string, number>(); const cityFilledByDomain = new Map<string, number>();
for (const u of out.values()) {
  if (baseKept.has(u)) continue;
  const c = (u.dealer.city ?? "").trim();
  if (c && !STATE_CODES.has(c.toUpperCase())) continue;
  const dd = bare(u.provenance.dealerDomain); const loc = DEALER_LOC[dd];
  const lc = (loc?.city ?? "").trim();
  if (lc && !STATE_CODES.has(lc.toUpperCase()) && String(loc?.state ?? "").toUpperCase() === u.dealer.state.toUpperCase()) {
    u.dealer = { ...u.dealer, city: lc }; cityFilled++; inc(cityFilledByDomain, dd);
  } else if (c) { u.dealer = { ...u.dealer, city: "" }; cityBlanked++; inc(cityBlankedByDomain, dd); }
}
// ── Multi-lot dealers whose Oct 14 base records carry a lot city that is not stated for the unit (CSO QA
// v3.1): Meyers base records are stitched (the city came along with another unit's fields, e.g. VIN
// 573FM433XK1114170 filed under Caledonia, page lot Farmington) and every McClain's base record is filed under
// Corinth (page lot for W1X9N33Y5SN347437 is Rockwall). The unit-to-lot mapping is not in our data, so the city
// is blanked and the state kept. Page-verified harvest records keep their own city. UNSTATED_LOT_DOMAINS overrides.
const UNSTATED_LOT_DOMAINS = new Set((process.env.UNSTATED_LOT_DOMAINS ?? "meyersrvsuperstores.com,mcclainsrv.com").split(",").map(x => bare(x.trim())).filter(Boolean));
let lotCityBlanked = 0; const lotCityBlankedByDomain = new Map<string, number>(); const lotCityBefore = new Map<string, number>();
for (const u of out.values()) {
  const dd = bare(u.provenance.dealerDomain);
  if (u.provenance.harvestMethod || baseKept.has(u) || !UNSTATED_LOT_DOMAINS.has(dd) || !(u.dealer.city ?? "").trim()) continue;
  inc(lotCityBefore, `${dd}|${u.dealer.city}`);
  u.dealer = { ...u.dealer, id: `${dd}:${u.dealer.state.toLowerCase()}`, city: "", lat: null, lng: null };
  lotCityBlanked++; inc(lotCityBlankedByDomain, dd);
}
// ── rvType that contradicts the VIN on stitched base records (CSO QA v3.1 row 23: Meyers Ford-chassis
// Forester 1FDXE4FN8VDD08460 typed travel_trailer; Jayco Eagle SLE fifth wheels typed class_c). The VIN's
// manufacturer code (first 3 chars) says motorized (chassis maker) vs towable; codes are taken from the other
// dealers' records in this build (>=20 units, >=98% one side). A contradicted rvType cannot be confirmed from
// the record, and RvType has no "unknown", so the record is held back.
const MOT_TYPES = new Set(["class_a", "class_b", "class_c"]);
const wmiSide = new Map<string, { mot: number; tow: number }>();
for (const u of out.values()) {
  const dd = bare(u.provenance.dealerDomain);
  if (!u.vin || u.vin.length !== 17 || dd === "rv.campingworld.com" || STITCHED_DOMAINS.has(dd) || UNSTATED_LOT_DOMAINS.has(dd)) continue;
  const w = wmiSide.get(u.vin.slice(0, 3)) ?? { mot: 0, tow: 0 }; MOT_TYPES.has(u.rvType) ? w.mot++ : w.tow++; wmiSide.set(u.vin.slice(0, 3), w);
}
const clearSide = (vin: string): "mot" | "tow" | null => {
  const w = wmiSide.get(vin.slice(0, 3)); if (!w) return null; const n = w.mot + w.tow;
  return n >= 20 ? (w.mot / n >= 0.98 ? "mot" : w.tow / n >= 0.98 ? "tow" : null) : null;
};
let rvTypeVinHeld = 0; const rvTypeVinHeldByDomain = new Map<string, number>(); const rvTypeVinExamples: string[] = [];
for (const [k, u] of [...out]) {
  const dd = bare(u.provenance.dealerDomain);
  if (u.provenance.harvestMethod || baseKept.has(u) || !(dd === "rv.campingworld.com" || STITCHED_DOMAINS.has(dd)) || !u.vin || u.vin.length !== 17) continue;
  const side = clearSide(u.vin); if (!side || side === (MOT_TYPES.has(u.rvType) ? "mot" : "tow")) continue;
  rvTypeVinHeld++; inc(rvTypeVinHeldByDomain, dd);
  if (rvTypeVinExamples.length < 10) rvTypeVinExamples.push(`${u.vin} | ${u.title} | typed ${u.rvType}, VIN says ${side === "mot" ? "motorized" : "towable"}`);
  out.delete(k);
}
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
// builtAt is this build's wall-clock time (the harvest as-of time); the MCP stale-listing rule measures each
// unit's lastSeenAt against it. Never copied from the base snapshot. BUILT_AT (ISO) pins it for reproducible builds.
const builtAt = process.env.BUILT_AT ? new Date(process.env.BUILT_AT).toISOString() : new Date().toISOString();
const lastSeenTimes = units.map(u => Date.parse(u.provenance.lastSeenAt)).filter(Number.isFinite);
const lastSeenRange = { oldest: new Date(lastSeenTimes.reduce((a, b) => (b < a ? b : a), Infinity)).toISOString(), newest: new Date(lastSeenTimes.reduce((a, b) => (b > a ? b : a), -Infinity)).toISOString() };
const staleWindows = Object.fromEntries([14, 21, 30, 45].map(d => [`${d}d`, units.filter(u => Date.parse(builtAt) - Date.parse(u.provenance.lastSeenAt) <= d * 864e5).length]));
const stats = {
  builtAt, keepBase: KEEP_BASE, baseKeptUnits: baseKept.size, oldUnits: oldUnits.length, freshRows: rows.length, freshByOrigin: Object.fromEntries(byOrigin),
  freshAdmitted: fresh.length, freshDupes, freshUnique: fresh.length - freshDupes, rejects: Object.fromEntries(rejects), typeVia: Object.fromEntries(typeVia),
  mode: REFRESH_ONLY ? "refresh_only_existing_units" : "refresh_and_add", typeStrict: TYPE_STRICT,
  oldUnitsDroppedGoneOrSold: goneDropped, refreshOtherDomainSkipped, freshUnitsNotAddedRefreshOnly: notAddedRefreshOnly,
  refreshedOldUnits: refreshed, sep17UnitsSeenAgain: sep17Seen, oldDupesDropped: oldDupes, idCollisions,
  addedUnits: newDomainUnits.length, addedFromNewDealerDomains: newDomainUnits.filter(u => !oldDomains.has(bare(u.provenance.dealerDomain))).length,
  noPriceUnitsHeldInSidecar: noPriceHeld.length, noPriceUnitsHeldFromNewDealers: noPriceHeld.filter(u => !oldDomains.has(bare(u.provenance.dealerDomain))).length,
  addedNoPrice: newDomainUnits.filter(u => u.priceUsd.value === null).length, addedWithPrice: newDomainUnits.filter(u => u.priceUsd.value !== null).length,
  heldBackDomains: [...HOLDBACK], heldBackUnits: [...heldBackByDomain.values()].reduce((a, b) => a + b, 0), heldBackByDomain: Object.fromEntries(heldBackByDomain),
  priceTemplateHeldUnits: [...priceTemplateHeld.values()].reduce((a, b) => a + b, 0), priceTemplateHeldByDomain: Object.fromEntries(priceTemplateHeld), priceTemplateValues,
  baseTitleNotUnitHeld: stitch.titleNotUnit, chassisMakeFixedFromTitle: stitch.chassisMakeFixed, chassisMakeFixedByDomain: Object.fromEntries([...stitch.chassisByDomain].sort((a, b) => b[1] - a[1])),
  stitchedRecordsRebuiltFromOwnTitle: stitch.records, stitchedHeldUnconfirmable: stitch.heldUnconfirmable, stitchedHeldByDomain: Object.fromEntries(stitch.heldByDomain),
  stitchedByDomain: Object.fromEntries([...stitch.byDomain].sort((a, b) => b[1] - a[1])), stitchedFieldChanged: stitch.fieldChanged,
  stitchedFieldChangedByDomain: Object.fromEntries([...stitch.fieldChangedByDomain].sort((a, b) => (b[1].make ?? 0) + (b[1].stockNumber ?? 0) - (a[1].make ?? 0) - (a[1].stockNumber ?? 0))), stitchedExamples: stitch.examples,
  yearTitleRangeSkipped: yearRangeSkipped,
  nonRvDropped: [...nonRvDropped.values()].reduce((a, b) => a + b, 0), nonRvDroppedByMake: Object.fromEntries(nonRvDropped), nonRvExamples,
  lowPriceHeld: [...lowPriceHeld.values()].reduce((a, b) => a + b, 0), lowPriceHeldByMake: Object.fromEntries([...lowPriceHeld].sort((a, b) => b[1] - a[1])), lowPriceExamples,
  lowPriceKept, lowPriceKeptByMake: Object.fromEntries([...lowPriceKeptByMake].sort((a, b) => b[1] - a[1])),
  dupStockPairs, dupStockUnitsBlanked, dupStockByDomain: Object.fromEntries([...dupStockByDomain].sort((a, b) => b[1] - a[1])), dupStockExamples,
  lotCityBlanked, lotCityBlankedByDomain: Object.fromEntries(lotCityBlankedByDomain), lotCityBefore: Object.fromEntries(lotCityBefore), rvTypeVinHeld, rvTypeVinHeldByDomain: Object.fromEntries(rvTypeVinHeldByDomain), rvTypeVinExamples, cityFilled, cityFilledByDomain: Object.fromEntries(cityFilledByDomain), cityBlanked, cityBlankedByDomain: Object.fromEntries([...cityBlankedByDomain].sort((a, b) => b[1] - a[1])),
  yearFromDealerTitle: yearFix.fromTitle, yearFromDealerTitleWhereVinAgreedWithOldYear: yearFix.fromTitleVinAgreedWithOld,
  yearFromDealerTitleByDomain: Object.fromEntries([...yearFix.byDomain].sort((a, b) => b[1] - a[1]).slice(0, 25)),
  finalUnits: units.length, dealerDomains: dealers.size, locations: new Set(units.map(u => u.dealer.id)).size, states: states.size,
  byState: Object.fromEntries([...states].sort((a, b) => b[1] - a[1])),
  coverage: { length: known("lengthFt"), sleeps: known("sleeps"), dryWeight: known("dryWeightLbs"), gvwr: known("gvwrLbs"), price: known("priceUsd") },
};
console.log(JSON.stringify(stats, null, 1));
const payload = JSON.stringify({
  schemaVersion: 1, builtAt,
  datasetNote: "MatchRV nationwide dealer inventory snapshot: the Oct 14 dealer-website snapshot, refreshed and extended with a 2026-10-25..31 harvest (MarketCheck active RV listings + dealer websites). Each harvested unit has a VIN or stock number and a listing URL; specs are copied from the listing or left blank. Units not seen again keep their earlier lastSeenAt.",
  stats: { rawRecords: oldUnits.length + rows.length, units: units.length, dealers: dealers.size,
    rejections: Object.fromEntries(rejects), uniqueVins: units.filter(u => u.vin).length, withLength: known("lengthFt"), withSleeps: known("sleeps"),
    lastSeenRange, seenWithinDaysOfBuiltAt: staleWindows },
  units,
});
// ASCII-only JSON (non-ASCII as \uXXXX escapes): identical parsed values, but the text decodes to a
// one-byte string at load, halving the transient memory of JSON.parse on the server.
const asciiPayload = payload.replace(/[\u007f-\uffff]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
writeFileSync(`${SNAPSHOT}.gz`, gzipSync(Buffer.from(asciiPayload, "latin1"), { level: 9 }));
writeFileSync(statsPath, JSON.stringify(stats, null, 1));
if (noPriceHeld.length) writeFileSync(statsPath.replace(/\.json$/, "") + ".no-price-units.ndjson.gz", gzipSync(noPriceHeld.map(u => JSON.stringify(u)).join("\n")));
console.log(`wrote ${SNAPSHOT}.gz (${(payload.length / 1e6).toFixed(0)} MB raw)`);
