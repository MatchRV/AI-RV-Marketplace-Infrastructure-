import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetGa4MpForTests,
  __setGa4MpForTests,
  ga4MpEnabled,
  ga4MpReady,
  reportOffsiteGenerateLead,
  sendGenerateLead,
  OFFSITE_LEAD_SOURCES,
} from "../src/services/ga4-measurement-protocol";
import { emptyAttribution, type LeadRequestContext } from "../src/services/lead-attribution";

const SECRET = "test-only-mp-secret";
const ID = "G-Y2C0PN44L2";

function ctx(over: Partial<LeadRequestContext> = {}): LeadRequestContext {
  return {
    channel: "mcp",
    entryPoint: "mcp_send_dealer_inquiry",
    userAgent: "ChatGPT-User/1.0",
    attribution: emptyAttribution(),
    agent: {
      surface: "mcp",
      tier: "unverified_host",
      hostLabel: "chatgpt_app",
      clientId: null,
      clientName: null,
      sessionHash: null,
      scopes: [],
      limits: null,
      rejectedKey: false,
    },
    ...over,
  };
}

describe("GA4 Measurement Protocol", () => {
  const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

  beforeEach(() => {
    __resetGa4MpForTests();
    fetchImpl.mockClear();
    fetchImpl.mockResolvedValue(new Response(null, { status: 204 }));
    __setGa4MpForTests({ enabled: true, measurementId: ID, apiSecret: SECRET, fetchImpl: fetchImpl as unknown as typeof fetch });
  });

  afterEach(() => {
    __resetGa4MpForTests();
  });

  it("stays off by default (flag unset)", () => {
    __setGa4MpForTests({ enabled: null, measurementId: ID, apiSecret: SECRET, fetchImpl: fetchImpl as unknown as typeof fetch });
    delete process.env.GA4_MP_ENABLED;
    expect(ga4MpEnabled()).toBe(false);
    expect(ga4MpReady()).toBe(false);
  });

  it("is not ready when the secret is missing, even if the flag is on", () => {
    __setGa4MpForTests({ enabled: true, measurementId: ID, apiSecret: null, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(ga4MpReady()).toBe(false);
  });

  it("sends generate_lead for an off-site ChatGPT/MCP inquiry with no PII", async () => {
    reportOffsiteGenerateLead({
      ctx: ctx(),
      unitId: "lst_aaaaaaaaaaaaaaaaaaaaaaaa",
      dealerId: "tacoma-rv",
      priceUsd: 45900,
      inquiryId: "inq_test_1",
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("measurement_id=G-Y2C0PN44L2");
    expect(String(url)).toContain("api_secret=");
    const body = JSON.parse(String(init.body));
    expect(body.events).toHaveLength(1);
    expect(body.events[0].name).toBe("generate_lead");
    const params = body.events[0].params as Record<string, unknown>;
    expect(params.lead_type).toBe("buyer_dealer_inquiry");
    expect(params.lead_verified).toBe(true);
    expect(params.source).toBe("chatgpt_app");
    expect(params.item_id).toBe("lst_aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(params.dealer_id).toBe("tacoma-rv");
    expect(params.value).toBe(45900);
    expect(params.currency).toBe("USD");
    const blob = JSON.stringify(body);
    expect(blob).not.toMatch(/@/);
    expect(blob.toLowerCase()).not.toContain("email");
    expect(blob.toLowerCase()).not.toContain("phone");
    expect(OFFSITE_LEAD_SOURCES.has("chatgpt_app")).toBe(true);
  });

  it("does not send for a website browser inquiry (client gtag already fires)", async () => {
    reportOffsiteGenerateLead({
      ctx: ctx({
        channel: "http",
        entryPoint: "website_inquiry_api",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        agent: null,
      }),
      unitId: "lst_aaaaaaaaaaaaaaaaaaaaaaaa",
      inquiryId: "inq_web",
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not send for crawler traffic", async () => {
    reportOffsiteGenerateLead({
      ctx: ctx({
        channel: "http",
        entryPoint: "website_inquiry_api",
        userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        agent: null,
      }),
      inquiryId: "inq_bot",
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("strips PII if a caller accidentally passes it through sendGenerateLead", async () => {
    await sendGenerateLead({
      clientId: "1111111111111111.2222222222222222",
      source: "lotai",
      item_id: "u1",
      // @ts-expect-error intentional leak to prove the sanitizer
      email: "shopper@example.com",
    } as Parameters<typeof sendGenerateLead>[0] & { email?: string });
    // The extra email field is not on the official type; sendGenerateLead only
    // forwards the documented params, which already exclude PII. Re-check the body.
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const body = String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body);
    expect(body).not.toContain("shopper@example.com");
    expect(body).not.toContain("email");
  });

  it("swallows fetch failures so the lead path is not blocked", async () => {
    fetchImpl.mockRejectedValueOnce(new Error("network down"));
    await expect(sendGenerateLead({
      clientId: "1111111111111111.2222222222222222",
      source: "native_ios",
    })).resolves.toBeUndefined();
  });

  it("no-ops when the flag is off", async () => {
    __setGa4MpForTests({ enabled: false, measurementId: ID, apiSecret: SECRET, fetchImpl: fetchImpl as unknown as typeof fetch });
    reportOffsiteGenerateLead({
      ctx: ctx(),
      inquiryId: "inq_off",
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
