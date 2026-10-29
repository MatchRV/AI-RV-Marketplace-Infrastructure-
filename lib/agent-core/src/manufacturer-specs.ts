/**
 * Manufacturer spec (brochure / floorplan page) enrichment with receipts.
 *
 * Fills a unit's MISSING critical specs from the manufacturer's own published
 * specification for the exact model year + series + floorplan code — and
 * nothing else. Rules (the product):
 *
 *  1. Source-backed only. Every spec record carries an https sourceUrl on the
 *     manufacturer's own domain and the date it was read. Third-party spec
 *     sites, dealer pages and model-family "typical" values are rejected.
 *  2. Exact configuration. Year, series and floorplan code must all match the
 *     unit's own TITLE (feeds sometimes paste the wrong model into the model
 *     field), and the brand must not contradict the record. A neighbouring
 *     year or floorplan is never borrowed.
 *  3. Fill, never overwrite. Values the dealer listed (or that were parsed
 *     from the dealer's text) stay; a large disagreement is reported as a
 *     conflict for human review instead of being silently "fixed".
 *  4. Unknown stays unknown. A field the manufacturer did not publish is not
 *     computed from other fields (e.g. GVWR is never derived as UVW + CCC).
 *     Ambiguous matches (two records disagree) fill nothing.
 *
 * Browser-safe: no node:* imports (agent-core is bundled into the web client).
 */

import type { CanonicalUnit, Fact, FactSource, FuelType } from "./types.js";
import { canonicalBrand, unitMakeModel } from "./brands.js";
import { TOWABLE_TYPES } from "./types.js";

/** Public provenance vocabulary used in docs, listings and MCP receipts. */
export type ProvenanceLabel =
  | "dealer_listing"
  | "parsed_dealer_text"
  | "decoded_floorplan_code"
  | "computed_from_brochure"
  | "computed_estimate"
  | "reference_table"
  | "shopper_confirmed"
  | "unknown";

export function provenanceLabel(f: Pick<Fact<unknown>, "value" | "source">): ProvenanceLabel {
  if (f.value === null || f.value === undefined || !f.source) return "unknown";
  const map: Record<FactSource, ProvenanceLabel> = {
    dealer_listing: "dealer_listing",
    derived_text: "parsed_dealer_text",
    derived_model_code: "decoded_floorplan_code",
    manufacturer_spec: "computed_from_brochure",
    computed: "computed_estimate",
    reference_table: "reference_table",
    learned: "shopper_confirmed",
  };
  return map[f.source] ?? "unknown";
}

// ── Spec records ───────────────────────────────────────────────────────────

export type SpecField =
  | "lengthFt"
  | "sleeps"
  | "dryWeightLbs"
  | "gvwrLbs"
  | "hitchWeightLbs"
  | "slideouts"
  | "freshWaterGal"
  | "greyWaterGal"
  | "blackWaterGal";

export const SPEC_FIELDS: SpecField[] = [
  "lengthFt", "sleeps", "dryWeightLbs", "gvwrLbs", "hitchWeightLbs",
  "slideouts", "freshWaterGal", "greyWaterGal", "blackWaterGal",
];

const RANGES: Record<SpecField, [number, number]> = {
  lengthFt: [8, 60],
  sleeps: [1, 14],
  dryWeightLbs: [500, 40_000],
  gvwrLbs: [1_000, 60_000],
  hitchWeightLbs: [50, 6_000],
  slideouts: [0, 6],
  freshWaterGal: [5, 300],
  greyWaterGal: [5, 300],
  blackWaterGal: [5, 300],
};

/** Weights vary with options; dimensions/capacities of a floorplan don't. */
const CONFIDENCE: Record<SpecField, "high" | "medium"> = {
  lengthFt: "high", sleeps: "high", slideouts: "high",
  freshWaterGal: "high", greyWaterGal: "high", blackWaterGal: "high",
  dryWeightLbs: "medium", gvwrLbs: "medium", hitchWeightLbs: "medium",
};

export interface ManufacturerSpecRecord {
  year: number;
  /** Manufacturer as published, e.g. "Keystone", "Jayco". */
  make: string;
  /** Other brand names the units are sold under (licensed badges), e.g. ["Coleman"]. */
  brandAliases?: string[];
  /** Series / model line as it appears in listing titles, e.g. "Coleman", "Jay Flight". */
  series: string;
  /** Floorplan code exactly as published, e.g. "17B", "270BHSW". */
  floorplanCode: string;
  /** Manufacturer page or brochure PDF that publishes these numbers. */
  sourceUrl: string;
  /** ISO date the source was read. */
  retrievedAt: string;
  /** Exact label used by the manufacturer for weight fields, kept as a receipt. */
  labels?: Partial<Record<SpecField, string>>;
  specs: Partial<Record<SpecField, number>>;
  /** Why a published field was left out, or any other caveat for reviewers. */
  note?: string;
  /** Motorhomes only, when the manufacturer states it for this floorplan. */
  fuelType?: FuelType;
  /** Floorplan name/description exactly as the manufacturer publishes it, e.g. "Single axle, non-slide, single bunks". */
  floorplanName?: string;
  /**
   * Bunkhouse yes/no, only when the manufacturer's own floorplan description or
   * spec table says so (bunkhouseEvidence quotes it). Omitted = not published.
   */
  bunkhouse?: boolean;
  bunkhouseEvidence?: string;
}

/** Manufacturer-owned domains (subdomains allowed). Extend only with first-party domains. */
export const MANUFACTURER_DOMAINS: Record<string, string[]> = {
  keystone: ["keystonerv.com"],
  jayco: ["jayco.com"],
  "forest river": ["forestriverinc.com"],
  "grand design": ["granddesignrv.com"],
  winnebago: ["winnebago.com", "winnebagoind.com"],
  airstream: ["airstream.com"],
  thor: ["thormotorcoach.com", "thorindustries.com"],
  heartland: ["heartlandrvs.com"],
  coachmen: ["coachmenrv.com"],
  dutchmen: ["dutchmen.com"],
  "east to west": ["etwrv.com"],
  "entegra coach": ["entegracoach.com"],
  tiffin: ["tiffinmotorhomes.com"],
  newmar: ["newmarcorp.com"],
  alliance: ["alliancerv.com"],
  brinkley: ["brinkleyrv.com"],
  lance: ["lancecamper.com"],
  "gulf stream": ["gulfstreamcoach.com"],
  palomino: ["palominorv.com"],
  "cruiser rv": ["cruiserrv.com"],
  "drv luxury suites": ["drvsuites.com"],
  nucamp: ["nucamprv.com"],
  fleetwood: ["fleetwoodrv.com", "rev-rv.com"],
  "holiday rambler": ["holidayrambler.com", "rev-rv.com"],
  "american coach": ["americancoach.com", "rev-rv.com"],
  "northwood": ["northwoodmfg.com"],
  "outdoors rv": ["outdoorsrvmfg.com"],
  "highland ridge": ["highlandridgerv.com"],
  venture: ["venturerv.com"],
  "k-z": ["kz-rv.com"],
  "riverstone": ["forestriverinc.com"],
};

const normText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function isManufacturerSource(record: Pick<ManufacturerSpecRecord, "make" | "sourceUrl">): boolean {
  let url: URL;
  try { url = new URL(record.sourceUrl); } catch { return false; }
  if (url.protocol !== "https:") return false;
  const domains = MANUFACTURER_DOMAINS[normText(record.make)] ?? [];
  const host = url.hostname.toLowerCase();
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

export interface SpecIndex {
  byKey: Map<string, ManufacturerSpecRecord[]>;
  rejected: { record: ManufacturerSpecRecord; reason: string }[];
  accepted: number;
}

const specKey = (year: number, code: string) => `${year}|${normCode(code)}`;

/** Validate records and index them by year + floorplan code. Invalid records are kept out, with a reason. */
export function buildSpecIndex(records: ManufacturerSpecRecord[]): SpecIndex {
  const index: SpecIndex = { byKey: new Map(), rejected: [], accepted: 0 };
  for (const r of records) {
    const reason = validateRecord(r);
    if (reason) { index.rejected.push({ record: r, reason }); continue; }
    const k = specKey(r.year, r.floorplanCode);
    index.byKey.set(k, [...(index.byKey.get(k) ?? []), r]);
    index.accepted++;
  }
  return index;
}

function validateRecord(r: ManufacturerSpecRecord): string | null {
  if (!Number.isInteger(r.year) || r.year < 1990 || r.year > 2100) return "invalid_year";
  if (!r.make?.trim() || !r.series?.trim()) return "missing_make_or_series";
  if (!/^[A-Z0-9]{2,10}$/.test(normCode(r.floorplanCode ?? "")) || !/\d/.test(r.floorplanCode)) return "invalid_floorplan_code";
  if (!isManufacturerSource(r)) return "source_not_manufacturer_https";
  if (!r.retrievedAt || Number.isNaN(Date.parse(r.retrievedAt))) return "missing_retrieved_at";
  for (const [f, v] of Object.entries(r.specs ?? {}) as [SpecField, number][]) {
    if (!(f in RANGES)) return `unknown_field_${f}`;
    const [min, max] = RANGES[f];
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) return `out_of_range_${f}`;
  }
  if (r.bunkhouse !== undefined && typeof r.bunkhouse !== "boolean") return "invalid_bunkhouse";
  if (r.bunkhouse !== undefined && !r.bunkhouseEvidence?.trim()) return "bunkhouse_without_evidence";
  if (!Object.keys(r.specs ?? {}).length && !r.fuelType && r.bunkhouse === undefined) return "no_specs";
  return null;
}

// ── Matching ───────────────────────────────────────────────────────────────

/** Floorplan codes named in a listing title (normalized, e.g. "270BHSW"). */
export function titleFloorplanCodes(text: string): string[] { return [...codesIn(text)]; }

// 4-digit codes (Grand Design Imagine 2470BH, Keystone Springdale 2880BRS) only in the unspaced form, so "2027 GRAND" is never a code.
const CODE_RE = /\b(\d{2,3}\s?-?[A-Z]{1,6}\d?|\d{1,4}[A-Z]{1,6}\d?)\b/g;

function codesIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.toUpperCase().matchAll(CODE_RE)) out.add(normCode(m[1]));
  return out;
}

const hasWords = (hay: string, needle: string) => {
  const n = normText(needle);
  return !!n && new RegExp(`(?:^| )${n.replace(/ /g, " ")}(?: |$)`).test(normText(hay));
};

const squash = (s: string) => normText(s).replace(/ /g, "");
/** Title names the series immediately followed by the floorplan code (spacing/hyphens ignored). */
export function seriesThenCode(title: string, series: string, floorplanCode: string): boolean {
  const t = ` ${normText(title)} `;
  const want = `${squash(series)}${normCode(floorplanCode).toLowerCase()}`;
  // Re-join every run of words and test word-boundary-aligned containment.
  const words = t.trim().split(" ");
  for (let i = 0; i < words.length; i++) {
    let acc = "";
    for (let j = i; j < words.length && acc.length < want.length; j++) {
      acc += words[j];
      if (acc === want) return true;
    }
  }
  return false;
}

export type MatchFailure =
  | "no_record_for_year_and_code"
  | "code_not_in_title"
  | "model_field_names_other_floorplan"
  | "series_not_in_title"
  | "brand_conflict"
  | "ambiguous";

export function findSpecRecord(
  unit: CanonicalUnit,
  index: SpecIndex,
): { record: ManufacturerSpecRecord } | { failure: MatchFailure } {
  const title = unit.title ?? "";
  const titleCodes = codesIn(title);
  const candidates = [...titleCodes].flatMap((c) => index.byKey.get(specKey(unit.year, c)) ?? []);
  if (!candidates.length) {
    // Record exists for the model field's code but not the title's? Feed bug — refuse.
    const modelHit = [...codesIn(unit.model ?? "")].some((c) => index.byKey.has(specKey(unit.year, c)));
    return { failure: modelHit ? (titleCodes.size ? "model_field_names_other_floorplan" : "code_not_in_title") : "no_record_for_year_and_code" };
  }
  // Model field must not name a different floorplan than the title.
  const modelCodes = codesIn(unit.model ?? "");
  if (modelCodes.size && titleCodes.size && ![...modelCodes].some((c) => titleCodes.has(c))) {
    return { failure: "model_field_names_other_floorplan" };
  }
  // Exact configuration: the series must be immediately followed by the
  // floorplan code ("Jay Flight 270BHSW"). A longer series name in the title
  // ("Jay Flight SLX 270BHSW", "Coleman Lantern 17B") is a different model
  // line, so a series-level match is refused.
  const bySeries = candidates.filter((r) => hasWords(title, r.series) && seriesThenCode(title, r.series, r.floorplanCode));
  if (!bySeries.length) return { failure: "series_not_in_title" };
  const unitBrand = canonicalBrand(unitMakeModel(unit).brand) ?? canonicalBrand(unit.make);
  const byBrand = bySeries.filter((r) => {
    if (!unitBrand) return true; // unknown brand doesn't contradict; series + code + year still matched
    const accepted = [r.make, ...(r.brandAliases ?? [])].map((b) => canonicalBrand(b) ?? normText(b));
    return accepted.includes(unitBrand) || accepted.includes(normText(unitBrand));
  });
  if (!byBrand.length) return { failure: "brand_conflict" };
  const distinct = new Set(byBrand.map((r) => JSON.stringify([r.specs, r.fuelType ?? null, r.bunkhouse ?? null])));
  if (distinct.size > 1) return { failure: "ambiguous" };
  return { record: byBrand[0] };
}

// ── Fill ───────────────────────────────────────────────────────────────────

export interface SpecConflict {
  unitId: string;
  /** "bunkhouse" values are 1 (yes) / 0 (no). */
  field: SpecField | "bunkhouse";
  unitValue: number;
  unitSource: FactSource | null;
  manufacturerValue: number;
  sourceUrl: string;
}

export interface SpecFillResult {
  filled: (SpecField | "bunkhouse")[];
  fuelFilled: boolean;
  conflicts: SpecConflict[];
  failure?: MatchFailure;
  sourceUrl?: string;
}

/** Relative disagreement above which a dealer value is flagged for review. */
const CONFLICT_TOLERANCE: Record<SpecField, number> = {
  lengthFt: 0.05, sleeps: 0, slideouts: 0,
  freshWaterGal: 0.1, greyWaterGal: 0.1, blackWaterGal: 0.1,
  dryWeightLbs: 0.15, gvwrLbs: 0.1, hitchWeightLbs: 0.25,
};

function manufacturerFact(value: number, field: SpecField, r: ManufacturerSpecRecord): Fact<number> {
  const label = r.labels?.[field];
  const weightNote = CONFIDENCE[field] === "medium" ? " Base-model figure; options change actual weight — check the unit's weight label." : "";
  return {
    value,
    source: "manufacturer_spec",
    confidence: CONFIDENCE[field],
    note: `${r.year} ${r.make} ${r.series} ${r.floorplanCode} manufacturer spec${label ? ` ("${label}")` : ""}; dealer did not publish this.${weightNote}`,
    sourceUrl: r.sourceUrl,
    observedAt: r.retrievedAt,
  };
}

/**
 * Fill missing critical specs on one unit from the matching manufacturer
 * record. Mutates `unit` (same convention as enrichSnapshotUnits). Only
 * fields whose value is null are written; estimates (source "computed" /
 * "derived_model_code") are replaced because a published spec beats a guess.
 */
export function applyManufacturerSpecs(unit: CanonicalUnit, index: SpecIndex): SpecFillResult {
  const res: SpecFillResult = { filled: [], fuelFilled: false, conflicts: [] };
  const hit = findSpecRecord(unit, index);
  if ("failure" in hit) { res.failure = hit.failure; return res; }
  const r = hit.record;
  res.sourceUrl = r.sourceUrl;

  for (const field of SPEC_FIELDS) {
    const mv = r.specs[field];
    if (mv === undefined) continue; // manufacturer didn't publish it: stays as-is (unknown stays unknown)
    const cur = unit[field] as Fact<number>;
    const isEstimate = cur.source === "computed" || cur.source === "derived_model_code";
    if (cur.value === null || isEstimate) {
      (unit[field] as Fact<number>) = manufacturerFact(mv, field, r);
      res.filled.push(field);
      continue;
    }
    if (cur.source === "manufacturer_spec") continue;
    const tol = CONFLICT_TOLERANCE[field];
    const diff = Math.abs(cur.value - mv) / Math.max(1, mv);
    if (diff > tol) {
      res.conflicts.push({ unitId: unit.id, field, unitValue: cur.value, unitSource: cur.source, manufacturerValue: mv, sourceUrl: r.sourceUrl });
    }
  }

  if (r.bunkhouse !== undefined) {
    const cur = unit.bunkhouse;
    // Dealer-stated (structured or the dealer's own text) wins; a BH-code reading is a convention, so the brochure replaces it.
    if (cur.value === null || cur.source === "derived_model_code" || cur.source === "computed") {
      unit.bunkhouse = {
        value: r.bunkhouse,
        source: "manufacturer_spec",
        confidence: "high",
        note: `${r.year} ${r.make} ${r.series} ${r.floorplanCode} manufacturer floorplan: "${r.bunkhouseEvidence}".`,
        sourceUrl: r.sourceUrl,
        observedAt: r.retrievedAt,
      };
      res.filled.push("bunkhouse");
    } else if (cur.source !== "manufacturer_spec" && cur.value !== r.bunkhouse) {
      res.conflicts.push({ unitId: unit.id, field: "bunkhouse", unitValue: cur.value ? 1 : 0, unitSource: cur.source, manufacturerValue: r.bunkhouse ? 1 : 0, sourceUrl: r.sourceUrl });
    }
  }

  if (r.fuelType && !TOWABLE_TYPES.includes(unit.rvType)) {
    const pt = unit.powertrain;
    if (!pt?.fuelType || pt.fuelType.value === null) {
      const fuel: Fact<FuelType> = {
        value: r.fuelType, source: "manufacturer_spec", confidence: "high",
        note: `${r.year} ${r.make} ${r.series} ${r.floorplanCode} manufacturer spec.`,
        sourceUrl: r.sourceUrl, observedAt: r.retrievedAt,
      };
      const UNKNOWN = { value: null, source: null, confidence: null } as const;
      unit.powertrain = {
        fuelType: fuel,
        engine: pt?.engine ?? UNKNOWN, horsepower: pt?.horsepower ?? UNKNOWN, horsepowerRpm: pt?.horsepowerRpm ?? UNKNOWN,
        torqueLbFt: pt?.torqueLbFt ?? UNKNOWN, torqueRpm: pt?.torqueRpm ?? UNKNOWN, transmission: pt?.transmission ?? UNKNOWN,
        chassis: pt?.chassis ?? UNKNOWN, engineBrake: pt?.engineBrake ?? UNKNOWN,
      };
      res.fuelFilled = true;
    }
  }
  return res;
}

export interface SpecRunStats {
  units: number;
  matched: number;
  fieldsFilled: Partial<Record<SpecField | "fuelType" | "bunkhouse", number>>;
  conflicts: SpecConflict[];
  failures: Partial<Record<MatchFailure, number>>;
}

export function applyManufacturerSpecsToAll(units: CanonicalUnit[], index: SpecIndex): SpecRunStats {
  const stats: SpecRunStats = { units: units.length, matched: 0, fieldsFilled: {}, conflicts: [], failures: {} };
  for (const u of units) {
    const r = applyManufacturerSpecs(u, index);
    if (r.failure) {
      if (r.failure !== "no_record_for_year_and_code") stats.failures[r.failure] = (stats.failures[r.failure] ?? 0) + 1;
      continue;
    }
    stats.matched++;
    for (const f of r.filled) stats.fieldsFilled[f] = (stats.fieldsFilled[f] ?? 0) + 1;
    if (r.fuelFilled) stats.fieldsFilled.fuelType = (stats.fieldsFilled.fuelType ?? 0) + 1;
    stats.conflicts.push(...r.conflicts);
  }
  return stats;
}

// ── Spec-page text parser ──────────────────────────────────────────────────
// Turns the text of ONE floorplan's manufacturer spec table into numbers.
// Only explicitly labeled values are read; an unlabeled number stays unknown.
// "Length" is used only when no "overall" length is published, because some
// manufacturers (Jayco) publish both a box length and an overall length.

const feetInches = (s: string): number | null => {
  const m = /(\d{1,2})\s*(?:ft\.?|feet|')\s*(?:(\d{1,2}(?:\.\d+)?)\s*(?:in\.?|inches|"|''))?/i.exec(s);
  if (!m) return null;
  const inches = Number(m[2] ?? 0);
  if (inches >= 12) return null;
  return Math.round((Number(m[1]) + inches / 12) * 100) / 100;
};

const numberIn = (s: string): number | null => {
  const m = /([\d,]+(?:\.\d+)?)/.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

export function parseSpecTableText(text: string): { specs: Partial<Record<SpecField, number>>; labels: Partial<Record<SpecField, string>> } {
  const specs: Partial<Record<SpecField, number>> = {};
  const labels: Partial<Record<SpecField, string>> = {};
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\|/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  const set = (f: SpecField, v: number | null, label: string) => {
    if (v === null || specs[f] !== undefined) return;
    const [min, max] = RANGES[f];
    if (v < min || v > max) return;
    specs[f] = v;
    labels[f] = label;
  };
  const rules: { f: SpecField; re: RegExp; parse: (rest: string) => number | null; priority?: number }[] = [
    { f: "lengthFt", re: /^(exterior length \(overall\)|overall length|exterior length overall)(?=\s|$)/i, parse: feetInches },
    { f: "sleeps", re: /^(sleeping capacity|sleeps|max sleeping count)\b/i, parse: numberIn },
    { f: "dryWeightLbs", re: /^(unloaded vehicle weight|uvw|dry weight|shipping weight|base weight)\b/i, parse: numberIn },
    { f: "gvwrLbs", re: /^(gross vehicle weight rating|gvwr)\b/i, parse: numberIn },
    { f: "hitchWeightLbs", re: /^(dry hitch weight|hitch weight|dry tongue weight|tongue weight|pin weight|dry pin weight|hitch)\b/i, parse: numberIn },
    { f: "slideouts", re: /^(slide ?outs?|number of slides?|slides)\b/i, parse: numberIn },
    { f: "freshWaterGal", re: /^(fresh water( capacity)?|fresh tank)\b/i, parse: numberIn },
    { f: "greyWaterGal", re: /^(gr[ae]y water( capacity)?|gr[ae]y tank)\b/i, parse: numberIn },
    { f: "blackWaterGal", re: /^(black (water|tank)( capacity)?|waste water)\b/i, parse: numberIn },
  ];
  for (const line of lines) {
    for (const r of rules) {
      const m = r.re.exec(line);
      if (!m) continue;
      let rest = line.slice(m[0].length);
      // "Fresh Water Capacity (gals) 76.0" — drop a unit hint in parentheses.
      rest = rest.replace(/^\s*\((?:lbs?|gals?|gallons)\)\s*/i, "");
      set(r.f, r.parse(rest), m[0]);
      break;
    }
  }
  if (specs.lengthFt === undefined) {
    for (const line of lines) {
      const m = /^length\b/i.exec(line);
      if (m) { set("lengthFt", feetInches(line.slice(m[0].length)), "Length"); break; }
    }
  }
  return { specs, labels };
}

// ── Facts-only serving rule ────────────────────────────────────────────────
// A spec value is served only when it is published for THIS unit: by the
// dealer (structured listing field, the dealer's own description text, or the
// dealer's VIN feed), by the manufacturer for the exact year + series +
// floorplan (with its sourceUrl), or confirmed by the shopper themselves.
// Anything inferred, estimated, decoded from a naming convention or computed
// becomes null ("not published") and is treated as needs-verification.

export const SERVABLE_SPEC_SOURCES: readonly FactSource[] = ["dealer_listing", "derived_text", "manufacturer_spec", "learned"];

export function isServableFact(f: Pick<Fact<unknown>, "value" | "source" | "sourceUrl">): boolean {
  if (f.value === null || f.value === undefined || !f.source) return false;
  if (!SERVABLE_SPEC_SOURCES.includes(f.source)) return false;
  if (f.source === "manufacturer_spec" && !f.sourceUrl) return false;
  return true;
}

export type FactsOnlyStats = Partial<Record<SpecField, Partial<Record<FactSource, number>>>>;

/** Null every non-servable spec value in place. Returns what was blanked, by field and source. */
export function enforceFactsOnly(units: CanonicalUnit[]): FactsOnlyStats {
  const blanked: FactsOnlyStats = {};
  for (const u of units) {
    for (const field of SPEC_FIELDS) {
      const f = u[field] as Fact<number>;
      if (f.value === null || f.value === undefined || isServableFact(f)) continue;
      const by = (blanked[field] ??= {});
      const src = (f.source ?? "computed") as FactSource;
      by[src] = (by[src] ?? 0) + 1;
      (u[field] as Fact<number>) = {
        value: null, source: null, confidence: null,
        note: `${field === "sleeps" ? "Sleeping capacity" : "Value"} not published by the dealer or the manufacturer for this exact floorplan; confirm with the dealer.`,
      };
    }
  }
  return blanked;
}
