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
    expect(gtag.mock.calls[2][2]).toMatchObject({ lead_type: "dealer_contact_form", lead_audience: "dealer", lead_verified: true });
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
    trackLead("book_demo_click", { dedupeKey: "home_plans" });
    const names = gtag.mock.calls.map(call => call[1]);
    expect(names).toEqual(["book_demo_click"]);
  });

  it("no longer reports quiz events as GA4 purchases", async () => {
    const { trackEvent } = await import("@/lib/analytics");
    trackEvent("quiz_complete");
    trackEvent("quiz_start");
    const names = gtag.mock.calls.map(call => call[1]);
    expect(names).not.toContain("purchase");
    expect(names).not.toContain("begin_checkout");
  });
});
