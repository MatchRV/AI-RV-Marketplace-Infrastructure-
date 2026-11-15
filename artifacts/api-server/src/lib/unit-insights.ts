/**
 * What a MatchRV unit page says that the dealer's own listing does not.
 *
 * A unit page that only repeats the dealer's listing is a duplicate, and
 * Google indexes the dealer's copy instead. Everything here is derived from
 * data MatchRV already holds: the unit's own listing facts, the rest of the
 * inventory (price context, similar units) and MatchRV's curated tow
 * reference table. Nothing is invented: a section with no data behind it is
 * left out, never filled with a guess.
 *
 * The same object feeds the server-rendered HTML (crawlers that run no
 * JavaScript, including AI crawlers) and the React listing page (via
 * GET /api/listing-insights/:id), so humans and bots see the same content.
 */
import {
  TOW_SAFETY_MARGIN,
  TOW_VEHICLES,
  TOWABLE_TYPES,
  publicListingId,
  type CanonicalUnit,
  type Fact,
} from "@workspace/agent-core";
import { getInventory } from "../services/agent-inventory";
import { inventoryQualityIssues } from "../services/mcp-inventory-quality";
import { isBoilerplateDescription } from "./description-boilerplate";
import { hubForUnit, type HubRef } from "./inventory-hubs";

const SITE = "https://matchrv.com";

/** Fewest comparable listings before MatchRV states a price context. */
export const MIN_PRICE_COMPS = 5;
/** Model years either side of the unit that still count as comparable. */
export const COMP_YEAR_WINDOW = 1;
/** Pages below this richness carry noindex and stay out of the sitemap. */
export const MIN_INDEX_RICHNESS = 3;
/** Within this fraction of the median, the price reads as "near the middle". */
const NEAR_MEDIAN = 0.05;

export const RV_TYPE_LABEL: Record<string, string> = {
  travel_trailer: "Travel Trailer",
  fifth_wheel: "Fifth Wheel",
  toy_hauler: "Toy Hauler",
  class_a: "Class A Motorhome",
  class_b: "Class B Camper Van",
  class_c: "Class C Motorhome",
  truck_camper: "Truck Camper",
  popup_camper: "Pop-Up Camper",
};

/** Pickups only: a fifth wheel needs a bed-mounted hitch. */
const PICKUP_KEYS = new Set([
  "ford_f150", "ford_f250", "ford_f350", "ford_ranger", "ford_maverick",
  "chevrolet_silverado_1500", "chevrolet_silverado_2500", "chevrolet_silverado_3500", "chevrolet_colorado",
  "gmc_sierra_1500", "ram_1500", "ram_2500", "ram_3500", "toyota_tundra", "toyota_tacoma",
  "jeep_gladiator", "nissan_titan", "nissan_frontier", "honda_ridgeline",
]);

export interface SpecRow { label: string; value: string; source: string }

export interface TowInsight {
  /** Which weight the check used: GVWR (loaded max) when listed, else dry weight. */
  basis: "gvwr" | "dry_weight";
  basisLbs: number;
  hitchLbs: number | null;
  /** Rated to tow it with MatchRV's 20% margin in every common configuration. */
  comfortable: string[];
  /** Some configurations can, some can't: check the door-jamb sticker. */
  dependsOnConfig: string[];
  /** Above the top rating in MatchRV's table. */
  tooHeavy: string[];
  pickupsOnly: boolean;
  summary: string;
}

export interface PriceContext {
  compCount: number;
  medianUsd: number;
  lowUsd: number;
  highUsd: number;
  deltaUsd: number;
  deltaPct: number;
  position: "below" | "near" | "above";
  scope: string;
  summary: string;
}

export interface SimilarUnit { url: string; title: string; priceUsd: number | null; location: string }

export interface UnitInsights {
  unitId: string;
  url: string;
  seo: { title: string; description: string };
  indexable: boolean;
  /** Why the page is noindex. Empty when indexable. */
  noindexReasons: string[];
  typeLabel: string;
  location: string;
  specs: SpecRow[];
  tow: TowInsight | null;
  priceContext: PriceContext | null;
  offGrid: { score: number; knownInputs: string[]; missingInputs: string[] } | null;
  similar: SimilarUnit[];
  hub: HubRef | null;
  /** Dealer's own text, trimmed, when it is about the RV. Quoted as theirs. */
  dealerDescription: string | null;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const lbs = (n: number) => `${Math.round(n).toLocaleString("en-US")} lbs`;

export function unitUrl(unitId: string): string {
  return `${SITE}/listing/${encodeURI(publicListingId(unitId))}`;
}

export function dealerDisplayName(unit: CanonicalUnit): string {
  const n = (unit.dealer.name || "").replace(/\s+/g, " ").trim();
  // A name with spaces is a real name ("Puyallup RV - Puyallup"): keep it.
  if (/\s/.test(n)) return n;
  if (n && !/^[a-z0-9.-]+$/i.test(n)) return n;
  if (n.includes("-") || n.includes(".")) {
    return n
      .replace(/\.(com|net|org)$/i, "")
      .split(/[-_.]/)
      .filter(Boolean)
      .map((w) => (/^rvs?$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(" ");
  }
  return n || "RV Dealer";
}

export function unitLocation(unit: CanonicalUnit): string {
  return [unit.dealer.city, unit.dealer.state].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
}

function conditionLabel(unit: CanonicalUnit): string {
  return unit.condition === "new" ? "New" : unit.condition === "used" ? "Used" : "";
}

/** Group key for comparable units: same make, model family and floorplan. */
export function compKey(unit: CanonicalUnit): string | null {
  const make = norm(unit.make);
  const fp = norm(unit.floorplanCode);
  let model = norm(unit.model);
  if (fp && model.endsWith(fp)) model = model.slice(0, -fp.length);
  if (!make || !model) return null;
  return `${make}|${model}|${fp}`;
}

const priceOf = (u: CanonicalUnit): number | null => {
  const v = u.priceUsd?.value;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
};

// ── lazy indexes (built once per snapshot) ──────────────────────────────────

interface Indexes {
  units: CanonicalUnit[];
  groups: Map<string, CanonicalUnit[]>;
  titleCount: Map<string, number>;
  referenceTime: Date | undefined;
  /** Units the existing MCP screen would withhold (stale, implausible price, category conflict). */
  screenIssues: Map<string, string[]>;
}

let cached: { units: CanonicalUnit[]; idx: Indexes } | null = null;

function indexes(): Indexes {
  const inv = getInventory();
  if (cached && cached.units === inv.units) return cached.idx;
  const builtAt = Date.parse(inv.snapshot?.builtAt ?? "");
  const referenceTime = Number.isFinite(builtAt) ? new Date(builtAt) : undefined;
  const groups = new Map<string, CanonicalUnit[]>();
  const titleCount = new Map<string, number>();
  const screenIssues = new Map<string, string[]>();
  for (const u of inv.units) {
    const issues = inventoryQualityIssues(u, { referenceTime });
    if (issues.length) screenIssues.set(u.id, issues);
    const t = norm(u.title);
    titleCount.set(t, (titleCount.get(t) ?? 0) + 1);
    const k = compKey(u);
    if (!k) continue;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(u);
  }
  const idx = { units: inv.units, groups, titleCount, referenceTime, screenIssues };
  cached = { units: inv.units, idx };
  indexInsightsCache.clear();
  return idx;
}

/** Test hook: forget the lazy indexes. */
export function resetUnitInsightsCache(): void {
  cached = null;
  indexInsightsCache.clear();
}

// ── price sanity against the dealer's own text ──────────────────────────────

/**
 * Prices the dealer's own description states ("Listing Price: $36,900",
 * "Reduced Price: $29,900", "Sale Price $24,995"). MSRP is ignored: it is
 * supposed to differ from the asking price.
 */
export function statedPricesInDescription(text: string | null | undefined): number[] {
  const out: number[] = [];
  const re = /\b(?:listing|reduced|sale|our|asking|internet|special|now)\s+price\s*:?\s*\$\s*([\d,]{4,9})/gi;
  for (const m of (text ?? "").matchAll(re)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 1000) out.push(n);
  }
  return out;
}

/** True when the dealer's own text names prices and none of them is the stored price. */
export function priceConflictsWithDescription(unit: CanonicalUnit): boolean {
  const price = priceOf(unit);
  if (price == null) return false;
  const stated = statedPricesInDescription(unit.description);
  if (!stated.length) return false;
  return !stated.some((s) => Math.abs(s - price) <= Math.max(500, price * 0.02));
}

/** Price safe to advertise (meta, JSON-LD, page copy): null when it fails a check. */
export function advertisablePrice(unit: CanonicalUnit): number | null {
  const price = priceOf(unit);
  if (price == null) return null;
  if (priceConflictsWithDescription(unit)) return null;
  const issues = indexes().screenIssues.get(unit.id) ?? [];
  if (issues.some((i) => i.startsWith("[price_below_class_floor]"))) return null;
  return price;
}

// ── sections ────────────────────────────────────────────────────────────────

function factRow(label: string, f: Fact<number> | undefined, fmt: (n: number) => string): SpecRow | null {
  if (!f || f.value == null || !Number.isFinite(f.value)) return null;
  const source =
    f.source === "manufacturer_spec" ? "Manufacturer spec"
      : f.source === "dealer_listing" ? "Dealer listing"
        : f.source === "derived_model_code" ? "Floorplan code"
          : f.source === "derived_text" ? "Dealer description"
            : f.source === "learned" ? "Confirmed by a shopper or dealer"
              : "MatchRV";
  return { label, value: fmt(f.value), source };
}

function boolRow(label: string, f: Fact<boolean> | undefined): SpecRow | null {
  if (!f || f.value == null) return null;
  return { label, value: f.value ? "Yes" : "No", source: f.source === "manufacturer_spec" ? "Manufacturer spec" : "Dealer listing" };
}

export function buildSpecs(unit: CanonicalUnit): SpecRow[] {
  const rows: Array<SpecRow | null> = [
    factRow("Length", unit.lengthFt, (n) => `${n} ft`),
    factRow("Sleeps", unit.sleeps, (n) => String(n)),
    factRow("Slide-outs", unit.slideouts, (n) => String(n)),
    factRow("Dry weight", unit.dryWeightLbs, lbs),
    factRow("GVWR (max loaded weight)", unit.gvwrLbs, lbs),
    factRow("Hitch weight", unit.hitchWeightLbs, lbs),
    factRow("Fresh water", unit.freshWaterGal, (n) => `${n} gal`),
    factRow("Grey water", unit.greyWaterGal, (n) => `${n} gal`),
    factRow("Black water", unit.blackWaterGal, (n) => `${n} gal`),
    boolRow("Bunkhouse", unit.bunkhouse),
    boolRow("Generator", unit.generator),
    boolRow("Lithium battery", unit.lithiumBattery),
    boolRow("Four-season package", unit.fourSeason),
    boolRow("Outdoor kitchen", unit.outdoorKitchen),
  ];
  if (unit.solar?.value) {
    rows.push({ label: "Solar", value: unit.solar.value === "installed" ? "Installed" : unit.solar.value === "prep" ? "Prep only" : "None", source: "Dealer listing" });
  }
  const pt = unit.powertrain;
  if (pt?.fuelType?.value) rows.push({ label: "Fuel", value: pt.fuelType.value === "diesel" ? "Diesel" : "Gas", source: "Dealer listing" });
  if (pt?.engine?.value) rows.push({ label: "Engine", value: pt.engine.value, source: pt.engine.source === "manufacturer_spec" ? "Manufacturer spec" : "Dealer listing" });
  if (pt?.chassis?.value) rows.push({ label: "Chassis", value: pt.chassis.value, source: pt.chassis.source === "manufacturer_spec" ? "Manufacturer spec" : "Dealer listing" });
  const towRating = unit.towing?.hitchTowRatingLbs;
  const r = factRow("Hitch tow rating", towRating, lbs);
  if (r) rows.push(r);
  return rows.filter((x): x is SpecRow => x != null);
}

/**
 * Cargo and water MatchRV assumes on top of dry weight when the dealer lists
 * no GVWR. tow.ts states the same range (loaded runs 1,000-1,500+ lbs over dry);
 * the page says this assumption out loud.
 */
export const DRY_WEIGHT_CARGO_ALLOWANCE_LBS = 1500;

export function buildTowInsight(unit: CanonicalUnit): TowInsight | null {
  if (!TOWABLE_TYPES.includes(unit.rvType) || unit.rvType === "truck_camper") return null;
  const gvwr = unit.gvwrLbs?.value ?? null;
  const dry = unit.dryWeightLbs?.value ?? null;
  const basis: TowInsight["basis"] | null = gvwr != null ? "gvwr" : dry != null ? "dry_weight" : null;
  const weight = gvwr ?? dry;
  if (basis == null || weight == null || weight <= 0) return null;
  // Planning weight: GVWR when listed, else dry weight plus the cargo allowance.
  const planning = basis === "gvwr" ? weight : weight + DRY_WEIGHT_CARGO_ALLOWANCE_LBS;
  const pickupsOnly = unit.rvType === "fifth_wheel";
  const comfortable: string[] = [];
  const dependsOnConfig: string[] = [];
  const tooHeavy: string[] = [];
  for (const v of TOW_VEHICLES) {
    if (pickupsOnly && !PICKUP_KEYS.has(v.key)) continue;
    // Same rule as evaluateTowFit: comfortable only with the 20% margin
    // across every configuration of the vehicle.
    if (planning <= Math.round(v.towLbsMin * TOW_SAFETY_MARGIN)) comfortable.push(v.label);
    else if (planning <= v.towLbsMax) dependsOnConfig.push(v.label);
    else tooHeavy.push(v.label);
  }
  const hitch = unit.hitchWeightLbs?.value ?? null;
  const basisText = basis === "gvwr"
    ? `its ${lbs(weight)} GVWR (the most it may weigh loaded)`
    : `its ${lbs(weight)} dry weight plus ${lbs(DRY_WEIGHT_CARGO_ALLOWANCE_LBS)} for cargo and water, since the dealer lists no GVWR`;
  let summary = `MatchRV checked ${basisText} against tow ratings for ${comfortable.length + dependsOnConfig.length + tooHeavy.length} common ${pickupsOnly ? "pickups" : "trucks and SUVs"}.`;
  if (comfortable.length) summary += ` ${comfortable.length} can tow it with a 20% margin in any configuration.`;
  if (dependsOnConfig.length) summary += ` ${dependsOnConfig.length} can in some configurations only, so check the door-jamb sticker.`;
  if (!comfortable.length && !dependsOnConfig.length) summary += " None of them is rated for it.";
  if (hitch != null) summary += ` The ${lbs(hitch)} ${pickupsOnly ? "pin" : "hitch"} weight counts against the tow vehicle's payload.`;
  if (pickupsOnly) summary += " A fifth wheel needs a pickup with a bed-mounted hitch.";
  return { basis, basisLbs: weight, hitchLbs: hitch, comfortable, dependsOnConfig, tooHeavy, pickupsOnly, summary };
}

function median(sorted: number[]): number {
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function compsFor(unit: CanonicalUnit, idx: Indexes, yearWindow: number): CanonicalUnit[] {
  const k = compKey(unit);
  if (!k) return [];
  return (idx.groups.get(k) ?? []).filter(
    (c) => c.id !== unit.id && Math.abs(c.year - unit.year) <= yearWindow && !idx.screenIssues.has(c.id) && c.status !== "removed",
  );
}

export function buildPriceContext(unit: CanonicalUnit): PriceContext | null {
  const idx = indexes();
  const price = advertisablePrice(unit);
  if (price == null || unit.condition === "unknown") return null;
  const comps = compsFor(unit, idx, COMP_YEAR_WINDOW).filter(
    (c) => c.condition === unit.condition && !priceConflictsWithDescription(c),
  );
  const prices = comps.map(priceOf).filter((p): p is number => p != null).sort((a, b) => a - b);
  if (prices.length < MIN_PRICE_COMPS) return null;
  const med = median(prices);
  const delta = price - med;
  const deltaPct = med > 0 ? delta / med : 0;
  const position: PriceContext["position"] = Math.abs(deltaPct) <= NEAR_MEDIAN ? "near" : delta < 0 ? "below" : "above";
  const years = unit.year - COMP_YEAR_WINDOW === unit.year + COMP_YEAR_WINDOW ? String(unit.year) : `${unit.year - COMP_YEAR_WINDOW} to ${unit.year + COMP_YEAR_WINDOW}`;
  const name = [unit.make, unit.model, unit.floorplanCode && !norm(unit.model).endsWith(norm(unit.floorplanCode)) ? unit.floorplanCode : ""].filter(Boolean).join(" ");
  const scope = `${unit.condition} ${years} ${name}`;
  const where =
    position === "near"
      ? `within ${Math.round(NEAR_MEDIAN * 100)}% of the ${usd(med)} median`
      : `${usd(Math.abs(delta))} (${Math.round(Math.abs(deltaPct) * 100)}%) ${position} the ${usd(med)} median`;
  const summary = `This asking price is ${where} of ${prices.length} other ${scope} listings MatchRV tracks, which range from ${usd(prices[0])} to ${usd(prices[prices.length - 1])}. These are dealer asking prices, not sale prices, and options and condition vary.`;
  return {
    compCount: prices.length,
    medianUsd: Math.round(med),
    lowUsd: prices[0],
    highUsd: prices[prices.length - 1],
    deltaUsd: Math.round(delta),
    deltaPct: Math.round(deltaPct * 1000) / 1000,
    position,
    scope,
    summary,
  };
}

export function buildSimilar(unit: CanonicalUnit, limit = 6): SimilarUnit[] {
  const idx = indexes();
  const pool = compsFor(unit, idx, 2);
  const sameState = (c: CanonicalUnit) => (c.dealer.state === unit.dealer.state ? 0 : 1);
  pool.sort((a, b) => sameState(a) - sameState(b) || Math.abs(a.year - unit.year) - Math.abs(b.year - unit.year) || a.id.localeCompare(b.id));
  const picked: CanonicalUnit[] = [];
  const seenTitles = new Set<string>();
  for (const c of pool) {
    if (picked.length >= limit) break;
    const t = `${norm(c.title)}|${c.dealer.id}`;
    if (seenTitles.has(t)) continue;
    seenTitles.add(t);
    picked.push(c);
  }
  return picked.map((c) => ({
    url: unitUrl(c.id),
    title: c.title,
    priceUsd: advertisablePrice(c),
    location: unitLocation(c),
  }));
}

export function buildOffGrid(unit: CanonicalUnit): UnitInsights["offGrid"] {
  const b = unit.boondocking;
  if (!b || b.score == null) return null;
  // A score built from one or two inputs says more about missing data than the RV.
  if ((b.knownInputs?.length ?? 0) < 3) return null;
  return { score: b.score, knownInputs: b.knownInputs, missingInputs: b.missingInputs ?? [] };
}

export function dealerDescriptionExcerpt(unit: CanonicalUnit, max = 600): string | null {
  const d = (unit.description ?? "").replace(/\s+/g, " ").trim();
  if (!d || isBoilerplateDescription(d) || d.length < 80) return null;
  if (d.length <= max) return d;
  const cut = d.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
  return `${lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : cut.trimEnd()}…`;
}

// ── title + meta ────────────────────────────────────────────────────────────

/** Dealer title without a leading "New"/"Used" (MatchRV adds its own). */
export function bareTitle(unit: CanonicalUnit): string {
  return unit.title.replace(/\s+/g, " ").trim().replace(/^(?:new|used|pre-owned)\s+/i, "");
}

function typeInTitle(title: string, unit: CanonicalUnit): boolean {
  const t = title.toLowerCase();
  const label = (RV_TYPE_LABEL[unit.rvType] ?? "").toLowerCase();
  return Boolean(label) && (t.includes(label) || (unit.rvType === "fifth_wheel" && /5th\s*wheel/.test(t)));
}

export function buildSeoTitle(unit: CanonicalUnit): string {
  const idx = indexes();
  const typeLabel = RV_TYPE_LABEL[unit.rvType] ?? "RV";
  const cond = conditionLabel(unit);
  const base = bareTitle(unit);
  const head = [cond, base, typeInTitle(base, unit) ? "" : typeLabel].filter(Boolean).join(" ");
  const loc = unitLocation(unit);
  let title = `${head} for Sale${loc ? ` in ${loc}` : ""}`;
  // Same dealer title on several pages (common for new stock): add the stock
  // number so each page has its own title.
  if ((idx.titleCount.get(norm(unit.title)) ?? 0) > 1 && unit.stockNumber) title += ` (Stock ${unit.stockNumber})`;
  return `${title} | MatchRV`;
}

export function buildSeoDescription(unit: CanonicalUnit, ctx: { price: number | null; tow: TowInsight | null; priceContext: PriceContext | null }): string {
  const bits: string[] = [];
  const cond = conditionLabel(unit);
  const head = `${cond ? `${cond} ` : ""}${bareTitle(unit)}`;
  const dealer = dealerDisplayName(unit);
  const loc = unitLocation(unit);
  bits.push(`${head}${ctx.price != null ? `, ${usd(ctx.price)}` : ""} at ${dealer}${loc && !dealer.includes(unit.dealer.city || "\u0000") ? ` in ${loc}` : loc ? ` (${unit.dealer.state})` : ""}.`);
  const specs: string[] = [];
  if (unit.sleeps?.value != null) specs.push(`sleeps ${unit.sleeps.value}`);
  if (unit.lengthFt?.value != null) specs.push(`${unit.lengthFt.value} ft`);
  if (unit.dryWeightLbs?.value != null) specs.push(`${lbs(unit.dryWeightLbs.value)} dry`);
  if (specs.length) bits.push(`${specs.join(", ").replace(/^./, (c) => c.toUpperCase())}.`);
  if (ctx.priceContext && ctx.priceContext.position !== "near") {
    bits.push(`${usd(Math.abs(ctx.priceContext.deltaUsd))} ${ctx.priceContext.position} the median of ${ctx.priceContext.compCount} similar listings.`);
  } else if (ctx.priceContext) {
    bits.push(`Priced near the median of ${ctx.priceContext.compCount} similar listings.`);
  }
  if (ctx.tow?.comfortable.length) bits.push(`Tow check: ${ctx.tow.comfortable.length} common ${ctx.tow.pickupsOnly ? "pickups" : "trucks and SUVs"} pull it with margin.`);
  let out = "";
  for (const b of bits) {
    if ((out ? `${out} ${b}` : b).length > 160 && out) break;
    out = out ? `${out} ${b}` : b;
  }
  return out;
}

// ── indexability + assembly ─────────────────────────────────────────────────

/**
 * Richness: how much a page has beyond the dealer's own listing. Price
 * context and the tow check are worth the most because no dealer page has
 * them.
 */
function richness(unit: CanonicalUnit, specCount: number, tow: TowInsight | null, pc: PriceContext | null, similarCount: number): number {
  return (pc ? 2 : 0) + (tow ? 2 : 0) + (similarCount >= 3 ? 1 : 0) + Math.min(specCount, 4) * 0.5 + (dealerDescriptionExcerpt(unit) ? 0.5 : 0);
}

const indexInsightsCache = new Map<string, string[]>();
/** Shared empty list: most units are indexable, so don't allocate one each. */
const NO_REASONS: string[] = Object.freeze([]) as unknown as string[];

/** Why a unit page should carry noindex (empty = index it). No hub lookups, so hubs can call it. */
export function noindexReasons(unit: CanonicalUnit): string[] {
  const idx = indexes();
  const hit = indexInsightsCache.get(unit.id);
  if (hit) return hit;
  let reasons: string[] = [];
  if (unit.status === "removed") reasons.push("no_longer_listed");
  for (const issue of idx.screenIssues.get(unit.id) ?? []) {
    const m = /^\[([a-z_]+)\]/.exec(issue);
    if (m && !reasons.includes(m[1])) reasons.push(m[1]);
  }
  if (priceConflictsWithDescription(unit)) reasons.push("price_conflicts_with_dealer_text");
  if (!unit.images?.length) reasons.push("no_photos");
  const similarCount = Math.min(3, compsFor(unit, idx, 2).length);
  if (richness(unit, buildSpecs(unit).length, buildTowInsight(unit), buildPriceContext(unit), similarCount) < MIN_INDEX_RICHNESS) {
    reasons.push("thin_content");
  }
  if (!reasons.length) reasons = NO_REASONS;
  indexInsightsCache.set(unit.id, reasons);
  return reasons;
}

/** Whether the unit page is worth indexing (cached; used by the sitemap and hubs). */
export function isIndexableUnit(unit: CanonicalUnit): boolean {
  return noindexReasons(unit).length === 0;
}

export function buildUnitInsights(unit: CanonicalUnit): UnitInsights {
  const specs = buildSpecs(unit);
  const tow = buildTowInsight(unit);
  const priceContext = buildPriceContext(unit);
  const price = advertisablePrice(unit);
  const reasons = noindexReasons(unit);
  return {
    unitId: unit.id,
    url: unitUrl(unit.id),
    seo: { title: buildSeoTitle(unit), description: buildSeoDescription(unit, { price, tow, priceContext }) },
    indexable: reasons.length === 0,
    noindexReasons: reasons,
    typeLabel: RV_TYPE_LABEL[unit.rvType] ?? "RV",
    location: unitLocation(unit),
    specs,
    tow,
    priceContext,
    offGrid: buildOffGrid(unit),
    similar: buildSimilar(unit),
    hub: hubForUnit(unit),
    dealerDescription: dealerDescriptionExcerpt(unit),
  };
}

/**
 * Compute every unit's index decision in small slices so the first unit page,
 * hub or sitemap request after a deploy doesn't stall the event loop for the
 * whole pass (~10s on the full snapshot).
 */
export async function warmUnitIndexability(sliceSize = 2000): Promise<number> {
  const units = getInventory().units;
  indexes();
  let indexable = 0;
  for (let i = 0; i < units.length; i += sliceSize) {
    for (const u of units.slice(i, i + sliceSize)) if (isIndexableUnit(u)) indexable++;
    await new Promise<void>((r) => setImmediate(r));
  }
  return indexable;
}
