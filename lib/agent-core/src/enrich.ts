/**
 * Deterministic enrichment: extract structured facts from dealer-authored
 * text (title, model code, description, feature list) with explicit
 * provenance. No LLM, no guessing — a regex either finds dealer-stated
 * evidence or the field stays unknown.
 *
 * IMPORTANT: absence of evidence is NOT evidence of absence. When text
 * doesn't mention solar, `solar` stays null (unknown), never "none".
 */

import type { Fact, FactSource, SolarStatus } from "./types.js";

export function fact<T>(
  value: T | null,
  source: FactSource | null,
  confidence: "high" | "medium" | "low" | null,
  note?: string,
): Fact<T> {
  if (value === null || value === undefined) {
    return { value: null, source: null, confidence: null, ...(note ? { note } : {}) };
  }
  return { value, source, confidence, ...(note ? { note } : {}) };
}

export const unknown = <T>(note?: string): Fact<T> => fact<T>(null, null, null, note);

interface TextCorpus {
  /** Lowercased description + features + title, for matching. */
  all: string;
  features: string;
}

export function buildCorpus(
  title: string | null,
  description: string | null,
  features: string[],
): TextCorpus {
  const f = features.join(" \n ").toLowerCase();
  const all = [title ?? "", description ?? "", f].join(" \n ").toLowerCase();
  return { all, features: f };
}

// ── Floorplan code decoding ────────────────────────────────────────────────
// RV model names embed floorplan codes: "26BHX" → 26 ft-class bunkhouse.
// Decoding the suffix letters is standard industry practice, but it's a
// convention, not a spec — so everything derived this way is confidence
// "medium" and labeled derived_model_code.

const FLOORPLAN_RE = /\b(\d{2,3})\s?([A-Z]{2,5})\b/;

export function extractFloorplanCode(model: string, title: string): string | null {
  const m = model.toUpperCase().match(FLOORPLAN_RE) ?? title.toUpperCase().match(FLOORPLAN_RE);
  return m ? `${m[1]}${m[2]}` : null;
}

const BUNK_CODE = /(BH|DB|QB|BHS|BHX|BHK|DBS|BUNK)/;

export function floorplanSuggestsBunks(code: string | null): boolean {
  if (!code) return false;
  const letters = code.replace(/^\d+/, "");
  return BUNK_CODE.test(letters);
}

// ── Boolean feature extraction ─────────────────────────────────────────────

const NEG_NEARBY = /(no|without|minus|not equipped|prep only|prepped for|ready for)\s+(?:\w+\s+){0,2}$/;

/** Does the corpus affirmatively mention `re`, without an obvious negation immediately before it? */
function mentions(corpus: TextCorpus, re: RegExp): boolean {
  const m = re.exec(corpus.all);
  if (!m) return false;
  const before = corpus.all.slice(Math.max(0, m.index - 24), m.index);
  return !NEG_NEARBY.test(before);
}

export function extractSolar(corpus: TextCorpus): Fact<SolarStatus> {
  const prep = /solar\s*(prep|ready|pre-?wir|port|hook-?up|connection|plug)/;
  const installed =
    /(\d+\s*(w|watt)s?\s*(of\s*)?solar|solar\s*panel|solar\s*package|roof-?mounted\s*solar|with\s+solar|solar\s*power\s*system|go\s*power|zamp)/;
  if (mentions(corpus, installed)) {
    return fact<SolarStatus>("installed", "derived_text", "medium", "Dealer text mentions installed solar equipment.");
  }
  if (mentions(corpus, prep)) {
    return fact<SolarStatus>("prep", "derived_text", "medium", "Dealer text mentions solar prep/ready, not installed panels.");
  }
  return unknown("Dealer text does not mention solar either way.");
}

export function extractLithium(corpus: TextCorpus): Fact<boolean> {
  if (mentions(corpus, /(lithium|lifepo4|li-?ion\s*(battery|batteries))/)) {
    return fact(true, "derived_text", "medium", "Dealer text mentions lithium battery equipment.");
  }
  return unknown("Battery chemistry not stated by dealer.");
}

export function extractGenerator(
  structured: boolean | null | undefined,
  corpus: TextCorpus,
): Fact<boolean> {
  if (structured === true) return fact(true, "dealer_listing", "high");
  if (mentions(corpus, /(generator|onan|gen\s*prep)/)) {
    const prepOnly = /gen(erator)?\s*prep/.test(corpus.all) && !/(onan|generator)(?!\s*prep)/.test(corpus.all.replace(/gen(erator)?\s*prep/g, ""));
    if (prepOnly) return unknown("Only generator PREP mentioned — no generator confirmed.");
    return fact(true, "derived_text", "medium", "Dealer text mentions a generator.");
  }
  if (structured === false) return unknown("Dealer feed shows no generator flag; text silent — treating as unknown, not 'no'.");
  return unknown("Generator not mentioned by dealer.");
}

export function extractBunkhouse(
  structured: boolean | null | undefined,
  corpus: TextCorpus,
  floorplanCode: string | null,
): Fact<boolean> {
  if (structured === true) return fact(true, "dealer_listing", "high");
  if (mentions(corpus, /(bunkhouse|bunk\s*house|bunk\s*bed|bunk\s*room|double-?size\s*bunk|set of bunks)/)) {
    return fact(true, "derived_text", "medium", "Dealer text mentions bunks.");
  }
  if (floorplanSuggestsBunks(floorplanCode)) {
    return fact(true, "derived_model_code", "medium", `Floorplan code ${floorplanCode} indicates a bunk layout.`);
  }
  if (structured === false) return fact(false, "dealer_listing", "medium", "Dealer feed marks no bunkhouse.");
  return unknown("Bunk layout not stated.");
}

export function extractEntryDoors(corpus: TextCorpus): Fact<number> {
  if (mentions(corpus, /(two|2|dual|double)\s*entry\s*doors?|second\s*entry\s*door|entry\s*doors\s*:\s*2/)) {
    return fact(2, "derived_text", "medium", "Dealer text mentions a second entry door.");
  }
  return unknown("Entry-door count not stated by dealer.");
}

export function extractFourSeason(corpus: TextCorpus): Fact<boolean> {
  if (
    mentions(
      corpus,
      /(four\s*seasons?|4\s*seasons?|all[-\s]?season|arctic\s*(package|pkg|insulation)|extreme\s*weather|polar\s*package|climate\s*(shield|package)|weather\s*shield|azdel)/,
    )
  ) {
    return fact(true, "derived_text", "medium", "Dealer text mentions four-season/arctic construction.");
  }
  return unknown("Four-season capability not stated.");
}

export function extractOutdoorKitchen(corpus: TextCorpus): Fact<boolean> {
  if (mentions(corpus, /(outdoor|outside|exterior)\s*(kitchen|griddle|cook)/)) {
    return fact(true, "derived_text", "medium", "Dealer text mentions an outdoor kitchen.");
  }
  return unknown("Outdoor kitchen not stated.");
}

// ── Labeled spec extraction ────────────────────────────────────────────────
// Dealers often publish specs only as text ("Sleeps 5", "44ft long",
// "GVWR: 7,600 lbs"). We parse ONLY explicitly labeled values — an unlabeled
// "3,088 lbs" could be dry, hitch, or cargo weight, so it stays unknown.

export interface TextSpecs {
  sleeps: number | null;
  lengthFt: number | null;
  slideouts: number | null;
  dryWeightLbs: number | null;
  gvwrLbs: number | null;
  hitchWeightLbs: number | null;
  freshWaterGal: number | null;
}

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const within = (n: number | null, min: number, max: number): number | null =>
  n !== null && n >= min && n <= max ? n : null;

export function extractSpecsFromText(corpus: TextCorpus): TextSpecs {
  const t = corpus.all;
  const m = (re: RegExp): string | undefined => re.exec(t)?.[1];

  return {
    sleeps: within(num(m(/sleeps\s*:?\s*(\d{1,2})\b/)), 1, 14),
    lengthFt: within(
      num(m(/\b(\d{2}(?:\.\d+)?)\s*(?:ft|feet|')\s*(?:long|length)?\b/) ?? m(/length\s*[:\-]?\s*(\d{2}(?:\.\d+)?)/)),
      8,
      60,
    ),
    slideouts: within(num(m(/\b(\d)\s*slide(?:s|outs?|-outs?)?\b/)), 0, 6),
    dryWeightLbs: within(num(m(/(?:dry\s*weight|uvw|unloaded\s*vehicle\s*weight)\s*[:\-]?\s*([\d,]{3,7})/)), 500, 40_000),
    gvwrLbs: within(num(m(/gvwr\s*[:\-]?\s*([\d,]{3,7})/)), 1_000, 60_000),
    hitchWeightLbs: within(num(m(/(?:hitch|tongue)\s*(?:weight|wt)?\s*[:\-]?\s*([\d,]{2,6})\s*(?:lbs?|pounds)?\b/)), 50, 6_000),
    freshWaterGal: within(
      num(m(/([\d.]{1,5})\s*gal(?:lons?)?\s*(?:of\s*)?fresh/) ?? m(/fresh\s*(?:water)?\s*(?:capacity|tank)?\s*[:\-]?\s*([\d.]{1,5})\s*gal/)),
      5,
      300,
    ),
  };
}

// ── Boondocking score (deterministic, with receipts) ───────────────────────
// Same weighting the legacy AI-enrichment pipeline used, computed without an
// LLM and only over KNOWN inputs. Unknown inputs are reported, not assumed.

export interface BoondockingInputs {
  solar: Fact<SolarStatus>;
  generator: Fact<boolean>;
  freshWaterGal: Fact<number>;
  greyWaterGal: Fact<number>;
  blackWaterGal: Fact<number>;
  fourSeason: Fact<boolean>;
  lithium: Fact<boolean>;
}

export function computeBoondocking(i: BoondockingInputs): {
  score: number | null;
  knownInputs: string[];
  missingInputs: string[];
} {
  const known: string[] = [];
  const missing: string[] = [];
  let score = 0;
  let anyKnown = false;

  const power =
    i.solar.value === "installed" || i.generator.value === true;
  if (i.solar.value !== null || i.generator.value !== null) {
    anyKnown = true;
    if (power) {
      score += 25;
      known.push(i.solar.value === "installed" ? "solar installed (+25)" : "generator (+25)");
    } else if (i.solar.value === "prep") {
      score += 15;
      known.push("solar prep (+15)");
    }
  } else {
    missing.push("off-grid power (solar/generator)");
  }

  if (i.lithium.value === true) {
    score += 10;
    known.push("lithium battery (+10)");
    anyKnown = true;
  } else if (i.lithium.value === null) {
    missing.push("battery chemistry");
  }

  const fresh = i.freshWaterGal.value;
  if (fresh != null) {
    anyKnown = true;
    if (fresh >= 60) {
      score += 30;
      known.push(`${fresh} gal fresh water (+30)`);
    } else if (fresh >= 40) {
      score += 20;
      known.push(`${fresh} gal fresh water (+20)`);
    } else {
      known.push(`${fresh} gal fresh water (+0)`);
    }
  } else {
    missing.push("fresh water capacity");
  }

  const grey = i.greyWaterGal.value;
  if (grey != null) {
    anyKnown = true;
    if (grey >= 40) {
      score += 5;
      known.push(`${grey} gal grey water (+5)`);
    }
  } else {
    missing.push("grey water capacity");
  }

  const black = i.blackWaterGal.value;
  if (black != null) {
    anyKnown = true;
    if (black >= 30) {
      score += 5;
      known.push(`${black} gal black water (+5)`);
    }
  } else {
    missing.push("black water capacity");
  }

  if (i.fourSeason.value === true) {
    score += 10;
    known.push("four-season construction (+10)");
    anyKnown = true;
  } else if (i.fourSeason.value === null) {
    missing.push("four-season construction");
  }

  return {
    score: anyKnown ? Math.min(100, score) : null,
    knownInputs: known,
    missingInputs: missing,
  };
}
