import { afterEach, describe, expect, it } from "vitest";
import {
  buildInquiryOutcomeEvent,
  classifyClientHint,
  configureProductAnalyticsForTests,
  captureProductEvent,
  flushProductAnalytics,
  productAnalyticsDroppedCount,
  resetProductAnalyticsForTests,
  sanitizeProductEvent,
  summarizeMcpExchange,
} from "../src/services/product-analytics";

const secretEmail = "pat@example.com";

afterEach(() => {
  resetProductAnalyticsForTests();
});

describe("product analytics privacy allowlist", () => {
  it("drops contact fields, free text, urls, tokens, and unknown properties", () => {
    const clean = sanitizeProductEvent({
      event: "website_listing_view",
      source: "website",
      listing_id: "stk:dealer.example:unit-1",
      dealer_id: "dealer-42",
      surface: "listing_detail",
      email: secretEmail,
      phone: "(253) 555-0142",
      message: "Is Saturday okay?",
      query: "bunkhouse near tacoma",
      page_location: "https://matchrv.com/listing/abc?token=sekret",
      authorization: "Bearer super-secret",
      session_key: "raw-mcp-session",
      confirmation_token: "tok_secret",
      vin: "1HGCM82633A004352",
      name: "Pat Tester",
    });
    expect(clean).toMatchObject({
      event: "website_listing_view",
      source: "website",
      listing_id: "stk:dealer.example:unit-1",
      dealer_id: "dealer-42",
      surface: "listing_detail",
      identity_is_person: false,
      $process_person_profile: false,
    });
    const blob = JSON.stringify(clean);
    expect(blob).not.toContain(secretEmail);
    expect(blob).not.toContain("555-0142");
    expect(blob).not.toContain("Saturday");
    expect(blob).not.toContain("tacoma");
    expect(blob).not.toContain("sekret");
    expect(blob).not.toContain("Bearer");
    expect(blob).not.toContain("raw-mcp-session");
    expect(blob).not.toContain("1HGCM82633A004352");
    expect(blob).not.toContain("Pat Tester");
  });

  it("rejects forged inquiry events and full urls from the website allowlist", () => {
    expect(sanitizeProductEvent({ event: "inquiry_outcome", source: "website", channel: "client" })).toBeNull();
    expect(sanitizeProductEvent({ event: "mcp_tool_completed", source: "website", tool_name: "search_rvs" })).toBeNull();
    expect(sanitizeProductEvent({
      event: "website_page_view",
      source: "website",
      path: "/swipe?zip=98402&q=family",
    })).toBeNull();
    expect(sanitizeProductEvent({
      event: "website_page_view",
      source: "website",
      path: "/swipe",
    })).toMatchObject({ event: "website_page_view", path: "/swipe" });
  });

  it("keeps an unknown user agent unknown and treats openai-mcp as a hint", () => {
    expect(classifyClientHint(undefined)).toEqual({ client_hint: "unknown", client_hint_is_proof: false });
    expect(classifyClientHint("SomeCustomClient/9.1")).toEqual({ client_hint: "unknown", client_hint_is_proof: false });
    expect(classifyClientHint("Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120.0.0.0")).toEqual({
      client_hint: "unknown",
      client_hint_is_proof: false,
    });
    expect(classifyClientHint("openai-mcp/1.0.0")).toEqual({
      client_hint: "openai_mcp_user_agent",
      client_hint_is_proof: false,
    });
    expect(classifyClientHint("curl/8.5.0")).toEqual({ client_hint: "test_or_scan", client_hint_is_proof: false });
    const hint = classifyClientHint("openai-mcp/1.0.0");
    expect(JSON.stringify(hint)).not.toContain("ChatGPT");
    expect(JSON.stringify(hint)).not.toContain("openai-mcp/1.0.0");
  });
});

describe("MCP exchange semantics", () => {
  it("records initialize and tools/list separately from shopper tool use", () => {
    const init = summarizeMcpExchange({
      method: "initialize",
      httpStatus: 200,
      latencyMs: 12,
      responseBody: "{}",
      userAgent: "openai-mcp/1.0.0",
    });
    expect(init).toHaveLength(1);
    expect(init[0]).toMatchObject({
      event: "mcp_protocol_request",
      method: "initialize",
      counts_as_shopper_tool: false,
      client_hint: "openai_mcp_user_agent",
      client_hint_is_proof: false,
    });
    const list = summarizeMcpExchange({
      method: "tools/list",
      httpStatus: 200,
      latencyMs: 8,
      responseBody: "{}",
      userAgent: "",
    });
    expect(list[0]).toMatchObject({ event: "mcp_protocol_request", method: "tools/list", counts_as_shopper_tool: false, client_hint: "unknown" });
  });

  it("emits one start and one completion for a tool call, with discovery and no-results not counted as errors", () => {
    const discovery = summarizeMcpExchange({
      method: "tools/call",
      toolName: "search_rvs",
      httpStatus: 200,
      latencyMs: 40,
      userAgent: "unknown-agent",
      responseBody: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          content: [{ type: "text", text: JSON.stringify({ status: "needs_discovery", results: [], nextQuestion: { id: "price_range" }, query: "family of 4 near home" }) }],
        },
      }),
    });
    expect(discovery.map((e) => e.event)).toEqual(["mcp_tool_started", "mcp_tool_completed"]);
    expect(discovery[0].execution_id).toBe(discovery[1].execution_id);
    expect(discovery[1]).toMatchObject({
      tool_name: "search_rvs",
      outcome: "discovery",
      counts_as_error: false,
      counts_as_shopper_tool: true,
      counts_as_results_returned: false,
      http_status: 200,
      latency_ms: 40,
      client_hint: "unknown",
      source: "mcp",
    });
    expect(JSON.stringify(discovery)).not.toContain("family of 4");

    const none = summarizeMcpExchange({
      method: "tools/call",
      toolName: "search_rvs",
      httpStatus: 200,
      latencyMs: 55,
      responseBody: JSON.stringify({
        result: { content: [{ type: "text", text: JSON.stringify({ status: "shortlist", results: [] }) }] },
      }),
    });
    expect(none[1]).toMatchObject({
      outcome: "no_results",
      result_count: 0,
      counts_as_error: false,
      counts_as_results_returned: true,
    });
  });

  it("counts an application error inside an HTTP 200 tool response", () => {
    const events = summarizeMcpExchange({
      method: "tools/call",
      toolName: "get_rv",
      httpStatus: 200,
      latencyMs: 15,
      listingIds: ["unit-9", secretEmail],
      responseBody: JSON.stringify({
        result: {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "unit_not_found", email: secretEmail }) }],
        },
      }),
    });
    expect(events[1]).toMatchObject({
      event: "mcp_tool_completed",
      outcome: "app_error",
      error_code: "unit_not_found",
      counts_as_error: true,
      http_status: 200,
      listing_id: "unit-9",
    });
    expect(JSON.stringify(events)).not.toContain(secretEmail);
  });

  it("does not emit a second shopper tool event for protocol methods", () => {
    const events = summarizeMcpExchange({
      method: "ping",
      httpStatus: 200,
      latencyMs: 1,
      responseBody: "",
    });
    expect(events.every((e) => e.counts_as_shopper_tool === false)).toBe(true);
    expect(events.some((e) => e.event === "mcp_tool_completed")).toBe(false);
  });
});

describe("inquiry outcome boundaries", () => {
  it("distinguishes queued, delivered, failed, duplicate, and dry run without contact fields", () => {
    const queued = buildInquiryOutcomeEvent({
      source: "website",
      status: "queued_for_matchrv",
      channel: "matchrv_forward",
      duplicate: false,
      dryRun: false,
      listingId: "unit-1",
      dealerId: "dealer-7",
    });
    expect(queued).toMatchObject({
      event: "inquiry_outcome",
      source: "website",
      outcome: "submitted_queued",
      counts_as_submitted: true,
      counts_as_queued: true,
      counts_as_delivered: false,
      channel: "matchrv_forward",
      listing_id: "unit-1",
      dealer_id: "dealer-7",
    });

    const delivered = buildInquiryOutcomeEvent({
      source: "mcp",
      status: "delivered",
      channel: "dealer_email",
      duplicate: false,
      dryRun: false,
      listingId: "unit-1",
      dealerId: "dealer-7",
    });
    expect(delivered).toMatchObject({
      outcome: "submitted_delivered",
      counts_as_submitted: true,
      counts_as_queued: false,
      counts_as_delivered: true,
      source: "mcp",
    });

    expect(buildInquiryOutcomeEvent({
      source: "mcp",
      status: "failed",
      channel: "matchrv_forward",
      duplicate: false,
      dryRun: false,
    })).toMatchObject({ outcome: "submitted_failed", counts_as_submitted: true, counts_as_delivered: false, counts_as_queued: false });

    expect(buildInquiryOutcomeEvent({
      source: "website",
      status: "delivered",
      channel: "dealer_email",
      duplicate: true,
      dryRun: false,
    })).toMatchObject({ outcome: "duplicate", counts_as_submitted: false, counts_as_delivered: false, counts_as_queued: false });

    expect(buildInquiryOutcomeEvent({
      source: "mcp",
      status: "dry_run",
      channel: "none",
      duplicate: false,
      dryRun: true,
    })).toMatchObject({ outcome: "dry_run", counts_as_submitted: false, counts_as_delivered: false });

    expect(buildInquiryOutcomeEvent({
      source: "website_webmcp",
      status: "queued_for_matchrv",
      channel: "demo_lead_record",
      duplicate: false,
      dryRun: false,
      dealerDeliverySupported: false,
    })).toMatchObject({
      source: "website_webmcp",
      outcome: "submitted_queued",
      counts_as_delivered: false,
      counts_as_queued: true,
      channel: "demo_lead_record",
    });

    const rejected = buildInquiryOutcomeEvent({
      source: "website",
      status: "not_confirmed",
      channel: "none",
      duplicate: false,
      dryRun: false,
      email: secretEmail,
      message: "please send this",
    });
    expect(rejected).toMatchObject({ outcome: "rejected", counts_as_submitted: false, status: "not_confirmed" });
    expect(JSON.stringify(rejected)).not.toContain(secretEmail);
    expect(JSON.stringify(rejected)).not.toContain("please send");
  });
});

describe("collector fail-open behavior", () => {
  it("is a no-op when the project key is missing and does not call the network", async () => {
    const calls: string[] = [];
    configureProductAnalyticsForTests({
      apiKey: "",
      transport: { sendBatch: async (body) => { calls.push(body); return { ok: true }; } },
    });
    captureProductEvent({ event: "website_page_view", source: "website", path: "/swipe" });
    await flushProductAnalytics();
    expect(calls).toEqual([]);
  });

  it("posts one batch to the official US capture host and does not throw when ingestion hangs", async () => {
    const bodies: string[] = [];
    configureProductAnalyticsForTests({
      apiKey: "test-project-token",
      host: "https://us.i.posthog.com",
      timeoutMs: 40,
      transport: {
        sendBatch: async (body) => {
          bodies.push(body);
          await new Promise(() => {});
          return { ok: true };
        },
      },
    });
    const started = Date.now();
    captureProductEvent({ event: "website_page_view", source: "website", path: "/swipe" });
    expect(Date.now() - started).toBeLessThan(30);
    await flushProductAnalytics();
    expect(Date.now() - started).toBeLessThan(500);
    // One bounded retry, then the event is dropped. Neither attempt is allowed to hang the caller.
    expect(bodies).toHaveLength(2);
    const payload = JSON.parse(bodies[0]) as { api_key: string; historical_migration: boolean; batch: Array<{ event: string; distinct_id: string; properties: Record<string, unknown> }> };
    expect(payload.api_key).toBe("test-project-token");
    expect(payload.historical_migration).toBe(false);
    expect(payload.batch).toHaveLength(1);
    expect(payload.batch[0].event).toBe("website_page_view");
    expect(payload.batch[0].properties.$process_person_profile).toBe(false);
    expect(payload.batch[0].properties.identity_is_person).toBe(false);
    expect(payload.batch[0].distinct_id.startsWith("anon_")).toBe(true);
    expect(productAnalyticsDroppedCount()).toBe(1);
  });

  it("drops events past the bounded queue instead of growing it", async () => {
    configureProductAnalyticsForTests({
      apiKey: "test-project-token",
      host: "https://us.i.posthog.com",
      maxQueue: 2,
      transport: { sendBatch: async () => ({ ok: true }) },
    });
    captureProductEvent({ event: "website_page_view", source: "website", path: "/a" });
    captureProductEvent({ event: "website_page_view", source: "website", path: "/b" });
    captureProductEvent({ event: "website_page_view", source: "website", path: "/c" });
    expect(productAnalyticsDroppedCount()).toBe(1);
  });

  it("refuses a non-PostHog host instead of sending events there", async () => {
    const calls: string[] = [];
    configureProductAnalyticsForTests({
      apiKey: "test-project-token",
      host: "https://example.internal/capture",
      transport: { sendBatch: async (body) => { calls.push(body); return { ok: true }; } },
    });
    captureProductEvent({ event: "website_page_view", source: "website", path: "/swipe" });
    await flushProductAnalytics();
    expect(calls).toEqual([]);
  });
});
