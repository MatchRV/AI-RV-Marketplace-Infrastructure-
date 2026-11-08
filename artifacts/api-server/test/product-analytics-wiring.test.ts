import { afterEach, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { ensureDbReady } from "@workspace/db";
import { matchRvMcpHandler } from "../src/mcp";
import { getInventory } from "../src/services/agent-inventory";
import inquiriesRouter from "../src/routes/inquiries";
import swipeRouter from "../src/routes/swipe";
import productAnalyticsRouter from "../src/routes/product-analytics";
import { __resetLeadStore, createPreview, decidePreview, submitPreview } from "../src/services/agent-leads";
import {
  __resetInquiries, __setRoutes, __setTransport, prepareInquiry, sendInquiry, type InquiryTransport,
} from "../src/services/dealer-inquiries";
import { resetOutboundClicks } from "../src/services/outbound-clicks";
import { deckEligible } from "../src/services/swipe-deck";
import {
  configureProductAnalyticsForTests,
  flushProductAnalytics,
  observeMcpFetch,
  resetProductAnalyticsForTests,
} from "../src/services/product-analytics";

const SHOPPER_EMAIL = "analytics-shopper@example.com";

type Captured = { event: string; distinct_id: string; properties: Record<string, unknown> };

function collectEvents(): Captured[] {
  const events: Captured[] = [];
  configureProductAnalyticsForTests({
    apiKey: "test-project-token",
    host: "https://us.i.posthog.com",
    timeoutMs: 50,
    transport: {
      async sendBatch(body) {
        const parsed = JSON.parse(body) as { batch: Captured[] };
        events.push(...parsed.batch);
        return { ok: true };
      },
    },
  });
  return events;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
  await flushProductAnalytics();
}

function mockTransport(opts: { email?: boolean; push?: boolean } = {}): InquiryTransport {
  return {
    emailConfigured: () => opts.email ?? true,
    opsPushConfigured: () => opts.push ?? true,
    async sendEmail() { if (!(opts.email ?? true)) throw new Error("smtp down"); },
    async notifyOps() { if (!(opts.push ?? true)) throw new Error("ntfy down"); },
  };
}

afterEach(() => {
  resetProductAnalyticsForTests();
  __resetInquiries();
  __setTransport(null);
  __setRoutes({});
});

describe("MCP request observer", () => {
  it("returns the handler body immediately and emits one protocol event for initialize", async () => {
    const events = collectEvents();
    const started = Date.now();
    const response = await observeMcpFetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "SomeCustomClient/9" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      }),
      async () => new Response(JSON.stringify({ result: { protocolVersion: "2025-03-26" } }), { status: 200 }),
    );
    expect(Date.now() - started).toBeLessThan(50);
    expect(await response.json()).toEqual({ result: { protocolVersion: "2025-03-26" } });
    await settle();
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("mcp_protocol_request");
    expect(events[0].properties.counts_as_shopper_tool).toBe(false);
    expect(events[0].properties.client_hint).toBe("unknown");
    expect(JSON.stringify(events)).not.toContain("SomeCustomClient");
  });

  it("emits one start and one completion for a tool call, not a second copy", async () => {
    const events = collectEvents();
    await observeMcpFetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "openai-mcp/1.0.0" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "tools/call",
          params: { name: "search_rvs", arguments: { query: "family bunkhouse near home", unit_id: "unit-1" } },
        }),
      }),
      async () => new Response(JSON.stringify({
        result: { content: [{ type: "text", text: JSON.stringify({ status: "needs_discovery", results: [], query: "family bunkhouse near home" }) }] },
      }), { status: 200 }),
    );
    await settle();
    expect(events.map((e) => e.event)).toEqual(["mcp_tool_started", "mcp_tool_completed"]);
    expect(events[1].properties).toMatchObject({
      outcome: "discovery",
      counts_as_error: false,
      tool_name: "search_rvs",
      client_hint: "openai_mcp_user_agent",
      client_hint_is_proof: false,
      source: "mcp",
    });
    expect(JSON.stringify(events)).not.toContain("bunkhouse");
    expect(JSON.stringify(events)).not.toContain("openai-mcp/1.0.0");
  });
});

describe("inquiry analytics at the send boundary", () => {
  const lookupUnit = (id: string) => getInventory().byId.get(id);

  it("records queued vs delivered once, and a duplicate send is not a second lead", async () => {
    const events = collectEvents();
    __setTransport(mockTransport({ email: false, push: true }));
    const unit = getInventory().units.find((u) => u.status === "available")!;
    const prepared = prepareInquiry(unit, { name: "Pat", email: SHOPPER_EMAIL, phone: null, message: "Is it available Saturday?" });
    if (!prepared.ok) throw new Error("preview failed");
    const queued = await sendInquiry({
      confirmationToken: prepared.confirmationToken, confirmed: true, requesterKey: "analytics-q", scope: null, lookupUnit,
      analyticsSource: "website",
    });
    expect(queued.ok).toBe(true);
    const again = prepareInquiry(unit, { name: "Pat", email: SHOPPER_EMAIL, phone: null, message: "Is it available Saturday?" });
    if (!again.ok) throw new Error("preview failed");
    const duplicate = await sendInquiry({
      confirmationToken: again.confirmationToken, confirmed: true, requesterKey: "analytics-q2", scope: null, lookupUnit,
      analyticsSource: "website",
    });
    expect(duplicate.ok && duplicate.duplicate).toBe(true);
    await settle();
    const leads = events.filter((e) => e.event === "inquiry_outcome");
    expect(leads).toHaveLength(2);
    expect(leads[0].properties).toMatchObject({ outcome: "submitted_queued", counts_as_submitted: true, counts_as_delivered: false, source: "website" });
    expect(leads[1].properties).toMatchObject({ outcome: "duplicate", counts_as_submitted: false, counts_as_delivered: false });
    expect(JSON.stringify(leads)).not.toContain(SHOPPER_EMAIL);
    expect(JSON.stringify(leads)).not.toContain("Saturday");
  });

  it("still returns the inquiry when ingestion throws", async () => {
    configureProductAnalyticsForTests({
      apiKey: "test-project-token",
      host: "https://us.i.posthog.com",
      timeoutMs: 20,
      transport: { async sendBatch() { throw new Error("analytics down"); } },
    });
    __setTransport(mockTransport({ email: true, push: false }));
    __setRoutes({ "*": "dealer@example.com" });
    const unit = getInventory().units.find((u) => u.status === "available")!;
    const prepared = prepareInquiry(unit, { name: "Pat", email: SHOPPER_EMAIL, phone: null, message: "Hello" });
    if (!prepared.ok) throw new Error("preview failed");
    const result = await sendInquiry({
      confirmationToken: prepared.confirmationToken, confirmed: true, requesterKey: "analytics-throw", scope: null, lookupUnit,
      analyticsSource: "mcp",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.inquiry.status === "delivered" || result.inquiry.status === "queued_for_matchrv").toBe(true);
    await settle();
  });

  it("labels the website route and the MCP tool with different sources", async () => {
    const events = collectEvents();
    __setTransport(mockTransport());
    const app = express();
    app.use(express.json());
    app.use("/api", inquiriesRouter);
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const unit = getInventory().units.find((u) => u.status === "available")!;
      const preview = await fetch(`${base}/api/inquiries`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ unit_id: unit.id, name: "Pat", email: SHOPPER_EMAIL, message: "Can I visit?" }),
      });
      const previewBody = await preview.json() as { confirmationToken: string };
      const sent = await fetch(`${base}/api/inquiries`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation_token: previewBody.confirmationToken, confirmed: true, dry_run: true }),
      });
      expect(sent.status).toBe(201);
      const response = await matchRvMcpHandler.fetch(new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "user-agent": "openai-mcp/1.0.0" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "tools/call",
          params: {
            name: "send_dealer_inquiry",
            arguments: { confirmation_token: "not-a-real-token", confirmed: false },
          },
        }),
      }));
      expect(response.status).toBe(200);
      await settle();
      const inquiries = events.filter((e) => e.event === "inquiry_outcome");
      expect(inquiries.some((e) => e.properties.source === "website" && e.properties.outcome === "dry_run")).toBe(true);
      expect(inquiries.some((e) => e.properties.source === "mcp" && e.properties.outcome === "rejected")).toBe(true);
      const toolEvents = events.filter((e) => e.event === "mcp_tool_completed");
      expect(toolEvents).toHaveLength(1);
      expect(toolEvents[0].properties.counts_as_shopper_tool).toBe(true);
      expect(JSON.stringify(events)).not.toContain(SHOPPER_EMAIL);
    } finally {
      server.close();
    }
  });
});

describe("website server actions", () => {
  let base = "";
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api", swipeRouter);
    app.use("/api", productAnalyticsRouter);
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  it("emits one search-results event for a swipe deck and one dealer click for a real redirect", async () => {
    const events = collectEvents();
    resetOutboundClicks();
    const unit = getInventory().units.find((u) => deckEligible(u) && u.provenance.listingUrl)!;
    const deck = await fetch(`${base}/api/swipe/deck`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ zip: "98402", rvType: "travel_trailer" }),
    });
    expect(deck.status).toBe(200);
    const deckBody = await deck.json() as { cards: unknown[]; matched: number; zip?: string };
    const click = await fetch(`${base}/api/out?unit=${encodeURIComponent(unit.id)}&from=swipe`, { redirect: "manual" });
    expect(click.status).toBe(302);
    const missed = await fetch(`${base}/api/out?unit=missing-unit&from=swipe`, { redirect: "manual" });
    expect(missed.status).toBe(302);
    await settle();
    const searches = events.filter((e) => e.event === "website_search_results");
    const clicks = events.filter((e) => e.event === "website_dealer_click");
    expect(searches).toHaveLength(1);
    expect(searches[0].properties).toMatchObject({
      source: "website",
      surface: "swipe",
      result_count: deckBody.cards.length,
      rv_type: "travel_trailer",
    });
    expect(clicks).toHaveLength(1);
    expect(clicks[0].properties).toMatchObject({
      source: "website",
      listing_id: unit.id,
      dealer_id: unit.dealer.id,
      surface: "swipe",
    });
    const blob = JSON.stringify(events);
    expect(blob).not.toContain("98402");
    expect(blob).not.toContain(unit.dealer.name);
  });

  it("accepts one allowlisted website event and ignores a forged inquiry", async () => {
    const events = collectEvents();
    const ok = await fetch(`${base}/api/analytics/product`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "website_page_view", source: "website", path: "/swipe",
        email: SHOPPER_EMAIL, session_id: "sess_abc12345",
      }),
    });
    const forged = await fetch(`${base}/api/analytics/product`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "inquiry_outcome", source: "website", outcome: "submitted_delivered" }),
    });
    expect(ok.status).toBe(204);
    expect(forged.status).toBe(204);
    await settle();
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("website_page_view");
    expect(events[0].properties.path).toBe("/swipe");
    expect(events[0].distinct_id.startsWith("web_session_")).toBe(true);
    expect(JSON.stringify(events)).not.toContain(SHOPPER_EMAIL);
  });
});

describe("in-page WebMCP lead queue", () => {
  it("counts an approved submit as queued for MatchRV, not dealer delivery, and does not count the duplicate", async () => {
    await ensureDbReady();
    __resetLeadStore();
    const events = collectEvents();
    const unit = getInventory().units[0];
    const staged = createPreview({
      unit,
      customer: { name: "Test Shopper", email: SHOPPER_EMAIL },
      message: "Please hold this RV",
    });
    const blocked = await submitPreview(staged.preview.previewId);
    expect(blocked.ok).toBe(false);
    decidePreview(staged.preview.previewId, "approved", staged.approvalToken);
    const sent = await submitPreview(staged.preview.previewId);
    expect(sent.ok).toBe(true);
    const second = await submitPreview(staged.preview.previewId);
    expect(second.ok).toBe(false);
    await settle();
    const leads = events.filter((e) => e.event === "inquiry_outcome");
    expect(leads.map((e) => e.properties.outcome)).toEqual(["rejected", "submitted_queued", "rejected"]);
    expect(leads[1].properties).toMatchObject({
      source: "website_webmcp",
      channel: "demo_lead_record",
      counts_as_delivered: false,
      counts_as_queued: true,
      listing_id: unit.id,
    });
    expect(JSON.stringify(leads)).not.toContain(SHOPPER_EMAIL);
    expect(JSON.stringify(leads)).not.toContain("Please hold");
  });
});
