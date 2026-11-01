// Database search parity (INVENTORY_SOURCE=supabase vs the in-memory snapshot).
// Runs only when INVENTORY_DATABASE_URL points at a loaded inventory schema;
// the full harness is `pnpm --filter @workspace/api-server run inventory-parity`.
import { afterAll, describe, expect, it } from "vitest";
import { mergeConstraints, type Constraints, type SearchOutcome } from "@workspace/agent-core";
import { searchMcpInventory, lookupMcpUnit } from "../src/services/inventory-access";
import { queryListings } from "../src/services/snapshot-listings";
import { closeInventoryPool } from "../src/services/inventory-db";
import type { MemoryScope } from "../src/services/learned-store";

const enabled = Boolean(process.env.INVENTORY_DATABASE_URL);
const scope = { id: null } as unknown as MemoryScope;
const CASES = [
  { rvTypes: ["travel_trailer"], priceMaxUsd: 40000, location: { place: "Tacoma, WA", radiusMiles: 100 } },
  { rvTypes: ["class_a"], makes: ["Tiffin"], sort: "price_asc" },
  { location: { place: "Texas" }, sleepsMin: 6, mustHave: ["bunkhouse"] },
  { towVehicle: "2022 Ford F-150", rvTypes: ["travel_trailer"], location: { place: "80202", radiusMiles: 150 } },
  { condition: "used", lengthMaxFt: 28, location: { place: "Sacramento, CA", radiusMiles: 300 } },
  { rvTypes: ["truck_camper"], excludeMakes: ["Coachmen"], location: { place: "80202", radiusMiles: 100 } },
].map((c) => mergeConstraints({}, c as Constraints, "replace"));

async function withSource<T>(src: string, f: () => Promise<T>): Promise<T> {
  const prev = process.env.INVENTORY_SOURCE;
  process.env.INVENTORY_SOURCE = src;
  try { return await f(); } finally { process.env.INVENTORY_SOURCE = prev; }
}
const view = (o: SearchOutcome) => ({ results: o.results, passedHard: o.funnel.passedHard, unverified: o.funnel.unverified, totalUnits: o.funnel.totalUnits, coverage: o.coverage });

describe.skipIf(!enabled)("inventory database parity", () => {
  afterAll(() => closeInventoryPool());

  it("search_rvs results and ordering match the snapshot", { timeout: 300000 }, async () => {
    for (const c of CASES) {
      const run = async () => { const r = await searchMcpInventory(c, null, scope); return view({ ...r.outcome, results: await r.hydrate(r.outcome.results) }); };
      const mem = await withSource("snapshot", run);
      const db = await withSource("supabase", run);
      expect(db).toEqual(mem);
    }
  });

  it("unit lookups and website listings match", { timeout: 300000 }, async () => {
    const mem = await withSource("snapshot", () => queryListings({ type: "travel_trailer", sort: "price_asc" }));
    const db = await withSource("supabase", () => queryListings({ type: "travel_trailer", sort: "price_asc" }));
    expect(db).toEqual(mem);
    for (const row of mem.rows.slice(0, 5)) {
      expect(await withSource("supabase", () => lookupMcpUnit(row.id))).toEqual(await withSource("snapshot", () => lookupMcpUnit(row.id)));
    }
  });
});
