/**
 * Replayable InventoryState freshness fixtures.
 *
 * In-memory indexes only. These tests do not read or write the committed
 * inventory snapshot and do not touch the data directory.
 *
 * The Lazydays case is a synthetic Vancouver mis-home. It does not re-home
 * the 737 real Lazydays Vancouver units. Those corrections are not done here.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { CanonicalUnit, Fact, InventoryIndex } from "@workspace/agent-core";
import { matchRvMcpHandler, MCP_VERSION } from "../src/mcp";
import { resetInventoryIndexSource, useInventoryIndexSource, type InventoryIndexSource } from "../src/services/inventory-index-source";
import {
  inventoryFreshnessRecheckEnabled,
  inventoryFreshnessWallClockEnabled,
  projectInventoryState,
  recheckIndex,
} from "../src/services/inventory-state-freshness";

const BUILT = "2026-10-30T00:00:00.000Z";
const SEEN = "2026-10-20T00:00:00.000Z";
const SHOW = {
  shopper_requested_results_now: true,
  shopper_words: "just show me",
  make: "Jayco",
  constraints: { rvTypes: ["travel_trailer"] },
  limit: 10,
};

function fact<T>(value: T | null): Fact<T> {
  return value == null ? { value: null, source: null, confidence: null } : { value, source: "dealer_listing", confidence: "high" };
}

function unit(partial: Partial<CanonicalUnit> & Pick<CanonicalUnit, "id" | "title">): CanonicalUnit {
  const dealer = {
    id: "example-dealer.test:lot",
    name: "Example Dealer",
    city: "Fife",
    state: "WA",
    lat: null,
    lng: null,
    website: "https://example-dealer.test",
    ...partial.dealer,
  };
  return {
    id: partial.id,
    vin: null,
    stockNumber: "FX-1",
    title: partial.title,
    year: partial.year ?? 2018,
    make: partial.make ?? "Jayco",
    model: partial.model ?? "Fixture Flight 21B",
    trim: null,
    floorplanCode: null,
    rvType: partial.rvType ?? "travel_trailer",
    condition: partial.condition ?? "used",
    status: partial.status ?? "available",
    priceUsd: partial.priceUsd ?? fact(42000),
    msrpUsd: fact(null),
    lengthFt: fact(28),
    dryWeightLbs: fact(5000),
    gvwrLbs: fact(7000),
    hitchWeightLbs: fact(500),
    sleeps: fact(null),
    slideouts: fact(1),
    freshWaterGal: fact(40),
    greyWaterGal: fact(null),
    blackWaterGal: fact(null),
    bunkhouse: fact(null),
    entryDoors: fact(null),
    solar: fact(null),
    lithiumBattery: fact(null),
    generator: fact(null),
    fourSeason: fact(null),
    outdoorKitchen: fact(null),
    boondocking: { score: null, knownInputs: [], missingInputs: [] },
    dealer,
    images: [],
    description: null,
    features: [],
    provenance: {
      sourceKind: "dealer_website_snapshot",
      dealerDomain: dealer.id.split(":")[0],
      firstSeenAt: "2026-10-01T00:00:00.000Z",
      lastSeenAt: SEEN,
      harvestMethod: "dealer_website_rv_inventory_scraper",
      lastSeenBasis: "harvested_at",
      verifiedAt: SEEN,
      listingUrl: "https://example-dealer.test/unit",
      ...partial.provenance,
    },
  };
}

function asIndex(units: CanonicalUnit[], builtAt = BUILT): InventoryIndex {
  const byId = new Map(units.map((row) => [row.id, row]));
  const byState = new Map<string, CanonicalUnit[]>();
  for (const row of units) {
    const key = (row.dealer.state || "??").toUpperCase();
    const bucket = byState.get(key) ?? [];
    bucket.push(row);
    byState.set(key, bucket);
  }
  return {
    snapshot: {
      schemaVersion: 1,
      builtAt,
      datasetNote: "In-memory freshness fixture. Not the committed inventory snapshot.",
      stats: { rawRecords: units.length, units: units.length, dealers: new Set(units.map((row) => row.dealer.id)).size, rejections: {} },
      units,
    },
    units,
    byId,
    byState,
  };
}

function scripted(indexes: InventoryIndex[]): InventoryIndexSource & { reads: number } {
  let reads = 0;
  return {
    get reads() { return reads; },
    readIndex() {
      const index = indexes[Math.min(reads, indexes.length - 1)]!;
      reads += 1;
      return index;
    },
  };
}

async function rpc(method: string, params: unknown = {}) {
  const response = await matchRvMcpHandler.fetch(new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
  expect(response.status).toBe(200);
  const raw = await response.text();
  const message = JSON.parse(raw.startsWith("event:") || raw.startsWith("data:") ? raw.split("\n").find((line) => line.startsWith("data:"))!.slice(5) : raw);
  expect(message.error).toBeUndefined();
  return message.result;
}

async function tool(name: string, args: Record<string, unknown>) {
  const result = await rpc("tools/call", { name, arguments: args });
  const data = JSON.parse(result.content.find((part: { type: string }) => part.type === "text").text);
  return { result, data };
}

function enableRecheck() {
  process.env.INVENTORY_STATE_FRESHNESS = "1";
  delete process.env.INVENTORY_FRESHNESS_WALL_CLOCK;
}

afterEach(() => {
  delete process.env.INVENTORY_STATE_FRESHNESS;
  delete process.env.INVENTORY_FRESHNESS_WALL_CLOCK;
  resetInventoryIndexSource();
});

describe("InventoryState freshness flags", () => {
  it("defaults both flags off and does not treat other strings as on", () => {
    expect(inventoryFreshnessRecheckEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(inventoryFreshnessWallClockEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(inventoryFreshnessRecheckEnabled({ INVENTORY_STATE_FRESHNESS: "0" } as NodeJS.ProcessEnv)).toBe(false);
    expect(inventoryFreshnessRecheckEnabled({ INVENTORY_STATE_FRESHNESS: "1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(inventoryFreshnessWallClockEnabled({ INVENTORY_FRESHNESS_WALL_CLOCK: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(inventoryFreshnessWallClockEnabled({ INVENTORY_FRESHNESS_WALL_CLOCK: "yes" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("keeps the public MCP contract when the flags are off", async () => {
    delete process.env.INVENTORY_STATE_FRESHNESS;
    delete process.env.INVENTORY_FRESHNESS_WALL_CLOCK;
    expect(MCP_VERSION).toBe("2.2.7");
    const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "freshness-contract", version: "1" } });
    expect(init.serverInfo).toMatchObject({ name: "matchrv", version: "2.2.7" });
    const list = await rpc("tools/list");
    expect(list.tools).toHaveLength(11);
    expect(list.tools.map((entry: { name: string }) => entry.name)).toEqual([
      "teach_outfitter",
      "outfitter_memory",
      "outfitter_discovery",
      "outfitter_guide",
      "search_rvs",
      "get_rv",
      "compare_rvs",
      "evaluate_tow_fit",
      "prepare_dealer_inquiry",
      "send_dealer_inquiry",
      "get_dealer_inquiry_status",
    ]);
    const search = list.tools.find((entry: { name: string }) => entry.name === "search_rvs");
    expect(Object.keys(search.inputSchema.properties)).not.toContain("inventory_state");
    expect(Object.keys(search.inputSchema.properties)).not.toContain("verified_via");
    expect(list.tools.map((entry: { name: string }) => entry.name)).not.toContain("check_availability");
  });

  it("projects verified_via, computes freshness, and does not store stale or retrieved_at", () => {
    const row = unit({ id: "fixture:project", title: "2018 Jayco Fixture Flight 21B" });
    row.provenance.harvestMethod = "marketcheck_api_v2_rv_active";
    const before = JSON.stringify(row);
    const projected = projectInventoryState(row, { now: new Date("2026-10-30T12:00:00.000Z"), referenceTime: new Date(BUILT) });
    expect(projected).toMatchObject({
      state: "available",
      freshness: "current",
      verified_at: SEEN,
      verified_via: "marketcheck",
      retrieved_at: "2026-10-30T12:00:00.000Z",
    });
    expect(JSON.stringify(row)).toBe(before);
    expect(before).not.toContain("retrieved_at");
    expect(before).not.toContain("freshness");

    const discount = unit({
      id: "fixture:discount",
      title: "2018 Jayco Fixture Flight 21B",
      dealer: { id: "discountrv.test:main", name: "Discount RV", city: "Fife", state: "WA", lat: null, lng: null, website: null },
    });
    expect(projectInventoryState(discount, { now: new Date(BUILT), referenceTime: new Date(BUILT) })?.note).toContain("not a live feed");

    const removed = unit({ id: "fixture:removed", title: "2018 Jayco Fixture Flight 21B", status: "removed" });
    const unknown = unit({ id: "fixture:unknown", title: "2018 Jayco Unknown", status: "unknown" });
    const index = asIndex([removed, unknown]);
    const checked = recheckIndex(index, new Date(BUILT));
    expect(checked.byId.has(removed.id)).toBe(false);
    expect(checked.byId.has(unknown.id)).toBe(false);
    expect(checked.withheld.get(removed.id)?.reason).toBe("left_active_set");
    expect(checked.withheld.get(removed.id)?.inventory_state).toBeUndefined();
    expect(checked.withheld.get(unknown.id)?.inventory_state?.state).toBe("unknown");
    expect(JSON.stringify(checked.withheld.get(removed.id))).not.toContain("\"removed\"");
  });
});

describe("replayable freshness fixtures", () => {
  it("withholds a unit that sells between turns", async () => {
    enableRecheck();
    const subject = unit({ id: "fixture:sold-mid-chat", title: "2018 Jayco Fixture Flight 21B", priceUsd: fact(42000) });
    const control = unit({ id: "fixture:sold-control", title: "2018 Jayco Fixture Flight 24B", model: "Fixture Flight 24B", priceUsd: fact(39000) });
    const index = asIndex([subject, control]);
    const source = scripted([index]);
    useInventoryIndexSource(source);

    const first = await tool("search_rvs", SHOW);
    expect(first.data.status).toBe("shortlist");
    expect(first.data.results.map((row: { unit_id: string }) => row.unit_id)).toContain(subject.id);
    const readsAfterFirst = source.reads;
    expect(readsAfterFirst).toBeGreaterThanOrEqual(2);

    subject.status = "sold";
    const second = await tool("search_rvs", SHOW);
    expect(second.data.results.map((row: { unit_id: string }) => row.unit_id)).not.toContain(subject.id);
    expect(second.data.results.map((row: { unit_id: string }) => row.unit_id)).toContain(control.id);
    expect(source.reads).toBeGreaterThan(readsAfterFirst);

    const detail = await tool("get_rv", { unit_id: subject.id });
    expect(detail.result.isError).toBe(true);
    expect(detail.data.error).toBe("unit_sold");
    expect(detail.data.inventory_state.state).toBe("sold");
    expect(detail.data.inventory_state.freshness).toBe("current");
    expect(detail.data.unit).toBeUndefined();
    expect(`${detail.data.guidance} ${detail.data.error}`.toLowerCase()).not.toMatch(/\bavailable\b/);
    expect(JSON.stringify(subject)).not.toContain("retrieved_at");
    expect(subject.status).toBe("sold");

    const compared = await tool("compare_rvs", { unit_ids: [subject.id, control.id] });
    expect(compared.result.isError).toBe(true);
    expect(compared.data.comparison).toBeUndefined();
    expect(JSON.stringify(compared.data.withheld)).toContain("unit_sold");

    const tow = await tool("evaluate_tow_fit", { vehicle: "Ford F-150", unit_ids: [subject.id] });
    expect(tow.result.isError).toBe(true);
    expect(tow.data.error).toBe("unit_sold");
    expect(tow.data.fits).toBeUndefined();

    const preview = await tool("prepare_dealer_inquiry", {
      unit_id: subject.id,
      name: "Riley Shopper",
      email: "riley@example.com",
      message: "Is this still on the lot?",
    });
    expect(preview.result.isError).toBe(true);
    expect(preview.data.preview).toBeUndefined();
    expect(preview.data.error).toBe("unit_sold");
  });

  it("uses the re-read price and status, not the first retrieval", async () => {
    enableRecheck();
    const firstUnit = unit({ id: "fixture:price-change", title: "2018 Jayco Fixture Flight 21B", priceUsd: fact(42000), status: "available" });
    const secondUnit = unit({ id: "fixture:price-change", title: "2018 Jayco Fixture Flight 21B", priceUsd: fact(35500), status: "pending" });
    const source = scripted([asIndex([firstUnit]), asIndex([secondUnit])]);
    useInventoryIndexSource(source);
    const before = JSON.stringify(secondUnit);

    const searched = await tool("search_rvs", SHOW);
    expect(searched.data.status).toBe("shortlist");
    expect(source.reads).toBeGreaterThanOrEqual(2);
    expect(searched.data.results).toHaveLength(1);
    expect(searched.data.results[0].price).toBe(35500);
    expect(searched.data.results[0].inventory_state.state).toBe("pending");
    expect(searched.data.results[0].inventory_state.freshness).toBe("current");
    expect(searched.data.results[0].inventory_state.verified_via).toBe("listing_page");
    expect(searched.data.results[0].listing_changed.price).toBe(true);
    expect(searched.data.results[0].listing_changed.status).toBe(true);
    expect(JSON.stringify(searched.data.results)).not.toContain("42000");
    expect(JSON.stringify(searched.data.results[0].inventory_state).toLowerCase()).not.toMatch(/\bavailable\b/);
    expect(JSON.stringify(secondUnit)).toBe(before);

    const later = unit({ id: "fixture:price-change", title: "2018 Jayco Fixture Flight 21B", priceUsd: fact(31000), status: "pending" });
    useInventoryIndexSource(scripted([asIndex([later])]));
    const detail = await tool("get_rv", { unit_id: later.id });
    expect(detail.result.isError).not.toBe(true);
    expect(detail.data.unit.priceUsd.value).toBe(31000);
    expect(detail.data.inventory_state.state).toBe("pending");
    expect(detail.data.inventory_state.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(later)).not.toContain("retrieved_at");
    expect(detail.data.unit.priceUsd.value).not.toBe(42000);
    expect(detail.data.unit.priceUsd.value).not.toBe(35500);
  });

  it("withholds a unit once verified_at ages out of the 30-day builtAt window", async () => {
    enableRecheck();
    const subject = unit({ id: "fixture:ages-out", title: "2018 Jayco Fixture Flight 21B" });
    subject.provenance.lastSeenAt = SEEN;
    subject.provenance.verifiedAt = SEEN;
    const index = asIndex([subject]);
    useInventoryIndexSource({ readIndex: () => index });

    const first = await tool("search_rvs", SHOW);
    expect(first.data.results.map((row: { unit_id: string }) => row.unit_id)).toContain(subject.id);
    expect(first.data.results[0].inventory_state.freshness).toBe("current");
    expect(first.data.results[0].inventory_state.verified_at).toBe(SEEN);

    subject.provenance.verifiedAt = "2026-09-01T00:00:00.000Z";
    const stored = JSON.stringify(subject);
    const second = await tool("search_rvs", SHOW);
    expect(second.data.results.map((row: { unit_id: string }) => row.unit_id)).not.toContain(subject.id);
    expect(JSON.stringify(subject)).toBe(stored);
    expect(stored).not.toContain("\"stale\"");
    expect(stored).not.toContain("retrieved_at");

    const detail = await tool("get_rv", { unit_id: subject.id });
    expect(detail.result.isError).toBe(true);
    expect(detail.data.error).toBe("unit_quarantined");
    expect(detail.data.reason).toBe("stale");
    expect(detail.data.inventory_state.freshness).toBe("stale");
    expect(detail.data.inventory_state.state).toBe("available");
    expect(detail.data.inventory_state.state).not.toBe("stale");
    expect(detail.data.inventory_state.verified_at).toBe("2026-09-01T00:00:00.000Z");
    expect(detail.data.unit).toBeUndefined();
    expect(String(detail.data.guidance).toLowerCase()).not.toMatch(/\bavailable\b/);
    expect(String(detail.data.guidance)).toContain("2026-09-01");
    expect(String(detail.data.guidance)).toContain("30-day");
  });

  it("keeps the builtAt clock unless the wall-clock flag is turned on", async () => {
    enableRecheck();
    const now = Date.now();
    const day = 864e5;
    const builtAt = new Date(now - 5 * day).toISOString();
    const verifiedAt = new Date(now - 34 * day).toISOString();
    const subject = unit({ id: "fixture:wall-clock", title: "2018 Jayco Fixture Flight 21B" });
    subject.provenance.lastSeenAt = verifiedAt;
    subject.provenance.verifiedAt = verifiedAt;
    useInventoryIndexSource({ readIndex: () => asIndex([subject], builtAt) });

    const builtAtPass = await tool("search_rvs", SHOW);
    expect(builtAtPass.data.results.map((row: { unit_id: string }) => row.unit_id)).toContain(subject.id);
    expect(builtAtPass.data.results[0].inventory_state.freshness).toBe("current");

    process.env.INVENTORY_FRESHNESS_WALL_CLOCK = "1";
    const wallFail = await tool("search_rvs", SHOW);
    expect(wallFail.data.results.map((row: { unit_id: string }) => row.unit_id)).not.toContain(subject.id);
    const detail = await tool("get_rv", { unit_id: subject.id });
    expect(detail.data.inventory_state.freshness).toBe("stale");
    expect(detail.data.reason).toBe("stale");

    delete process.env.INVENTORY_FRESHNESS_WALL_CLOCK;
    const restored = await tool("search_rvs", SHOW);
    expect(restored.data.results.map((row: { unit_id: string }) => row.unit_id)).toContain(subject.id);
  });

  it("shows a corrected Lazydays lot on the next read (fixture only; the 737 real Vancouver re-homes are not done)", async () => {
    enableRecheck();
    const subject = unit({
      id: "fixture:lazydays-location",
      title: "2019 Jayco Lazydays Fixture Coach",
      year: 2019,
      dealer: {
        id: "lazydays.com:vancouver-mis-home",
        name: "Lazydays RV of Vancouver",
        city: "Vancouver",
        state: "WA",
        lat: null,
        lng: null,
        website: "https://lazydays.com",
      },
    });
    subject.provenance.dealerDomain = "lazydays.com";
    const index = asIndex([subject]);
    useInventoryIndexSource({ readIndex: () => index });

    const first = await tool("get_rv", { unit_id: subject.id });
    expect(first.data.unit.dealer.city).toBe("Vancouver");
    expect(first.data.unit.dealer.state).toBe("WA");
    expect(first.data.inventory_state.verified_via).toBe("listing_page");

    subject.dealer = {
      id: "lazydays.com:tampa",
      name: "Lazydays RV Tampa",
      city: "Tampa",
      state: "FL",
      lat: null,
      lng: null,
      website: "https://lazydays.com",
    };
    subject.provenance.verifiedVia = "recheck";

    const detail = await tool("get_rv", { unit_id: subject.id });
    expect(detail.data.unit.dealer.city).toBe("Tampa");
    expect(detail.data.unit.dealer.state).toBe("FL");
    expect(detail.data.unit.dealer.name).toBe("Lazydays RV Tampa");
    expect(detail.data.inventory_state.verified_via).toBe("recheck");
    expect(detail.data.inventory_state.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(subject)).not.toContain("retrieved_at");

    const searched = await tool("search_rvs", SHOW);
    expect(searched.data.results[0].dealer).toContain("Tampa");
    expect(searched.data.results[0].dealer).toContain("FL");
    expect(searched.data.results[0].dealer).not.toContain("Vancouver");
    expect(searched.data.results[0].inventory_state.verified_via).toBe("recheck");
    expect(["listing_page", "recheck", "marketcheck"]).toContain(searched.data.results[0].inventory_state.verified_via);
  });
});
