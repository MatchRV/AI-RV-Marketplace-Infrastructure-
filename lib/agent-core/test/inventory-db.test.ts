import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  indexSnapshot,
  runSearch,
  buildContext,
  createSearchAccumulator,
  slimUnitForRanking,
  isSlimUnit,
  buildCandidateQuery,
  geoBox,
  haversineMiles,
  unitSearchColumns,
  PREFILTER_EXCLUDED_REASON,
  type CanonicalUnit,
  type Constraints,
  type InventorySnapshot,
  type UnitMatch,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const plain = resolve(here, "../data/inventory.snapshot.json");
const snapshot = JSON.parse(existsSync(plain) ? readFileSync(plain, "utf-8") : gunzipSync(readFileSync(`${plain}.gz`)).toString("utf-8")) as InventorySnapshot;
const units = indexSnapshot(snapshot).units.slice(0, 6000);

const CASES: Constraints[] = [
  { rvTypes: ["travel_trailer"], priceMaxUsd: 40000 },
  { location: { place: "Seattle, WA", radiusMiles: 150 }, sleepsMin: 6, mustHave: ["bunkhouse"] },
  { makes: ["Grand Design"], condition: "new", sort: "price_asc" },
  { location: { place: "TX" }, rvTypes: ["fifth_wheel", "toy_hauler"], maxWeightLbs: 12000 },
  { towVehicle: "2021 Toyota Tacoma", rvTypes: ["travel_trailer"] },
  { condition: "used", lengthMaxFt: 28, sort: "newest" },
] as Constraints[];

const rehydrate = (byId: Map<string, CanonicalUnit>) => (m: UnitMatch): UnitMatch => ({ ...m, unit: byId.get(m.unit.id)! });

describe("search accumulator", () => {
  it("batched add() is exactly runSearch", () => {
    for (const c of CASES) {
      const ref = runSearch(units, c);
      const acc = createSearchAccumulator(buildContext(c, null));
      for (let i = 0; i < units.length; i += 777) acc.add(units.slice(i, i + 777));
      expect(acc.finish()).toEqual(ref);
    }
  });

  it("slim retained units rank identically and rehydrate to the same results", () => {
    const byId = new Map(units.map((u) => [u.id, u]));
    for (const c of CASES) {
      const ref = runSearch(units, c);
      const acc = createSearchAccumulator(buildContext(c, null), { retain: (m) => ({ ...m, unit: slimUnitForRanking(m.unit) }) });
      acc.add(units);
      const out = acc.finish();
      expect(out.results.every((m) => isSlimUnit(m.unit))).toBe(true);
      expect(out.results.map((m) => m.unit.id)).toEqual(ref.results.map((m) => m.unit.id));
      expect({ ...out, results: out.results.map(rehydrate(byId)) }).toEqual(ref);
    }
  });

  it("finish(totals) reports corpus totals and a single prefilter bucket", () => {
    const c = CASES[0];
    const acc = createSearchAccumulator(buildContext(c, null));
    acc.add(units.slice(0, 100));
    const out = acc.finish({ totalUnits: 90000, unitsInArea: 0, prefilteredOut: 89900 });
    expect(out.funnel.totalUnits).toBe(90000);
    expect(out.funnel.excluded.find((e) => e.reason === PREFILTER_EXCLUDED_REASON)?.count).toBe(89900);
  });
});

describe("buildCandidateQuery", () => {
  it("never interpolates shopper text into SQL", () => {
    const evil = "x'); DROP TABLE inventory.units; --";
    const q = buildCandidateQuery(buildContext({ makes: [evil], excludeMakes: [evil], rvTypes: ["travel_trailer"], location: { place: "TX" } } as Constraints, null), { touchedIds: [evil] });
    expect(q.where).not.toContain("DROP");
    expect(q.where.startsWith("mcp_eligible AND ")).toBe(true);
    expect(q.params.flat()).toContain(evil);
    expect(q.where).toContain("OR id = ANY(");
  });

  it("an unconstrained search fetches every MCP-eligible unit", () => {
    expect(buildCandidateQuery(buildContext({} as Constraints, null)).where).toBe("mcp_eligible AND true");
  });

  it("geo box contains every point within the radius", () => {
    for (const [lat, lng, r] of [[47.6, -122.3, 250], [25.8, -80.2, 50], [64.8, -147.7, 500], [32.7, -117.2, 25]]) {
      const b = geoBox(lat, lng, r);
      for (let k = 0; k < 360; k += 5) for (const f of [0.5, 0.99, 1]) {
        const d = ((r + 0.5) * f) / 69;
        const pLat = lat + d * Math.cos((k * Math.PI) / 180);
        const pLng = lng + (d * Math.sin((k * Math.PI) / 180)) / Math.cos((pLat * Math.PI) / 180);
        if (haversineMiles({ lat, lng }, { lat: pLat, lng: pLng }) > r + 0.5) continue;
        expect(pLat).toBeGreaterThanOrEqual(b.minLat);
        expect(pLat).toBeLessThanOrEqual(b.maxLat);
        if (b.minLng !== null) { expect(pLng).toBeGreaterThanOrEqual(b.minLng); expect(pLng).toBeLessThanOrEqual(b.maxLng!); }
      }
    }
  });

  it("typed columns are derived for every unit", () => {
    for (const u of units.slice(0, 500)) {
      const cols = unitSearchColumns(u);
      expect(cols.rv_type).toBe(u.rvType);
      expect(cols.price_usd).toBe(u.priceUsd.value);
      if (cols.coords_ok) { expect(cols.lat).toBe(u.dealer.lat); expect(cols.lng).toBe(u.dealer.lng); }
    }
  });
});
