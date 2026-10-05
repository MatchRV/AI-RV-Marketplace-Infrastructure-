import { describe, expect, it } from "vitest";
import { unitKnowledgeReceipts } from "../src/format.js";
import { normalizeRecord, type RawScrapeRecord } from "../src/normalize.js";

const base: RawScrapeRecord = {
  dealer_name: "Sample Dealer", dealer_domain: "example.com", dealer_location: "Tacoma, WA",
  _first_seen: "2026-10-01T00:00:00Z", _last_seen: "2026-10-05T00:00:00Z",
  inventory_status: "available", year: 2025, make: "Example", model: "35A",
  title: "2025 Example Class A Motorhome", rv_type: "Class A", price: 150000,
  image_urls: ["https://example.com/coach.jpg"], url: "https://example.com/coach/35a",
};

function coach(overrides: Partial<RawScrapeRecord> = {}) {
  const result = normalizeRecord("coach", { ...base, ...overrides });
  if ("reject" in result) throw Error(result.reject.reason);
  return result.unit;
}

describe("motorhome knowledge receipts", () => {
  it("keeps unpublished ratings unknown and exposes listing provenance", () => {
    const unit = coach();
    expect(unit.motorhome?.gcwrLbs.value).toBeNull();
    expect(unit.motorhome?.towCapacityAtGvwrLbs.value).toBeNull();
    const detail = unitKnowledgeReceipts(unit) as any;
    expect(detail.motorhome.gcwrLbs.source).toBeNull();
    expect(detail.facts.priceUsd.sourceUrl).toBe(base.url);
    expect(detail.photos.urls).toEqual(base.image_urls);
    expect(detail.availability.observedAt).toBe(base._last_seen);
  });

  it("calculates only a qualified ceiling at GVWR from three ratings", () => {
    const unit = coach({ gvwr: 18000, gcwr: 23000, receiver_hitch_rating: 10000,
      uvw: 15000, occc: 2500, front_axle_rating: 7000, rear_axle_rating: 12000,
      engine: "V8", horsepower: 350, torque: 468, transmission: "6-speed", chassis: "F53" });
    expect(unit.motorhome?.towCapacityAtGvwrLbs.value).toBe(5000);
    expect(unit.motorhome?.towCapacityAtGvwrLbs.source).toBe("computed");
    expect(unit.motorhome?.towCapacityAtGvwrLbs.note).toMatch(/screening ceiling/i);
    const detail = unitKnowledgeReceipts(unit) as any;
    expect(detail.motorhome.horsepowerHp.value).toBe(350);
    expect(detail.motorhome.gcwrLbs.sourceUrl).toBe(base.url);
  });

  it("does not invent OCCC from UVW and rejects conflicting ratings", () => {
    const unit = coach({ gvwr: 18000, uvw: 15000, gcwr: 17000, receiver_hitch_rating: 5000 });
    expect(unit.motorhome?.occcLbs.value).toBeNull();
    expect(unit.motorhome?.towCapacityAtGvwrLbs.value).toBeNull();
  });

  it("does not attach motorhome ratings to a travel trailer", () => {
    const result = normalizeRecord("trailer", { ...base, rv_type: "Travel Trailer", title: "2025 Example Travel Trailer", gcwr: 23000 });
    if ("reject" in result) throw Error(result.reject.reason);
    expect(result.unit.motorhome).toBeUndefined();
  });
});
