import { describe, expect, it } from "vitest";
import { sendDealerInquiry } from "@/lib/dealer-inquiry";

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
    expect(f.calls[0].body).toEqual({ unit_id: input.unitId, name: "Pat Shopper", email: "pat@example.com", phone: null, message: "Is this still available?" });
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

  it("respects a non-root BASE_URL", async () => {
    const f = fakeFetch([{ status: 404, body: { error: "unit_not_found" } }]);
    const r = await sendDealerInquiry(input, "/app", f.impl);
    expect(f.calls[0].url).toBe("/app/api/inquiries");
    expect(r.ok).toBe(false);
  });
});
