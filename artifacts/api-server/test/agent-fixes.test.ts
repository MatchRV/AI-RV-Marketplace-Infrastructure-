import { describe, expect, it } from "vitest";
import type { CanonicalUnit } from "@workspace/agent-core";
import { getInventory } from "../src/services/agent-inventory";
import { buildPreview, formatInquiryForwardText, unitListingUrl, type DealerInquiry } from "../src/services/dealer-inquiries";
import { unitAvailability } from "../src/mcp";
import { countUrlsInXml, renderSitemapIndex, renderUnitSitemapPage, unitSitemapPageCount, UNITS_PER_SITEMAP } from "../src/lib/sitemap";
import { isIndexableUnit } from "../src/lib/unit-insights";

const units = () => getInventory().units as CanonicalUnit[];
const contact = { name: "Test Shopper", email: "shopper@example.com", phone: null };

describe("dealer inquiry preview carries the unit's own listing URL", () => {
  it("uses provenance.listingUrl when the snapshot has one", () => {
    const unit = units().find((u) => /^https?:\/\//.test(u.provenance.listingUrl ?? ""))!;
    expect(unit).toBeTruthy();
    const p = buildPreview(unit, contact, "Is this still available?");
    expect(p.unit.stockUrl).toBe(unit.provenance.listingUrl);
    expect(p.unit.stockUrlNote).toContain(unit.provenance.lastSeenAt.slice(0, 10));
    expect(p.unit.stockUrlNote).not.toContain("does not store");
    const text = formatInquiryForwardText({ id: "inq_test", preview: p } as DealerInquiry);
    expect(text).toContain(`Listing: ${unit.provenance.listingUrl}`);
  });

  it("stays null, with the dealership website named, when there is no listing URL", () => {
    const unit = structuredClone(units()[0]);
    delete unit.provenance.listingUrl;
    const p = buildPreview(unit, contact, "Is this still available?");
    expect(p.unit.stockUrl).toBeNull();
    expect(p.unit.stockUrlNote).toContain("does not store a per-unit listing URL");
    expect(formatInquiryForwardText({ id: "inq_test", preview: p } as DealerInquiry)).not.toContain("Listing:");
  });

  it("rejects anything that is not a plain http(s) URL", () => {
    const unit = structuredClone(units()[0]);
    for (const bad of ["javascript:alert(1)", "ftp://x.example/y", "https://x.example/a b", "", "//x.example"]) {
      unit.provenance.listingUrl = bad;
      expect(unitListingUrl(unit)).toBeNull();
    }
  });
});

describe("get_rv availability block", () => {
  const base = () => structuredClone(units()[0]);
  const now = new Date("2026-11-14T12:00:00.000Z");

  it("reports status, last-seen date and age, and asks for dealer confirmation once it is over two days old", () => {
    const u = base(); u.status = "available"; u.provenance.lastSeenAt = "2026-11-10T04:47:46.000Z";
    const a = unitAvailability(u, "2026-11-10T16:54:16.000Z", now);
    expect(a).toMatchObject({ status: "available", lastSeenAt: "2026-11-10T04:47:46.000Z", daysSinceLastSeen: 4, snapshotBuiltAt: "2026-11-10T16:54:16.000Z", needsDealerConfirmation: true });
    expect(String(a.guidance)).toContain("2026-11-10");
    expect(String(a.guidance)).toContain("not a live stock check");
  });

  it("does not ask for confirmation on a unit seen today, and still never says live", () => {
    const u = base(); u.status = "available"; u.provenance.lastSeenAt = "2026-11-14T08:00:00.000Z";
    const a = unitAvailability(u, null, now);
    expect(a.daysSinceLastSeen).toBe(0);
    expect(a.needsDealerConfirmation).toBe(false);
  });

  it("keeps unknown unknown and flags pending/removed", () => {
    const u = base(); u.provenance.lastSeenAt = "2026-11-14T08:00:00.000Z";
    u.status = "unknown";
    expect(unitAvailability(u, null, now)).toMatchObject({ status: "unknown", needsDealerConfirmation: true });
    expect(String(unitAvailability(u, null, now).guidance)).toContain("unknown");
    u.status = "pending";
    expect(String(unitAvailability(u, null, now).guidance)).toContain("sale pending");
    u.status = "removed";
    expect(String(unitAvailability(u, null, now).guidance)).toContain("Do not present it as available");
  });

  it("handles a missing last-seen date without inventing one", () => {
    const u = base(); u.status = "available"; u.provenance.lastSeenAt = "";
    expect(unitAvailability(u, null, now)).toMatchObject({ lastSeenAt: null, daysSinceLastSeen: null, needsDealerConfirmation: true });
  });
});

describe("sitemap advertises unit pages without saying where records came from", () => {
  it("index lists core, hubs, plus every unit page", () => {
    const xml = renderSitemapIndex();
    const pages = unitSitemapPageCount();
    expect(xml).toContain("https://matchrv.com/sitemaps/core.xml");
    expect(xml).toContain("https://matchrv.com/sitemaps/hubs.xml");
    for (let i = 1; i <= pages; i++) expect(xml).toContain(`https://matchrv.com/sitemaps/units-${i}.xml`);
    expect(countUrlsInXml(xml)).toBe(pages + 2);
  });

  it("unit pages cover every indexable unit that is not removed, within the per-file limit", () => {
    const expected = units().filter((u) => u.status !== "removed" && isIndexableUnit(u)).length;
    expect(expected).toBeGreaterThan(0);
    let total = 0;
    for (let i = 1; i <= unitSitemapPageCount(); i++) {
      const n = countUrlsInXml(renderUnitSitemapPage(i)!);
      expect(n).toBeLessThanOrEqual(UNITS_PER_SITEMAP);
      total += n;
    }
    expect(total).toBe(expected);
    expect(renderUnitSitemapPage(unitSitemapPageCount() + 1)).toBeNull();
  });

  it("contains only MatchRV listing URLs and dates: no source, harvest method or dealer URL", () => {
    const xml = renderUnitSitemapPage(1)!;
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs.every((l) => l.startsWith("https://matchrv.com/listing/"))).toBe(true);
    // Unit ids hold dealer domains and towns (e.g. "mechanicsville"), so check everything outside <loc>.
    expect(xml.replace(/<loc>[^<]*<\/loc>/g, "")).not.toMatch(/marketcheck|harvest|scrap|csv|feed|dealer_website|sourceKind|lastSeenBasis/i);
    const tags = new Set([...xml.matchAll(/<([a-z]+)[ >]/g)].map((m) => m[1]));
    // changefreq is gone: Google ignores it.
    expect([...tags].sort()).toEqual(["lastmod", "loc", "url", "urlset"]);
  });
});

describe("availability block does not expose record source", () => {
  it("has no basis / harvest / source fields", () => {
    const a = unitAvailability(units()[0], null);
    expect(Object.keys(a).join(",")).not.toMatch(/basis|harvest|source/i);
  });
});
