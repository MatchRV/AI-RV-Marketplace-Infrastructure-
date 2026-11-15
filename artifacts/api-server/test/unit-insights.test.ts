import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TOW_SAFETY_MARGIN, TOW_VEHICLES, type CanonicalUnit } from "@workspace/agent-core";
import { getInventory } from "../src/services/agent-inventory";
import {
  DRY_WEIGHT_CARGO_ALLOWANCE_LBS,
  MIN_PRICE_COMPS,
  advertisablePrice,
  buildSeoTitle,
  buildTowInsight,
  buildUnitInsights,
  isIndexableUnit,
  noindexReasons,
  priceConflictsWithDescription,
  statedPricesInDescription,
} from "../src/lib/unit-insights";
import { MIN_HUB_UNITS, listHubUrls, parseHubPath, renderHubPage } from "../src/lib/inventory-hubs";
import { buildListingHeadInjection, buildListingBodySummary, buildUnitJsonLd } from "../src/lib/listing-seo";
import { renderSitemapIndex, renderHubSitemap, renderUnitSitemapPage, unitSitemapLoc } from "../src/lib/sitemap";
import app from "../src/app";

const units = () => getInventory().units;
const clone = (u: CanonicalUnit): CanonicalUnit => structuredClone(u);

describe("price sanity against the dealer's own text", () => {
  it("reads listing / reduced / sale prices and ignores MSRP", () => {
    expect(statedPricesInDescription("Listing Price: $36,900 Reduced Price: $29,900")).toEqual([36900, 29900]);
    expect(statedPricesInDescription("MSRP $58,011 Sale Price $44,995")).toEqual([44995]);
    expect(statedPricesInDescription("A great camper. Call us.")).toEqual([]);
  });

  it("flags a stored price the dealer's text contradicts, withholds it, and noindexes the page", () => {
    const u = clone(units()[0]);
    u.priceUsd = { value: 13900, source: "dealer_listing", confidence: "high" };
    u.description = "Inventory Number: 2502C002 Year: 2018 Listing Price: $36,900 Reduced Price: $29,900";
    expect(priceConflictsWithDescription(u)).toBe(true);
    expect(advertisablePrice(u)).toBeNull();
    expect((buildUnitJsonLd(u).offers as Record<string, unknown>).price).toBeUndefined();
    expect(noindexReasons({ ...u, id: `${u.id}#conflict-test` })).toContain("price_conflicts_with_dealer_text");
  });

  it("keeps a price that matches one of the stated prices", () => {
    const u = clone(units()[0]);
    u.priceUsd = { value: 29900, source: "dealer_listing", confidence: "high" };
    u.description = "Listing Price: $36,900 Reduced Price: $29,900";
    expect(priceConflictsWithDescription(u)).toBe(false);
  });
});

describe("unit page insights", () => {
  it("gives every page a title with condition, type and location, and no doubled New/Used", () => {
    for (const u of units().slice(0, 2000)) {
      const t = buildSeoTitle(u);
      expect(t.endsWith(" | MatchRV")).toBe(true);
      expect(t).not.toMatch(/^(New|Used) (New|Used) /i);
      if (u.dealer.state) expect(t).toContain(u.dealer.state);
    }
  });

  it("states price context only with enough comparable listings, from real comps", () => {
    const withCtx = units().slice(0, 5000).map((u) => buildUnitInsights(u)).filter((i) => i.priceContext);
    expect(withCtx.length).toBeGreaterThan(0);
    for (const i of withCtx) {
      const pc = i.priceContext!;
      expect(pc.compCount).toBeGreaterThanOrEqual(MIN_PRICE_COMPS);
      expect(pc.lowUsd).toBeLessThanOrEqual(pc.medianUsd);
      expect(pc.highUsd).toBeGreaterThanOrEqual(pc.medianUsd);
      expect(pc.summary).toContain("not sale prices");
    }
  });

  it("on dry weight alone, adds the stated cargo allowance and fifth wheels list pickups only", () => {
    const fw = units().find((u) => u.rvType === "fifth_wheel" && u.gvwrLbs.value == null && u.dryWeightLbs.value != null)!;
    const t = buildTowInsight(fw)!;
    expect(t.basis).toBe("dry_weight");
    expect(t.summary).toContain(`plus ${DRY_WEIGHT_CARGO_ALLOWANCE_LBS.toLocaleString("en-US")} lbs for cargo and water`);
    const planning = fw.dryWeightLbs.value! + DRY_WEIGHT_CARGO_ALLOWANCE_LBS;
    for (const label of t.comfortable) {
      const v = TOW_VEHICLES.find((x) => x.label === label)!;
      expect(planning).toBeLessThanOrEqual(Math.round(v.towLbsMin * TOW_SAFETY_MARGIN));
    }
    expect(t.pickupsOnly).toBe(true);
    expect([...t.comfortable, ...t.dependsOnConfig, ...t.tooHeavy]).not.toContain("Chevrolet Suburban");
    expect(t.summary).toContain("bed-mounted hitch");
  });

  it("a light trailer gets comfortable tow vehicles; GVWR is the basis when listed", () => {
    const light = clone(units().find((u) => u.rvType === "travel_trailer")!);
    light.gvwrLbs = { value: 3000, source: "dealer_listing", confidence: "high" };
    const t = buildTowInsight(light)!;
    expect(t.basis).toBe("gvwr");
    expect(t.comfortable).toContain("Ford F-250 Super Duty");
    expect(t.tooHeavy).toEqual([]);
  });

  it("has no tow section for motorhomes or units with no weight", () => {
    const motor = units().find((u) => u.rvType === "class_a")!;
    expect(buildTowInsight(motor)).toBeNull();
    const tt = clone(units().find((u) => u.rvType === "travel_trailer")!);
    tt.gvwrLbs = { value: null, source: null, confidence: null };
    tt.dryWeightLbs = { value: null, source: null, confidence: null };
    expect(buildTowInsight(tt)).toBeNull();
  });

  it("noindexes listings not seen recently and keeps them out of the unit sitemap", () => {
    const stale = units().find((u) => noindexReasons(u).includes("stale_listing"));
    expect(stale).toBeTruthy();
    const head = buildListingHeadInjection(stale!);
    expect(head).toContain(`<meta name="robots" content="noindex, follow" />`);
    const xml = renderUnitSitemapPage(1)!;
    expect(xml).not.toContain(`/listing/${encodeURI(stale!.id)}<`);
  });

  it("indexable pages carry no robots meta and render the MatchRV sections the data supports", () => {
    const u = units().find((x) => isIndexableUnit(x) && buildUnitInsights(x).priceContext && buildUnitInsights(x).tow)!;
    const head = buildListingHeadInjection(u);
    expect(head).not.toContain("noindex");
    expect(head).toContain('id="matchrv-unit-breadcrumbs"');
    const body = buildListingBodySummary(u);
    expect(body).toContain('id="price-context"');
    expect(body).toContain('id="tow-check"');
    expect(body).toContain("not a safety determination");
  });
});

describe("sitemaps", () => {
  it("lists the hub sitemap and only indexable units", () => {
    expect(renderSitemapIndex()).toContain("<loc>https://matchrv.com/sitemaps/hubs.xml</loc>");
    const xml = renderUnitSitemapPage(1)!;
    expect(xml).not.toContain("<changefreq>");
    const byUrl = new Map(units().map((u) => [unitSitemapLoc(u.id), u]));
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"'));
    expect(locs.length).toBeGreaterThan(1000);
    let checked = 0;
    for (const loc of locs) {
      const u = byUrl.get(loc);
      if (!u) continue;
      checked++;
      expect(isIndexableUnit(u)).toBe(true);
    }
    expect(checked).toBe(locs.length);
    const hubs = renderHubSitemap();
    expect(hubs).toContain("<loc>https://matchrv.com/rvs/washington/travel-trailers</loc>");
  });
});

describe("shopping hubs", () => {
  it("parses only known hub shapes", () => {
    expect(parseHubPath("/rvs/washington")).toEqual({ state: "WA", type: null, cap: null });
    expect(parseHubPath("/rvs/washington/fifth-wheels/under-40000")).toEqual({ state: "WA", type: "fifth_wheel", cap: 40000 });
    expect(parseHubPath("/rvs/washington/fifth-wheels/under-41234")).toBeNull();
    expect(parseHubPath("/rvs/atlantis/fifth-wheels")).toBeNull();
    expect(parseHubPath("/rvs/washington/spaceships")).toBeNull();
  });

  it("renders a hub with enough units, linking only to indexable unit pages", () => {
    const html = renderHubPage("/rvs/washington/travel-trailers")!;
    expect(html).toContain("<h1>Travel Trailers for Sale in Washington</h1>");
    expect(html).toContain('<link rel="canonical" href="https://matchrv.com/rvs/washington/travel-trailers">');
    const links = [...html.matchAll(/href="https:\/\/matchrv\.com\/listing\/([^"]+)"/g)].map((m) => decodeURI(m[1]));
    expect(links.length).toBeGreaterThanOrEqual(MIN_HUB_UNITS);
    const byId = getInventory().byId;
    for (const id of links) {
      const u = byId.get(id);
      if (u) expect(isIndexableUnit(u)).toBe(true);
    }
    expect(listHubUrls().length).toBeGreaterThan(100);
  });
});

describe("routes", () => {
  let server: Server;
  let base = "";
  beforeAll(async () => {
    server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("serves hubs, redirects a trailing slash, and serves the hub sitemap", async () => {
    const hub = await fetch(`${base}/rvs/washington/travel-trailers`);
    expect(hub.status).toBe(200);
    expect(await hub.text()).toContain("Travel Trailers for Sale in Washington");
    const slash = await fetch(`${base}/rvs/washington/`, { redirect: "manual" });
    expect(slash.status).toBe(301);
    expect(slash.headers.get("location")).toBe("/rvs/washington");
    const sm = await fetch(`${base}/sitemaps/hubs.xml`);
    expect(sm.status).toBe(200);
    expect((await fetch(`${base}/rvs/washington/travel-trailers/under-12345`)).status).toBe(404);
    expect((await fetch(`${base}/rvs/atlantis`)).status).toBe(404);
  });

  it("paginates hubs so every listed unit is reachable by links", async () => {
    const p2 = await fetch(`${base}/rvs/washington/travel-trailers?page=2`);
    expect(p2.status).toBe(200);
    const html = await p2.text();
    expect(html).toContain('<link rel="canonical" href="https://matchrv.com/rvs/washington/travel-trailers?page=2">');
    expect(html).toContain('rel="prev"');
    const one = await fetch(`${base}/rvs/washington/travel-trailers?page=1`, { redirect: "manual" });
    expect(one.status).toBe(301);
    expect((await fetch(`${base}/rvs/washington/travel-trailers?page=9999`)).status).toBe(404);
    expect((await fetch(`${base}/rvs/washington/travel-trailers?page=abc`)).status).toBe(404);
  });

  it("serves listing insights for a known unit and 404 for an unknown one", async () => {
    const u = units().find((x) => isIndexableUnit(x))!;
    const ok = await fetch(`${base}/api/listing-insights/${encodeURIComponent(u.id)}`);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { unitId: string; seo: { title: string } };
    expect(body.unitId).toBe(u.id);
    expect(body.seo.title).toContain("| MatchRV");
    const miss = await fetch(`${base}/api/listing-insights/${encodeURIComponent("vin:NOPE00000000000000")}`);
    expect(miss.status).toBe(404);
  });
});
