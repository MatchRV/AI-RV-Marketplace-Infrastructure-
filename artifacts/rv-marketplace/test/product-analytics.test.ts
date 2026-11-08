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
    expect(trackWebsiteProductEvent({ event: "website_page_view", path: "/listing/unit-1?token=sekret&q=family", sessionId: "sess_abc12345" })).toBe(true);
    expect(trackWebsiteProductEvent({ event: "website_page_view", path: "/listing/unit-1?token=sekret&q=family", sessionId: "sess_abc12345" })).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toMatchObject({ event: "website_page_view", source: "website", path: "/listing/unit-1", session_id: "sess_abc12345" });
    expect(JSON.stringify(body)).not.toContain("sekret");
    expect(JSON.stringify(body)).not.toContain("family");
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
    expect(trackWebsiteProductEvent({
      event: "website_listing_view",
      listingId: "stk:dealer.example:unit-1",
      dealerId: "dealer-9",
      surface: "listing_detail",
      sessionId: "sess_abc12345",
    })).toBe(true);
    expect(trackWebsiteProductEvent({
      event: "website_listing_view",
      listingId: "stk:dealer.example:unit-1",
      dealerId: "dealer-9",
      surface: "listing_detail",
      sessionId: "sess_abc12345",
    })).toBe(false);
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1].body)));
    expect(bodies[0]).toMatchObject({ event: "website_search_results", result_count: 12, rv_type: "travel_trailer", surface: "category_listings" });
    expect(bodies[1]).toMatchObject({ event: "website_listing_view", listing_id: "stk:dealer.example:unit-1", dealer_id: "dealer-9" });
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
    expect(() => trackWebsiteProductEvent({ event: "website_card_viewed", listingId: "unit-2", surface: "swipe" })).not.toThrow();
  });
});
