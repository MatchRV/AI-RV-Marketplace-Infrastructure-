/**
 * The deterministic matching engine.
 *
 * Every hard constraint evaluates three-valued: pass / fail / unknown.
 * Units with a fail are excluded (and counted, per constraint). Units with
 * no fail but at least one unknown are "unverified" — surfaced below
 * verified matches and clearly flagged, never silently included or dropped.
 * Soft preferences never exclude; they move a documented, deterministic
 * score. No LLM anywhere in this file — the shopper's own agent does the
 * natural-language reasoning; MatchRV does the arithmetic.
 */

import type {
  CanonicalUnit,
  CheckStatus,
  ConstraintCheck,
  Constraints,
  FeatureKey,
  SearchOutcome,
  SoftCheck,
  TowResolution,
  UnitMatch,
} from "./types.js";
import { haversineMiles, knownPlaces, resolvePlace } from "./geo.js";
import { evaluateTowFit, resolveTowVehicle } from "./tow.js";

export class ConstraintError extends Error {
  constructor(
    message: string,
    public readonly hint: string,
  ) {
    super(message);
    this.name = "ConstraintError";
  }
}

// ── Constraint merging (shared shopping session semantics) ────────────────

/**
 * Merge an incoming partial constraint update into the current session
 * constraints. `refine` keeps everything not mentioned; an explicit null
 * clears a key. `replace` starts over from the incoming set.
 */
export function mergeConstraints(
  current: Constraints,
  incoming: Constraints,
  mode: "refine" | "replace",
): Constraints {
  if (mode === "replace") return stripNulls(incoming);
  const merged: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(incoming)) {
    if (v === undefined) continue;
    if (v === null) delete merged[k];
    else merged[k] = v;
  }
  return merged as Constraints;
}

function stripNulls(c: Constraints): Constraints {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out as Constraints;
}

// ── Feature access ─────────────────────────────────────────────────────────

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  bunkhouse: "bunkhouse",
  solar: "solar installed",
  solar_prep: "solar installed or prepped",
  lithium: "lithium battery",
  generator: "generator",
  four_season: "four-season package",
  outdoor_kitchen: "outdoor kitchen",
  two_entry_doors: "two entry doors",
};

/** true / false / null(unknown) for a feature on a unit. */
export function featureValue(unit: CanonicalUnit, f: FeatureKey): boolean | null {
  switch (f) {
    case "bunkhouse":
      return unit.bunkhouse.value;
    case "solar":
      return unit.solar.value === null ? null : unit.solar.value === "installed";
    case "solar_prep":
      return unit.solar.value === null ? null : unit.solar.value !== "none";
    case "lithium":
      return unit.lithiumBattery.value;
    case "generator":
      return unit.generator.value;
    case "four_season":
      return unit.fourSeason.value;
    case "outdoor_kitchen":
      return unit.outdoorKitchen.value;
    case "two_entry_doors":
      return unit.entryDoors.value === null ? null : unit.entryDoors.value >= 2;
  }
}

function featureSource(unit: CanonicalUnit, f: FeatureKey) {
  switch (f) {
    case "bunkhouse":
      return unit.bunkhouse.source;
    case "solar":
    case "solar_prep":
      return unit.solar.source;
    case "lithium":
      return unit.lithiumBattery.source;
    case "generator":
      return unit.generator.source;
    case "four_season":
      return unit.fourSeason.source;
    case "outdoor_kitchen":
      return unit.outdoorKitchen.source;
    case "two_entry_doors":
      return unit.entryDoors.source;
  }
}

// ── Search context (resolved once per search) ──────────────────────────────

export interface SearchContext {
  constraints: Constraints;
  tow: TowResolution | null;
  location: { place: string; lat: number; lng: number; radiusMiles: number } | null;
}

export function buildContext(constraints: Constraints): SearchContext {
  let location: SearchContext["location"] = null;
  if (constraints.location?.place) {
    const resolved = resolvePlace(constraints.location.place);
    if (!resolved) {
      const popular = ["Tacoma", "Seattle", "Spokane", "Olympia", "Everett", "Vancouver", "Bellingham", "Yakima", "Portland"];
      const rest = knownPlaces().filter((p) => !popular.includes(p));
      throw new ConstraintError(
        `Unknown place "${constraints.location.place}" — MatchRV's demo footprint covers the Pacific Northwest.`,
        `Try one of: ${[...popular, ...rest.slice(0, 30)].join(", ")} …`,
      );
    }
    location = {
      place: resolved.canonical,
      lat: resolved.lat,
      lng: resolved.lng,
      radiusMiles: constraints.location.radiusMiles,
    };
  }
  const tow = constraints.towVehicle ? resolveTowVehicle(constraints.towVehicle) : null;
  return { constraints, tow, location };
}

// ── Per-unit evaluation ────────────────────────────────────────────────────

const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString()}`;

function check(
  constraint: string,
  status: CheckStatus,
  actual: string,
  source: ConstraintCheck["source"],
): ConstraintCheck {
  return { constraint, status, actual, source };
}

function cmpMax(
  label: string,
  factValue: number | null,
  factSource: ConstraintCheck["source"],
  max: number,
  fmt: (n: number) => string,
  unknownField: string,
  unknowns: string[],
): ConstraintCheck {
  if (factValue === null) {
    unknowns.push(unknownField);
    return check(`${label} ≤ ${fmt(max)}`, "unknown", "unknown", null);
  }
  return check(
    `${label} ≤ ${fmt(max)}`,
    factValue <= max ? "pass" : "fail",
    fmt(factValue),
    factSource,
  );
}

export function evaluateUnit(unit: CanonicalUnit, ctx: SearchContext): UnitMatch {
  const c = ctx.constraints;
  const hardChecks: ConstraintCheck[] = [];
  const softChecks: SoftCheck[] = [];
  const unknowns: string[] = [];
  const breakdown: { label: string; points: number }[] = [];

  // — hard: rv type
  if (c.rvTypes && c.rvTypes.length > 0) {
    hardChecks.push(
      check(
        `type in [${c.rvTypes.join(", ")}]`,
        c.rvTypes.includes(unit.rvType) ? "pass" : "fail",
        unit.rvType,
        "dealer_listing",
      ),
    );
  }

  // — hard: condition
  if (c.condition && c.condition !== "any") {
    hardChecks.push(
      check(`condition = ${c.condition}`, unit.condition === c.condition ? "pass" : "fail", unit.condition, "dealer_listing"),
    );
  }

  // — hard: price
  const price = unit.priceUsd.value;
  if (c.priceMaxUsd != null) {
    hardChecks.push(
      price === null
        ? check(`price ≤ ${fmtUsd(c.priceMaxUsd)}`, "unknown", "unknown", null)
        : check(`price ≤ ${fmtUsd(c.priceMaxUsd)}`, price <= c.priceMaxUsd ? "pass" : "fail", fmtUsd(price), unit.priceUsd.source),
    );
  }
  if (c.priceMinUsd != null && price !== null) {
    hardChecks.push(
      check(`price ≥ ${fmtUsd(c.priceMinUsd)}`, price >= c.priceMinUsd ? "pass" : "fail", fmtUsd(price), unit.priceUsd.source),
    );
  }

  // — hard: length
  if (c.lengthMaxFt != null) {
    hardChecks.push(
      cmpMax("length", unit.lengthFt.value, unit.lengthFt.source, c.lengthMaxFt, (n) => `${n} ft`, "lengthFt", unknowns),
    );
  }
  if (c.lengthMinFt != null && unit.lengthFt.value !== null) {
    hardChecks.push(
      check(`length ≥ ${c.lengthMinFt} ft`, unit.lengthFt.value >= c.lengthMinFt ? "pass" : "fail", `${unit.lengthFt.value} ft`, unit.lengthFt.source),
    );
  }

  // — hard: explicit unit weight cap
  const unitWeight = unit.gvwrLbs.value ?? unit.dryWeightLbs.value;
  const weightSource = unit.gvwrLbs.value != null ? unit.gvwrLbs.source : unit.dryWeightLbs.source;
  const weightBasis = unit.gvwrLbs.value != null ? "GVWR" : "dry weight";
  if (c.maxWeightLbs != null) {
    if (unitWeight === null) {
      unknowns.push("weight (GVWR/dry)");
      hardChecks.push(check(`weight ≤ ${c.maxWeightLbs.toLocaleString()} lbs`, "unknown", "unknown", null));
    } else {
      hardChecks.push(
        check(
          `weight ≤ ${c.maxWeightLbs.toLocaleString()} lbs`,
          unitWeight <= c.maxWeightLbs ? "pass" : "fail",
          `${unitWeight.toLocaleString()} lbs (${weightBasis})`,
          weightSource,
        ),
      );
    }
  }

  // — hard: tow vehicle cap (only for towables; drivables pass vacuously)
  let towFit = null;
  if (ctx.tow) {
    towFit = evaluateTowFit(unit, ctx.tow);
    if (towFit.verdict === "not_towable") {
      // Motorhomes aren't gated by a tow vehicle.
    } else if (ctx.tow.filterCapLbs === null || towFit.verdict === "unknown") {
      unknowns.push("weight (GVWR/dry)");
      hardChecks.push(check(`towable by ${ctx.tow.matched?.label ?? "your vehicle"}`, "unknown", "weight unknown", null));
    } else {
      hardChecks.push(
        check(
          `towable by ${ctx.tow.matched?.label ?? "your vehicle"} (≤ ${ctx.tow.filterCapLbs.toLocaleString()} lbs)`,
          towFit.verdict === "exceeds" ? "fail" : "pass",
          `${towFit.comparedWeightLbs?.toLocaleString()} lbs (${towFit.comparedWeightField === "gvwrLbs" ? "GVWR" : "dry"}) — ${towFit.verdict.replace(/_/g, " ")}`,
          weightSource,
        ),
      );
    }
  }

  // — hard: sleeps
  if (c.sleepsMin != null) {
    if (unit.sleeps.value === null) {
      unknowns.push("sleeps");
      hardChecks.push(check(`sleeps ≥ ${c.sleepsMin}`, "unknown", "unknown", null));
    } else {
      hardChecks.push(
        check(`sleeps ≥ ${c.sleepsMin}`, unit.sleeps.value >= c.sleepsMin ? "pass" : "fail", String(unit.sleeps.value), unit.sleeps.source),
      );
    }
  }

  // — hard: fresh water minimum
  if (c.freshWaterMinGal != null) {
    if (unit.freshWaterGal.value === null) {
      unknowns.push("freshWaterGal");
      hardChecks.push(check(`fresh water ≥ ${c.freshWaterMinGal} gal`, "unknown", "unknown", null));
    } else {
      hardChecks.push(
        check(
          `fresh water ≥ ${c.freshWaterMinGal} gal`,
          unit.freshWaterGal.value >= c.freshWaterMinGal ? "pass" : "fail",
          `${unit.freshWaterGal.value} gal`,
          unit.freshWaterGal.source,
        ),
      );
    }
  }

  // — hard: must-have features
  for (const f of c.mustHave ?? []) {
    const v = featureValue(unit, f);
    if (v === null) {
      unknowns.push(f);
      hardChecks.push(check(`has ${FEATURE_LABELS[f]}`, "unknown", "unknown — dealer listing doesn't say", null));
    } else {
      hardChecks.push(check(`has ${FEATURE_LABELS[f]}`, v ? "pass" : "fail", v ? "yes" : "no", featureSource(unit, f)));
    }
  }

  // — hard: distance
  let distanceMiles: number | null = null;
  if (ctx.location) {
    if (unit.dealer.lat !== null && unit.dealer.lng !== null) {
      distanceMiles = Math.round(
        haversineMiles(
          { lat: ctx.location.lat, lng: ctx.location.lng },
          { lat: unit.dealer.lat, lng: unit.dealer.lng },
        ),
      );
      hardChecks.push(
        check(
          `within ${ctx.location.radiusMiles} mi of ${ctx.location.place}`,
          distanceMiles <= ctx.location.radiusMiles ? "pass" : "fail",
          `${distanceMiles} mi (${unit.dealer.name}, ${unit.dealer.city})`,
          "computed",
        ),
      );
    } else {
      unknowns.push("dealerLocation");
      hardChecks.push(check(`within ${ctx.location.radiusMiles} mi of ${ctx.location.place}`, "unknown", "dealer location unresolved", null));
    }
  }

  // — hard status
  const anyFail = hardChecks.some((h) => h.status === "fail");
  const anyUnknown = hardChecks.some((h) => h.status === "unknown");
  const hardStatus = anyFail ? "fail" : anyUnknown ? "unverified" : "pass";

  // — soft scoring (deterministic, documented) ------------------------------
  let score = 50;
  breakdown.push({ label: "base", points: 50 });

  for (const f of c.prefer ?? []) {
    const v = featureValue(unit, f);
    if (v === true) {
      score += 8;
      breakdown.push({ label: `prefers ${FEATURE_LABELS[f]}: yes`, points: 8 });
      softChecks.push({ preference: FEATURE_LABELS[f], satisfied: true, detail: "confirmed in dealer listing" });
    } else if (v === false) {
      softChecks.push({ preference: FEATURE_LABELS[f], satisfied: false, detail: "listing indicates not equipped" });
    } else {
      unknowns.push(f);
      softChecks.push({ preference: FEATURE_LABELS[f], satisfied: null, detail: "unknown — dealer listing doesn't say" });
    }
  }

  if (c.boondocking) {
    const b = unit.boondocking.score;
    if (b !== null) {
      const pts = Math.round((b / 100) * 20);
      score += pts;
      breakdown.push({ label: `boondocking readiness ${b}/100`, points: pts });
      softChecks.push({
        preference: "boondocking readiness",
        satisfied: b >= 40,
        detail: `${b}/100 from ${unit.boondocking.knownInputs.join(", ") || "no inputs"}`,
      });
    } else {
      unknowns.push("boondocking inputs");
      softChecks.push({
        preference: "boondocking readiness",
        satisfied: null,
        detail: `unknown — missing ${unit.boondocking.missingInputs.slice(0, 3).join(", ")}`,
      });
    }
  }

  if (c.priceMaxUsd != null && price !== null && price <= c.priceMaxUsd) {
    const pts = Math.round((1 - price / c.priceMaxUsd) * 10);
    if (pts > 0) {
      score += pts;
      breakdown.push({ label: `${fmtUsd(c.priceMaxUsd - price)} under budget`, points: pts });
    }
  }

  if (ctx.location && distanceMiles !== null && distanceMiles <= ctx.location.radiusMiles) {
    const pts = Math.round((1 - distanceMiles / Math.max(1, ctx.location.radiusMiles)) * 10);
    if (pts > 0) {
      score += pts;
      breakdown.push({ label: `${distanceMiles} mi away`, points: pts });
    }
  }

  if (towFit && (towFit.verdict === "fits_with_margin" || towFit.verdict === "marginal")) {
    const pts = towFit.verdict === "fits_with_margin" ? 6 : 2;
    score += pts;
    breakdown.push({ label: `tow fit: ${towFit.verdict.replace(/_/g, " ")}`, points: pts });
  }

  const yearPts = Math.max(0, Math.min(5, unit.year - 2020));
  if (yearPts > 0) {
    score += yearPts;
    breakdown.push({ label: `${unit.year} model year`, points: yearPts });
  }

  if (hardStatus === "unverified") {
    score -= 12;
    breakdown.push({ label: `unverified: ${[...new Set(unknowns)].slice(0, 4).join(", ")}`, points: -12 });
  }

  score = Math.max(5, Math.min(99, score));

  return {
    unit,
    distanceMiles,
    hardStatus,
    hardChecks,
    softChecks,
    unknownFields: [...new Set(unknowns)],
    score,
    scoreBreakdown: breakdown,
  };
}

// ── Search over the corpus ─────────────────────────────────────────────────

/** Order in which a unit's first failing constraint is attributed in the funnel. */
function firstFailReason(m: UnitMatch): string {
  const fail = m.hardChecks.find((h) => h.status === "fail");
  return fail ? fail.constraint : "other";
}

export function runSearch(units: CanonicalUnit[], constraints: Constraints): SearchOutcome {
  const ctx = buildContext(constraints);

  const evaluated = units.map((u) => evaluateUnit(u, ctx));

  const passed = evaluated.filter((m) => m.hardStatus === "pass");
  const unverified = evaluated.filter((m) => m.hardStatus === "unverified");
  const failed = evaluated.filter((m) => m.hardStatus === "fail");

  const buckets = new Map<string, number>();
  for (const m of failed) {
    const r = firstFailReason(m);
    buckets.set(r, (buckets.get(r) ?? 0) + 1);
  }

  const sortKey = constraints.sort ?? "best_match";
  const unknownHard = (m: UnitMatch) => m.hardChecks.filter((h) => h.status === "unknown").length;
  const cmp = (a: UnitMatch, b: UnitMatch): number => {
    switch (sortKey) {
      case "price_asc":
        return (a.unit.priceUsd.value ?? Infinity) - (b.unit.priceUsd.value ?? Infinity);
      case "price_desc":
        return (b.unit.priceUsd.value ?? 0) - (a.unit.priceUsd.value ?? 0);
      case "distance":
        return (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity);
      case "newest_model_year":
        return b.unit.year - a.unit.year;
      default:
        // Most-verified first: within the unverified tier, a unit with more
        // hard requirements actually CONFIRMED outranks one that merely
        // scores well on soft preferences — "why it ranked here" must reward
        // verification, not guesswork. (No-op in the all-pass tier.)
        return (
          unknownHard(a) - unknownHard(b) ||
          b.score - a.score ||
          (a.unit.priceUsd.value ?? Infinity) - (b.unit.priceUsd.value ?? Infinity)
        );
    }
  };
  passed.sort(cmp);
  unverified.sort(cmp);

  // Collapse identical twins (same model, price, branch — multiple in stock)
  // into one row so the shopper sees variety, honestly annotated.
  const collapse = (list: UnitMatch[]): UnitMatch[] => {
    const seen = new Map<string, UnitMatch>();
    const out: UnitMatch[] = [];
    for (const m of list) {
      const key = `${m.unit.title}|${m.unit.priceUsd.value}|${m.unit.dealer.id}`;
      const head = seen.get(key);
      if (head) {
        (head.identicalUnitIds ??= []).push(m.unit.id);
      } else {
        seen.set(key, m);
        out.push(m);
      }
    }
    return out;
  };

  return {
    funnel: {
      totalUnits: units.length,
      passedHard: passed.length,
      unverified: unverified.length,
      excluded: [...buckets.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
    },
    results: [...collapse(passed), ...collapse(unverified)],
    appliedConstraints: ctx.constraints,
    towResolution: ctx.tow,
    locationResolution: ctx.location
      ? { place: ctx.location.place, lat: ctx.location.lat, lng: ctx.location.lng }
      : null,
  };
}
