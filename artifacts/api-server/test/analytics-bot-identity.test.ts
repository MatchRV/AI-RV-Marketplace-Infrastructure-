import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { classifyUserAgent } from "../src/services/bot-detect";
import {
  ANALYTICS_CLIENT_IP_HEADER, clientFromNodeRequest, hashedIpUaId, isLocalProxyAddress, resolveClientIp,
  sessionUuidFor, stampAnalyticsClientIp, UUID_RE,
} from "../src/services/analytics-client";
import {
  captureProductEvent, configureProductAnalyticsForTests, flushProductAnalytics, mcpIdentity, observeMcpFetch,
  resetProductAnalyticsForTests,
} from "../src/services/product-analytics";
import productAnalyticsRouter from "../src/routes/product-analytics";

type Captured = { event: string; distinct_id: string; properties: Record<string, unknown> };

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:132.0) Gecko/20100101 Firefox/132.0";

function collect(): Captured[] {
  const events: Captured[] = [];
  configureProductAnalyticsForTests({
    apiKey: "test-project-token",
    host: "https://us.i.posthog.com",
    timeoutMs: 50,
    transport: {
      async sendBatch(body) {
        events.push(...(JSON.parse(body) as { batch: Captured[] }).batch);
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

afterEach(() => resetProductAnalyticsForTests());

describe("bot / AI agent user-agent classifier", () => {
  const cases: Array<[string, string, string]> = [
    ["Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.69 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "googlebot", "search_crawler"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36", "bingbot", "search_crawler"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)", "gptbot", "ai_crawler"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot", "oai-searchbot", "ai_crawler"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot", "chatgpt-user", "ai_agent_user"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "claudebot", "ai_crawler"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)", "claude-user", "ai_agent_user"],
    ["anthropic-ai", "anthropic-ai", "ai_crawler"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", "perplexitybot", "ai_crawler"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)", "perplexity-user", "ai_agent_user"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)", "applebot", "search_crawler"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot) Chrome/119.0.6045.214 Safari/537.36", "amazonbot", "ai_crawler"],
    ["meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)", "meta-externalagent", "ai_crawler"],
    ["facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "facebookexternalhit", "social_preview"],
    ["Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)", "bytespider", "ai_crawler"],
    ["CCBot/2.0 (https://commoncrawl.org/faq/)", "ccbot", "ai_crawler"],
    ["Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)", "yandexbot", "search_crawler"],
    ["DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)", "duckduckbot", "search_crawler"],
    ["Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", "ahrefsbot", "seo_tool"],
    ["Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)", "semrushbot", "seo_tool"],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36", "headlesschrome", "headless"],
    ["python-requests/2.32.3", "python-requests", "generic_script"],
    ["curl/8.5.0", "curl", "generic_script"],
    ["openai-mcp/1.0.0", "openai-mcp", "ai_agent_user"],
    ["Mozilla/5.0 (compatible; SomeNewCrawler/1.0)", "other-bot", "other_crawler"],
    ["", "empty-ua", "generic_script"],
  ];
  it.each(cases)("%s -> %s", (ua, name, category) => {
    expect(classifyUserAgent(ua)).toEqual({ is_bot: true, bot_name: name, bot_category: category });
  });

  it("leaves real browsers alone", () => {
    for (const ua of [CHROME, SAFARI_IOS, FIREFOX]) expect(classifyUserAgent(ua)).toEqual({ is_bot: false });
  });
});

describe("client IP resolution", () => {
  it("honors X-Forwarded-For only from a local proxy and takes the left-most valid entry", () => {
    expect(resolveClientIp("127.0.0.1", "203.0.113.7, 10.0.0.2")).toBe("203.0.113.7");
    expect(resolveClientIp("::ffff:127.0.0.1", "203.0.113.7")).toBe("203.0.113.7");
    expect(resolveClientIp("::1", "[2001:db8::5]:443")).toBe("2001:db8::5");
    expect(resolveClientIp("127.0.0.1", "garbage, 198.51.100.4:5555")).toBe("198.51.100.4");
    expect(resolveClientIp("127.0.0.1", undefined)).toBe("127.0.0.1");
  });

  it("ignores X-Forwarded-For from a direct internet connection", () => {
    expect(resolveClientIp("198.51.100.20", "1.2.3.4")).toBe("198.51.100.20");
    expect(resolveClientIp("::ffff:198.51.100.20", "1.2.3.4")).toBe("198.51.100.20");
  });

  it("knows which peers are local proxies", () => {
    for (const ip of ["127.0.0.1", "::1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "fd00::1"]) expect(isLocalProxyAddress(ip)).toBe(true);
    for (const ip of ["34.171.66.221", "8.8.8.8", "172.32.0.1", "2001:db8::1", ""]) expect(isLocalProxyAddress(ip)).toBe(false);
  });

  it("stamps the MCP request with the resolved IP and drops a forged inbound header", () => {
    const req = {
      socket: { remoteAddress: "198.51.100.20" },
      headers: { [ANALYTICS_CLIENT_IP_HEADER]: "6.6.6.6", "x-forwarded-for": "1.2.3.4" } as Record<string, string | string[] | undefined>,
    };
    let called = false;
    stampAnalyticsClientIp(req, {}, () => { called = true; });
    expect(called).toBe(true);
    expect(req.headers[ANALYTICS_CLIENT_IP_HEADER]).toBe("198.51.100.20");
  });
});

describe("anonymous ids carry no raw PII", () => {
  it("hashes IP + UA into a stable per-day id", () => {
    const client = { ip: "203.0.113.7", userAgent: CHROME };
    const day = Date.UTC(2026, 10, 20, 12);
    const a = hashedIpUaId("anon_", client, day);
    expect(a).toMatch(/^anon_[0-9a-f]{24}$/);
    expect(hashedIpUaId("anon_", client, day + 60_000)).toBe(a);
    expect(hashedIpUaId("anon_", client, day + 86_400_000)).not.toBe(a);
    expect(a).not.toContain("203");
  });

  it("maps one session key to one UUIDv7", () => {
    const a = sessionUuidFor("web:abc12345");
    expect(a).toMatch(UUID_RE);
    expect(a[14]).toBe("7");
    expect(sessionUuidFor("web:abc12345")).toBe(a);
    expect(sessionUuidFor("web:other123")).not.toBe(a);
  });
});

describe("website events", () => {
  it("forwards $ip, $raw_user_agent and keeps one distinct id per browser session", async () => {
    const events = collect();
    const client = { ip: "203.0.113.7", userAgent: CHROME };
    captureProductEvent({ event: "website_page_view", source: "website", path: "/swipe", session_id: "1732150000000-abc1234" }, client);
    captureProductEvent({ event: "website_listing_view", source: "website", path: "/listing/123", listing_id: "123", session_id: "1732150000000-abc1234" }, client);
    await settle();
    expect(events).toHaveLength(2);
    expect(events[0].distinct_id).toBe("web_session_1732150000000-abc1234");
    expect(events[1].distinct_id).toBe(events[0].distinct_id);
    expect(events[0].properties).toMatchObject({
      $ip: "203.0.113.7", $raw_user_agent: CHROME, is_bot: false, identity_scope: "anonymous_session",
      $process_person_profile: false, identity_is_person: false,
    });
    expect(events[0].properties.$session_id).toMatch(UUID_RE);
    expect(events[1].properties.$session_id).toBe(events[0].properties.$session_id);
    expect(events[0].properties.session_id).toBeUndefined();
  });

  it("reuses the browser's posthog-js distinct id and session id when posted", async () => {
    const events = collect();
    captureProductEvent({
      event: "website_page_view", source: "website", path: "/",
      distinct_id: "01936f6e-1a2b-7c3d-8e4f-0123456789ab", $session_id: "01936f6e-1a2b-7c3d-8e4f-aaaaaaaaaaaa",
      session_id: "1732150000000-abc1234",
    }, { ip: "203.0.113.7", userAgent: CHROME });
    await settle();
    expect(events[0].distinct_id).toBe("01936f6e-1a2b-7c3d-8e4f-0123456789ab");
    expect(events[0].properties.identity_scope).toBe("browser_distinct_id");
    expect(events[0].properties.$session_id).toBe("01936f6e-1a2b-7c3d-8e4f-aaaaaaaaaaaa");
  });

  it("refuses a posted distinct id that claims a bot, MCP or email identity", async () => {
    const events = collect();
    for (const forged of ["bot:googlebot", "mcp_abcdef0123456789", "pat@example.com"]) {
      captureProductEvent({ event: "website_page_view", source: "website", path: "/", distinct_id: forged, session_id: "1732150000000-abc1234" }, { ip: "203.0.113.7", userAgent: CHROME });
    }
    await settle();
    expect(events.map((e) => e.distinct_id)).toEqual(Array(3).fill("web_session_1732150000000-abc1234"));
  });

  it("falls back to a hashed IP + UA id, not a per-request id", async () => {
    const events = collect();
    const client = { ip: "203.0.113.7", userAgent: CHROME };
    captureProductEvent({ event: "website_page_view", source: "website", path: "/a" }, client);
    captureProductEvent({ event: "website_page_view", source: "website", path: "/b" }, client);
    await settle();
    expect(events[0].distinct_id).toMatch(/^anon_[0-9a-f]{24}$/);
    expect(events[1].distinct_id).toBe(events[0].distinct_id);
    expect(events[0].properties.identity_scope).toBe("anonymous_ip_ua_daily");
    expect(events[0].distinct_id).not.toContain("203.0.113.7");
  });

  it("collapses every hit from a crawler to one bot id with bot tags", async () => {
    const events = collect();
    const gptbot = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";
    for (let i = 0; i < 5; i += 1) {
      captureProductEvent({ event: "website_listing_view", source: "website", path: "/listing/x", listing_id: String(1000 + i), session_id: `${Date.now()}-r${i}abcde` }, { ip: `20.0.0.${i}`, userAgent: gptbot });
    }
    await settle();
    expect(new Set(events.map((e) => e.distinct_id))).toEqual(new Set(["bot:gptbot"]));
    expect(events[0].properties).toMatchObject({
      is_bot: true, bot_name: "gptbot", bot_category: "ai_crawler", identity_scope: "bot", $process_person_profile: false,
    });
  });
});

describe("POST /api/analytics/product forwards the real client", () => {
  let server: Server;
  let base = "";
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api", productAnalyticsRouter);
    await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

  it("uses the Caddy X-Forwarded-For IP and the browser UA, not the VM", async () => {
    const events = collect();
    const res = await fetch(`${base}/api/analytics/product`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": SAFARI_IOS, "x-forwarded-for": "198.51.100.44" },
      body: JSON.stringify({ event: "website_page_view", source: "website", path: "/swipe", session_id: "1732150000000-zzz9999", $ip: "6.6.6.6", is_bot: false }),
    });
    expect(res.status).toBe(204);
    await settle();
    expect(events).toHaveLength(1);
    expect(events[0].properties.$ip).toBe("198.51.100.44");
    expect(events[0].properties.$raw_user_agent).toBe(SAFARI_IOS);
    expect(events[0].distinct_id).toBe("web_session_1732150000000-zzz9999");
  });

  it("tags a headless crawler hitting the beacon", async () => {
    const events = collect();
    await fetch(`${base}/api/analytics/product`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36" },
      body: JSON.stringify({ event: "website_listing_view", source: "website", path: "/listing/1", listing_id: "1", session_id: "1732150000000-hhh1111" }),
    });
    await settle();
    expect(events[0].distinct_id).toBe("bot:headlesschrome");
    expect(events[0].properties).toMatchObject({ is_bot: true, bot_category: "headless" });
  });
});

describe("MCP identity", () => {
  it("derives a stable hashed id from Mcp-Session-Id and tags the agent", () => {
    const headers = new Headers({ "mcp-session-id": "sess-abcdef-123456", "user-agent": "openai-mcp/1.0.0", [ANALYTICS_CLIENT_IP_HEADER]: "198.51.100.9" });
    const a = mcpIdentity(headers);
    const b = mcpIdentity(new Headers({ "mcp-session-id": "sess-abcdef-123456", "user-agent": "openai-mcp/1.0.0", [ANALYTICS_CLIENT_IP_HEADER]: "198.51.100.77" }));
    expect(a.distinctId).toMatch(/^mcp_[0-9a-f]{24}$/);
    expect(b.distinctId).toBe(a.distinctId);
    expect(a.distinctId).not.toContain("sess-abcdef");
    expect(a).toMatchObject({ is_bot: true, bot_name: "openai-mcp", bot_category: "ai_agent_user", identity_scope: "mcp_session", $ip: "198.51.100.9", $raw_user_agent: "openai-mcp/1.0.0" });
    expect(a.$session_id).toMatch(UUID_RE);
    expect(b.$session_id).toBe(a.$session_id);
  });

  it("uses the session id the server assigns on initialize", () => {
    const fromResponse = mcpIdentity(new Headers({ "user-agent": "openai-mcp/1.0.0" }), new Headers({ "mcp-session-id": "sess-from-server-1" }));
    const later = mcpIdentity(new Headers({ "user-agent": "openai-mcp/1.0.0", "mcp-session-id": "sess-from-server-1" }));
    expect(later.distinctId).toBe(fromResponse.distinctId);
  });

  it("falls back to hashed IP + UA without a session header", () => {
    const h = () => new Headers({ "user-agent": "Claude-User/1.0", [ANALYTICS_CLIENT_IP_HEADER]: "198.51.100.9" });
    const a = mcpIdentity(h());
    expect(a.distinctId).toMatch(/^mcp_[0-9a-f]{24}$/);
    expect(mcpIdentity(h()).distinctId).toBe(a.distinctId);
    expect(a.identity_scope).toBe("mcp_ip_ua_daily");
    expect(a.distinctId).not.toContain("198.51");
  });

  it("observeMcpFetch sends the stable id, $ip, $raw_user_agent and $session_id on every event", async () => {
    const events = collect();
    const call = () => observeMcpFetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "openai-mcp/1.0.0", "mcp-session-id": "sess-observe-0001", [ANALYTICS_CLIENT_IP_HEADER]: "198.51.100.9" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
      async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }), { status: 200 }),
    );
    await call();
    await call();
    await settle();
    expect(events).toHaveLength(2);
    expect(events[0].distinct_id).toMatch(/^mcp_[0-9a-f]{24}$/);
    expect(events[1].distinct_id).toBe(events[0].distinct_id);
    expect(events[0].properties).toMatchObject({
      $ip: "198.51.100.9", $raw_user_agent: "openai-mcp/1.0.0", is_bot: true, bot_name: "openai-mcp",
      bot_category: "ai_agent_user", identity_scope: "mcp_session", $process_person_profile: false,
    });
    expect(events[0].properties.$session_id).toMatch(UUID_RE);
    expect(JSON.stringify(events)).not.toContain("sess-observe-0001");
  });

  it("clientFromNodeRequest reads socket + headers", () => {
    expect(clientFromNodeRequest({ socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "203.0.113.9", "user-agent": CHROME } }))
      .toEqual({ ip: "203.0.113.9", userAgent: CHROME });
  });
});
