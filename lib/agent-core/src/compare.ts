/**
 * Structured unit comparison. Returns true values (with unknowns intact),
 * not generated prose — the shopper's agent does the narrative.
 */

import type { CanonicalUnit, Constraints, Fact } from "./types.js";
import { buildContext, evaluateUnit } from "./match.js";

export interface CompareRow {
  spec: string;
  unit: string; // display unit ("USD", "ft", "lbs", "gal", "")
  values: (string | number | boolean | null)[]; // per unit, null = unknown
  sources: (string | null)[];
  /** index of the best value in this row, when "best" is well-defined and known for ≥2 units. */
  bestIndex: number | null;
}

export interface CompareResult {
  unitIds: string[];
  titles: string[];
  rows: CompareRow[];
  /** vs current session constraints (empty checks when no constraints set). */
  constraintSummary: {
    unitId: string;
    hardStatus: "pass" | "unverified" | "fail";
    score: number;
    failed: string[];
    unknown: string[];
  }[];
  unknownNotes: string[];
}

const f = <T,>(fact: Fact<T>): { v: T | null; s: string | null } => ({
  v: fact.value,
  s: fact.source,
});

export function compareUnits(units: CanonicalUnit[], constraints: Constraints): CompareResult {
  type Row = {
    spec: string;
    unit: string;
    get: (u: CanonicalUnit) => { v: string | number | boolean | null; s: string | null };
    best?: "min" | "max";
  };

  const rows: Row[] = [
    { spec: "price", unit: "USD", get: (u) => f(u.priceUsd), best: "min" },
    { spec: "year", unit: "", get: (u) => ({ v: u.year, s: "dealer_listing" }), best: "max" },
    { spec: "length", unit: "ft", get: (u) => f(u.lengthFt), best: "min" },
    { spec: "dry weight", unit: "lbs", get: (u) => f(u.dryWeightLbs), best: "min" },
    { spec: "GVWR", unit: "lbs", get: (u) => f(u.gvwrLbs), best: "min" },
    { spec: "hitch weight", unit: "lbs", get: (u) => f(u.hitchWeightLbs), best: "min" },
    { spec: "sleeps", unit: "", get: (u) => f(u.sleeps), best: "max" },
    { spec: "slideouts", unit: "", get: (u) => f(u.slideouts) },
    { spec: "fresh water", unit: "gal", get: (u) => f(u.freshWaterGal), best: "max" },
    { spec: "grey water", unit: "gal", get: (u) => f(u.greyWaterGal), best: "max" },
    { spec: "black water", unit: "gal", get: (u) => f(u.blackWaterGal), best: "max" },
    { spec: "bunkhouse", unit: "", get: (u) => f(u.bunkhouse) },
    { spec: "entry doors", unit: "", get: (u) => f(u.entryDoors), best: "max" },
    { spec: "solar", unit: "", get: (u) => f(u.solar) },
    { spec: "lithium battery", unit: "", get: (u) => f(u.lithiumBattery) },
    { spec: "generator", unit: "", get: (u) => f(u.generator) },
    { spec: "four season", unit: "", get: (u) => f(u.fourSeason) },
    { spec: "outdoor kitchen", unit: "", get: (u) => f(u.outdoorKitchen) },
    {
      spec: "boondocking score",
      unit: "/100",
      get: (u) => ({ v: u.boondocking.score, s: u.boondocking.score === null ? null : "computed" }),
      best: "max",
    },
    { spec: "condition", unit: "", get: (u) => ({ v: u.condition, s: "dealer_listing" }) },
    { spec: "dealer", unit: "", get: (u) => ({ v: `${u.dealer.name} (${u.dealer.city})`, s: "dealer_listing" }) },
  ];

  const outRows: CompareRow[] = rows.map((row) => {
    const cells = units.map((u) => row.get(u));
    let bestIndex: number | null = null;
    if (row.best) {
      const numeric = cells.map((c) => (typeof c.v === "number" ? c.v : null));
      const known = numeric.filter((n): n is number => n !== null);
      if (known.length >= 2) {
        const target = row.best === "min" ? Math.min(...known) : Math.max(...known);
        bestIndex = numeric.findIndex((n) => n === target);
      }
    }
    return {
      spec: row.spec,
      unit: row.unit,
      values: cells.map((c) => c.v),
      sources: cells.map((c) => c.s),
      bestIndex,
    };
  });

  const ctx = buildContext(constraints);
  const constraintSummary = units.map((u) => {
    const m = evaluateUnit(u, ctx);
    return {
      unitId: u.id,
      hardStatus: m.hardStatus,
      score: m.score,
      failed: m.hardChecks.filter((h) => h.status === "fail").map((h) => h.constraint),
      unknown: m.unknownFields,
    };
  });

  const unknownNotes: string[] = [];
  for (const row of outRows) {
    const unknownFor = row.values
      .map((v, i) => (v === null ? units[i].title.slice(0, 40) : null))
      .filter((x): x is string => x !== null);
    if (unknownFor.length > 0 && unknownFor.length < units.length) {
      unknownNotes.push(`${row.spec}: unknown for ${unknownFor.length} of ${units.length} units`);
    }
  }

  return {
    unitIds: units.map((u) => u.id),
    titles: units.map((u) => u.title),
    rows: outRows,
    constraintSummary,
    unknownNotes: unknownNotes.slice(0, 8),
  };
}
