/**
 * Fit-ranking rules: budget as a shopping band, heavy-tow veto, motorhome
 * length ceiling, early shortlist readiness, and browse (swipe) diversity.
 * Deterministic — no LLM.
 */

import type { BuyerProfile } from "./discovery.js";
import type { CanonicalUnit, Constraints, RvType, UnitMatch } from "./types.js";
import { towingOf } from "./motorhome.js";

const MOTOR_TYPES: RvType[] = ["class_a", "class_b", "class_c"];
const TOWABLE_TYPES: RvType[] = ["travel_trailer", "fifth_wheel", "toy_hauler", "popup_camper"];

function isMotorizedSearch(p: Pick<BuyerProfile, "rvTypes">): boolean {
  const t = p.rvTypes ?? [];
  return t.length > 0 && t.every((x) => MOTOR_TYPES.includes(x));
}
function isTowableSearch(p: Pick<BuyerProfile, "rvTypes" | "models">): boolean {
  const t = p.rvTypes ?? [];
  return t.length > 0 && t.every((x) => TOWABLE_TYPES.includes(x as RvType));
}

/** Normal Class A / Super C motorhomes top out around this length. */
export const MOTORHOME_LENGTH_CEILING_FT = 45;

/** At most this many cards from one dealer in the first browse/swipe window. */
export const MAX_PER_DEALER_BROWSE = 2;

const HEAVY_TOW_RE =
  /\b(?:race\s*(?:truck|trailer|car|rig)|enclosed\s*(?:car\s*)?trailer|car\s*hauler|heavy\s*(?:tow|trailer|haul)|equipment\s*trailer|dump\s*trailer|gooseneck|toy\s*hauler\s*trailer|landscape\s*trailer|utility\s*trailer\s*(?:full|heavy)|must\s*tow\s*heavy|tow(?:ing)?\s*heavy)\b/i;

/** True when the shopper's words mean they need serious hitch capacity behind a motorhome. */
export function isHeavyTowIntent(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (!t || /^(?:nothing|none|no|n\/a)$/i.test(t)) return false;
  return HEAVY_TOW_RE.test(t);
}

/** Class B / camper-van style units are never a fit for full-time + heavy tow. */
export function isWrongClassForHeavyTow(unit: CanonicalUnit): boolean {
  if (unit.rvType === "class_b") return true;
  const blob = `${unit.title} ${unit.make} ${unit.model}`.toLowerCase();
  return /\b(?:camper\s*van|class\s*b\b|sequence\b|travato|revel\b|interstate\s*nineteen|atalanta)\b/.test(blob);
}

/** Hitch rating that can never clear a heavy-tow veto (missing or zero). */
export function hitchFailsHeavyTow(unit: CanonicalUnit): boolean {
  const hitch = towingOf(unit).hitchTowRatingLbs.value;
  return hitch === null || hitch <= 0;
}

export function budgetKnown(p: BuyerProfile): boolean {
  if (p.budgetDeclined) return true;
  if (p.budgetMaxUsd != null || p.cashBudgetUsd != null || p.outTheDoorBudgetUsd != null) return true;
  if (p.paymentMethod === "finance" || p.paymentMethod === "special_finance") {
    return p.monthlyPaymentUsd != null || p.downPaymentUsd != null;
  }
  return p.paymentMethod === "cash" && (p.budgetMaxUsd != null || p.cashBudgetUsd != null || p.outTheDoorBudgetUsd != null);
}

export function lengthKnown(p: BuyerProfile): boolean {
  return p.lengthMaxFt != null || p.noLengthLimit === true;
}

export function towKnown(p: BuyerProfile): boolean {
  if (isTowableSearch(p)) {
    return Boolean(p.towVehicle) || p.towVehicleUnknown === true || p.truckTowRatingLbs != null;
  }
  if (isMotorizedSearch(p)) return p.towingBehind != null;
  return Boolean(p.towVehicle) || p.towVehicleUnknown === true || p.truckTowRatingLbs != null || p.towingBehind != null;
}

/**
 * Budget + length + tow are enough for an early 3-card shortlist.
 * Remaining Product Selection questions stay open but do not block results.
 */
export function earlyProductReady(p: BuyerProfile): boolean {
  return budgetKnown(p) && lengthKnown(p) && towKnown(p);
}

/** Interview step ids that may wait until after the early shortlist. */
export const EARLY_NONBLOCKING_STEPS = new Set([
  "rv_type",
  "use",
  "activities",
  "vacation",
  "who_going",
  "buyers",
  "trade",
  "trade_details",
  "trips",
  "length_reason",
  "length_flex",
  "tow_payload",
]);

/**
 * Comfort +2 ft is never offered when it would invent a non-normal motorhome length
 * (e.g. stretching a 45-ft Class A cap to 47).
 */
export function shouldOfferLengthFlex(p: BuyerProfile): boolean {
  if (p.lengthMaxFt == null || p.lengthReason !== "comfort" || p.lengthFlexApproved != null) return false;
  if (isMotorizedSearch(p) && p.lengthMaxFt + 2 > MOTORHOME_LENGTH_CEILING_FT) return false;
  // Undeclared type but a long "motorhome-sized" cap: still don't invent 47+.
  if (!p.rvTypes?.length && p.lengthMaxFt >= 40 && p.lengthMaxFt + 2 > MOTORHOME_LENGTH_CEILING_FT) return false;
  return true;
}

/** Effective length after flex, capped for motorhomes. */
export function cappedEffectiveLengthMaxFt(stated: number, flexApproved: boolean, motorized: boolean): number {
  const raw = flexApproved ? stated + 2 : stated;
  if (motorized) return Math.min(raw, MOTORHOME_LENGTH_CEILING_FT);
  return raw;
}

/**
 * Budget is a shopping BAND, not a race to the floor.
 * Peak score near ~75–90% of the ceiling; deep-under-budget units get little or no bonus.
 */
export function budgetBandPoints(priceUsd: number, budgetMaxUsd: number): { points: number; label: string } {
  if (!(budgetMaxUsd > 0) || !(priceUsd >= 0) || priceUsd > budgetMaxUsd) {
    return { points: 0, label: "" };
  }
  const ratio = priceUsd / budgetMaxUsd;
  // Peak at 0.82 of budget. Full points (±0) within ~0.12; tapers to 0 by ±0.45.
  const dist = Math.abs(ratio - 0.82);
  let points = 0;
  if (ratio >= 0.35) {
    points = Math.round(Math.max(0, 1 - dist / 0.45) * 12);
  } else {
    // Far below the band (e.g. $58k vs $350k): at most 1 soft point, never the old "under budget" jackpot.
    points = ratio >= 0.15 ? 1 : 0;
  }
  const label =
    points > 0
      ? ratio >= 0.55
        ? `in budget band (${Math.round(ratio * 100)}% of ceiling)`
        : `well under budget band (${Math.round(ratio * 100)}% of ceiling)`
      : "";
  return { points, label };
}

/** Soft fit signals that should beat pure distance sorting. */
export function hasFitSignals(c: Constraints): boolean {
  return Boolean(
    c.priceMaxUsd != null ||
      c.priceMinUsd != null ||
      c.trailerWeightLbs != null ||
      c.heavyTowRequired ||
      c.towVehicle ||
      c.fuelType ||
      c.horsepowerMin != null ||
      c.torqueMinLbFt != null ||
      (c.prefer && c.prefer.length) ||
      (c.mustHave && c.mustHave.length) ||
      c.sherpa?.floorplanIntent ||
      c.sherpa?.campingStyle ||
      (c.makes && c.makes.length) ||
      (c.models && c.models.length),
  );
}

/** Location-only browse/swipe: no budget, tow, or type filters yet. */
export function isBrowseMode(c: Constraints): boolean {
  if (!c.location?.place) return false;
  return !hasFitSignals(c) && !(c.rvTypes && c.rvTypes.length) && c.sleepsMin == null && c.lengthMaxFt == null;
}

/**
 * Spread dealers (max per dealer) and prefer class variety in the first window.
 * Used for swipe/browse decks so one lot of cheap vans cannot fill the shortlist.
 */
/** Re-order so the first `windowSize` cards respect max-per-dealer (and light class mix). */
export function diversifyMatches(list: UnitMatch[], maxPerDealer = MAX_PER_DEALER_BROWSE, windowSize = 10): UnitMatch[] {
  const dealerCount = new Map<string, number>();
  const typeCount = new Map<string, number>();
  const head: UnitMatch[] = [];
  const rest: UnitMatch[] = [];

  for (const m of list) {
    if (head.length >= windowSize) {
      rest.push(m);
      continue;
    }
    const dealer = m.unit.dealer.id || m.unit.dealer.name;
    const dtype = m.unit.rvType;
    const dN = dealerCount.get(dealer) ?? 0;
    if (dN >= maxPerDealer) {
      rest.push(m);
      continue;
    }
    const tN = typeCount.get(dtype) ?? 0;
    if (head.length < 6 && tN >= 2) {
      const laterOther = list.slice(list.indexOf(m) + 1).some((x) => {
        if (x.unit.rvType === dtype) return false;
        const xd = x.unit.dealer.id || x.unit.dealer.name;
        return (dealerCount.get(xd) ?? 0) < maxPerDealer;
      });
      if (laterOther) {
        rest.push(m);
        continue;
      }
    }
    head.push(m);
    dealerCount.set(dealer, dN + 1);
    typeCount.set(dtype, tN + 1);
  }
  return [...head, ...rest];
}

/** Radii to try when the local lot cannot fill a 3-unit shortlist. */
export const RADIUS_EXPAND_STEPS_MI = [150, 300, 500, 1000];

export function nextExpandedRadius(current: number): number | null {
  for (const r of RADIUS_EXPAND_STEPS_MI) {
    if (r > current) return r;
  }
  return null;
}
