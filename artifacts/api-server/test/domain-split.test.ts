import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app";
import { migrationTarget } from "../src/lib/site-host";
import { CONSUMER_CORE_URLS, DEALER_CORE_URLS } from "../src/lib/sitemap-core-urls";
import { renderCoreSitemap, renderSitemapIndex } from "../src/lib/sitemap";

let server: Server;
let port = 0;

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function hit(path: string, host: string): Promise<{ status: number; location?: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: "GET", headers: { Host: host } },
      (res) => {
        res.resume();
        const location = Array.isArray(res.headers.location) ? res.headers.location[0] : res.headers.location;
        resolve({ status: res.statusCode ?? 0, location });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("host migration targets", () => {
  it("sends dealer marketing from the apex to dealer.matchrv.com and keeps the query", () => {
    expect(migrationTarget("matchrv.com", "/visibility-solution", "?utm=newsletter")).toBe(
      "https://dealer.matchrv.com/visibility-solution?utm=newsletter",
    );
    expect(migrationTarget("www.matchrv.com", "/lotai/", "")).toBe("https://dealer.matchrv.com/lotai");
    expect(migrationTarget("matchrv.com", "/advertising", "?ref=old")).toBe(
      "https://dealer.matchrv.com/visibility-solution?ref=old",
    );
  });

  it("sends inventory and shopper pages from the dealer host back to the apex", () => {
    expect(migrationTarget("dealer.matchrv.com", "/listing/vin:TESTVIN123456789", "?utm=1")).toBe(
      "https://matchrv.com/listing/vin:TESTVIN123456789?utm=1",
    );
    expect(migrationTarget("dealer.matchrv.com", "/shop", "")).toBe("https://matchrv.com/shop");
    expect(migrationTarget("dealer.matchrv.com", "/rvs/washington", "")).toBe("https://matchrv.com/rvs/washington");
  });

  it("never redirects MCP, API, well-known, ops, or the two homepages", () => {
    for (const host of ["matchrv.com", "dealer.matchrv.com", "www.matchrv.com"]) {
      expect(migrationTarget(host, "/mcp", "")).toBeNull();
      expect(migrationTarget(host, "/mcp/v1", "")).toBeNull();
      expect(migrationTarget(host, "/api/listings", "?limit=1")).toBeNull();
      expect(migrationTarget(host, "/api/out", "?unit=1")).toBeNull();
      expect(migrationTarget(host, "/.well-known/muse-challenge/abc", "")).toBeNull();
      expect(migrationTarget(host, "/ops/leads-dashboard", "")).toBeNull();
      expect(migrationTarget(host, "/", "")).toBeNull();
    }
    expect(migrationTarget("localhost", "/lotai", "")).toBeNull();
    expect(migrationTarget("127.0.0.1", "/shop", "")).toBeNull();
  });
});

describe("separate sitemaps", () => {
  it("keeps listings on the consumer sitemap and dealer services on the dealer sitemap", () => {
    const consumer = renderCoreSitemap("consumer");
    const dealer = renderCoreSitemap("dealer");
    expect(consumer).toContain("https://matchrv.com/shop");
    expect(consumer).toContain("https://matchrv.com/mcp-docs");
    expect(consumer).not.toContain("dealer.matchrv.com");
    expect(consumer).not.toContain("/lotai");
    expect(dealer).toContain("https://dealer.matchrv.com/lotai");
    expect(dealer).toContain("https://dealer.matchrv.com/");
    expect(dealer).not.toContain("https://matchrv.com/");
    expect(dealer).not.toContain("/listing/");
    expect(renderSitemapIndex("dealer")).not.toContain("units-");
    expect(renderSitemapIndex("dealer")).not.toContain("hubs.xml");
    expect(renderSitemapIndex("consumer")).toContain("https://matchrv.com/sitemaps/hubs.xml");
    for (const url of CONSUMER_CORE_URLS) expect(consumer).toContain(`<loc>${url}</loc>`);
    for (const url of DEALER_CORE_URLS) expect(dealer).toContain(`<loc>${url}</loc>`);
  });
});

describe("production host redirects", () => {
  it("301s dealer marketing on matchrv.com and listings on the dealer host, and leaves /mcp alone", async () => {
    const dealerPage = await hit("/visibility-solution?utm=keep", "matchrv.com");
    expect(dealerPage.status).toBe(301);
    expect(dealerPage.location).toBe("https://dealer.matchrv.com/visibility-solution?utm=keep");

    const listing = await hit("/listing/vin:TESTVIN123456789?src=ad", "dealer.matchrv.com");
    expect(listing.status).toBe(301);
    expect(listing.location).toBe("https://matchrv.com/listing/vin:TESTVIN123456789?src=ad");

    const apexListing = await hit("/listing/vin:TESTVIN123456789", "matchrv.com");
    expect(apexListing.status).not.toBe(301);
    expect(apexListing.location).toBeUndefined();

    for (const host of ["matchrv.com", "dealer.matchrv.com"]) {
      const mcp = await hit("/mcp", host);
      expect(mcp.status).not.toBe(301);
      expect(mcp.location).toBeUndefined();
      const api = await hit("/api/listings?limit=1", host);
      expect(api.status).not.toBe(301);
      expect(api.location).toBeUndefined();
    }
  });

  it("serves a dealer sitemap on the dealer host and a consumer sitemap on the apex", async () => {
    const dealer = await new Promise<string>((resolve, reject) => {
      http.get({ hostname: "127.0.0.1", port, path: "/sitemap.xml", headers: { Host: "dealer.matchrv.com" } }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      }).on("error", reject);
    });
    expect(dealer).toContain("https://dealer.matchrv.com/sitemaps/core.xml");
    expect(dealer).not.toContain("/listing/");
    expect(dealer).not.toContain("hubs.xml");

    const consumer = await new Promise<string>((resolve, reject) => {
      http.get({ hostname: "127.0.0.1", port, path: "/sitemaps/core.xml", headers: { Host: "matchrv.com" } }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      }).on("error", reject);
    });
    expect(consumer).toContain("https://matchrv.com/shop");
    expect(consumer).not.toContain("dealer.matchrv.com");
  });
});
