/**
 * One async door to inventory for routes and MCP tools, whichever source is
 * configured (see inventory-source.ts). Snapshot mode calls the original
 * in-memory code unchanged; supabase mode queries Postgres and never parses
 * the snapshot, so the process doesn't hold the corpus in memory.
 */
import {
  buildCandidateQuery,
  buildContext,
  createSearchAccumulator,
  geoBox,
  isSlimUnit,
  slimUnitForRanking,
  haversineMiles,
  runSearch,
  type CanonicalUnit,
  type Constraints,
  type SearchOutcome,
  type UnitMatch,
} from "@workspace/agent-core";
import { getInventory } from "./agent-inventory";
import { screenMcpInventory } from "./mcp-inventory-quality";
import { usingInventoryDb } from "./inventory-source";
import { activeSnapshot, decodeRows, fetchUnits, q, streamUnits } from "./inventory-db";
import { applyMemory, memoryTouchedUnitIds, type MemoryScope } from "./learned-store";
import { isSearchReady } from "./search-ready";
import { toRow, getListingRows, type ListingRow } from "./outfitter-inventory";

type LearnedTow = { towRatingLbs: number | null; confirmations: number; source: string } | null;

// ── snapshot-mode MCP view (screened once) ──────────────────────────────────
let screened: ReturnType<typeof screenMcpInventory> | undefined;
export function screenedSnapshotInventory() {
  return (screened ??= screenMcpInventory(getInventory()));
}

// ── Dataset info ────────────────────────────────────────────────────────────
export interface DatasetInfo { units: number; searchableUnits: number; mcpEligible: number; dealers: number; builtAt: string; datasetNote: string; source: "snapshot" | "supabase"; version?: string }

export async function datasetInfo(): Promise<DatasetInfo> {
  if (usingInventoryDb()) {
    const a = await activeSnapshot();
    return { units: a.units, searchableUnits: a.searchReady, mcpEligible: a.mcpEligible, dealers: a.dealers ?? 0, builtAt: a.builtAt, datasetNote: String(a.meta.datasetNote ?? ""), source: "supabase", version: a.version };
  }
  const inv = getInventory();
  return {
    units: inv.units.length,
    searchableUnits: inv.units.filter(isSearchReady).length,
    mcpEligible: screenedSnapshotInventory().units.length,
    dealers: inv.snapshot.stats.dealers,
    builtAt: inv.snapshot.builtAt,
    datasetNote: inv.snapshot.datasetNote,
    source: "snapshot",
  };
}

export async function mcpInventoryQuality(): Promise<Record<string, unknown>> {
  if (usingInventoryDb()) return ((await activeSnapshot()).meta.inventoryQuality ?? {}) as Record<string, unknown>;
  return screenedSnapshotInventory().inventoryQuality;
}

// ── Lookups ─────────────────────────────────────────────────────────────────
/** Any unit in the website corpus (all loaded records). */
export async function lookupUnit(id: string): Promise<CanonicalUnit | undefined> {
  if (usingInventoryDb()) return (await fetchUnits([id])).get(id)?.unit;
  return getInventory().byId.get(id);
}

/** A unit MCP tools may serve; quarantined (screened-out) units come back with their issues instead. */
export async function lookupMcpUnit(id: string): Promise<{ unit?: CanonicalUnit; quarantine?: string[] }> {
  if (usingInventoryDb()) {
    const row = (await fetchUnits([id])).get(id);
    if (!row) return {};
    return row.mcpEligible ? { unit: row.unit } : { quarantine: row.quarantine ?? [] };
  }
  const inv = screenedSnapshotInventory();
  const unit = inv.byId.get(id);
  return unit ? { unit } : inv.quarantined.has(id) ? { quarantine: inv.quarantined.get(id) } : {};
}

export async function lookupMcpUnits(ids: string[]): Promise<(CanonicalUnit | undefined)[]> {
  if (usingInventoryDb()) {
    const rows = await fetchUnits(ids);
    return ids.map((id) => { const r = rows.get(id); return r?.mcpEligible ? r.unit : undefined; });
  }
  const inv = screenedSnapshotInventory();
  return ids.map((id) => inv.byId.get(id));
}

// ── Search ──────────────────────────────────────────────────────────────────
export interface SearchRun {
  outcome: SearchOutcome;
  candidates: number;
  dbMs?: number;
  /**
   * Full records for matches about to be shown. A database search keeps only
   * ranking fields (slimUnitForRanking) on each match to bound memory; call
   * this on the shortlist before reading anything else from m.unit. Identity
   * in snapshot mode.
   */
  hydrate: (matches: UnitMatch[]) => Promise<UnitMatch[]>;
}

const identityHydrate = async (matches: UnitMatch[]) => matches;

/**
 * search_rvs over the MCP corpus (screened), with memory applied exactly as
 * the in-memory path does: applyMemory(scope, corpus) then runSearch.
 */
export async function searchMcpInventory(constraints: Constraints, learnedTow: LearnedTow, scope: MemoryScope): Promise<SearchRun> {
  if (!usingInventoryDb()) {
    const corpus = applyMemory(scope, screenedSnapshotInventory().units);
    return { outcome: runSearch(corpus, constraints, learnedTow), candidates: corpus.length, hydrate: identityHydrate };
  }
  return dbSearch("mcp_eligible", constraints, learnedTow, (units) => applyMemory(scope, units), memoryTouchedUnitIds(scope));
}

/** /agent/search corpus: website search-ready units (no MCP screen), no memory. */
export async function searchReadyCorpus(constraints: Constraints): Promise<SearchRun & { eligibleInventory: number; totalInventory: number }> {
  if (!usingInventoryDb()) {
    const inv = getInventory();
    const corpus = inv.units.filter(isSearchReady);
    return { outcome: runSearch(corpus, constraints), candidates: corpus.length, eligibleInventory: corpus.length, totalInventory: inv.units.length, hydrate: identityHydrate };
  }
  const a = await activeSnapshot();
  const run = await dbSearch("search_ready", constraints, null, (u) => u, []);
  return { ...run, eligibleInventory: a.searchReady, totalInventory: a.units };
}

async function dbSearch(
  corpusColumn: "mcp_eligible" | "search_ready",
  constraints: Constraints,
  learnedTow: LearnedTow,
  overlay: (units: CanonicalUnit[]) => CanonicalUnit[],
  touchedIds: string[],
): Promise<SearchRun> {
  const t0 = performance.now();
  const ctx = buildContext(constraints, learnedTow);
  const a = await activeSnapshot();
  const totalUnits = corpusColumn === "mcp_eligible" ? a.mcpEligible : a.searchReady;
  const cq = buildCandidateQuery(ctx, { touchedIds });
  const where = cq.where.replace(/^mcp_eligible AND /, `${corpusColumn} AND `);
  const acc = createSearchAccumulator(ctx, { retain: (m) => ({ ...m, unit: slimUnitForRanking(m.unit) }) });
  const [candidates, unitsInArea] = await Promise.all([
    streamUnits(where, cq.params, (batch) => acc.add(overlay(batch))),
    areaCount(corpusColumn, ctx.location),
  ]);
  const outcome = acc.finish({ totalUnits, unitsInArea: unitsInArea ?? 0, prefilteredOut: Math.max(0, totalUnits - candidates) });
  const hydrate = async (matches: UnitMatch[]) => {
    const ids = [...new Set(matches.filter((m) => isSlimUnit(m.unit)).map((m) => m.unit.id))];
    if (!ids.length) return matches;
    const rows = await fetchUnits(ids);
    const full = new Map(overlay(ids.map((id) => rows.get(id)?.unit).filter((u): u is CanonicalUnit => Boolean(u))).map((u) => [u.id, u]));
    return matches.map((m) => (isSlimUnit(m.unit) && full.has(m.unit.id) ? { ...m, unit: full.get(m.unit.id)! } : m));
  };
  return { outcome, candidates, dbMs: Math.round(performance.now() - t0), hydrate };
}

/** Units in the requested area across the whole corpus (same rule as runSearch's coverage count). */
async function areaCount(corpusColumn: string, loc: ReturnType<typeof buildContext>["location"]): Promise<number | null> {
  if (!loc) return null;
  if (loc.state) {
    const r = await q<{ n: string }>(`select count(*) n from inventory.units where ${corpusColumn} and dealer_state = $1`, [loc.state]);
    return Number(r[0]?.n ?? 0);
  }
  // Same box as the candidate query; exact distance in JS with the engine's haversine + rounding.
  const b = geoBox(loc.lat, loc.lng, loc.radiusMiles);
  const params: unknown[] = [b.minLat, b.maxLat];
  let lngClause = "";
  if (b.minLng !== null && b.maxLng !== null) { params.push(b.minLng, b.maxLng); lngClause = " and lng between $3 and $4"; }
  const rows = await q<{ lat: number; lng: number }>(`select lat, lng from inventory.units where ${corpusColumn} and coords_ok and lat between $1 and $2${lngClause}`, params);
  let n = 0;
  for (const r of rows) if (Math.round(haversineMiles({ lat: loc.lat, lng: loc.lng }, { lat: r.lat, lng: r.lng })) <= loc.radiusMiles) n++;
  return n;
}

// ── Website listing rows (classic /browse, outfitter, sitemap) ─────────────
export async function listingRowById(id: string): Promise<ListingRow | undefined> {
  if (!usingInventoryDb()) return getListingRows().find((r) => String(r.id) === id);
  const row = (await fetchUnits([id])).get(id);
  return row ? toRow(row.unit, row.dealerSeq) : undefined;
}

/** First `limit` website rows (snapshot order) that satisfy `predicate`; streams, stops early. */
export async function firstListingRows(predicate: (row: ListingRow) => boolean, limit: number, prefilter?: { where: string; params: unknown[] }): Promise<ListingRow[]> {
  if (!usingInventoryDb()) return getListingRows().filter(predicate).slice(0, limit);
  const out: ListingRow[] = [];
  let lastOrd = -1;
  let lastId = "";
  const where = prefilter?.where ?? "true";
  const params = prefilter?.params ?? [];
  const n = params.length;
  while (out.length < limit) {
    const rows = await q<{ ord: number; id: string; unit_z: Buffer; zdict_id: number; dealer_seq: number }>(
      `select ord, id, unit_z, zdict_id, dealer_seq from inventory.units where (${where}) and (ord, id) > ($${n + 1}::int, $${n + 2}::text) order by ord, id limit 500`,
      [...params, lastOrd, lastId],
    );
    if (!rows.length) break;
    const units = await decodeRows(rows);
    for (let i = 0; i < rows.length && out.length < limit; i++) {
      const row = toRow(units[i], rows[i].dealer_seq);
      if (predicate(row)) out.push(row);
    }
    lastOrd = rows[rows.length - 1].ord;
    lastId = rows[rows.length - 1].id;
    if (rows.length < 500) break;
  }
  return out;
}

/** Sitemap entries (id + last seen) in snapshot order. */
export async function sitemapEntries(offset: number, limit: number): Promise<{ id: string; lastSeenAt: string }[]> {
  if (!usingInventoryDb()) return getInventory().units.slice(offset, offset + limit).map((u) => ({ id: u.id, lastSeenAt: u.provenance.lastSeenAt || "" }));
  const rows = await q<{ id: string; last_seen_at: Date | null }>("select id, last_seen_at from inventory.units order by ord, id offset $1 limit $2", [offset, limit]);
  return rows.map((r) => ({ id: r.id, lastSeenAt: r.last_seen_at ? r.last_seen_at.toISOString() : "" }));
}
