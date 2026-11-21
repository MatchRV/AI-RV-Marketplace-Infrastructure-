import { beforeEach, describe, expect, it, vi } from "vitest";

function installBrowserStubs() {
  const store = new Map<string, string>();
  const gtag = vi.fn();
  const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.stubGlobal("window", { gtag });
  vi.stubGlobal("document", { querySelector: () => null });
  vi.stubGlobal("fetch", fetchMock);
  return { gtag, fetchMock };
}

describe("trackLead", () => {
  let gtag: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    ({ gtag } = installBrowserStubs());
  });

  it("sends form_submit, the outcome event, and generate_lead for a verified lead", async () => {
    const { trackLead } = await import("@/lib/analytics");
    expect(trackLead("dealer_contact_form", { formId: "dealer_contact", dedupeKey: "a@b.com" })).toBe(true);
    const names = gtag.mock.calls.map(call => call[1]);
    expect(names).toEqual(["form_submit", "dealer_contact_form", "generate_lead"]);
    expect(gtag.mock.calls[2][2]).toMatchObject({ lead_type: "dealer_contact_form", lead_audience: "dealer", lead_verified: true, form_id: "dealer_contact" });
  });

  it("deduplicates repeat submissions of the same lead in a session", async () => {
    const { trackLead } = await import("@/lib/analytics");
    trackLead("snapshot_request", { dedupeKey: "r1" });
    expect(trackLead("snapshot_request", { dedupeKey: "r1" })).toBe(false);
    expect(gtag.mock.calls.filter(call => call[1] === "generate_lead")).toHaveLength(1);
    // a different report is a different lead
    expect(trackLead("snapshot_request", { dedupeKey: "r2" })).toBe(true);
  });

  it("does not count a booking-calendar click as a generated lead", async () => {
    const { trackLead } = await import("@/lib/analytics");
    trackLead("book_demo_click", { dedupeKey: "home_plans", placement: "home_plans" });
    const names = gtag.mock.calls.map(call => call[1]);
    expect(names).toEqual(["book_demo_click"]);
    expect(gtag.mock.calls[0][2]).toMatchObject({ placement: "home_plans", lead_verified: false });
  });

  it("no longer reports quiz events as GA4 purchases", async () => {
    const { trackEvent } = await import("@/lib/analytics");
    trackEvent("quiz_complete");
    trackEvent("quiz_start");
    const names = gtag.mock.calls.map(call => call[1]);
    expect(names).not.toContain("purchase");
    expect(names).not.toContain("begin_checkout");
  });

  it("maps return_visit to return_visit, not the reserved session_start event", async () => {
    const { trackEvent } = await import("@/lib/analytics");
    trackEvent("return_visit");
    const names = gtag.mock.calls.map(call => call[1]);
    expect(names).toEqual(["return_visit"]);
    expect(names).not.toContain("session_start");
  });

  it("sends consistent non-PII params including value/currency and strips email/name/phone", async () => {
    const { trackLead } = await import("@/lib/analytics");
    trackLead("buyer_dealer_inquiry", {
      formId: "listing_contact_dealer",
      dedupeKey: "42",
      listingId: 42,
      dealerId: "tacoma-rv",
      source: "listing_detail",
      surface: "unit_detail",
      placement: "listing_form",
      value: 58900,
      metadata: {
        email: "shopper@example.com",
        contactName: "Jane Doe",
        phone: "555-0100",
        title: "2019 Travel Trailer",
      },
    });
    const leadParams = gtag.mock.calls.find(call => call[1] === "generate_lead")?.[2] as Record<string, unknown>;
    expect(leadParams).toMatchObject({
      lead_type: "buyer_dealer_inquiry",
      lead_audience: "shopper",
      lead_verified: true,
      source: "listing_detail",
      surface: "unit_detail",
      placement: "listing_form",
      form_id: "listing_contact_dealer",
      item_id: "42",
      dealer_id: "tacoma-rv",
      value: 58900,
      currency: "USD",
      title: "2019 Travel Trailer",
    });
    expect(leadParams).not.toHaveProperty("email");
    expect(leadParams).not.toHaveProperty("contactName");
    expect(leadParams).not.toHaveProperty("phone");
    expect(JSON.stringify(leadParams)).not.toContain("shopper@example.com");
    expect(JSON.stringify(leadParams)).not.toContain("Jane Doe");
    expect(JSON.stringify(leadParams)).not.toContain("555-0100");
  });

  it("fires generate_lead for price alerts, buyers-agent inquiries, and /sell submissions", async () => {
    const { trackLead } = await import("@/lib/analytics");
    expect(trackLead("price_alert", { formId: "listing_price_alert", dedupeKey: "1", value: 10000 })).toBe(true);
    expect(trackLead("buyers_agent_inquiry", { formId: "buyers_agent", dedupeKey: "session" })).toBe(true);
    expect(trackLead("seller_listing_submit", { formId: "sell_your_rv", dedupeKey: "session", value: 25000 })).toBe(true);
    const generate = gtag.mock.calls.filter(call => call[1] === "generate_lead").map(call => call[2]);
    expect(generate).toHaveLength(3);
    expect(generate[0]).toMatchObject({ lead_type: "price_alert", lead_audience: "shopper", lead_verified: true, value: 10000, currency: "USD" });
    expect(generate[1]).toMatchObject({ lead_type: "buyers_agent_inquiry", lead_audience: "shopper" });
    expect(generate[2]).toMatchObject({ lead_type: "seller_listing_submit", lead_audience: "seller", value: 25000, currency: "USD" });
  });

  it("fires sign_up without generate_lead", async () => {
    const { trackSignUp } = await import("@/lib/analytics");
    expect(trackSignUp({ method: "clerk", dedupeKey: "user_1" })).toBe(true);
    expect(trackSignUp({ method: "clerk", dedupeKey: "user_1" })).toBe(false);
    const names = gtag.mock.calls.map(call => call[1]);
    expect(names).toEqual(["sign_up"]);
    expect(gtag.mock.calls[0][2]).toMatchObject({ method: "clerk" });
  });
});
