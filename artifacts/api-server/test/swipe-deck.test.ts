import { describe, expect, it, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { CanonicalUnit } from "@workspace/agent-core";
import { buildDeckPool, deckCoverage, deckEligible, toCard, unitDetail, withUtm, DECK_PER_DEALER_CAP } from "../src/services/swipe-deck";
import { getScreenedInventory } from "../src/services/screened-inventory";
import { inventoryQualityIssues } from "../src/services/mcp-inventory-quality";
import { outboundSummary, resetOutboundClicks } from "../src/services/outbound-clicks";
import { nearestZip } from "../src/services/zip-centroids";
import swipeRouter from "../src/routes/swipe";

const inv = () => getScreenedInventory();
const sample = () => inv().units.find((u) => deckEligible(u) && u.dealer.lat !== null)!;
const ok = async () => true;

describe("swipe deck eligibility (same screen as MCP search_rvs)", () => {
  it("excludes held, unpriced, MSRP-only, unavailable and photo-less units", () => {
    const u = sample();
    expect(deckEligible(u)).toBe(true);
    expect(deckEligible({ ...u, status: "pending" })).toBe(false);
    expect(deckEligible({ ...u, status: "unknown" })).toBe(false);
    expect(deckEligible({ ...u, priceUsd: { value: null, source: null, confidence: null } })).toBe(false);
    // MSRP is never an asking price: a unit with only an MSRP has no deck price.
    expect(deckEligible({ ...u, priceUsd: { value: null, source: null, confidence: null }, msrpUsd: { value: 99999, source: "dealer_listing", confidence: "high" } })).toBe(false);
    expect(deckEligible({ ...u, priceUsd: { value: 50000, source: "computed", confidence: "low" } })).toBe(false);
    expect(deckEligible({ ...u, images: [] })).toBe(false);
    expect(deckEligible({ ...u, images: ["https://dealer.example.com/no-image.jpg", "https://dealer.example.com/logo.png"] })).toBe(false);
  });
  it("uses the MCP-screened view: quarantined (held) units are not in the deck corpus", () => {
    const held = [...inv().quarantined.keys()].slice(0, 50);
    expect(held.length).toBeGreaterThan(0);
    for (const id of held) {
      expect(inv().byId.has(id)).toBe(false);
      expect(unitDetail(id)).toBeNull();
    }
    // A price below the class floor is held by the screen, so it never reaches the deck.
    const u = sample();
    expect(inventoryQualityIssues({ ...u, priceUsd: { value: 900, source: "dealer_listing", confidence: "high" } }).length).toBeGreaterThan(0);
  });
  it("never uses the dealer's name as the make (it would leak the dealer onto the card)", () => {
    const u = sample();
    expect(deckEligible({ ...u, make: u.dealer.name, title: `${u.year} ${u.dealer.name} ${u.model}` })).toBe(false);
  });
});

describe("swipe cards", () => {
  it("carry no dealer name and omit unknown specs", () => {
    const u = sample();
    const c = toCard({ ...u, lengthFt: { value: null, source: null, confidence: null }, sleeps: { value: 4, source: "computed", confidence: "low" }, condition: "unknown" }, 12.4);
    expect(c).not.toHaveProperty("lengthFt");
    expect(c).not.toHaveProperty("sleeps");
    expect(c).not.toHaveProperty("condition");
    expect(c.distanceMiles).toBe(12);
    expect(JSON.stringify(c)).not.toContain(u.dealer.name);
    expect(JSON.stringify(c)).not.toContain(u.dealer.id);
    expect(c.priceUsd).toBe(u.priceUsd.value);
  });
  it("builds a fit+distance pool near Tacoma with a per-dealer cap and only photo-checked units", async () => {
    const pool = await buildDeckPool({ zip: "98444" }, { photoCheck: ok });
    expect(pool.cards.length).toBeGreaterThan(20);
    const per = new Map<string, number>();
    for (const c of pool.cards) per.set(c.dealerKey, (per.get(c.dealerKey) ?? 0) + 1);
    expect(Math.max(...per.values())).toBeLessThanOrEqual(DECK_PER_DEALER_CAP);
    for (const c of pool.cards) {
      expect(c.distanceMiles).toBeLessThanOrEqual(150);
      expect(c.photo).toMatch(/^https:/);
      expect(c.priceUsd).toBeGreaterThan(0);
    }
    const none = await buildDeckPool({ zip: "98444" }, { photoCheck: async () => false });
    expect(none.cards).toEqual([]);
  });
  it("applies the type and budget pre-filter", async () => {
    const pool = await buildDeckPool({ zip: "98444", rvTypes: ["fifth_wheel"], priceMaxUsd: 60000 }, { photoCheck: ok });
    expect(pool.cards.length).toBeGreaterThan(0);
    for (const c of pool.cards) { expect(c.rvType).toBe("fifth_wheel"); expect(c.priceUsd).toBeLessThanOrEqual(60000); }
  });
  it("enforces a price floor without turning it into a ceiling, and does not invent Parkland", async () => {
    const { deckConstraints } = await import("../src/services/swipe-deck");
    expect(deckConstraints({ priceMinUsd: 200000 }).location).toBeUndefined();
    expect(deckConstraints({ priceMinUsd: 200000 }).priceMinUsd).toBe(200000);
    expect(deckConstraints({ priceMinUsd: 200000 }).priceMaxUsd).toBeUndefined();
    const pool = await buildDeckPool({ zip: "98444", rvTypes: ["class_a"], priceMinUsd: 200000, priceMaxUsd: 350000 }, { photoCheck: ok });
    expect(pool.cards.length).toBeGreaterThan(0);
    for (const c of pool.cards) {
      expect(c.rvType).toBe("class_a");
      expect(c.priceUsd).toBeGreaterThanOrEqual(200000);
      expect(c.priceUsd).toBeLessThanOrEqual(350000);
    }
  });
  it("reports coverage: eligible (price + photo) out of searchable", () => {
    const cov = deckCoverage();
    expect(cov.eligible).toBeGreaterThan(0);
    expect(cov.eligible).toBeLessThanOrEqual(cov.searchable);
  });
});

describe("near me and outbound redirect", () => {
  it("maps a coordinate to the nearest ZIP", () => {
    expect(nearestZip(47.17, -122.43)).toMatch(/^984\d\d$/);
    expect(nearestZip(0, 0)).toBeNull();
  });
  it("adds utm_source=matchrv without dropping the dealer's query", () => {
    const out = new URL(withUtm("https://dealer.example.com/unit/123?stock=A1"));
    expect(out.searchParams.get("stock")).toBe("A1");
    expect(out.searchParams.get("utm_source")).toBe("matchrv");
    expect(out.searchParams.get("utm_campaign")).toBe("swipe_deck");
  });

  let base = "";
  beforeEach(async () => {
    resetOutboundClicks();
    if (base) return;
    const app = express(); app.use(express.json()); app.use("/api", swipeRouter);
    const server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  it("GET /api/out logs the click and 302s to the dealer page with utm_source=matchrv", async () => {
    const u = inv().units.find((x) => deckEligible(x) && x.provenance.listingUrl)!;
    const r = await fetch(`${base}/api/out?unit=${encodeURIComponent(u.id)}&from=swipe`, { redirect: "manual" });
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.get("location")!);
    expect(loc.searchParams.get("utm_source")).toBe("matchrv");
    expect(r.headers.get("x-robots-tag")).toMatch(/noindex/);
    const s = outboundSummary();
    expect(s.total).toBe(1);
    expect(s.recent[0]).toMatchObject({ unitId: u.id, dealerId: u.dealer.id, from: "swipe" });
    expect(Object.keys(s.recent[0]).sort()).toEqual(["at", "dealerId", "dealerName", "from", "host", "unitId"]);
  });
  it("GET /api/out for an unknown or held unit goes back to /swipe and logs nothing", async () => {
    const held = [...inv().quarantined.keys()][0];
    for (const id of ["nope", held]) {
      const r = await fetch(`${base}/api/out?unit=${encodeURIComponent(id)}`, { redirect: "manual" });
      expect(r.status).toBe(302);
      expect(r.headers.get("location")).toBe("/swipe");
    }
    expect(outboundSummary().total).toBe(0);
  });
  it("GET /api/swipe/units/:id reveals the dealer name and lot for the detail view", async () => {
    const u = sample();
    const r = await fetch(`${base}/api/swipe/units/${encodeURIComponent(u.id)}`);
    const d = await r.json();
    expect(d.dealer).toEqual({ name: u.dealer.name, city: u.dealer.city, state: u.dealer.state });
    expect(typeof d.hasDealerPage).toBe("boolean");
  });
});

describe("detail view: description, options, specs, video (only what our data has)", () => {
  const all = () => inv().units.filter(deckEligible);
  it("returns the stored description as-is and flags a shortened one", () => {
    const u = all().find((x) => x.description && x.description.trim().length > 80)!;
    const d = unitDetail(u.id)!;
    expect(d.description).not.toBeNull();
    expect(u.description!.replace(/\s+/g, " ")).toContain(d.description!.replace(/\s+/g, " ").slice(0, 60));
    const s = all().find((x) => x.description && /(\u2026|\.\.\.)\s*$/.test(x.description))!;
    expect(unitDetail(s.id)!.descriptionShortened).toBe(true);
  });
  it("no description → null (never filled from the title), still a dealer link and spec facts", () => {
    const u = all().find((x) => !x.description && x.provenance.listingUrl)!;
    const d = unitDetail(u.id)!;
    expect(d.description).toBeNull();
    expect(d.hasDealerPage).toBe(true);
    for (const s of d.specs) expect(["dealer_listing", "derived_text", "manufacturer_spec"]).toContain(s.source);
  });
  it("a customer testimonial stored as the description is withheld, not shown as the dealer's description", async () => {
    const { cleanDescriptionText } = await import("../src/services/swipe-deck");
    expect(cleanDescriptionText("I had such an awesome experience with my purchase. My salesman was Mike, he brought us to the rv.")).toBeNull();
    expect(cleanDescriptionText("We purchased a new Jayco a week ago and the team was great.")).toBeNull();
    const real = "2023 Grand Design Imagine 2500RL with rear living, theater seating and a 15K BTU A/C.";
    expect(cleanDescriptionText(real)).toBe(real);
  });
  it("features drop page chrome (tabs, share buttons) and keep the dealer's own options", async () => {
    const { cleanFeatures } = await import("../src/services/swipe-deck");
    expect(cleanFeatures(["Description", "Similar RVs", "Share", "Pin It", "Power Awning w/ LED lights", "power awning w/ led lights", "  15K BTU AC "])).toEqual(["Power Awning w/ LED lights", "15K BTU AC"]);
    expect(cleanFeatures(null)).toEqual([]);
    expect(cleanFeatures(["Contact Sales", "Black Tank Flush"])).toEqual(["Black Tank Flush"]);
  });
  it("video only from the dealer's own listing data (YouTube), else null", () => {
    const withVid = all().filter((x) => unitDetail(x.id)!.video);
    for (const x of withVid) {
      const v = unitDetail(x.id)!.video!;
      expect(v.youtubeId).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(v.url).toMatch(/youtu/);
    }
    expect(unitDetail(sample().id)!.video === null || typeof unitDetail(sample().id)!.video!.youtubeId === "string").toBe(true);
  });
});

describe("deck refetch for check-in edits", () => {
  it("excludes already-shown ids and applies sleepsMin", async () => {
    const first = await buildDeckPool({ zip: "98444" }, { photoCheck: ok });
    const exclude = new Set(first.cards.slice(0, 10).map((c) => c.id));
    const again = await buildDeckPool({ zip: "98444", sleepsMin: 6 }, { photoCheck: ok, exclude });
    expect(again.cards.length).toBeGreaterThan(0);
    for (const c of again.cards) { expect(exclude.has(c.id)).toBe(false); expect(c.sleeps ?? 0).toBeGreaterThanOrEqual(6); }
  });
});
