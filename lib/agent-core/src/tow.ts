/**
 * Tow-vehicle reference data and fit evaluation.
 *
 * Safety posture: tow ratings vary widely by cab, bed, drivetrain, axle
 * ratio, and package — a bare "F-150" spans 5,000–13,500 lbs. So we never
 * pretend one number: with only a model name we evaluate against the RANGE
 * ("fits any configuration" vs "depends on configuration" vs "exceeds all"),
 * and when the shopper states their actual rating we plan against it with a
 * safety margin. Output is planning guidance, never a safety guarantee — and
 * it says so.
 */

import type {
  CanonicalUnit,
  TowFitResult,
  TowResolution,
  TowVehicleSpec,
  TowVerdict,
} from "./types.js";
import { TOWABLE_TYPES } from "./types.js";

/** Fraction of a stated tow rating we treat as comfortably usable. */
export const TOW_SAFETY_MARGIN = 0.8;

/**
 * Curated from manufacturer-published ratings for recent model years
 * (~2019-2025). Ranges span common configurations, not records.
 */
export const TOW_VEHICLES: TowVehicleSpec[] = [
  { key: "ford_f150", label: "Ford F-150", aliases: ["f-150", "f150", "f 150"], towLbsMin: 5000, towLbsMax: 13500, note: "Varies by engine/cab/axle; many are 7,000-11,300 lbs." },
  { key: "ford_f250", label: "Ford F-250 Super Duty", aliases: ["f-250", "f250", "f 250"], towLbsMin: 12300, towLbsMax: 20000, note: "Conventional hitch; gooseneck/5th-wheel higher." },
  { key: "ford_f350", label: "Ford F-350 Super Duty", aliases: ["f-350", "f350", "f 350"], towLbsMin: 14000, towLbsMax: 21200, note: "Conventional hitch; gooseneck/5th-wheel higher." },
  { key: "ford_ranger", label: "Ford Ranger", aliases: ["ranger"], towLbsMin: 3500, towLbsMax: 7500, note: "7,500 lbs requires the tow package." },
  { key: "ford_maverick", label: "Ford Maverick", aliases: ["maverick"], towLbsMin: 2000, towLbsMax: 4000, note: "4,000 lbs requires the 4K tow package." },
  { key: "ford_expedition", label: "Ford Expedition", aliases: ["expedition"], towLbsMin: 6000, towLbsMax: 9600, note: "Heavy-duty tow package required for the top rating." },
  { key: "ford_explorer", label: "Ford Explorer", aliases: ["explorer"], towLbsMin: 3000, towLbsMax: 5600, note: "" },
  { key: "chevrolet_silverado_1500", label: "Chevrolet Silverado 1500", aliases: ["silverado", "silverado 1500"], towLbsMin: 6700, towLbsMax: 13300, note: "Varies by engine and axle." },
  { key: "chevrolet_silverado_2500", label: "Chevrolet Silverado 2500HD", aliases: ["silverado 2500", "silverado 2500hd"], towLbsMin: 14500, towLbsMax: 18500, note: "" },
  { key: "chevrolet_silverado_3500", label: "Chevrolet Silverado 3500HD", aliases: ["silverado 3500", "silverado 3500hd"], towLbsMin: 14500, towLbsMax: 20000, note: "Conventional hitch; gooseneck higher." },
  { key: "chevrolet_suburban", label: "Chevrolet Suburban", aliases: ["suburban"], towLbsMin: 7400, towLbsMax: 8300, note: "" },
  { key: "chevrolet_tahoe", label: "Chevrolet Tahoe", aliases: ["tahoe"], towLbsMin: 7400, towLbsMax: 8400, note: "" },
  { key: "chevrolet_colorado", label: "Chevrolet Colorado", aliases: ["colorado"], towLbsMin: 3500, towLbsMax: 7700, note: "" },
  { key: "chevrolet_traverse", label: "Chevrolet Traverse", aliases: ["traverse"], towLbsMin: 1500, towLbsMax: 5000, note: "5,000 lbs requires the tow package." },
  { key: "gmc_sierra_1500", label: "GMC Sierra 1500", aliases: ["sierra", "sierra 1500"], towLbsMin: 6700, towLbsMax: 13200, note: "Varies by engine and axle." },
  { key: "gmc_yukon", label: "GMC Yukon", aliases: ["yukon", "yukon xl"], towLbsMin: 7400, towLbsMax: 8400, note: "" },
  { key: "ram_1500", label: "Ram 1500", aliases: ["ram", "ram 1500"], towLbsMin: 6100, towLbsMax: 12750, note: "Varies by engine and axle." },
  { key: "ram_2500", label: "Ram 2500", aliases: ["ram 2500"], towLbsMin: 14000, towLbsMax: 19680, note: "" },
  { key: "ram_3500", label: "Ram 3500", aliases: ["ram 3500"], towLbsMin: 15000, towLbsMax: 23000, note: "Conventional hitch; gooseneck far higher." },
  { key: "toyota_tundra", label: "Toyota Tundra", aliases: ["tundra"], towLbsMin: 8300, towLbsMax: 12000, note: "" },
  { key: "toyota_tacoma", label: "Toyota Tacoma", aliases: ["tacoma"], towLbsMin: 3500, towLbsMax: 6800, note: "6,800 lbs requires the tow package." },
  { key: "toyota_4runner", label: "Toyota 4Runner", aliases: ["4runner", "4 runner"], towLbsMin: 5000, towLbsMax: 6000, note: "" },
  { key: "toyota_sequoia", label: "Toyota Sequoia", aliases: ["sequoia"], towLbsMin: 8980, towLbsMax: 9520, note: "" },
  { key: "toyota_highlander", label: "Toyota Highlander", aliases: ["highlander"], towLbsMin: 3500, towLbsMax: 5000, note: "" },
  { key: "jeep_grand_cherokee", label: "Jeep Grand Cherokee", aliases: ["grand cherokee"], towLbsMin: 3500, towLbsMax: 7200, note: "7,200 lbs requires V8/tow package." },
  { key: "jeep_gladiator", label: "Jeep Gladiator", aliases: ["gladiator"], towLbsMin: 4000, towLbsMax: 7700, note: "" },
  { key: "nissan_titan", label: "Nissan Titan", aliases: ["titan"], towLbsMin: 9270, towLbsMax: 9660, note: "" },
  { key: "nissan_frontier", label: "Nissan Frontier", aliases: ["frontier"], towLbsMin: 6270, towLbsMax: 6720, note: "" },
  { key: "honda_ridgeline", label: "Honda Ridgeline", aliases: ["ridgeline"], towLbsMin: 5000, towLbsMax: 5000, note: "" },
  { key: "honda_pilot", label: "Honda Pilot", aliases: ["pilot"], towLbsMin: 3500, towLbsMax: 5000, note: "AWD required for 5,000 lbs." },
  { key: "dodge_durango", label: "Dodge Durango", aliases: ["durango"], towLbsMin: 6200, towLbsMax: 8700, note: "" },
];

const STANDARD_CAVEATS = [
  "Actual capacity depends on cab, bed, drivetrain, axle ratio, and package — check the door-jamb sticker and owner's manual.",
  "Payload (passengers, cargo, hitch/tongue weight) usually runs out before tow rating does.",
  "This is planning guidance from MatchRV's reference table, not a safety determination for a specific vehicle.",
];

/**
 * Resolve a free-text tow vehicle ("2024 Ford F-150", "F-150 rated 8,000 lbs")
 * to a spec + planning numbers. An explicit stated rating always wins.
 */
export function resolveTowVehicle(input: string): TowResolution {
  const text = input.trim().toLowerCase();

  const explicit = text.match(/([\d,]{4,7})\s*(?:lb|lbs|pound|#)/);
  const explicitLbs = explicit ? parseInt(explicit[1].replace(/,/g, ""), 10) : null;

  let matched: TowVehicleSpec | null = null;
  let bestLen = 0;
  for (const spec of TOW_VEHICLES) {
    for (const alias of [spec.label.toLowerCase(), ...spec.aliases]) {
      if (text.includes(alias) && alias.length > bestLen) {
        matched = spec;
        bestLen = alias.length;
      }
    }
  }

  const caveats = [...STANDARD_CAVEATS];

  if (explicitLbs && explicitLbs >= 1500 && explicitLbs <= 40000) {
    caveats.unshift(
      `Using your stated ${explicitLbs.toLocaleString()} lbs rating; "comfortable" = under ${Math.round(explicitLbs * TOW_SAFETY_MARGIN).toLocaleString()} lbs (${Math.round((1 - TOW_SAFETY_MARGIN) * 100)}% margin).`,
    );
    return {
      input,
      matched,
      statedRatingLbs: explicitLbs,
      rangeLbs: matched ? { min: matched.towLbsMin, max: matched.towLbsMax } : null,
      filterCapLbs: explicitLbs,
      comfortCapLbs: Math.round(explicitLbs * TOW_SAFETY_MARGIN),
      safetyMarginPct: Math.round((1 - TOW_SAFETY_MARGIN) * 100),
      caveats,
    };
  }

  if (matched) {
    caveats.unshift(
      `${matched.label} ratings span ${matched.towLbsMin.toLocaleString()}–${matched.towLbsMax.toLocaleString()} lbs by configuration. Filtering out anything above the top rating; results show whether a unit fits any configuration or only some. State your actual rating (e.g. "rated 8,000 lbs") for precision.`,
    );
    if (matched.note) caveats.push(matched.note);
    return {
      input,
      matched,
      statedRatingLbs: null,
      rangeLbs: { min: matched.towLbsMin, max: matched.towLbsMax },
      filterCapLbs: matched.towLbsMax,
      comfortCapLbs: Math.round(matched.towLbsMin * TOW_SAFETY_MARGIN),
      safetyMarginPct: Math.round((1 - TOW_SAFETY_MARGIN) * 100),
      caveats,
    };
  }

  caveats.unshift(
    "Vehicle not in MatchRV's reference table — provide the tow rating from the owner's manual (e.g. \"rated 8,000 lbs\") for weight-aware matching.",
  );
  return {
    input,
    matched: null,
    statedRatingLbs: null,
    rangeLbs: null,
    filterCapLbs: null,
    comfortCapLbs: null,
    safetyMarginPct: Math.round((1 - TOW_SAFETY_MARGIN) * 100),
    caveats,
  };
}

/** Evaluate one unit against a tow resolution. Honest about which weight was used. */
export function evaluateTowFit(unit: CanonicalUnit, tow: TowResolution): TowFitResult {
  if (!TOWABLE_TYPES.includes(unit.rvType)) {
    return {
      unitId: unit.id,
      verdict: "not_towable",
      comparedWeightLbs: null,
      comparedWeightField: null,
      detail: `${unit.title} is a drivable ${unit.rvType.replace(/_/g, " ")}, not a towable.`,
    };
  }

  const gvwr = unit.gvwrLbs.value;
  const dry = unit.dryWeightLbs.value;
  const field = gvwr != null ? "gvwrLbs" : dry != null ? "dryWeightLbs" : null;
  const weight = gvwr ?? dry;

  if (field == null || weight == null) {
    return {
      unitId: unit.id,
      verdict: "unknown",
      comparedWeightLbs: null,
      comparedWeightField: null,
      detail: "Dealer listing omits both GVWR and dry weight — weight fit cannot be verified.",
    };
  }

  const basis =
    field === "gvwrLbs"
      ? "GVWR (loaded max)"
      : "dry weight (GVWR unknown; loaded weight typically runs 1,000-1,500+ lbs higher)";

  let verdict: TowVerdict;
  let detail: string;

  if (tow.statedRatingLbs != null) {
    const rating = tow.statedRatingLbs;
    const comfort = tow.comfortCapLbs ?? Math.round(rating * TOW_SAFETY_MARGIN);
    if (weight <= comfort) verdict = "fits_with_margin";
    else if (weight <= rating) verdict = "marginal";
    else verdict = "exceeds";
    detail = `${weight.toLocaleString()} lbs ${basis} vs your ${rating.toLocaleString()} lbs rating (comfort cap ${comfort.toLocaleString()}).`;
  } else if (tow.rangeLbs != null) {
    const { min, max } = tow.rangeLbs;
    if (weight <= Math.round(min * TOW_SAFETY_MARGIN)) verdict = "fits_with_margin";
    else if (weight <= min) verdict = "marginal";
    else if (weight <= max) verdict = "depends_on_config";
    else verdict = "exceeds";
    detail = `${weight.toLocaleString()} lbs ${basis} vs ${tow.matched?.label} range ${min.toLocaleString()}–${max.toLocaleString()} lbs.`;
  } else {
    return {
      unitId: unit.id,
      verdict: "unknown",
      comparedWeightLbs: weight,
      comparedWeightField: field,
      detail: "No usable tow rating — provide vehicle details or a stated rating.",
    };
  }

  // A dry-weight-only basis can't support a confident green light.
  if (verdict === "fits_with_margin" && field === "dryWeightLbs") {
    verdict = "marginal";
    detail += " Downgraded to marginal because only dry weight is verified.";
  }

  return { unitId: unit.id, verdict, comparedWeightLbs: weight, comparedWeightField: field, detail };
}
