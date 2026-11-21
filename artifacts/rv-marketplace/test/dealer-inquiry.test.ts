import { describe, expect, it } from "vitest";
import { fetchShopperInquiryStatus, sendDealerInquiry, shopperInquiryStatusCopy } from "@/lib/dealer-inquiry";
import { landingFrom } from "@/lib/lead-attribution";

type Call = { url: string; body: any };
function fakeFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Call[] = [];
  const impl = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    const r = responses.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  };
  return { calls, impl };
}
const input = { unitId: "stk:example.com:id-1", name: "Pat Shopper", email: "pat@example.com", phone: null, message: "Is this still available?" };

describe("listing page Contact Dealer → /api/inquiries", () => {
  it("previews, then sends with the confirmation token (never /api/leads)", async () => {
    const f = fakeFetch([
      { status: 200, body: { preview: {}, confirmationToken: "dic_abc.sig" } },
      { status: 201, body: { inquiry: { inquiryId: "inq_1", status: "queued_for_matchrv", statusDetail: "Queued" } } },
    ]);
    const r = await sendDealerInquiry(input, "/", f.impl);
    expect(r).toEqual({ ok: true, inquiryId: "inq_1", status: "queued_for_matchrv", statusDetail: "Queued" });
    expect(f.calls.map((c) => c.url)).toEqual(["/api/inquiries", "/api/inquiries"]);
    expect(f.calls[0].body).toEqual({ unit_id: input.unitId, name: "Pat Shopper", email: "pat@example.com", phone: null, message: "Is this still available?", attribution: { client: "website", platform: "web" } });
    expect(f.calls[1].body).toEqual({ confirmation_token: "dic_abc.sig", confirmed: true });
    expect(f.calls.some((c) => c.url.includes("/api/leads"))).toBe(false);
  });

  it("does not send when the preview is rejected and shows the server's reason", async () => {
    const f = fakeFetch([{ status: 400, body: { error: "invalid_contact", errors: [{ field: "email", problem: "That email address does not look valid." }] } }]);
    const r = await sendDealerInquiry({ ...input, email: "bad" }, "/", f.impl);
    expect(r).toEqual({ ok: false, error: "That email address does not look valid." });
    expect(f.calls).toHaveLength(1);
  });

  it("reports a failed delivery as an error, not as sent", async () => {
    const f = fakeFetch([
      { status: 200, body: { confirmationToken: "dic_abc.sig" } },
      { status: 201, body: { inquiry: { inquiryId: "inq_2", status: "failed", statusDetail: "Not delivered: contact the dealership directly." } } },
    ]);
    const r = await sendDealerInquiry(input, "/", f.impl);
    expect(r).toEqual({ ok: false, error: "Not delivered: contact the dealership directly." });
  });

  it("shows queued and forwarded as different shopper statuses", () => {
    expect(shopperInquiryStatusCopy("queued_for_matchrv", "Fife RV")).toMatch(/has not reached the dealership/);
    expect(shopperInquiryStatusCopy("queued_for_matchrv", "Fife RV")).not.toMatch(/forwarded your message/);
    expect(shopperInquiryStatusCopy("forwarded", "Fife RV")).toMatch(/forwarded your message to Fife RV/);
    expect(shopperInquiryStatusCopy("forwarded", "Fife RV")).toMatch(/does not mean they have replied/);
    expect(shopperInquiryStatusCopy("delivered", "Fife RV")).not.toMatch(/forwarded your message/);
  });

  it("reads a forwarded status with the shopper token and ignores a failed lookup", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push(url);
      expect(new Headers(init?.headers).get("x-inquiry-token")).toBe("ist_token");
      return new Response(JSON.stringify({ inquiry: { status: "forwarded", statusDetail: "Forwarded." } }), { status: 200 });
    };
    await expect(fetchShopperInquiryStatus("/", "inq_1", "ist_token", fetchImpl)).resolves.toEqual({ status: "forwarded", statusDetail: "Forwarded." });
    expect(calls).toEqual(["/api/inquiries/inq_1"]);
    const missing = async () => new Response("{}", { status: 404 });
    await expect(fetchShopperInquiryStatus("/", "inq_1", "ist_nope", missing)).resolves.toBeNull();
  });

  it("respects a non-root BASE_URL", async () => {
    const f = fakeFetch([{ status: 404, body: { error: "unit_not_found" } }]);
    const r = await sendDealerInquiry(input, "/app", f.impl);
    expect(f.calls[0].url).toBe("/app/api/inquiries");
    expect(r.ok).toBe(false);
  });
});

describe("lead attribution on the inquiry", () => {
  it("sends surface + landing attribution without contact details, and can be turned off", async () => {
    const f = fakeFetch([
      { status: 200, body: { confirmationToken: "dic_abc.sig" } },
      { status: 201, body: { inquiry: { inquiryId: "inq_3", status: "queued_for_matchrv", statusDetail: "Queued" } } },
    ]);
    await sendDealerInquiry({ ...input, surface: "unit_detail" }, "/", f.impl, { client: "website", platform: "web", surface: "unit_detail", utm_source: "google", session_id: "1732000000000-abc1234" });
    expect(f.calls[0].body.attribution).toEqual({ client: "website", platform: "web", surface: "unit_detail", utm_source: "google", session_id: "1732000000000-abc1234" });
    expect(JSON.stringify(f.calls[0].body.attribution)).not.toContain("pat@example.com");
    expect(f.calls[1].body).toEqual({ confirmation_token: "dic_abc.sig", confirmed: true });
    const g = fakeFetch([{ status: 400, body: { error: "invalid_contact" } }]);
    await sendDealerInquiry(input, "/", g.impl, null);
    expect(g.calls[0].body).not.toHaveProperty("attribution");
  });

  it("landingFrom keeps slug utm tags, the referrer host and the path only", () => {
    expect(landingFrom("https://matchrv.com/listing/abc?utm_source=Google&utm_medium=cpc&utm_campaign=has%20space&email=a@b.co", "https://www.facebook.com/some/path?x=1"))
      .toEqual({ utm_source: "google", utm_medium: "cpc", landing_page: "/listing/abc", referrer: "www.facebook.com" });
    expect(landingFrom("https://matchrv.com/", "https://matchrv.com/other")).toEqual({ landing_page: "/" });
  });
});
