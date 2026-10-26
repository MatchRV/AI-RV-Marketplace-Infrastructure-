/**
 * Read-only provenance audit of the committed snapshot.
 *
 *   pnpm --filter @workspace/agent-core exec tsx scripts/provenance-audit.ts [--json out.json]
 *
 * Reports, for every critical field, how many units carry a value and where
 * it came from (dealer_listing / parsed_dealer_text / decoded_floorplan_code /
 * computed_from_brochure / computed_estimate / unknown), as the MCP serves it
 * (after index-time enrichment + manufacturer-spec fill), plus spec conflicts
 * and match refusals. Writes nothing unless --json is given.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { CanonicalUnit, InventorySnapshot } from "../src/index.js";
import {
  indexSnapshot, provenanceLabel, buildSpecIndex, applyManufacturerSpecs, MANUFACTURER_SPEC_RECORDS,
  type SpecConflict,
} from "../src/index.js";

const snapshot = JSON.parse(gunzipSync(readFileSync(new URL("../data/inventory.snapshot.json.gz", import.meta.url))).toString()) as InventorySnapshot;

const FIELDS = ["priceUsd", "lengthFt", "sleeps", "dryWeightLbs", "gvwrLbs", "hitchWeightLbs", "slideouts", "freshWaterGal", "bunkhouse"] as const;

function coverage(units: CanonicalUnit[]) {
  const out: Record<string, Record<string, number>> = {};
  for (const f of FIELDS) {
    const c: Record<string, number> = {};
    for (const u of units) { const l = provenanceLabel(u[f]); c[l] = (c[l] ?? 0) + 1; }
    out[f] = c;
  }
  const fuel: Record<string, number> = {};
  for (const u of units.filter((x) => ["class_a", "class_b", "class_c"].includes(x.rvType))) {
    const l = provenanceLabel(u.powertrain?.fuelType ?? { value: null, source: null }); fuel[l] = (fuel[l] ?? 0) + 1;
  }
  out["fuelType (motorhomes)"] = fuel;
  const ident: Record<string, number> = { year: 0, make: 0, model: 0, floorplanCode: 0, condition: 0 };
  for (const u of units) {
    if (u.year) ident.year++; if (u.make) ident.make++; if (u.model) ident.model++;
    if (u.floorplanCode) ident.floorplanCode++; if (u.condition) ident.condition++;
  }
  out["identity fields present (record-level dealer_listing provenance)"] = ident;
  return out;
}

const raw = coverage(snapshot.units);
const t0 = Date.now();
const idx = indexSnapshot(snapshot);
const ms = Date.now() - t0;
const served = coverage(idx.units);

// Conflicts list (re-run on already-filled units is a no-op for fills; conflicts are recomputed).
const spec = buildSpecIndex(MANUFACTURER_SPEC_RECORDS);
const conflicts: SpecConflict[] = [];
for (const u of idx.units) conflicts.push(...applyManufacturerSpecs(u, spec).conflicts);

const report = {
  builtAt: snapshot.builtAt,
  units: snapshot.units.length,
  rawRecords: snapshot.stats.rawRecords,
  indexMs: ms,
  specRecords: { accepted: spec.accepted, rejected: spec.rejected.map((r) => `${r.record.make} ${r.record.floorplanCode}: ${r.reason}`) },
  specStats: idx.specStats,
  coverageInSnapshotFile: raw,
  coverageAsServed: served,
  conflictsByField: conflicts.reduce<Record<string, number>>((a, c) => ((a[c.field] = (a[c.field] ?? 0) + 1), a), {}),
  conflictSamples: conflicts.slice(0, 8),
};

const jsonFlag = process.argv.indexOf("--json");
if (jsonFlag > 0 && process.argv[jsonFlag + 1]) writeFileSync(process.argv[jsonFlag + 1], JSON.stringify({ ...report, conflicts }, null, 2));
console.log(JSON.stringify(report, null, 2));
