import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { gunzipSync } from "node:zlib";
import type { CanonicalUnit, InventoryIndex } from "@workspace/agent-core";
import app, { loggablePath } from "../src/app";
import { buildFeedRow, feedLines, feedStats } from "../src/lib/product-feed";
import { feedInventory, feedKeyValid, presentedKey } from "../src/routes/product-feed";
import { resetInventoryIndexSource, useInventoryIndexSource } from "../src/services/inventory-index-source";
import { getScreenedInventory } from "../src/services/screened-inventory";

const units = () => getScreenedInventory().units as CanonicalUnit[];
const good = () => structuredClone(units().find((u) => u.status === "available" && (u.priceUsd.value ?? 0) > 0 && /^https:/.test(u.images[0] ?? "") && u.make)!);
const KEY = "test-feed-key-0123456789abcdef";
const bearer = (key: string) => ({ headers: { Authorization: `Bearer ${key}` } });

/** An in-memory index of real units, so the freshness recheck never reads the committed snapshot's state. */
function fixtureIndex(rows: CanonicalUnit[], builtAt: string): InventoryIndex {
  const byState = new Map<string, CanonicalUnit[]>();
  for (const row of rows) {
    const key = (row.dealer.state || "??").toUpperCase();
    byState.set(key, [...(byState.get(key) ?? []), row]);
  }
  return {
    snapshot: { schemaVersion: 1, builtAt, datasetNote: "product feed fixture", stats: { rawRecords: rows.length, units: rows.length, dealers: 1, rejections: {} }, units: rows },
    units: rows,
    byId: new Map(rows.map((row) => [row.id, row])),
    byState,
  } as InventoryIndex;
}

/** Four copies of a good unit, one per dealer state: current available, unknown, sold, and stale. */
function freshnessFixture() {
  const builtAt = "2026-10-30T00:00:00.000Z";
  const make = (id: string, status: CanonicalUnit["status"], seen: string) => {
    const u = good();
    u.id = `fixture:${id}`;
    u.status = status;
    u.provenance = { ...u.provenance, firstSeenAt: "2026-08-01T00:00:00.000Z", lastSeenAt: seen, verifiedAt: seen };
    return u;
  };
  const current = "2026-10-25T00:00:00.000Z";
  const old = "2026-08-15T00:00:00.000Z";
  const rows = [make("available", "available", current), make("unknown", "unknown", current), make("sold", "sold", current), make("stale", "available", old)];
  return fixtureIndex(rows, builtAt);
}

describe("product feed rows (OpenAI product feed schema)", () => {
  it("carries every required field in the documented format", () => {
    const u = good();
    const built = buildFeedRow(u);
    if (!("row" in built)) throw new Error("expected a row");
    const r = built.row;
    for (const k of ["item_id", "title", "description", "url", "brand", "seller_name", "image_url", "availability", "price"] as const) expect(r[k]).toBeTruthy();
    expect(r.item_id).toBe(u.id);
    expect(r.url.startsWith("https://matchrv.com/listing/")).toBe(true);
    expect(r.price).toMatch(/^\d+\.\d{2} USD$/);
    expect(r.price).toBe(`${u.priceUsd.value!.toFixed(2)} USD`);
    expect(r.availability).toBe("in_stock");
    expect(r.target_countries).toEqual(["US"]);
    expect(r.store_country).toBe("US");
    expect(r.is_eligible_checkout).toBe(false);
    expect(r.title.length).toBeLessThanOrEqual(150);
    expect(r.description.length).toBeLessThanOrEqual(5000);
    expect(r.description).not.toMatch(/<[a-z]/i);
  });

  it("a sold unit is left out with a sold reason, never sent as unknown", () => {
    const u = good();
    u.status = "sold";
    expect(buildFeedRow(u)).toEqual({ skip: "sold" });
    const s = feedStats([u, good()]);
    expect(s.skipped.sold).toBe(1);
    expect(s.rows).toBe(1);
    expect(s.availability.unknown).toBe(0);
  });

  it("unknown availability stays unknown; pending is not in stock; removed is left out", () => {
    const u = good();
    u.status = "unknown";
    expect((buildFeedRow(u) as { row: { availability: string } }).row.availability).toBe("unknown");
    u.status = "pending";
    expect((buildFeedRow(u) as { row: { availability: string } }).row.availability).toBe("out_of_stock");
    u.status = "removed";
    expect(buildFeedRow(u)).toEqual({ skip: "removed" });
  });

  it("leaves a row out rather than padding a missing price, image or brand", () => {
    let u = good(); u.priceUsd = { ...u.priceUsd, value: null };
    expect(buildFeedRow(u)).toEqual({ skip: "no_price" });
    u = good(); u.images = [];
    expect(buildFeedRow(u)).toEqual({ skip: "no_image" });
    u = good(); u.images = ["javascript:alert(1)"];
    expect(buildFeedRow(u)).toEqual({ skip: "no_image" });
    u = good(); u.make = "";
    expect(buildFeedRow(u)).toEqual({ skip: "no_brand" });
  });

  it("writes a factual description from published fields when the dealer wrote none", () => {
    const u = good(); u.description = null;
    const r = (buildFeedRow(u) as { row: { description: string } }).row;
    expect(r.description).toContain(u.make);
    expect(r.description).toContain("offered by");
  });

  it("says nothing about how or where MatchRV got the record", () => {
    const allowed = new Set(["item_id", "title", "description", "url", "brand", "seller_name", "image_url", "availability", "price", "condition", "product_category", "seller_url", "additional_image_urls", "weight", "item_weight_unit", "is_eligible_search", "is_eligible_checkout", "target_countries", "store_country"]);
    let n = 0;
    for (const line of feedLines(units().slice(0, 3000))) {
      const row = JSON.parse(line) as Record<string, unknown>;
      for (const k of Object.keys(row)) expect(allowed.has(k)).toBe(true);
      // Dealer-written text and ids can contain anything; check the fields MatchRV writes itself.
      expect(`${row.product_category ?? ""} ${row.availability} ${row.price}`).not.toMatch(/marketcheck|harvest|scrap|csv|feed|snapshot|provenance/i);
      n++;
    }
    expect(n).toBeGreaterThan(100);
  });

  it("stats add up to the units given", () => {
    const sample = units().slice(0, 5000);
    const s = feedStats(sample);
    const skipped = Object.values(s.skipped).reduce((a, b) => a + b, 0);
    expect(s.rows + skipped).toBe(sample.length);
    expect(s.availability.in_stock + s.availability.out_of_stock + s.availability.unknown).toBe(s.rows);
  });
});

describe("product feed key", () => {
  it("is off without a configured key, and refuses short or wrong keys", () => {
    expect(feedKeyValid("anything", undefined)).toBe(false);
    expect(feedKeyValid("", KEY)).toBe(false);
    expect(feedKeyValid("short", "short")).toBe(false);
    expect(feedKeyValid(KEY.slice(0, -1) + "X", KEY)).toBe(false);
    expect(feedKeyValid(undefined, KEY)).toBe(false);
    expect(feedKeyValid(KEY, KEY)).toBe(true);
  });

  it("is read only from an Authorization: Bearer header", () => {
    const req = (h: string | undefined) => ({ get: (name: string) => (name.toLowerCase() === "authorization" ? h : undefined) }) as Parameters<typeof presentedKey>[0];
    expect(presentedKey(req(`Bearer ${KEY}`))).toBe(KEY);
    expect(presentedKey(req(`bearer ${KEY}`))).toBe(KEY);
    expect(presentedKey(req(KEY))).toBeUndefined();
    expect(presentedKey(req(`Basic ${KEY}`))).toBeUndefined();
    expect(presentedKey(req(`Bearer ${KEY} extra`))).toBeUndefined();
    expect(presentedKey(req(undefined))).toBeUndefined();
  });

  it("the crawler log never prints a /feeds path", () => {
    expect(loggablePath(`/feeds/${KEY}/openai-products.jsonl`)).toBe("/feeds/[redacted]");
    expect(loggablePath("/feeds/openai-products.jsonl")).toBe("/feeds/[redacted]");
    expect(loggablePath("/FEEDS/x")).toBe("/feeds/[redacted]");
    expect(loggablePath("/listing/abc")).toBe("/listing/abc");
    expect(loggablePath("/feedsomething")).toBe("/feedsomething");
  });
});

describe("product feed inventory follows INVENTORY_STATE_FRESHNESS", () => {
  afterEach(() => {
    delete process.env.INVENTORY_STATE_FRESHNESS;
    delete process.env.INVENTORY_FRESHNESS_WALL_CLOCK;
    resetInventoryIndexSource();
  });

  it("with the flag off, uses the process-start screened inventory, as before", () => {
    delete process.env.INVENTORY_STATE_FRESHNESS;
    useInventoryIndexSource({ readIndex: () => freshnessFixture() });
    expect(feedInventory().units).toBe(getScreenedInventory().units);
  });

  it("with the flag on, publishes only what the MCP recheck would recommend", () => {
    process.env.INVENTORY_STATE_FRESHNESS = "1";
    useInventoryIndexSource({ readIndex: () => freshnessFixture() });
    const inv = feedInventory();
    expect(inv.units.map((u) => u.id)).toEqual(["fixture:available"]);
    expect(inv.snapshot?.builtAt).toBe("2026-10-30T00:00:00.000Z");
    const s = feedStats(inv.units);
    expect(s.rows).toBe(1);
    expect(s.availability).toEqual({ in_stock: 1, out_of_stock: 0, unknown: 0 });
  });

  it("with the flag on and the wall clock on, a unit stale by today's date is left out", () => {
    process.env.INVENTORY_STATE_FRESHNESS = "1";
    process.env.INVENTORY_FRESHNESS_WALL_CLOCK = "1";
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2027-01-15T00:00:00.000Z"));
      useInventoryIndexSource({ readIndex: () => freshnessFixture() });
      expect(feedInventory().units).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("product feed endpoints", () => {
  let server: Server;
  let base = "";
  const prior = process.env.PRODUCT_FEED_KEY;
  beforeAll(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    if (prior === undefined) delete process.env.PRODUCT_FEED_KEY; else process.env.PRODUCT_FEED_KEY = prior;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("answers 404 everywhere when no key is configured", async () => {
    delete process.env.PRODUCT_FEED_KEY;
    for (const path of ["/feeds/openai-products.jsonl", "/feeds/openai-products.jsonl.gz", "/feeds/openai-products.meta.json"]) {
      const res = await fetch(`${base}${path}`, bearer(KEY));
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("answers 404 for a missing or wrong key, and serves the feed for the right Bearer key", async () => {
    process.env.PRODUCT_FEED_KEY = KEY;
    expect((await fetch(`${base}/feeds/openai-products.jsonl`)).status).toBe(404);
    expect((await fetch(`${base}/feeds/openai-products.jsonl`, bearer("wrong-key-wrong-key-wrong-key"))).status).toBe(404);

    const meta = await (await fetch(`${base}/feeds/openai-products.meta.json`, bearer(KEY))).json() as { rows: number; skipped: Record<string, number> };
    expect(meta.rows).toBeGreaterThan(1000);
    expect(meta.skipped).toHaveProperty("sold");

    const res = await fetch(`${base}/feeds/openai-products.jsonl.gz`, bearer(KEY));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const lines = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8").trimEnd().split("\n");
    expect(lines.length).toBe(meta.rows);
    const first = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(first.item_id).toBeTruthy();
    expect(new Set(lines.map((l) => (JSON.parse(l) as { item_id: string }).item_id)).size).toBe(lines.length);

    const plainRes = await fetch(`${base}/feeds/openai-products.jsonl`, bearer(KEY));
    expect(plainRes.status).toBe(200);
    expect(plainRes.headers.get("content-type")).toContain("ndjson");
    await plainRes.body?.cancel();
  });

  it("does not accept the key in the query string or the path", async () => {
    process.env.PRODUCT_FEED_KEY = KEY;
    for (const path of [`/feeds/openai-products.jsonl?key=${KEY}`, `/feeds/openai-products.meta.json?key=${KEY}`, `/feeds/${KEY}/openai-products.jsonl`, `/feeds/${KEY}/openai-products.jsonl.gz`, `/feeds/${KEY}/openai-products.meta.json`]) {
      const res = await fetch(`${base}${path}`);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(await res.text()).toBe("not found");
    }
  });

  it("with INVENTORY_STATE_FRESHNESS on, the served feed is the recheck's units", async () => {
    process.env.PRODUCT_FEED_KEY = KEY;
    process.env.INVENTORY_STATE_FRESHNESS = "1";
    useInventoryIndexSource({ readIndex: () => freshnessFixture() });
    try {
      const body = await (await fetch(`${base}/feeds/openai-products.jsonl`, bearer(KEY))).text();
      const ids = body.trimEnd().split("\n").map((l) => (JSON.parse(l) as { item_id: string }).item_id);
      expect(ids).toEqual(["fixture:available"]);
      const meta = await (await fetch(`${base}/feeds/openai-products.meta.json`, bearer(KEY))).json() as { rows: number; inventoryRecheck: boolean };
      expect(meta).toMatchObject({ rows: 1, inventoryRecheck: true });
    } finally {
      delete process.env.INVENTORY_STATE_FRESHNESS;
      resetInventoryIndexSource();
    }
  });
});
