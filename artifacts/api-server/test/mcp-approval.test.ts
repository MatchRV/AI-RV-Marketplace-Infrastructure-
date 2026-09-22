import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureDbReady } from "@workspace/db";
import app from "../src/app";
import { matchingUnits } from "../../../lib/agent-core/test/matching-fixture";
import { __agePreview, __resetLeadStore, getPreview } from "../src/services/agent-leads";

// Exercise the HTTP/MCP wiring with deterministic inventory, never a real buyer request.
vi.mock("../src/services/agent-inventory", async () => {
  const { matchingUnits } = await import("../../../lib/agent-core/test/matching-fixture");
  return { getInventory: () => ({ units: matchingUnits, byId: new Map(matchingUnits.map((u) => [u.id, u])),
    snapshot: { builtAt: "2026-05-12T00:00:00Z", datasetNote: "Test fixtures", stats: { dealers: 1 } } }) };
});

let server: Server;
let base: string;
let rpcId = 0;
let sessionId: string | null = null;

async function rpc(method: string, params: Record<string, unknown>) {
  const res = await fetch(`${base}/mcp`, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  expect(res.ok).toBe(true);
  sessionId ||= res.headers.get("mcp-session-id");
  const body = await res.text();
  const event = body.split("\n").find((line) => line.startsWith("data: "));
  const payload = JSON.parse(event ? event.slice(6) : body);
  expect(payload.error).toBeUndefined();
  return payload.result;
}

async function tool(name: string, args: Record<string, unknown>) {
  const result = await rpc("tools/call", { name, arguments: args });
  return { isError: Boolean(result.isError), value: JSON.parse(result.content.find((p: { type: string }) => p.type === "text").text) };
}

async function prepare(message = "AUTOMATED TEST: please confirm availability. Do not deliver.") {
  const result = await tool("contact_dealer", { action: "prepare", unit_id: matchingUnits[0].id, name: "Test Shopper",
    email: "ci@example.invalid", phone: "555-0100", message });
  expect(result.isError, JSON.stringify(result.value)).toBe(false);
  return result.value;
}

async function openReview(url: string) {
  const res = await fetch(url);
  return { res, html: await res.text(), cookie: res.headers.get("set-cookie")?.split(";")[0] || "" };
}

async function decide(url: string, cookie: string, decision = "approved", origin = base) {
  return fetch(url, { method: "POST", redirect: "manual",
    headers: { origin, cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ decision, message: "MUTATED", email: "attacker@example.invalid" }) });
}

beforeAll(async () => {
  await ensureDbReady();
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "approval-test", version: "1" } });
}, 15000);
beforeEach(() => { __resetLeadStore(); vi.stubEnv("MATCHRV_PUBLIC_URL", base); });
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

describe("MCP human review journey", () => {
  it("searches six constraints, compares, previews, approves in the browser, and records the unchanged request once", async () => {
    const constraints = { rvTypes: ["travel_trailer"], priceMaxUsd: 36000, lengthMaxFt: 30, sleepsMin: 8,
      towVehicle: "Ford F-150 rated 8,000 lbs", location: { place: "Tacoma", radiusMiles: 150 } };
    const search = await tool("search_rvs", { constraints, limit: 2 });
    expect(search.isError).toBe(false);
    expect(search.value.results).toHaveLength(2);
    const ids = search.value.results.map((r: { unit: { id: string } }) => r.unit.id);
    expect((await tool("compare_rvs", { unit_ids: ids, constraints })).isError).toBe(false);
    const prepared = await prepare();
    const id = prepared.preview.previewId;
    expect(prepared.reviewUrl).toBe(`${base}/api/agent/leads/${id}/review`);
    expect(prepared.deliveryMode).toBe("demo");
    expect(JSON.stringify(prepared)).not.toMatch(/apt_|approvalToken|approval_token/);
    const early = await tool("contact_dealer", { action: "submit", preview_id: id });
    expect(early).toMatchObject({ isError: true, value: { error: "awaiting_human_approval", reviewUrl: prepared.reviewUrl } });
    const review = await openReview(prepared.reviewUrl);
    expect(review.res.status).toBe(200);
    expect(review.res.headers.get("set-cookie")).toContain("HttpOnly");
    expect(review.res.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect(review.res.headers.get("cache-control")).toBe("no-store");
    expect(review.res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(review.html).toContain(prepared.preview.message);
    expect(review.html).toContain(prepared.preview.customer.email);
    expect(review.html).toContain(prepared.preview.unitTitle);
    expect(review.html).toContain("Approve request");
    expect(review.html).toContain("Reject request");
    expect(review.html).not.toContain("apt_");
    expect(getPreview(id)?.status).toBe("awaiting_human_approval");
    expect((await decide(prepared.reviewUrl, review.cookie)).status).toBe(303);
    expect(getPreview(id)?.status).toBe("approved");
    expect((await openReview(prepared.reviewUrl)).html).toContain("It has not been submitted yet");
    const submitted = await tool("contact_dealer", { action: "submit", preview_id: id });
    expect(submitted.isError).toBe(false);
    expect(typeof submitted.value.receipt.leadId).toBe("number");
    expect(submitted.value.receipt.delivery).toContain("nothing is delivered");
    expect(getPreview(id)?.message).toBe(prepared.preview.message);
    expect(getPreview(id)?.customer.email).toBe("ci@example.invalid");
    expect((await openReview(prepared.reviewUrl)).html).toContain("No message was delivered");
    expect((await tool("contact_dealer", { action: "submit", preview_id: id })).value.error).toBe("already_submitted");
  });

  it("rejects decisions without the browser cookie, from another preview, cross-origin, or replayed", async () => {
    const a = await prepare();
    const b = await prepare();
    const review = await openReview(a.reviewUrl);
    expect((await decide(a.reviewUrl, "")).status).toBe(403);
    expect((await decide(b.reviewUrl, review.cookie)).status).toBe(403);
    expect((await decide(a.reviewUrl, review.cookie, "approved", "https://attacker.example")).status).toBe(403);
    expect((await decide(a.reviewUrl, review.cookie, "approved", "")).status).toBe(403);
    expect(getPreview(a.preview.previewId)?.status).toBe("awaiting_human_approval");
    expect((await decide(a.reviewUrl, review.cookie)).status).toBe(303);
    expect((await decide(a.reviewUrl, review.cookie)).status).toBe(409);
  });

  it("keeps rejection and expiration final, and explains previews lost on restart", async () => {
    const rejected = await prepare();
    const page = await openReview(rejected.reviewUrl);
    expect((await decide(rejected.reviewUrl, page.cookie, "rejected")).status).toBe(303);
    expect((await tool("contact_dealer", { action: "submit", preview_id: rejected.preview.previewId })).value.error).toBe("rejected");
    const expired = await prepare();
    const review = await openReview(expired.reviewUrl);
    __agePreview(expired.preview.previewId, 31 * 60 * 1000);
    expect((await openReview(expired.reviewUrl)).res.status).toBe(410);
    expect((await decide(expired.reviewUrl, review.cookie)).status).toBe(410);
    expect((await tool("contact_dealer", { action: "submit", preview_id: expired.preview.previewId })).value.error).toBe("expired");
    __resetLeadStore();
    const missing = await openReview(expired.reviewUrl);
    expect(missing.res.status).toBe(404);
    expect(missing.html).toContain("prepare a new preview");
  });

  it("escapes message HTML and blocks framing, cross-origin reads, and caching", async () => {
    const prepared = await prepare('<script>alert("x")</script><img src=x onerror=alert(1)>');
    const review = await fetch(prepared.reviewUrl, { headers: { Origin: "https://attacker.example" } });
    const html = await review.text();
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(review.headers.get("access-control-allow-origin")).toBeNull();
    expect(review.headers.get("access-control-allow-credentials")).toBeNull();
    expect(review.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(review.headers.get("x-frame-options")).toBe("DENY");
  });

  it("fails closed without a valid public production origin, and supports the hosting-provided origin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MATCHRV_PUBLIC_URL", "");
    vi.stubEnv("RENDER_EXTERNAL_URL", "");
    const args = { action: "prepare", unit_id: matchingUnits[0].id, name: "CI", email: "ci@example.invalid" };
    expect((await tool("contact_dealer", args)).value.error).toBe("approval_review_unavailable");
    vi.stubEnv("MATCHRV_PUBLIC_URL", "http://example.com");
    expect((await tool("contact_dealer", args)).isError).toBe(true);
    vi.stubEnv("MATCHRV_PUBLIC_URL", "");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://review.example.com");
    const result = await prepare();
    expect(result.reviewUrl).toMatch(/^https:\/\/review\.example\.com\/api\/agent\/leads\//);
    const local = await openReview(`${base}${new URL(result.reviewUrl).pathname}`);
    expect(local.res.headers.get("set-cookie")).toContain("Secure");
  });
});
