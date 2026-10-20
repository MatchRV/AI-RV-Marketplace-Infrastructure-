/**
 * Motorhome "Powertrain & Towing": what powers it, what it can carry, what it
 * can tow. Engine output never overrides weight limits, and no single rating
 * (e.g. a hitch rating) is treated as proof the whole combination fits.
 */

import type { CanonicalUnit, Fact, MotorhomeTowing, Powertrain } from "./types.js";
import { TOWABLE_TYPES } from "./types.js";

const UNKNOWN: Fact<never> = { value: null, source: null, confidence: null };

export function emptyPowertrain(): Powertrain {
  return {
    fuelType: UNKNOWN, engine: UNKNOWN, horsepower: UNKNOWN, horsepowerRpm: UNKNOWN,
    torqueLbFt: UNKNOWN, torqueRpm: UNKNOWN, transmission: UNKNOWN, chassis: UNKNOWN, engineBrake: UNKNOWN,
  };
}

export function emptyTowing(): MotorhomeTowing {
  return {
    cargoCapacityLbs: UNKNOWN, gcwrLbs: UNKNOWN, frontAxleRatingLbs: UNKNOWN,
    rearAxleRatingLbs: UNKNOWN, hitchTowRatingLbs: UNKNOWN, tongueWeightLimitLbs: UNKNOWN,
  };
}

export const isMotorized = (u: CanonicalUnit) => !TOWABLE_TYPES.includes(u.rvType);
export const powertrainOf = (u: CanonicalUnit): Powertrain => ({ ...emptyPowertrain(), ...u.powertrain });
export const towingOf = (u: CanonicalUnit): MotorhomeTowing => ({ ...emptyTowing(), ...u.towing });

/** Shopper-facing verification status for one fact. */
export function verificationStatus(f: Fact<unknown>): "listed_by_dealer" | "parsed_from_dealer_text" | "needs_verification" {
  if (f.value === null) return "needs_verification";
  return f.source === "dealer_listing" ? "listed_by_dealer" : "parsed_from_dealer_text";
}

export type LimitStatus = "pass" | "fail" | "needs_verification";

export interface LimitCheck {
  limit: string;
  status: LimitStatus;
  detail: string;
}

export interface MotorhomeTowResult {
  unitId: string;
  trailerWeightLbs: number;
  /** "not_a_motorhome" | "exceeds_a_limit" | "coach_overloaded" | "not_yet_confirmed". Never "safe". */
  verdict: "not_a_motorhome" | "coach_overloaded" | "exceeds_a_limit" | "not_yet_confirmed";
  checks: LimitCheck[];
  summary: string;
}

const lbs = (n: number) => `${Math.round(n).toLocaleString()} lb`;

/**
 * Evaluate a loaded trailer against each applicable motorhome limit
 * separately. A full confirmation needs weighed coach + axle loads and the
 * trailer's tongue load, which MatchRV never has — so the best possible
 * verdict is "not_yet_confirmed", with every rating that does clear shown.
 */
export function evaluateMotorhomeTow(
  unit: CanonicalUnit,
  trailerWeightLbs: number,
  opts: { tongueLbs?: number | null; coachLoadedLbs?: number | null } = {},
): MotorhomeTowResult {
  const base = { unitId: unit.id, trailerWeightLbs };
  if (!isMotorized(unit)) {
    return { ...base, verdict: "not_a_motorhome", checks: [], summary: `${unit.title} is a towable RV, not a motorhome; it cannot tow a trailer.` };
  }
  const t = towingOf(unit);
  const gvwr = unit.gvwrLbs.value;
  const loaded = opts.coachLoadedLbs ?? null;
  const checks: LimitCheck[] = [];

  // 1. The coach must be within its own GVWR before any towing allowance exists.
  if (loaded !== null && gvwr !== null) {
    checks.push(loaded > gvwr
      ? { limit: "loaded coach ≤ GVWR", status: "fail", detail: `Loaded coach ${lbs(loaded)} exceeds GVWR ${lbs(gvwr)} by ${lbs(loaded - gvwr)} — already overloaded before towing.` }
      : { limit: "loaded coach ≤ GVWR", status: "pass", detail: `Loaded coach ${lbs(loaded)} within GVWR ${lbs(gvwr)}.` });
  } else {
    checks.push({ limit: "loaded coach ≤ GVWR", status: "needs_verification", detail: gvwr === null ? "GVWR not published for this unit; loaded coach weight unknown." : `GVWR ${lbs(gvwr)}; loaded (weighed) coach weight unknown.` });
  }

  // 2. Hitch receiver rating.
  const hitch = t.hitchTowRatingLbs.value;
  checks.push(hitch === null
    ? { limit: "trailer ≤ hitch tow rating", status: "needs_verification", detail: "Hitch towing rating not published." }
    : trailerWeightLbs > hitch
      ? { limit: "trailer ≤ hitch tow rating", status: "fail", detail: `Trailer ${lbs(trailerWeightLbs)} exceeds hitch rating ${lbs(hitch)}.` }
      : { limit: "trailer ≤ hitch tow rating", status: "pass", detail: `Trailer ${lbs(trailerWeightLbs)} within hitch rating ${lbs(hitch)}.` });

  // 3. Combined weight. Using GVWR as the coach weight is conservative: if
  //    GVWR + trailer fits, any legal coach load fits. If it doesn't, the
  //    answer depends on the weighed coach.
  const gcwr = t.gcwrLbs.value;
  if (gcwr === null) {
    checks.push({ limit: "coach + trailer ≤ GCWR", status: "needs_verification", detail: "GCWR not published." });
  } else {
    const coach = loaded ?? gvwr;
    if (coach === null) {
      checks.push({ limit: "coach + trailer ≤ GCWR", status: "needs_verification", detail: `GCWR ${lbs(gcwr)}; coach weight unknown.` });
    } else if (coach + trailerWeightLbs <= gcwr) {
      checks.push({ limit: "coach + trailer ≤ GCWR", status: "pass", detail: `${loaded !== null ? "Loaded coach" : "GVWR"} ${lbs(coach)} + trailer ${lbs(trailerWeightLbs)} = ${lbs(coach + trailerWeightLbs)} ≤ GCWR ${lbs(gcwr)}.` });
    } else if (loaded !== null) {
      checks.push({ limit: "coach + trailer ≤ GCWR", status: "fail", detail: `Loaded coach + trailer ${lbs(loaded + trailerWeightLbs)} exceeds GCWR ${lbs(gcwr)}.` });
    } else {
      checks.push({ limit: "coach + trailer ≤ GCWR", status: "needs_verification", detail: `GVWR + trailer ${lbs(coach + trailerWeightLbs)} exceeds GCWR ${lbs(gcwr)}; fits only if the weighed coach is ≤ ${lbs(gcwr - trailerWeightLbs)}.` });
    }
  }

  // 4. Tongue weight limit.
  const tongueLimit = t.tongueWeightLimitLbs.value;
  const tongue = opts.tongueLbs ?? null;
  checks.push(tongueLimit === null
    ? { limit: "tongue load ≤ tongue limit", status: "needs_verification", detail: "Tongue-weight limit not published." }
    : tongue === null
      ? { limit: "tongue load ≤ tongue limit", status: "needs_verification", detail: `Tongue limit ${lbs(tongueLimit)}; trailer tongue load not provided.` }
      : tongue > tongueLimit
        ? { limit: "tongue load ≤ tongue limit", status: "fail", detail: `Tongue load ${lbs(tongue)} exceeds limit ${lbs(tongueLimit)}.` }
        : { limit: "tongue load ≤ tongue limit", status: "pass", detail: `Tongue load ${lbs(tongue)} within limit ${lbs(tongueLimit)}.` });

  // 5. Axle ratings: tongue load shifts weight to the rear axle; only a scale can confirm.
  const axles = [t.frontAxleRatingLbs.value, t.rearAxleRatingLbs.value];
  checks.push({ limit: "axle loads ≤ axle ratings", status: "needs_verification", detail: axles.some(a => a !== null) ? `Axle ratings front ${axles[0] === null ? "unknown" : lbs(axles[0])}, rear ${axles[1] === null ? "unknown" : lbs(axles[1])}; actual axle loads with the trailer hitched need weighing.` : "Axle ratings not published; actual axle loads need weighing." });

  const overloaded = checks[0].status === "fail";
  const anyFail = checks.some(c => c.status === "fail");
  const verdict = overloaded ? "coach_overloaded" : anyFail ? "exceeds_a_limit" : "not_yet_confirmed";
  const cleared = checks.filter(c => c.status === "pass").map(c => c.limit);
  const summary = overloaded
    ? `${checks[0].detail} Resolve the overload before considering any trailer.`
    : anyFail
      ? `Does not fit a ${lbs(trailerWeightLbs)} trailer: ${checks.filter(c => c.status === "fail").map(c => c.detail).join(" ")}`
      : `Fit for a ${lbs(trailerWeightLbs)} trailer not yet confirmed.${cleared.length ? ` Published ratings cleared: ${cleared.join("; ")}.` : ""} Still needs: ${checks.filter(c => c.status === "needs_verification").map(c => c.limit).join("; ")}.`;
  return { ...base, verdict, checks, summary };
}

/** Shopper-facing "Powertrain & Towing" section for a Match Report / get_rv. */
export function powertrainReport(unit: CanonicalUnit): Record<string, unknown> | null {
  if (!isMotorized(unit)) return null;
  const p = powertrainOf(unit);
  const t = towingOf(unit);
  const row = (f: Fact<unknown>) => ({ value: f.value, status: verificationStatus(f), ...(f.source ? { source: f.source } : {}), ...(f.note ? { note: f.note } : {}) });
  return {
    whatPowersIt: {
      fuelType: row(p.fuelType), engine: row(p.engine), horsepower: row(p.horsepower), horsepowerRpm: row(p.horsepowerRpm),
      torqueLbFt: row(p.torqueLbFt), torqueRpm: row(p.torqueRpm), transmission: row(p.transmission), chassis: row(p.chassis), engineBrake: row(p.engineBrake),
    },
    whatItCanCarry: { uvwLbs: row(unit.dryWeightLbs), cargoCapacityLbs: row(t.cargoCapacityLbs), gvwrLbs: row(unit.gvwrLbs), frontAxleRatingLbs: row(t.frontAxleRatingLbs), rearAxleRatingLbs: row(t.rearAxleRatingLbs) },
    whatItCanTow: { hitchTowRatingLbs: row(t.hitchTowRatingLbs), tongueWeightLimitLbs: row(t.tongueWeightLimitLbs), gcwrLbs: row(t.gcwrLbs) },
    legend: "listed_by_dealer = the dealer's listing states it for this unit; parsed_from_dealer_text = stated in the dealer's description; needs_verification = not published. None of these are manufacturer-verified. Horsepower and torque describe engine output only; GVWR, GCWR, axle, hitch and tongue limits apply separately.",
  };
}
