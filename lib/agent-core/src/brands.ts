/**
 * Make / model (series) resolution — makes and models are first-class
 * search filters.
 *
 * Dealer feeds are messy: one brand arrives under many spellings ("Tiffin",
 * "tiffin motorhomes", "TIFFIN MOTOR COACH"), and some scrapes put the wrong
 * brand in the make field entirely (Camping World rows with make="tiffin"
 * and a title of "2024 THOR RESONATE 30C", or make="thor" on a "2022 TIFFIN
 * ALLEGRO OPEN ROAD 34PA"). The brand stated at the start of the listing
 * title therefore wins over the make field when it names a known brand.
 *
 * Series (Allegro RED, Phaeton, Allegro Bus …) are matched against model +
 * title, most specific first, because many feeds carry only a floorplan code
 * ("40 IH") in the model field. Brands without a curated series table use a
 * whole-word model match instead.
 *
 * Pure and deterministic; results are cached per unit object.
 */

import type { CanonicalUnit, FuelType, RvType } from "./types.js";

export interface BrandDef {
  name: string;
  /** Lower-case spellings accepted in the make field and in shopper text. */
  aliases: string[];
  /** Aliases too ambiguous to trust at the start of a listing title. */
  makeOnlyAliases?: string[];
}

export interface SeriesDef {
  name: string;
  /** Matches the series in model + title text. Order matters: specific first. */
  rx: RegExp;
  /** Shopper phrasings that select this series. */
  queryRx: RegExp;
  impliedType?: RvType;
  /** Series-typical fuel (used only when the listing does not state it). */
  impliedFuel?: FuelType;
  /** Optional family, e.g. "Allegro" selects every Allegro series. */
  family?: string;
}

export const BRANDS: BrandDef[] = [
  { name: "Tiffin", aliases: ["tiffin", "tiffin motorhomes", "tiffin motor homes", "tiffin motor coach", "tiffin motorhomes inc"], makeOnlyAliases: ["allegro", "allegro red", "allegro bus", "tiffin allegro", "phaeton", "wayfarer", "byway"] },
  { name: "Forest River", aliases: ["forest river", "forest river rv", "forest river inc"], makeOnlyAliases: ["forest", "flagstaff", "flagstaff micro lite"] },
  { name: "Keystone", aliases: ["keystone", "keystone rv"], makeOnlyAliases: ["montana", "montana high country"] },
  { name: "Jayco", aliases: ["jayco"] },
  { name: "Grand Design", aliases: ["grand design", "grand design rv"], makeOnlyAliases: ["grand", "imagine", "imagine xls", "transcend", "transcend xplor", "solitude", "reflection"] },
  { name: "Thor Motor Coach", aliases: ["thor motor coach", "thor", "thor industries"] },
  { name: "Winnebago", aliases: ["winnebago", "winnebago industries", "winnebago industries towables"] },
  { name: "Coachmen", aliases: ["coachmen", "coachmen rv"], makeOnlyAliases: ["viking"] },
  { name: "Heartland", aliases: ["heartland", "heartland rv"] },
  { name: "Alliance RV", aliases: ["alliance rv"], makeOnlyAliases: ["alliance"] },
  { name: "Airstream", aliases: ["airstream"] },
  { name: "Brinkley", aliases: ["brinkley", "brinkley rv"] },
  { name: "Entegra Coach", aliases: ["entegra coach", "entegra"] },
  { name: "East to West", aliases: ["east to west"], makeOnlyAliases: ["east"] },
  { name: "Dutchmen", aliases: ["dutchmen", "dutchmen rv"] },
  { name: "Coleman", aliases: ["coleman"] },
  { name: "Venture RV", aliases: ["venture rv"], makeOnlyAliases: ["venture"] },
  { name: "Newmar", aliases: ["newmar"] },
  { name: "KZ", aliases: ["kz", "k-z", "kz rv", "k-z rv"], makeOnlyAliases: ["connect", "connect se", "sportsmen se", "sportsmen classic"] },
  { name: "Open Range", aliases: ["open range", "open range rv"] },
  { name: "Crossroads", aliases: ["crossroads", "crossroads rv"] },
  { name: "Palomino", aliases: ["palomino"] },
  { name: "Fleetwood", aliases: ["fleetwood", "fleetwood rv"] },
  { name: "Prime Time", aliases: ["prime time", "prime time rv", "prime time manufacturing"] },
  { name: "Highland Ridge", aliases: ["highland ridge", "highland ridge rv"] },
  { name: "Sunset Park", aliases: ["sunset park rv", "sunset park", "sunset park & rv inc"] },
  { name: "Gulf Stream", aliases: ["gulf stream", "gulf stream rv", "gulf stream coach"] },
  { name: "Holiday Rambler", aliases: ["holiday rambler"] },
  { name: "Genesis Supreme", aliases: ["genesis supreme"] },
  { name: "Lance", aliases: ["lance"] },
  { name: "Northwood", aliases: ["northwood"] },
  { name: "Starcraft", aliases: ["starcraft"] },
  { name: "Nexus RV", aliases: ["nexus rv", "nexus"] },
  { name: "Cruiser RV", aliases: ["cruiser rv"], makeOnlyAliases: ["cruiser"] },
  { name: "Outdoors RV", aliases: ["outdoors rv"] },
  { name: "Renegade", aliases: ["renegade", "renegade rv"] },
  { name: "Dynamax", aliases: ["dynamax", "dynamax corp"] },
  { name: "Shasta", aliases: ["shasta rvs"], makeOnlyAliases: ["shasta"] },
  { name: "Ember RV", aliases: ["ember rv"], makeOnlyAliases: ["ember"] },
  { name: "nuCamp", aliases: ["nucamp", "nucamp rv"] },
  { name: "Modern Buggy", aliases: ["modern buggy", "modern buggy rv"] },
  { name: "Roadtrek", aliases: ["roadtrek"] },
  { name: "inTech", aliases: ["intech", "intech rv"] },
  { name: "Itasca", aliases: ["itasca"] },
  { name: "Travel Lite", aliases: ["travel lite"] },
  { name: "Midwest Automotive Designs", aliases: ["midwest automotive designs"], makeOnlyAliases: ["midwest"] },
  { name: "American Coach", aliases: ["american coach"] },
  { name: "Aliner", aliases: ["aliner", "a liner"] },
  { name: "Storyteller Overland", aliases: ["storyteller overland"] },
  { name: "Pleasure-Way", aliases: ["pleasure-way", "pleasure way"] },
  { name: "Leisure Travel Vans", aliases: ["leisure travel vans", "leisure travel"] },
  { name: "Grech RV", aliases: ["grech rv", "grech motors", "grech"] },
  { name: "Northern Lite", aliases: ["northern lite"] },
  { name: "Foretravel", aliases: ["foretravel"] },
  { name: "Monaco", aliases: ["monaco"] },
  { name: "Prevost", aliases: ["prevost"] },
  { name: "Country Coach", aliases: ["country coach"] },
  { name: "Damon", aliases: ["damon"] },
  { name: "Chinook", aliases: ["chinook"] },
  { name: "Vanleigh", aliases: ["vanleigh", "vanleigh rv"] },
  { name: "DRV", aliases: ["drv luxury suites", "drv"] },
  { name: "Riverside RV", aliases: ["riverside rv"] },
  { name: "Braxton Creek", aliases: ["braxton creek"] },
  { name: "Redwood RV", aliases: ["redwood rv"], makeOnlyAliases: ["redwood"] },
  { name: "Encore RV", aliases: ["encore rv"] },
  { name: "Black Series", aliases: ["black series", "black series camper"] },
  { name: "Taxa Outdoors", aliases: ["taxa outdoors", "taxa"] },
  { name: "TrailManor", aliases: ["trailmanor"] },
  { name: "Bigfoot", aliases: ["bigfoot", "bigfoot industries"] },
  { name: "R-Vision", aliases: ["r-vision"] },
  { name: "Eclipse RV", aliases: ["eclipse rv"] },
  { name: "Skyline", aliases: ["skyline rv"], makeOnlyAliases: ["skyline"] },
  { name: "Liberty Outdoors", aliases: ["liberty outdoors"] },
  { name: "Remote Vans", aliases: ["remote vans"] },
  { name: "Wayfinder RV", aliases: ["wayfinder rv"] },
  { name: "Aluminum Trailer Co", aliases: ["aluminum trailer co", "atc trailers", "atc"] },
  { name: "Adventurer", aliases: ["adventurer manufacturing inc.", "adventurer manufacturing"], makeOnlyAliases: ["adventurer"] },
  { name: "Bontrager Outdoors", aliases: ["bontrager outdoors"] },
  { name: "OGV Luxury Coach", aliases: ["ogv luxury coach", "ogv"] },
  { name: "Pacific Coachworks", aliases: ["pacific coachworks"] },
  { name: "Xtreme Outdoors", aliases: ["xtreme outdoors"] },
  { name: "Recreation by Design", aliases: ["recreation by design"] },
];

/**
 * Curated series tables. Tiffin fuel map approved by MatchRV (Oct 2026):
 * Allegro Bus, Allegro RED, Phaeton, Allegro Breeze, Zephyr, Wayfarer =
 * diesel; Allegro Open Road and Allegro Bay = gas.
 */
export const SERIES: Record<string, SeriesDef[]> = {
  Tiffin: [
    { name: "Allegro Bus", rx: /\ballegro\s*bus\b/i, queryRx: /\ballegro\s*bus(?:es)?\b/i, impliedType: "class_a", impliedFuel: "diesel", family: "Allegro" },
    { name: "Allegro RED", rx: /\ballegro\s*red\b/i, queryRx: /\ballegro\s*reds?\b/i, impliedType: "class_a", impliedFuel: "diesel", family: "Allegro" },
    { name: "Allegro Breeze", rx: /\bbreeze\b/i, queryRx: /\ballegro\s*breeze\b/i, impliedType: "class_a", impliedFuel: "diesel", family: "Allegro" },
    { name: "Allegro Bay", rx: /\ballegro\s*bay\b/i, queryRx: /\ballegro\s*bay\b/i, impliedType: "class_a", impliedFuel: "gas", family: "Allegro" },
    { name: "Phaeton", rx: /\bphaeton\b/i, queryRx: /\bphaetons?\b/i, impliedType: "class_a", impliedFuel: "diesel" },
    { name: "Zephyr", rx: /\bzephyr\b/i, queryRx: /\bzephyrs?\b/i, impliedType: "class_a", impliedFuel: "diesel" },
    { name: "Wayfarer", rx: /\bwayfarer\b/i, queryRx: /\bwayfarers?\b/i, impliedType: "class_c", impliedFuel: "diesel" },
    { name: "Byway", rx: /\bbyway\b/i, queryRx: /\bbyway\b/i },
    { name: "GH1", rx: /\bgh\s*-?1\b/i, queryRx: /\bgh\s*-?1\b/i },
    { name: "GH2", rx: /\bgh\s*-?2\b/i, queryRx: /\bgh\s*-?2\b/i },
    { name: "GT1", rx: /\bgt\s*-?1\b/i, queryRx: /\bgt\s*-?1\b/i },
    { name: "GT2", rx: /\bgt\s*-?2\b/i, queryRx: /\bgt\s*-?2\b/i },
    // Tiffin's base Allegro is the Open Road; a bare "Allegro" resolves here
    // only after every more specific Allegro series has been ruled out.
    { name: "Allegro Open Road", rx: /\bopen\s*road\b|\ballegro\b/i, queryRx: /\b(?:allegro\s*open\s*road|open\s*road\s*allegro)\b/i, impliedType: "class_a", impliedFuel: "gas", family: "Allegro" },
  ],
};

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ").trim();

const aliasIndex = new Map<string, string>();
const titleAliases: { alias: string; brand: string }[] = [];
for (const b of BRANDS) {
  for (const a of b.aliases) { aliasIndex.set(a, b.name); titleAliases.push({ alias: a, brand: b.name }); }
  for (const a of b.makeOnlyAliases ?? []) aliasIndex.set(a, b.name);
  aliasIndex.set(norm(b.name), b.name);
}
titleAliases.sort((x, y) => y.alias.length - x.alias.length);

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Canonical brand for a free-text make ("tiffin motorhomes" → "Tiffin"); null if unknown. */
export function canonicalBrand(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = norm(raw);
  if (!n) return null;
  if (aliasIndex.has(n)) return aliasIndex.get(n)!;
  // "Tiffin Motorhomes Allegro Breeze" style make fields: longest alias prefix.
  for (const { alias, brand } of titleAliases) if (n === alias || n.startsWith(alias + " ")) return brand;
  return null;
}

/** Brand named at the start of a listing title (after condition words / year). */
export function brandFromTitle(title: string): string | null {
  let t = norm(title).replace(/^(?:(?:new|used|pre-owned|preowned|certified pre-owned|certified)\s+)?(?:\d{4}\s+)?(?:(?:new|used|pre-owned)\s+)?/, "");
  t = t.replace(/^\d{4}\s+/, "");
  for (const { alias, brand } of titleAliases) {
    if (t === alias || t.startsWith(alias + " ") || t.startsWith(alias + "-")) return brand;
  }
  return null;
}

export interface UnitMakeModel {
  /** Canonical brand, or the raw make field when the brand is not in the table. */
  brand: string;
  brandSource: "title" | "make_field" | "raw_make";
  /** Curated series name, or null when the brand has no table / it cannot be resolved. */
  series: string | null;
  seriesFamily: string | null;
  impliedFuel: FuelType | null;
}

const cache = new WeakMap<CanonicalUnit, UnitMakeModel>();

export function seriesTableFor(brand: string | null): SeriesDef[] | null {
  return brand ? SERIES[brand] ?? null : null;
}

function resolveSeriesText(brand: string, text: string): SeriesDef | null {
  const table = SERIES[brand];
  if (!table) return null;
  for (const s of table) if (s.rx.test(text)) return s;
  return null;
}

export function unitMakeModel(u: CanonicalUnit): UnitMakeModel {
  const hit = cache.get(u);
  if (hit) return hit;
  const fromTitle = brandFromTitle(u.title ?? "");
  const fromMake = canonicalBrand(u.make);
  let brand: string;
  let brandSource: UnitMakeModel["brandSource"];
  if (fromTitle) { brand = fromTitle; brandSource = "title"; }
  else if (fromMake) { brand = fromMake; brandSource = "make_field"; }
  else { brand = (u.make ?? "").trim(); brandSource = "raw_make"; }
  // A make field that is really a series ("Allegro Red") still names its brand.
  const text = `${u.model ?? ""} ${u.title ?? ""}`;
  const s = resolveSeriesText(brand, text);
  const out: UnitMakeModel = { brand, brandSource, series: s?.name ?? null, seriesFamily: s?.family ?? null, impliedFuel: s?.impliedFuel ?? null };
  cache.set(u, out);
  return out;
}

/** Same brand? Compares canonical names (falls back to normalized raw text). */
export function brandMatches(unitBrand: string, wanted: string): boolean {
  const a = canonicalBrand(unitBrand) ?? norm(unitBrand);
  const b = canonicalBrand(wanted) ?? norm(wanted);
  return a === b;
}

export type ModelMatch = "pass" | "fail" | "unknown";

/**
 * Does this unit match the requested model / series? Curated brands compare
 * series (a family like "Allegro" accepts any Allegro series); other brands
 * require the model words to appear in the unit's model or title.
 */
export function modelMatches(u: CanonicalUnit, wanted: string): ModelMatch {
  const mm = unitMakeModel(u);
  const table = seriesTableFor(mm.brand);
  const w = norm(wanted);
  if (table) {
    const wantedSeries = resolveWantedSeries(mm.brand, w);
    if (wantedSeries) {
      if (mm.series == null) return "unknown";
      if (wantedSeries.kind === "family") return mm.seriesFamily === wantedSeries.name || mm.series === wantedSeries.name ? "pass" : "fail";
      return mm.series === wantedSeries.name ? "pass" : "fail";
    }
  }
  if (!w) return "pass";
  const hay = norm(`${u.model ?? ""} ${u.title ?? ""}`);
  const words = w.split(" ").filter(Boolean);
  return words.every((word) => new RegExp(`(?:^|[^a-z0-9])${escapeRx(word)}(?:$|[^a-z0-9])`).test(hay)) ? "pass" : "fail";
}

export function resolveWantedSeries(brand: string, wantedNorm: string): { kind: "series" | "family"; name: string } | null {
  const table = SERIES[brand];
  if (!table) return null;
  const exact = table.find((s) => norm(s.name) === wantedNorm);
  if (exact) return { kind: "series", name: exact.name };
  for (const s of table) if (s.queryRx.test(wantedNorm)) return { kind: "series", name: s.name };
  if (brand === "Tiffin" && /^open\s*road$/.test(wantedNorm)) return { kind: "series", name: "Allegro Open Road" };
  if (brand === "Tiffin" && /^breeze$/.test(wantedNorm)) return { kind: "series", name: "Allegro Breeze" };
  const fam = table.find((s) => s.family && norm(s.family) === wantedNorm);
  if (fam) return { kind: "family", name: fam.family! };
  return null;
}

/** Which curated brand (if any) owns a series name. */
export function brandForSeries(model: string): string | null {
  const w = norm(model);
  for (const [brand, table] of Object.entries(SERIES)) {
    if (table.some((s) => norm(s.name) === w || s.queryRx.test(w) || (s.family && norm(s.family) === w))) return brand;
  }
  return null;
}

const MODEL_STOPWORDS = new Set([
  "rv", "rvs", "motorhome", "motorhomes", "motor", "home", "homes", "coach", "coaches", "travel", "trailer", "trailers", "fifth", "5th",
  "wheel", "wheels", "toy", "hauler", "haulers", "class", "a", "b", "c", "near", "in", "around", "under", "for", "with", "that", "sleeps",
  "new", "used", "pre-owned", "preowned", "gas", "diesel", "and", "or", "the", "within", "below", "less", "than", "max", "budget", "model",
  "models", "brand", "units", "unit", "any", "all", "family", "couples", "bunkhouse", "camper", "campers", "pop", "up", "popup", "truck",
  "van", "vans", "pusher", "pushers", "is", "are", "do", "you", "have", "got", "listings", "inventory", "options", "deals", "dealer", "dealers",
  "please", "something", "like", "about", "from", "to", "by", "of", "on", "at", "me", "show", "find", "looking", "want", "i", "im", "we",
]);

export interface ParsedMakeModel { makes: string[]; models: string[] }

/** Pull brand(s) and model/series name(s) out of shopper text. */
export function parseMakeModel(text: string): ParsedMakeModel {
  const q = ` ${norm(text)} `;
  const makes: string[] = [];
  const models: string[] = [];
  const consumed: [number, number][] = [];
  // Brand aliases (longest first, whole words). Make-only aliases are too
  // ambiguous in free text ("grand", "east", "connect"), so skip them here.
  for (const { alias, brand } of titleAliases) {
    if (alias.length < 3) continue;
    const re = new RegExp(`(?<=[^a-z0-9])${escapeRx(alias)}(?=[^a-z0-9])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(q))) {
      const start = m.index, end = m.index + alias.length;
      if (consumed.some(([s, e]) => start < e && end > s)) continue;
      consumed.push([start, end]);
      if (!makes.includes(brand)) makes.push(brand);
      // Generic model: the next word after the brand, unless it is a filler word.
      if (!SERIES[brand]) {
        const after = q.slice(end).trim().split(" ")[0] ?? "";
        if (after && after.length >= 3 && !MODEL_STOPWORDS.has(after) && /^[a-z][a-z0-9-]*$/.test(after) && (!canonicalBrand(after) || canonicalBrand(after) === brand)) models.push(after.replace(/^\w/, (c) => c.toUpperCase()));
      }
    }
  }
  // Curated series anywhere in the text (specific before generic).
  const seriesText = q;
  for (const [brand, table] of Object.entries(SERIES)) {
    const found: string[] = [];
    for (const s of table) {
      if (s.queryRx.test(seriesText)) {
        // "allegro red" must not also select the bare-Allegro Open Road.
        if (s.name === "Allegro Open Road" && found.some((f) => f.startsWith("Allegro"))) continue;
        found.push(s.name);
      }
    }
    if (brand === "Tiffin" && !found.length && makes.includes("Tiffin") && /\bopen\s*road\b/.test(seriesText)) found.push("Allegro Open Road");
    if (brand === "Tiffin" && !found.length && /\ballegro\b/.test(seriesText)) found.push("Allegro");
    if (found.length) {
      for (const f of found) if (!models.includes(f)) models.push(f);
      if (!makes.includes(brand)) makes.push(brand);
    }
  }
  return { makes, models };
}
