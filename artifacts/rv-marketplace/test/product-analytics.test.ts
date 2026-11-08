import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function installBrowser() {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock };
}

describe("website product events", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    ({ fetchMock } = installBrowser());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("emits a page view once for the same path and strips the query string", async () => {
    const { trackWebsiteProductEvent } = await import("@/lib/product-analytics");
    expect(trackWebsiteProductEvent({ event: "website_page_view", path: "/listing/vin:1HGCM82633A004352?token=sekret&q=family", sessionId: "sess_abc12345" })).toBe(true);
    expect(trackWebsiteProductEvent({ event: "website_page_view", path: "/listing/vin:1HGCM82633A004352?token=sekret&q=family", sessionId: "sess_abc12345" })).toBe(false);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toMatchObject({ event: "website_page_view", source: "website", path: "/listing", session_id: "sess_abc12345" });
    expect(JSON.stringify(body)).not.toContain("sekret");
    expect(JSON.stringify(body)).not.toContain("family");
    expect(JSON.stringify(body)).not.toContain("1HGCM82633A004352");
  });

  it("emits a listing view and a search result count separately, and ignores contact fields", async () => {
    const { trackWebsiteProductEvent } = await import("@/lib/product-analytics");
    expect(trackWebsiteProductEvent({
      event: "website_search_results",
      surface: "category_listings",
      rvType: "travel_trailer",
      resultCount: 12,
      sessionId: "sess_abc12345",
    })).toBe(true);
    const rawListing = "stk:dealer.example:unit-1";
    expect(trackWebsiteProductEvent({
      event: "website_listing_view",
      listingId: rawListing,
      dealerId: "dealer-9",
      surface: "listing_detail",
      sessionId: "sess_abc12345",
    })).toBe(true);
    expect(trackWebsiteProductEvent({
      event: "website_listing_view",
      listingId: rawListing,
      dealerId: "dealer-9",
      surface: "listing_detail",
      sessionId: "sess_abc12345",
    })).toBe(false);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1].body)));
    expect(bodies[0]).toMatchObject({ event: "website_search_results", result_count: 12, rv_type: "travel_trailer", surface: "category_listings" });
    expect(bodies[1]).toMatchObject({
      event: "website_listing_view",
      listing_id: `lst_${createHash("sha256").update(rawListing).digest("hex").slice(0, 24)}`,
      dealer_id: "dealer-9",
    });
    expect(JSON.stringify(bodies[1])).not.toContain(rawListing);
    expect(bodies[0]).not.toHaveProperty("email");
    expect(trackWebsiteProductEvent({
      event: "website_listing_view",
      listingId: "pat@example.com",
      surface: "listing_detail",
    } as never)).toBe(false);
  });

  it("does not throw when fetch rejects", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));
    const { trackWebsiteProductEvent } = await import("@/lib/product-analytics");
    expect(() => trackWebsiteProductEvent({ event: "website_card_viewed", listingId: "stk:dealer.example:unit-2", surface: "swipe" })).not.toThrow();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("does not transmit URL-shaped, query, VIN, or oversized listing ids", async () => {
    const { trackWebsiteProductEvent } = await import("@/lib/product-analytics");
    const urlKey = "key:u:https://nhrv.com/product/2018-keystone-montana-300lk/";
    expect(trackWebsiteProductEvent({
      event: "website_listing_view",
      listingId: urlKey,
      dealerId: "4ZSRVS.com:Peru",
      surface: "listing_detail",
    })).toBe(true);
    expect(trackWebsiteProductEvent({
      event: "website_listing_view",
      listingId: "key:u:https://evil.example/unit?token=sekret",
      surface: "listing_detail",
    })).toBe(false);
    expect(trackWebsiteProductEvent({
      event: "website_card_viewed",
      listingId: `key:u:https://evil.example/${"a".repeat(400)}`,
      surface: "swipe",
    })).toBe(false);
    expect(trackWebsiteProductEvent({
      event: "website_inventory_attention",
      listingId: "vin:1HGCM82633A004352",
      action: "like",
      surface: "discover",
    })).toBe(true);
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    const blob = JSON.stringify(fetchMock.mock.calls.map((call) => call[1].body));
    expect(blob).not.toContain("https://");
    expect(blob).not.toContain("sekret");
    expect(blob).not.toContain("1HGCM82633A004352");
    expect(blob).toContain("4zsrvs.com:peru");
    expect(blob).toContain(`lst_${createHash("sha256").update(urlKey).digest("hex").slice(0, 24)}`);
  });
});
