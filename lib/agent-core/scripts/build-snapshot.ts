/**
 * Build the committed inventory snapshot from the real scraped dealer data in
 * MatchRV-scraper/data/. Deterministic: same input → same output (modulo the
 * builtAt stamp). Prints a data-quality report so unknown-rates are visible.
 *
 * Run: pnpm --filter @workspace/agent-core run build-snapshot
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRecord, type RawScrapeRecord } from "../src/normalize.js";
import type { CanonicalUnit } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(here, "../../../MatchRV-scraper/data");
const OUT = resolve(here, "../data/inventory.snapshot.json");

const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json")).sort();

const byId = new Map<string, CanonicalUnit>();
const rejections = new Map<string, number>();
let rawCount = 0;

for (const file of files) {
  let parsed: Record<string, RawScrapeRecord>;
  try {
    parsed = JSON.parse(readFileSync(resolve(DATA_DIR, file), "utf-8"));
  } catch {
    console.warn(`skip unparseable ${file}`);
    continue;
  }
  for (const [key, rec] of Object.entries(parsed)) {
    rawCount++;
    const result = normalizeRecord(key, rec);
    if ("reject" in result) {
      rejections.set(result.reject.reason, (rejections.get(result.reject.reason) ?? 0) + 1);
      continue;
    }
    const unit = result.unit;
    const existing = byId.get(unit.id);
    // Part-files overlap; keep the most recently seen copy of a unit.
    if (!existing || existing.provenance.lastSeenAt < unit.provenance.lastSeenAt) {
      byId.set(unit.id, unit);
    }
  }
}

const units = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));

// ── Quality report ─────────────────────────────────────────────────────────

const pct = (n: number) => `${((100 * n) / units.length).toFixed(1)}%`;
const knownCount = (get: (u: CanonicalUnit) => unknown) =>
  units.filter((u) => get(u) !== null).length;

const fields: [string, (u: CanonicalUnit) => unknown][] = [
  ["price", (u) => u.priceUsd.value],
  ["length", (u) => u.lengthFt.value],
  ["dryWeight", (u) => u.dryWeightLbs.value],
  ["gvwr", (u) => u.gvwrLbs.value],
  ["hitchWeight", (u) => u.hitchWeightLbs.value],
  ["sleeps", (u) => u.sleeps.value],
  ["freshWater", (u) => u.freshWaterGal.value],
  ["bunkhouse", (u) => u.bunkhouse.value],
  ["entryDoors", (u) => u.entryDoors.value],
  ["solar", (u) => u.solar.value],
  ["lithium", (u) => u.lithiumBattery.value],
  ["generator", (u) => u.generator.value],
  ["fourSeason", (u) => u.fourSeason.value],
  ["boondockingScore", (u) => u.boondocking.score],
  ["dealerCoords", (u) => u.dealer.lat],
];

console.log(`\nraw records: ${rawCount}`);
console.log(`unique canonical units: ${units.length}`);
console.log(`\nrejections:`);
for (const [reason, n] of [...rejections.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${reason}: ${n}`);
}
console.log(`\nfield coverage (known / total):`);
for (const [name, get] of fields) {
  const k = knownCount(get);
  console.log(`  ${name.padEnd(18)} ${String(k).padStart(5)} (${pct(k)})`);
}

const dealers = new Map<string, number>();
const missingCoords = new Set<string>();
for (const u of units) {
  dealers.set(u.dealer.name, (dealers.get(u.dealer.name) ?? 0) + 1);
  if (u.dealer.lat === null) missingCoords.add(`${u.dealer.name} @ ${u.dealer.city}`);
}
console.log(`\ndealers: ${dealers.size}`);
for (const [name, n] of [...dealers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${name.padEnd(34)} ${n}`);
}
if (missingCoords.size) {
  console.log(`\nDEALER LOCATIONS WITHOUT COORDS (fix geo.ts):`);
  for (const d of missingCoords) console.log(`  ${d}`);
}

const rvTypes = new Map<string, number>();
for (const u of units) rvTypes.set(u.rvType, (rvTypes.get(u.rvType) ?? 0) + 1);
console.log(`\nby type: ${[...rvTypes.entries()].map(([t, n]) => `${t}=${n}`).join("  ")}`);

const lastSeens = units.map((u) => u.provenance.lastSeenAt).sort();
console.log(`lastSeen range: ${lastSeens[0]} → ${lastSeens[lastSeens.length - 1]}`);

const snapshot = {
  schemaVersion: 1,
  builtAt: new Date().toISOString(),
  datasetNote:
    "Representative snapshot of real Pacific-Northwest RV dealer listings collected by the MatchRV scraper. Demo dataset — not live inventory; freshness timestamps reflect the snapshot dates.",
  stats: {
    rawRecords: rawCount,
    units: units.length,
    dealers: dealers.size,
    rejections: Object.fromEntries(rejections),
  },
  units,
};

writeFileSync(OUT, JSON.stringify(snapshot));
console.log(`\nwrote ${OUT} (${(JSON.stringify(snapshot).length / 1024 / 1024).toFixed(2)} MB)`);
