import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { gunzipSync } from "node:zlib";
import type { CanonicalUnit } from "@workspace/agent-core";
import app from "../src/app";
import { buildFeedRow, feedLines, feedStats } from "../src/lib/product-feed";
import { feedKeyValid } from "../src/routes/product-feed";
import { getScreenedInventory } from "../src/services/screened-inventory";

const units = () => getScreenedInventory().units as CanonicalUnit[];
const good = () => structuredClone(units().find((u) => u.status === "available" && (u.priceUsd.value ?? 0) > 0 && /^https:/.test(u.images[0] ?? "") && u.make)!);
const KEY = "test-feed-key-0123456789abcdef";

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
    for (const path of ["/feeds/openai-products.jsonl", "/feeds/openai-products.jsonl.gz", "/feeds/openai-products.meta.json", `/feeds/openai-products.jsonl?key=${KEY}`, `/feeds/${KEY}/openai-products.jsonl`]) {
      const res = await fetch(`${base}${path}`);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("answers 404 for a missing or wrong key, and serves the feed for the right one", async () => {
    process.env.PRODUCT_FEED_KEY = KEY;
    expect((await fetch(`${base}/feeds/openai-products.jsonl`)).status).toBe(404);
    expect((await fetch(`${base}/feeds/openai-products.jsonl?key=wrong-key-wrong-key-wrong-key`)).status).toBe(404);

    const meta = await (await fetch(`${base}/feeds/openai-products.meta.json?key=${KEY}`)).json() as { rows: number };
    expect(meta.rows).toBeGreaterThan(1000);

    const res = await fetch(`${base}/feeds/${KEY}/openai-products.jsonl.gz`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const lines = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8").trimEnd().split("\n");
    expect(lines.length).toBe(meta.rows);
    const first = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(first.item_id).toBeTruthy();
    expect(new Set(lines.map((l) => (JSON.parse(l) as { item_id: string }).item_id)).size).toBe(lines.length);

    const plainRes = await fetch(`${base}/feeds/openai-products.jsonl?key=${KEY}`);
    expect(plainRes.status).toBe(200);
    expect(plainRes.headers.get("content-type")).toContain("ndjson");
    await plainRes.body?.cancel();
  });
});
