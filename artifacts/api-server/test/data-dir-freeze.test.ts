import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalUnit } from "@workspace/agent-core";
import app, { apiPathAllowedWithoutDatabase } from "../src/app";
import { matchRvMcpHandler } from "../src/mcp";
import {
  __resetDataDirFreezeForTests,
  __runDataDirShutdownForTests,
  DataDirFrozenError,
  freezeDataDir,
  unfreezeDataDir,
} from "../src/services/data-dir-freeze";
import {
  __resetInquiries,
  __setPersistenceForTests,
  __setRoutes,
  __setTransport,
  confirmInquiryForwarded,
  prepareInquiry,
  sendInquiry,
  type InquiryTransport,
} from "../src/services/dealer-inquiries";
import { __enablePersistence, __resetMemory, resolveScope, writableScope } from "../src/services/learned-store";
import { __enableFitPersistence, __resetShopperFit, rememberFit } from "../src/services/shopper-fit";
import { __setClickPersistenceForTests, outboundSummary, recordOutboundClick, resetOutboundClicks } from "../src/services/outbound-clicks";

const dir = mkdtempSync(join(tmpdir(), "matchrv-freeze-"));
const inqPath = join(dir, "dealer-inquiries.json");
const memPath = join(dir, "session-memory.json");
const fitPath = join(dir, "shopper-fit.json");
const clickPath = join(dir, "outbound-clicks.jsonl");
const signalMemPath = join(dir, "signal-session-memory.json");

const unit = {
  id: "unit-freeze-1",
  title: "Freeze Test Trailer",
  vin: null,
  stockNumber: "FT1",
  priceUsd: { value: 10000 },
  condition: "used",
  status: "available",
  dealer: { id: "dealer-freeze", name: "Freeze Dealer", city: "Tacoma", state: "WA", website: null },
  provenance: { dealerDomain: "example.test" },
} as CanonicalUnit;

const shopper = { name: "Pat Tester", email: "pat@example.test", phone: "2535550142", message: "Is this still available?" };
const memoryScope = resolveScope(null, `mrs_${"a".repeat(24)}`);
const fitScope = { id: "fit-scope", source: "session_key" as const, sessionKey: null };

function mockTransport(): InquiryTransport & { sent: number } {
  const state = { sent: 0 };
  const transport: InquiryTransport & { sent: number } = {
    get sent() { return state.sent; },
    emailConfigured: () => true,
    opsPushConfigured: () => true,
    async sendEmail() { state.sent += 1; },
    async notifyOps() { state.sent += 1; },
  };
  return transport;
}

let transport: ReturnType<typeof mockTransport>;

function readBytes(path: string): Buffer {
  return existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
}

beforeEach(() => {
  __resetDataDirFreezeForTests();
  __resetInquiries();
  __resetMemory();
  __resetShopperFit();
  resetOutboundClicks();
  transport = mockTransport();
  __setTransport(transport);
  __setRoutes({ "dealer-freeze": "dealer@example.test" });
  __setPersistenceForTests(true, inqPath);
  __enablePersistence(true);
  __enableFitPersistence(true);
  __setClickPersistenceForTests(true);
  process.env.SESSION_MEMORY_PATH = memPath;
  process.env.SHOPPER_FIT_PATH = fitPath;
  process.env.OUTBOUND_CLICKS_PATH = clickPath;
  for (const path of [inqPath, memPath, fitPath, clickPath]) {
    if (existsSync(path)) rmSync(path);
  }
});

afterEach(() => {
  vi.useRealTimers();
  __resetDataDirFreezeForTests();
  __setPersistenceForTests(false);
  __enablePersistence(false);
  __enableFitPersistence(false);
  __setClickPersistenceForTests(null);
  __setTransport(null);
  __setRoutes({});
  delete process.env.SESSION_MEMORY_PATH;
  delete process.env.SHOPPER_FIT_PATH;
  delete process.env.OUTBOUND_CLICKS_PATH;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("write freeze", () => {
  it("flushes debounced writes on freeze and reports nothing pending", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    const prepared = prepareInquiry(unit, shopper);
    if (!prepared.ok) throw new Error("preview failed");
    const sent = await sendInquiry({
      confirmationToken: prepared.confirmationToken,
      confirmed: true,
      requesterKey: "freeze-flush",
      scope: null,
      lookupUnit: () => unit,
    });
    expect(sent.ok).toBe(true);
    writableScope(memoryScope).learnVehicle("Freeze Truck", { towRatingLbs: 5000 }, "freeze-test");
    rememberFit(fitScope, { budgetMaxUsd: 20000 });
    recordOutboundClick({ unitId: "unit-freeze-1", dealerId: "dealer-freeze", dealerName: "Freeze Dealer", host: "dealer.example.test", from: "swipe" });
    expect(existsSync(inqPath)).toBe(false);
    expect(existsSync(memPath)).toBe(false);
    expect(existsSync(fitPath)).toBe(false);
    expect(existsSync(clickPath)).toBe(true);

    const status = await freezeDataDir();
    expect(status).toEqual({ frozen: true, pending: false, pendingWriters: [] });
    const inquiries = JSON.parse(readFileSync(inqPath, "utf8")) as { id: string }[];
    expect(inquiries).toHaveLength(1);
    expect(inquiries[0].id.startsWith("inq_")).toBe(true);
    expect(readFileSync(memPath, "utf8")).toContain("Freeze Truck");
    expect(readFileSync(fitPath, "utf8")).toContain("20000");
    expect(transport.sent).toBeGreaterThan(0);
  });

  it("refuses durable writes while frozen and keeps a lead unsent", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    const prepared = prepareInquiry(unit, shopper);
    if (!prepared.ok) throw new Error("preview failed");
    await sendInquiry({
      confirmationToken: prepared.confirmationToken,
      confirmed: true,
      requesterKey: "freeze-hold",
      scope: null,
      lookupUnit: () => unit,
    });
    writableScope(memoryScope).learnVehicle("Freeze Truck", { towRatingLbs: 5000 }, "freeze-test");
    rememberFit(fitScope, { budgetMaxUsd: 20000 });
    recordOutboundClick({ unitId: "unit-freeze-1", dealerId: "dealer-freeze", dealerName: "Freeze Dealer", host: "dealer.example.test", from: "swipe" });
    await freezeDataDir();
    const inquiriesBefore = readBytes(inqPath);
    const memoryBefore = readBytes(memPath);
    const fitBefore = readBytes(fitPath);
    const clicksBefore = readBytes(clickPath);
    const sentBefore = transport.sent;

    const again = prepareInquiry(unit, { ...shopper, email: "pat2@example.test" });
    if (!again.ok) throw new Error("preview failed");
    const refused = await sendInquiry({
      confirmationToken: again.confirmationToken,
      confirmed: true,
      requesterKey: "freeze-refuse",
      scope: null,
      lookupUnit: () => unit,
    });
    expect(refused).toMatchObject({ ok: false, code: "writes_frozen" });
    if (!refused.ok) expect(refused.guidance).toMatch(/retry/i);
    const dry = await sendInquiry({
      confirmationToken: again.confirmationToken,
      confirmed: true,
      dryRun: true,
      requesterKey: "freeze-dry",
      scope: null,
      lookupUnit: () => unit,
    });
    expect(dry.ok).toBe(true);
    expect(() => writableScope(memoryScope)).toThrow(DataDirFrozenError);
    rememberFit(fitScope, { partySize: 4 });
    recordOutboundClick({ unitId: "unit-freeze-2", dealerId: "dealer-freeze", dealerName: "Freeze Dealer", host: "dealer.example.test", from: "swipe" });
    expect(confirmInquiryForwarded("inq_missing").code).toBe("writes_frozen");
    const preview = prepareInquiry(unit, shopper);
    expect(preview.ok).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);

    expect(readBytes(inqPath)).toEqual(inquiriesBefore);
    expect(readBytes(memPath)).toEqual(memoryBefore);
    expect(readBytes(fitPath)).toEqual(fitBefore);
    expect(readBytes(clickPath)).toEqual(clicksBefore);
    expect(transport.sent).toBe(sentBefore);
    expect(outboundSummary().total).toBe(1);
    expect(readFileSync(fitPath, "utf8")).not.toContain("partySize");
  });

  it("resumes debounced writes after unfreeze", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    writableScope(memoryScope).learnVehicle("Freeze Truck", { towRatingLbs: 5000 }, "freeze-test");
    await freezeDataDir();
    const resumed = unfreezeDataDir();
    expect(resumed.frozen).toBe(false);
    writableScope(memoryScope).learnVehicle("Other Truck", { towRatingLbs: 6100 }, "freeze-test");
    expect(readFileSync(memPath, "utf8")).not.toContain("Other Truck");
    await vi.advanceTimersByTimeAsync(400);
    expect(readFileSync(memPath, "utf8")).toContain("Other Truck");
  });

  it("flushes pending writes on SIGINT before exit", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    const prepared = prepareInquiry(unit, shopper);
    if (!prepared.ok) throw new Error("preview failed");
    await sendInquiry({
      confirmationToken: prepared.confirmationToken,
      confirmed: true,
      requesterKey: "freeze-signal",
      scope: null,
      lookupUnit: () => unit,
    });
    expect(existsSync(inqPath)).toBe(false);
    const exit = vi.fn();
    await __runDataDirShutdownForTests("SIGINT", exit);
    expect(exit).toHaveBeenCalledWith(0);
    expect(JSON.parse(readFileSync(inqPath, "utf8"))).toHaveLength(1);
  });
});

describe("SIGTERM flushes the data dir", () => {
  it("writes the pending session file when the process receives SIGTERM", async () => {
    const stderr: Buffer[] = [];
    const child = spawn(process.execPath, ["--import", "tsx", "test/freeze-signal-child.ts"], {
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "production",
        SESSION_MEMORY_PATH: signalMemPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    const ready = new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`signal child did not become ready\n${Buffer.concat(stderr).toString("utf8")}`));
      }, 20_000);
      child.stdout.on("data", (chunk: Buffer) => {
        if (settled || !chunk.toString("utf8").includes("ready")) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      });
      child.once("exit", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`signal child exited early (${code})\n${Buffer.concat(stderr).toString("utf8")}`));
      });
    });
    await ready;
    child.kill("SIGTERM");
    const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
    expect(code).toBe(0);
    expect(readFileSync(signalMemPath, "utf8")).toContain("Signal Truck");
  });
});

describe("admin freeze route", () => {
  let server: Server;
  let base = "";
  const adminKey = "freeze-test-admin-key";

  beforeAll(async () => {
    process.env.ADMIN_KEY = adminKey;
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    delete process.env.ADMIN_KEY;
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function rpc(method: string, params: Record<string, unknown> = {}) {
    const response = await matchRvMcpHandler.fetch(new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }));
    const raw = await response.text();
    const json = JSON.parse(raw.startsWith("event:") || raw.startsWith("data:") ? raw.split("\n").find((line) => line.startsWith("data:"))!.slice(5) : raw) as { result: { tools?: { name: string }[]; isError?: boolean; content?: { text: string }[] } };
    return json.result;
  }

  it("requires the admin key, freezes, stays readable, and unfreezes", async () => {
    const missing = await fetch(`${base}/api/admin/data-dir`);
    expect(missing.status).toBe(403);
    const wrong = await fetch(`${base}/api/admin/data-dir`, { headers: { "x-admin-key": "nope" } });
    expect(wrong.status).toBe(403);

    const freeze = await fetch(`${base}/api/admin/data-dir`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": adminKey },
      body: JSON.stringify({ action: "freeze" }),
    });
    expect(freeze.status).toBe(200);
    expect(await freeze.json()).toEqual({ frozen: true, pending: false, pendingWriters: [] });

    const status = await fetch(`${base}/api/admin/data-dir`, { headers: { "x-admin-key": adminKey } });
    expect(await status.json()).toMatchObject({ frozen: true, pending: false });

    const health = await fetch(`${base}/api/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });

    const guide = await rpc("tools/call", { name: "outfitter_guide", arguments: { query: "how does payload and tongue weight work?" } });
    const guideData = JSON.parse(guide.content![0].text) as { topics: { id: string }[] };
    expect(guideData.topics[0].id).toBe("tow_basics");
    const list = await rpc("tools/list");
    expect(list.tools?.map((tool) => tool.name)).toEqual([
      "teach_outfitter", "outfitter_memory", "outfitter_discovery", "outfitter_guide",
      "search_rvs", "get_rv", "compare_rvs", "evaluate_tow_fit",
      "prepare_dealer_inquiry", "send_dealer_inquiry", "get_dealer_inquiry_status",
    ]);

    const taught = await rpc("tools/call", { name: "teach_outfitter", arguments: { vehicle: "Frozen Truck", tow_rating_lbs: 5000 } });
    expect(taught.isError).toBe(true);
    expect(JSON.parse(taught.content![0].text)).toMatchObject({ error: "writes_frozen", retryable: true, sent: false });

    const lead = await fetch(`${base}/api/inquiries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation_token: "dic_not-a-real-token.sig", confirmed: true }),
    });
    expect(lead.status).toBe(503);
    expect(lead.headers.get("retry-after")).toBe("120");
    expect(await lead.json()).toMatchObject({ error: "writes_frozen", retryable: true });

    const unfreeze = await fetch(`${base}/api/admin/data-dir`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": adminKey },
      body: JSON.stringify({ action: "unfreeze" }),
    });
    expect(await unfreeze.json()).toMatchObject({ frozen: false, pending: false });
  });
});

describe("database-free API paths", () => {
  it("keeps the write-freeze route available when the database is off", () => {
    expect(apiPathAllowedWithoutDatabase("GET", "/admin/data-dir")).toBe(true);
    expect(apiPathAllowedWithoutDatabase("POST", "/admin/data-dir")).toBe(true);
    expect(apiPathAllowedWithoutDatabase("GET", "/healthz")).toBe(true);
    expect(apiPathAllowedWithoutDatabase("POST", "/inquiries")).toBe(true);
    expect(apiPathAllowedWithoutDatabase("POST", "/admin/import-inventory")).toBe(false);
  });
});
