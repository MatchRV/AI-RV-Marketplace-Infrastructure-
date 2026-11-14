import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { listingIdEmbedsUrl, publicListingId } from "@workspace/agent-core";
import { CORE_SITEMAP_URLS } from "../src/lib/sitemap-core-urls";
import { renderCoreSitemap, unitSitemapLoc } from "../src/lib/sitemap";
import { listingCanonicalUrl } from "../src/lib/listing-seo";
import { decideListingRequest, resolveCatalogUnitId } from "../src/lib/listing-public-id";
import { PRERENDER_PAGES } from "../src/lib/prerender-pages";
import { getInventory } from "../src/services/agent-inventory";
import { getScreenedInventory } from "../src/services/screened-inventory";
import { matchRvMcpHandler, MCP_VERSION } from "../src/mcp";
import app from "../src/app";

const WEB_SHELL = resolve(import.meta.dirname, "../../rv-marketplace/dist/public/index.html");

const EXCLUDED = [
  "https://matchrv.com/terms-and-conditions",
  "https://matchrv.com/swipe",
  "https://matchrv.com/browse",
  "https://matchrv.com/rvs-for-sale",
  "https://matchrv.com/class-a-rvs-for-sale",
  "https://matchrv.com/class-b-rvs-for-sale",
  "https://matchrv.com/class-c-rvs-for-sale",
  "https://matchrv.com/fifth-wheels-for-sale",
  "https://matchrv.com/toy-haulers-for-sale",
  "https://matchrv.com/travel-trailers-for-sale",
  "https://matchrv.com/rv-dealers",
  "https://matchrv.com/guides",
  "https://matchrv.com/guides/how-to-buy-a-used-rv",
  "https://matchrv.com/guides/best-rvs-for-families",
  "https://matchrv.com/guides/motorhome-vs-travel-trailer",
  "https://matchrv.com/guides/rv-financing-guide",
  "https://matchrv.com/guides/towing-guide",
  "https://matchrv.com/finance",
  "https://matchrv.com/sell",
  "https://matchrv.com/campgrounds",
  "https://matchrv.com/dealer-visibility",
  "https://matchrv.com/dealers/login",
];

describe("public listing ids", () => {
  it("leaves ordinary unit ids unchanged and slugs only embedded URLs", () => {
    expect(publicListingId("vin:TESTVIN123456789")).toBe("vin:TESTVIN123456789");
    expect(publicListingId("stk:dealer.example:tacoma:A12")).toBe("stk:dealer.example:tacoma:A12");
    expect(publicListingId("key:u:not-a-url")).toBe("key:u:not-a-url");
    const ugly = "key:u:https://nhrv.com/product/2018-keystone-montana-300lk/";
    const slug = publicListingId(ugly);
    expect(listingIdEmbedsUrl(ugly)).toBe(true);
    expect(slug).toMatch(/^key:h:[0-9a-f]{16}$/);
    expect(publicListingId(ugly)).toBe(slug);
    expect(slug.length).toBeLessThanOrEqual(120);
    expect(listingCanonicalUrl(ugly)).toBe(`https://matchrv.com/listing/${slug}`);
    expect(listingCanonicalUrl("vin:TESTVIN123456789")).toBe("https://matchrv.com/listing/vin:TESTVIN123456789");
  });
});

describe("core sitemap pages", () => {
  it("replaces the terms redirect and lists only indexable public pages", () => {
    const xml = renderCoreSitemap();
    expect(xml).not.toContain("terms-and-conditions");
    for (const url of CORE_SITEMAP_URLS) {
      expect(xml).toContain(`<loc>${url}</loc>`);
    }
    for (const url of EXCLUDED) {
      expect(xml).not.toContain(`<loc>${url}</loc>`);
    }
    expect(xml.match(/<loc>/g)).toHaveLength(CORE_SITEMAP_URLS.length);
  });

  it("prerenders every core page except the dedicated MCP docs renderer", () => {
    const script = readFileSync(new URL("../../rv-marketplace/scripts/prerender-marketing.mjs", import.meta.url), "utf8");
    const paths = new Set(PRERENDER_PAGES.map((page) => page.path));
    for (const url of CORE_SITEMAP_URLS) {
      const path = new URL(url).pathname;
      if (path === "/mcp-docs") {
        expect(paths.has(path)).toBe(false);
        continue;
      }
      expect(paths.has(path)).toBe(true);
    }
    for (const page of PRERENDER_PAGES) {
      expect(script).toContain(JSON.stringify(page.path));
      expect(script).toContain(JSON.stringify(page.file));
    }
  });
});

describe("embedded-url unit ids in the live snapshot", () => {
  it("emits a stable slug, keeps every other loc byte-identical, and still resolves the old id", async () => {
    const units = getInventory().units.filter((unit) => unit.status !== "removed");
    const embedded = units.filter((unit) => listingIdEmbedsUrl(unit.id));
    const otherUrls = units.filter((unit) => unit.id.includes("://") && !listingIdEmbedsUrl(unit.id));
    expect(otherUrls).toEqual([]);
    expect(embedded).toHaveLength(89);
    expect(units.some((unit) => unit.id.startsWith("key:h:"))).toBe(false);

    const slugs = new Set<string>();
    for (const unit of embedded) {
      const slug = publicListingId(unit.id);
      expect(slugs.has(slug)).toBe(false);
      slugs.add(slug);
      expect(units.some((other) => other.id === slug)).toBe(false);
      expect(unitSitemapLoc(unit.id)).toBe(`https://matchrv.com/listing/${slug}`);
      expect(unitSitemapLoc(unit.id)).not.toMatch(/listing\/key:u:https?:/i);
      expect(resolveCatalogUnitId(slug)).toBe(unit.id);
      expect(resolveCatalogUnitId(unit.id)).toBe(unit.id);
      expect(listingCanonicalUrl(unit.id)).toBe(`https://matchrv.com/listing/${slug}`);
      const old = decideListingRequest(unit.id);
      expect(old).toEqual({ unitId: unit.id, redirect: `/listing/${slug}` });
      const current = decideListingRequest(slug);
      expect(current).toEqual({ unitId: unit.id, redirect: null });
    }

    for (const unit of units) {
      if (listingIdEmbedsUrl(unit.id)) continue;
      expect(unitSitemapLoc(unit.id)).toBe(`https://matchrv.com/listing/${encodeURI(unit.id)}`);
      expect(decideListingRequest(unit.id).redirect).toBeNull();
    }

    const allEmbedded = getInventory().units.filter((unit) => listingIdEmbedsUrl(unit.id));
    const screened = getScreenedInventory();
    const live = allEmbedded.find((unit) => screened.byId.has(unit.id));
    const held = allEmbedded.find((unit) => screened.quarantined.has(unit.id));
    expect(live || held).toBeTruthy();
    expect(MCP_VERSION).toBe("2.2.7");
    if (live) {
      const viaSlug = await callGetRv(publicListingId(live.id));
      expect(viaSlug.unit?.id).toBe(live.id);
      if (live.id.length <= 120) {
        const viaStored = await callGetRv(live.id);
        expect(viaStored.unit?.id).toBe(live.id);
      }
    }
    if (held) {
      const viaSlug = await callGetRv(publicListingId(held.id));
      expect(viaSlug.error).toBe("unit_quarantined");
      expect(viaSlug.unit).toBeUndefined();
    }
  }, 120_000);

  it.skipIf(!existsSync(WEB_SHELL))("serves a 301 from the embedded URL to the slug, then the canonical page", async () => {
    const id = "key:u:https://nhrv.com/product/2018-keystone-montana-300lk/";
    const slug = publicListingId(id);
    const server: Server = app.listen(0);
    await new Promise((resolveListen) => server.once("listening", resolveListen));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const old = await fetch(`${base}/listing/${id}`, { redirect: "manual" });
      expect(old.status).toBe(301);
      expect(old.headers.get("location")).toBe(`/listing/${slug}`);
      const page = await fetch(`${base}/listing/${slug}`, { redirect: "manual" });
      expect(page.status).toBe(200);
      expect(page.headers.get("location")).toBeNull();
      const html = await page.text();
      expect(html).toContain(`rel="canonical" href="https://matchrv.com/listing/${slug}"`);
      expect(html).toContain(`data-unit-id="${id}"`);
      const unknown = await fetch(`${base}/listing/vin:NOTAREALUNIT123`, { redirect: "manual" });
      expect(unknown.status).toBe(404);
      expect(unknown.headers.get("location")).toBeNull();
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  }, 60_000);
});

async function callGetRv(unitId: string): Promise<{ unit?: { id: string }; error?: string }> {
  const response = await matchRvMcpHandler.fetch(new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_rv", arguments: { unit_id: unitId } },
    }),
  }));
  const raw = await response.text();
  const message = JSON.parse(raw.startsWith("event:") || raw.startsWith("data:")
    ? raw.split("\n").find((line) => line.startsWith("data:"))!.slice(5)
    : raw);
  expect(message.error).toBeUndefined();
  const text = message.result.content.find((part: { type: string }) => part.type === "text").text as string;
  return JSON.parse(text);
}
