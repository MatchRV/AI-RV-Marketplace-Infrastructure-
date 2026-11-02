/**
 * Parity check: INVENTORY_SOURCE=supabase vs the in-memory snapshot.
 *
 *   INVENTORY_DATABASE_URL=... pnpm --filter @workspace/api-server run inventory-parity -- [--queries 300] [--seed 7] [--json out.json]
 *
 * Loads the committed snapshot in memory (the reference) and runs the same
 * generated searches through both sources: search_rvs's MCP corpus (with
 * memory overlay), /agent/search's search-ready corpus, website listing
 * queries, unit lookups, filters and the sitemap. A search matches only when
 * the full result list (every UnitMatch: unit, checks, score, distance,
 * identical twins) and the shopper-visible counts are identical.
 */
import { isDeepStrictEqual } from "node:util";
import { writeFileSync } from "node:fs";
import { mergeConstraints, ConstraintError, type Constraints, type SearchOutcome, PREFILTER_EXCLUDED_REASON } from "@workspace/agent-core";
import { searchMcpInventory, searchReadyCorpus, lookupMcpUnit, lookupUnit, sitemapEntries, screenedSnapshotInventory } from "../services/inventory-access";
import { queryListings, searchFilters, getListingById } from "../services/snapshot-listings";
import { closeInventoryPool } from "../services/inventory-db";
import { renderUnitSitemapPageFromSource } from "../lib/sitemap";
import { getInventory } from "../services/agent-inventory";
import { matchRvMcpHandler } from "../mcp";
import type { MemoryScope } from "../services/learned-store";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const N = Number(arg("queries")) || 300;
let seed = Number(arg("seed")) || 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const maybe = <T,>(p: number, f: () => T): T | undefined => (rnd() < p ? f() : undefined);

const PLACES = ["98402", "80202", "95814", "Tacoma, WA", "Fife, WA", "Denver, CO", "Sacramento, CA", "Washington", "Texas", "Florida", "Spokane, WA", "Phoenix, AZ", "ZIP 98444", "Buckley, WA"];
const TYPES = ["travel_trailer", "fifth_wheel", "toy_hauler", "class_a", "class_b", "class_c", "popup_camper", "truck_camper"] as const;
const FEATURES = ["bunkhouse", "outdoor_kitchen", "solar", "solar_prep", "lithium", "generator", "four_season", "two_entry_doors"] as const;
const TOWS = ["2022 Ford F-150", "Ram 2500 rated 12,000 lbs", "Toyota Tacoma", "2020 Chevy Silverado 1500", "F-350 rated 18000 lbs"];
const SORTS = ["best_match", "price_asc", "price_desc", "distance", "newest_model_year"] as const;
const MAKES = [["Jayco"], ["Tiffin"], ["Forest River"], ["Grand Design"], ["Winnebago", "Thor"], ["Keystone"]];
const MODELS = [["Allegro"], ["Phaeton"], ["Jay Flight"], ["Reflection"], ["Imagine"]];

function genConstraints(i: number): Constraints {
  const c: Record<string, unknown> = {};
  const place = i % 10 === 9 ? undefined : pick(PLACES);
  if (place) c.location = { place, radiusMiles: pick([25, 50, 100, 150, 300, 1000]) };
  const tow = rnd() < 0.3;
  const motor = rnd() < 0.3;
  if (rnd() < 0.75) c.rvTypes = motor ? [pick(["class_a", "class_b", "class_c"] as const)] : rnd() < 0.3 ? [pick(TYPES), pick(TYPES)] : [pick(TYPES)];
  Object.assign(c, {
    priceMaxUsd: maybe(0.6, () => pick([25000, 40000, 65000, 120000, 200000, 400000])),
    priceMinUsd: maybe(0.1, () => pick([10000, 30000])),
    sleepsMin: maybe(0.4, () => pick([2, 4, 6, 8])),
    condition: maybe(0.3, () => pick(["new", "used", "any"] as const)),
    lengthMaxFt: maybe(0.25, () => pick([22, 28, 32, 40])),
    lengthMinFt: maybe(0.1, () => pick([25, 35])),
    maxWeightLbs: maybe(0.15, () => pick([5000, 7500, 10000])),
    freshWaterMinGal: maybe(0.08, () => pick([30, 60])),
    mustHave: maybe(0.25, () => [pick(FEATURES)]),
    prefer: maybe(0.25, () => [pick(FEATURES), pick(FEATURES)]),
    boondocking: maybe(0.1, () => true),
    towVehicle: tow ? pick(TOWS) : undefined,
    makes: maybe(0.12, () => pick(MAKES)),
    sort: maybe(0.3, () => pick(SORTS)),
    sherpa: maybe(0.2, () => ({ sleepers: pick([2, 4, 6]), floorplanIntent: pick(["couples", "family_bunks", "flexible"] as const), ...(tow && rnd() < 0.5 ? { truckPayloadLbs: pick([1500, 2200]) } : {}) })),
  });
  if (c.makes && rnd() < 0.4) c.models = pick(MODELS);
  if (rnd() < 0.05) c.excludeMakes = ["Coachmen"];
  if (motor && rnd() < 0.3) Object.assign(c, rnd() < 0.5 ? { trailerWeightLbs: pick([5000, 10000]) } : { fuelType: pick(["gas", "diesel"] as const) });
  if (motor && rnd() < 0.15) c.horsepowerMin = 300;
  if (i % 50 === 13) c.location = { place: "Nowhereville, ZZ", radiusMiles: 50 };
  return mergeConstraints({}, c as Constraints, "replace");
}

const noScope: MemoryScope = { id: null } as unknown as MemoryScope;

function shopperView(o: SearchOutcome) {
  return {
    results: o.results,
    passedHard: o.funnel.passedHard,
    unverified: o.funnel.unverified,
    totalUnits: o.funnel.totalUnits,
    coverage: o.coverage,
    locationResolution: o.locationResolution,
    towResolution: o.towResolution,
    appliedConstraints: o.appliedConstraints,
    // In-database excluded counts are attributed per evaluated row plus one prefilter bucket; the sum must agree.
    excludedTotal: o.funnel.excluded.reduce((s, e) => s + e.count, 0),
  };
}

async function both<T>(f: () => Promise<T>): Promise<{ mem: T | Error; db: T | Error; ms: number }> {
  process.env.INVENTORY_SOURCE = "snapshot";
  let mem: T | Error; try { mem = await f(); } catch (e) { mem = e as Error; }
  process.env.INVENTORY_SOURCE = "supabase";
  const t0 = performance.now();
  let db: T | Error; try { db = await f(); } catch (e) { db = e as Error; }
  const ms = performance.now() - t0;
  process.env.INVENTORY_SOURCE = "snapshot";
  return { mem, db, ms };
}

const same = (a: unknown, b: unknown) => {
  if (a instanceof Error || b instanceof Error) return a instanceof Error && b instanceof Error && a.message === b.message && a.constructor === b.constructor;
  return isDeepStrictEqual(a, b);
};
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]) : 0; };

async function main() {
  getInventory(); screenedSnapshotInventory(); // reference corpus in memory
  const report: Record<string, unknown> = {};
  const fails: unknown[] = [];

  // 1) search_rvs (MCP corpus) — the main parity target.
  const mcpMs: number[] = []; const candidates: number[] = []; let mcpOk = 0; let errorsBoth = 0; let withResults = 0;
  for (let i = 0; i < N; i++) {
    const c = genConstraints(i);
    // Full result lists: the database path keeps ranking fields on unshown matches, so hydrate all of them to compare everything.
    const r = await both(async () => { const run = await searchMcpInventory(c, null, noScope); return shopperView({ ...run.outcome, results: await run.hydrate(run.outcome.results) }); });
    if (!(r.db instanceof Error)) { mcpMs.push(r.ms); }
    if (r.mem instanceof Error && r.db instanceof Error) errorsBoth++;
    if (same(r.mem, r.db)) mcpOk++;
    else fails.push({ kind: "search_rvs", i, constraints: c, mem: r.mem instanceof Error ? r.mem.message : { n: r.mem.results.length, first: r.mem.results.slice(0, 3).map((m) => m.unit.id), passed: r.mem.passedHard, unv: r.mem.unverified, cov: r.mem.coverage }, db: r.db instanceof Error ? r.db.message : { n: r.db.results.length, first: r.db.results.slice(0, 3).map((m) => m.unit.id), passed: r.db.passedHard, unv: r.db.unverified, cov: r.db.coverage } });
    if (!(r.mem instanceof Error) && r.mem.results.length) withResults++;
    if (!(r.db instanceof Error)) { process.env.INVENTORY_SOURCE = "supabase"; candidates.push((await searchMcpInventory(c, null, noScope)).candidates); process.env.INVENTORY_SOURCE = "snapshot"; }
  }
  report.search_rvs = { queries: N, identical: mcpOk, matchRate: `${((100 * mcpOk) / N).toFixed(1)}%`, withResults, bothErrored: errorsBoth, dbLatencyMs: { p50: pct(mcpMs, 50), p95: pct(mcpMs, 95), max: pct(mcpMs, 100) }, candidatesFetched: { p50: pct(candidates, 50), p95: pct(candidates, 95), max: pct(candidates, 100) } };

  // 2) /agent/search corpus (search-ready, no MCP screen).
  const readyMs: number[] = []; let readyOk = 0; const RN = Math.min(N, 100);
  for (let i = 0; i < RN; i++) {
    const c = genConstraints(1000 + i);
    const r = await both(async () => { const run = await searchReadyCorpus(c); return { ...shopperView({ ...run.outcome, results: await run.hydrate(run.outcome.results) }), eligibleInventory: run.eligibleInventory, totalInventory: run.totalInventory }; });
    if (!(r.db instanceof Error)) readyMs.push(r.ms);
    if (same(r.mem, r.db)) readyOk++; else fails.push({ kind: "agent_search", i, constraints: c });
  }
  report.agent_search = { queries: RN, identical: readyOk, dbLatencyMs: { p50: pct(readyMs, 50), p95: pct(readyMs, 95) } };

  // 2b) End to end through the MCP tools (what ChatGPT/Claude actually receive), minus timingMs.
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const response = await matchRvMcpHandler.fetch(new Request("http://localhost/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }));
    const raw = await response.text();
    const msg = JSON.parse(raw.startsWith("event:") || raw.startsWith("data:") ? raw.split("\n").find((l) => l.startsWith("data:"))!.slice(5) : raw);
    const strip = (o: any) => { if (o && typeof o === "object") { delete o.timingMs; for (const v of Object.values(o)) strip(v); } return o; };
    const out = msg.result ?? msg.error;
    // content[].text is the same payload as JSON text; compare it parsed (timingMs differs by design).
    for (const c of out?.content ?? []) if (c.type === "text") { try { c.text = JSON.parse(c.text); } catch { /* plain text */ } }
    // Known, internal-only difference: _meta diagnostics list one database-prefilter bucket instead of per-constraint
    // exclusion counts (never shown to shoppers), and the in-memory list is truncated to the top buckets. searched,
    // verifiedMatches and unverified are still compared, which pins the excluded total.
    const f = out?._meta?.["matchrv/internal"]?.funnel;
    if (f?.excluded) delete f.excluded;
    return strip(out);
  };
  const toolMs: number[] = []; let toolOk = 0; const TN = Math.min(N, 150); const shownIds: string[] = [];
  for (let i = 0; i < TN; i++) {
    const { sherpa: _s, ...c } = genConstraints(2000 + i) as Record<string, unknown>;
    const args = i % 7 === 3
      ? { rv_types: ["travel_trailer"], make: pick(MAKES)[0], location: pick(PLACES) } // discovery gate path (make/model counts)
      : { shopper_requested_results_now: true, shopper_words: "just show me what you have", limit: pick([3, 5, 10]), constraints: c };
    const r = await both(() => rpc("search_rvs", args));
    toolMs.push(r.ms);
    if (same(r.mem, r.db)) toolOk++; else fails.push({ kind: "mcp_search_rvs", i, args });
    const ids = ((r.mem as any)?.structuredContent?.results ?? []).map((x: any) => x.unit_id ?? x.id).filter(Boolean);
    shownIds.push(...ids.slice(0, 2));
  }
  let toolDetailOk = 0; let toolDetailN = 0;
  for (let k = 0; k + 1 < Math.min(shownIds.length, 60); k += 2) {
    for (const [name, a] of [["get_rv", { unit_id: shownIds[k] }], ["compare_rvs", { unit_ids: [shownIds[k], shownIds[k + 1]] }], ["evaluate_tow_fit", { vehicle: "2022 Ford F-150", unit_ids: [shownIds[k], shownIds[k + 1]] }]] as const) {
      toolDetailN++;
      const r = await both(() => rpc(name, a));
      if (same(r.mem, r.db)) toolDetailOk++; else fails.push({ kind: name, a });
    }
  }
  report.mcp_tools = { search_rvs_calls: TN, identical: toolOk, dbLatencyMs: { p50: pct(toolMs, 50), p95: pct(toolMs, 95), max: pct(toolMs, 100) }, detailCalls: toolDetailN, detailIdentical: toolDetailOk };

  // 3) Website listings (/api/listings), filters, by-id.
  const LQ: Record<string, string | undefined>[] = [
    {}, { type: "travel_trailer" }, { type: "class_a,class_c", state: "wa" }, { make: "Jayco", sort: "price_asc" }, { minPrice: "20000", maxPrice: "60000", sort: "price_desc" },
    { minYear: "2022", maxYear: "2025", sort: "newest" }, { minSleeps: "6", minLength: "25", sort: "length_desc" }, { maxLength: "30", sort: "length_asc" }, { maxTowWeight: "7000", fourSeason: "true" },
    { generator: "true", outdoorKitchen: "true" }, { search: "bunk" }, { search: "Grand Design Reflection" }, { dealer: "camping world", offset: "48" }, { condition: "used", state: "TX", limit: "100" }, { petFriendly: "true" }, { minSlides: "2", condition: "new", offset: "24" },
  ];
  let listOk = 0;
  for (const lq of LQ) { const r = await both(() => queryListings(lq)); if (same(r.mem, r.db)) listOk++; else fails.push({ kind: "listings", q: lq, mem: (r.mem as any)?.total, db: (r.db as any)?.total }); }
  const filt = await both(() => searchFilters());
  report.website = { listingQueries: LQ.length, identical: listOk, filtersIdentical: same(filt.mem, filt.db) };
  if (!same(filt.mem, filt.db)) fails.push({ kind: "filters", mem: filt.mem, db: filt.db });

  // 4) Lookups + sitemap.
  const all = getInventory().units; const scr = screenedSnapshotInventory();
  const ids = [...Array.from({ length: 150 }, (_, k) => all[Math.floor((k * all.length) / 150)].id), ...[...scr.quarantined.keys()].slice(0, 20), "nope:does-not-exist"];
  let lookOk = 0;
  for (const id of ids) {
    const r = await both(async () => ({ any: await lookupUnit(id), mcp: await lookupMcpUnit(id), row: await getListingById(id) }));
    if (same(r.mem, r.db)) lookOk++; else fails.push({ kind: "lookup", id });
  }
  // Sitemap XML (lastmod is the date part of last seen, so compare rendered pages).
  const sm = await both(async () => [await renderUnitSitemapPageFromSource(1), await renderUnitSitemapPageFromSource(2), await renderUnitSitemapPageFromSource(3), (await sitemapEntries(0, 200_000)).map((e) => e.id)]);
  report.lookups = { ids: ids.length, identical: lookOk, sitemapIdentical: same(sm.mem, sm.db) };
  if (!same(sm.mem, sm.db)) fails.push({ kind: "sitemap" });

  report.failures = fails.length;
  console.log(JSON.stringify(report, null, 2));
  if (fails.length) console.log("first failures:", JSON.stringify(fails.slice(0, 5), null, 1).slice(0, 6000));
  const out = arg("json"); if (out) writeFileSync(out, JSON.stringify({ report, fails }, null, 1));
  await closeInventoryPool();
  process.exit(fails.length ? 1 : 0);
}

void PREFILTER_EXCLUDED_REASON; void ConstraintError;
main().catch((err) => { console.error(err); process.exit(2); });
