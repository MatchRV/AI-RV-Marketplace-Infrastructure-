// The per-snapshot caches and the search fast path must return exactly what the
// pre-cache code returned: /api/listings (querySnapshotListings) and MCP search_rvs.
import { describe, it, expect } from "vitest";
import { runSearch, type Constraints } from "@workspace/agent-core";
import { getInventory } from "../src/services/agent-inventory";
import { querySnapshotListings, querySnapshotListingsUncached, type ListingQuery } from "../src/services/snapshot-listings";
import { matchRvMcpHandler } from "../src/mcp";

const SORTS = [undefined, "featured", "just_listed", "price_asc", "price_desc", "newest", "length_asc", "length_desc", "bogus"];
const FILTERS: ListingQuery[] = [
  {},
  { type: "travel_trailer" },
  { type: "travel_trailer,fifth_wheel", condition: "new" },
  { make: "Grand Design, keystone" },
  { state: "wa" },
  { condition: "used", maxPrice: "40000" },
  { condition: "all", minPrice: "20000", maxPrice: "60000", minYear: "2020" },
  { minSleeps: "6", maxLength: "32" },
  { minLength: "25", minSlides: "2", maxTowWeight: "9000" },
  { petFriendly: "true" },
  { fourSeason: "true", generator: "true" },
  { outdoorKitchen: "true", washerDryer: "true" },
  { search: "bunk" },
  { dealer: "camping world" },
  { maxYear: "2018", search: "slide" },
  { minPrice: "abc" },
];

describe("cached /api/listings equals the uncached path", () => {
  it("matches for every sort, filter and page", { timeout: 600_000 }, () => {
    expect(getInventory().units.length).toBeGreaterThan(100);
    let compared = 0;
    for (const f of FILTERS) {
      for (const sort of SORTS) {
        for (const page of [{ limit: "1" }, { limit: "100", offset: "5" }]) {
          const q: ListingQuery = { ...f, ...page, ...(sort ? { sort } : {}) };
          // Twice: the first call fills the cache, the second is served from it.
          const want = querySnapshotListingsUncached(q);
          expect(querySnapshotListings(q)).toEqual(want);
          expect(querySnapshotListings(q)).toEqual(want);
          compared++;
        }
      }
    }
    expect(compared).toBe(FILTERS.length * SORTS.length * 2);
  });

  it("returns a fresh object each call, so callers cannot mutate the cache", () => {
    const a = querySnapshotListings({ limit: "3" });
    a.rows.length = 0;
    a.total = -1;
    expect(querySnapshotListings({ limit: "3" })).toEqual(querySnapshotListingsUncached({ limit: "3" }));
  });
});

const SEARCHES: Constraints[] = [
  {},
  { priceMaxUsd: 40000, location: { place: "Tacoma, WA", radiusMiles: 150 } },
  { rvTypes: ["travel_trailer"], priceMaxUsd: 45000, priceMinUsd: 35000, lengthMaxFt: 30, mustHave: ["bunkhouse"] },
  { condition: "new", location: { place: "Tacoma, WA", radiusMiles: 50 } },
  { condition: "used", sleepsMin: 6, location: { place: "Texas", radiusMiles: 200 } },
  { makes: ["Grand Design"], models: ["Imagine"] },
  { rvTypes: ["class_a"], fuelType: "diesel", horsepowerMin: 340 },
  { towVehicle: "2022 Ford F-150", maxWeightLbs: 8000, prefer: ["outdoor_kitchen"] },
  { heavyTowRequired: true, priceMaxUsd: 350000 },
  { excludeMakes: ["Jayco"], freshWaterMinGal: 40, boondocking: true },
  { lengthMinFt: 35, rvTypes: ["fifth_wheel"], location: { place: "98402", radiusMiles: 25 } },
];

describe("MCP search fast path equals full evaluation", () => {
  it("runSearch returns identical outcomes with and without early exit", { timeout: 300_000 }, () => {
    const units = getInventory().units;
    for (const c of SEARCHES) {
      expect(runSearch(units, c, null)).toEqual(runSearch(units, c, null, { fullEvaluation: true }));
    }
  });

  it("search_rvs returns the same payload on a cold and a warm call", { timeout: 120_000 }, async () => {
    const call = async () => {
      const res = await matchRvMcpHandler.fetch(new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_rvs", arguments: { location: "Tacoma, WA", budget_max_usd: 40000, shopper_requested_results_now: true, limit: 10 } } }),
      }));
      const raw = await res.text();
      const msg = JSON.parse(raw.startsWith("event:") || raw.startsWith("data:") ? raw.split("\n").find((l) => l.startsWith("data:"))!.slice(5) : raw);
      // Strip wall-clock fields; everything else must match.
      return JSON.parse(JSON.stringify(msg.result, (k, v) => (/^(timingMs|elapsedMs|ms|generatedAt|searchedAt|at)$/.test(k) ? undefined : v)));
    };
    const cold = await call();
    expect(cold.isError).not.toBe(true);
    expect(await call()).toEqual(cold);
  });
});
