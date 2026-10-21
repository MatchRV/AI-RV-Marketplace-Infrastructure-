/**
 * Listing-level reconciliation of model year, condition and location.
 *
 * Why this exists (Oct 2026 audit of the 84k snapshot):
 *  - Model year: ~18.9k units carry a structured `year` that disagrees with the
 *    year printed in the dealer's own title (16k of them Camping World, e.g.
 *    title "2016 JAYCO JAY SERIES 1207UD" with year 2026). The VIN's 10th
 *    character agrees with the TITLE in 16,519 of those cases and with the
 *    structured field in only 265, so the title (VIN as tiebreaker) wins.
 *  - Condition: harvests label stock "new" by default; a 2011 Salem labelled
 *    new is old stock or a scrape default, not new. A shopper asking for new
 *    must never see units older than (current year - 1), or units the listing
 *    itself calls used / pre-owned.
 *  - Location: General RV's titles end "… at General RV | Jacksonville, FL"
 *    while every unit was filed under the HQ city (Wayland, MI). The listing's
 *    own location is the store that has the unit.
 *
 * Browser-safe (no node built-ins): agent-core is bundled into the client.
 */
import type { CanonicalUnit } from "./types.js";

const MIN_YEAR = 1970;
const maxYear = (now: Date) => now.getFullYear() + 2;

/** First plausible 4-digit model year in the listing title. */
export function titleModelYear(title: string | null | undefined, now = new Date()): number | null {
  const re = /\b(19[7-9]\d|20\d{2})\b/g;
  for (const m of (title ?? "").matchAll(re)) {
    const y = Number(m[1]);
    if (y >= MIN_YEAR && y <= maxYear(now)) return y;
  }
  return null;
}

const VIN_YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789"; // 1980 (A) … 2009 (9), then repeats from 2010.
/** Model year from VIN position 10 (30-year cycle resolved to the latest plausible year). */
export function vinModelYear(vin: string | null | undefined, now = new Date()): number | null {
  if (!vin || vin.length !== 17) return null;
  const i = VIN_YEAR_CODES.indexOf(vin[9].toUpperCase());
  if (i < 0) return null;
  let y = 1980 + i;
  while (y + 30 <= now.getFullYear() + 1) y += 30;
  return y;
}

/**
 * Best-evidence model year. Structured year and title year agree → that.
 * Otherwise the VIN breaks the tie; with no VIN agreement the dealer's own
 * title wins over the structured field (the field is the one that drifts).
 */
export function effectiveModelYear(unit: Pick<CanonicalUnit, "year" | "title" | "vin">, now = new Date()): { year: number; source: "structured" | "title" | "vin" } {
  const t = titleModelYear(unit.title, now);
  if (t === null || t === unit.year) return { year: unit.year, source: "structured" };
  const v = vinModelYear(unit.vin, now);
  if (v === unit.year) return { year: unit.year, source: "vin" };
  return { year: t, source: "title" };
}

/** The listing text itself says used / pre-owned. */
export function titleSaysUsed(title: string | null | undefined): boolean {
  return /\b(?:used|pre[- ]?owned)\b/i.test(title ?? "");
}

/** Oldest model year that can be called new: current year - 1. */
export function oldestNewModelYear(now = new Date()): number {
  return now.getFullYear() - 1;
}

/** True when a unit may be shown for condition=new. */
export function qualifiesAsNew(unit: Pick<CanonicalUnit, "condition" | "year" | "title">, now = new Date()): boolean {
  return unit.condition === "new" && unit.year >= oldestNewModelYear(now) && !titleSaysUsed(unit.title);
}

export interface ReconcileResult { yearCorrected: boolean; conditionCorrected: boolean }

/** Mutates the unit: corrects year from listing evidence, then demotes implausible "new". */
export function reconcileYearAndCondition(unit: CanonicalUnit, now = new Date()): ReconcileResult {
  const eff = effectiveModelYear(unit, now);
  const yearCorrected = eff.year !== unit.year;
  if (yearCorrected) unit.year = eff.year;
  let conditionCorrected = false;
  if (unit.condition === "new" && (unit.year < oldestNewModelYear(now) || titleSaysUsed(unit.title))) {
    unit.condition = "used";
    conditionCorrected = true;
  }
  return { yearCorrected, conditionCorrected };
}

/** "… at General RV | Jacksonville, FL" → { city: "Jacksonville", state: "FL" }. */
export function listingLocationFromTitle(title: string | null | undefined): { city: string; state: string } | null {
  const m = /\|\s*([A-Za-z][A-Za-z .'-]*?),\s*([A-Z]{2})\s*$/.exec(title ?? "");
  if (!m || !US_STATE_CODES.has(m[2])) return null;
  return { city: m[1].trim(), state: m[2] };
}

/**
 * Candidate city names from a scraped dealer city, most literal first.
 * Handles street-glued values ("Pacific Hwy EFife" → "Fife",
 * "E Knox AveLiberty Lake" → "Liberty Lake") and street prefixes
 * ("W. Deer Valley Rd Phoenix" → "Phoenix"). Callers must still verify each
 * candidate against a state-qualified gazetteer; nothing here is trusted alone.
 */
export function dealerCityCandidates(city: string | null | undefined): string[] {
  const raw = (city ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const out = [raw];
  // last capital glued to the previous letter/period without a space
  let glue = -1;
  for (let i = 1; i < raw.length; i++) {
    if (/[A-Z]/.test(raw[i]) && /[A-Za-z.]/.test(raw[i - 1]) && (i + 1 < raw.length && /[a-z]/.test(raw[i + 1]))) glue = i;
  }
  if (glue > 0) out.push(raw.slice(glue).trim());
  const words = raw.split(" ");
  for (let k = 1; k < words.length; k++) out.push(words.slice(k).join(" "));
  return [...new Set(out.filter((c) => c.length >= 3))];
}

/** City named in a dealer's display name: "Lazydays RV of Vancouver", "ClickIt RV - Union Gap". */
export function cityFromDealerName(name: string | null | undefined): string | null {
  const m = /(?:\s[-–]\s|\bof\s)([A-Za-z][A-Za-z .']+?)\s*$/i.exec(name ?? "");
  return m ? m[1].trim() : null;
}

export const US_STATE_CODES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "),
);

/** Gazetteer key: "jacksonville|FL". Saint/St., Mount/Mt. and punctuation are folded. */
export function cityKey(city: string, state: string): string {
  const c = city.toLowerCase()
    .replace(/\./g, " ")
    .replace(/\bsaint\b/g, "st")
    .replace(/\bmt\b/g, "mount")
    .replace(/\bft\b/g, "fort")
    .replace(/[^a-z' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${c}|${state.toUpperCase()}`;
}
