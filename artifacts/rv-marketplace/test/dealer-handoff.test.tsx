import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
});
afterEach(() => { delete (globalThis as any).sessionStorage; });

describe("dealer handoff links", () => {
  it("every dealer link goes through the tagged /api/out redirect with surface and session id", async () => {
    const { dealerOutHref } = await import("../src/lib/dealer-handoff");
    const href = dealerOutHref({ unitId: "stk:dealer.com:A1" }, "swipe_detail", { base: "/" });
    const url = new URL(href, "https://matchrv.com");
    expect(url.pathname).toBe("/api/out");
    expect(url.searchParams.get("unit")).toBe("stk:dealer.com:A1");
    expect(url.searchParams.get("from")).toBe("swipe_detail");
    expect(url.searchParams.get("sid")).toMatch(/^\d+-[a-z0-9]+$/);
    expect(url.searchParams.get("alert")).toBeNull();
    const withAlert = new URL(dealerOutHref({ unitId: "u1" }, "answer_engine", { alertSaved: true, base: "/" }), "https://matchrv.com");
    expect(withAlert.searchParams.get("alert")).toBe("1");
    const home = new URL(dealerOutHref({ dealerId: "d-9" }, "answer_engine", { base: "/" }), "https://matchrv.com");
    expect(home.searchParams.get("dealer")).toBe("d-9");
    expect(home.searchParams.get("unit")).toBeNull();
  });

  it("offers the 'before you go' step once per tab, and it can always be skipped", async () => {
    const { shouldOfferBeforeYouGo, markBeforeYouGoSeen, looksLikeEmail } = await import("../src/lib/dealer-handoff");
    expect(shouldOfferBeforeYouGo()).toBe(true);
    markBeforeYouGoSeen();
    expect(shouldOfferBeforeYouGo()).toBe(false);
    expect(looksLikeEmail("pat@example.com")).toBe(true);
    expect(looksLikeEmail("pat@")).toBe(false);
  });

  it("renders the dealer link as small secondary text pointing at /api/out (never the raw dealer URL)", async () => {
    const { DealerSiteLink } = await import("../src/components/dealer-handoff");
    const html = renderToStaticMarkup(<DealerSiteLink unitId="u1" surface="swipe_detail">Dealer's own page</DealerSiteLink>);
    expect(html).toContain('data-testid="dealer-site-link"');
    expect(html).toMatch(/href="\/api\/out\?unit=u1&amp;from=swipe_detail/);
    expect(html).toContain("text-xs");
    expect(html).not.toContain("https://");
  });
});
