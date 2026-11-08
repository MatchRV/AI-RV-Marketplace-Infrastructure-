import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import { getInventory } from "../src/services/agent-inventory";
import inquiriesRouter from "../src/routes/inquiries";
import { OPS_LEADS_HTML } from "../src/routes/ops-leads-page";
import {
  __exportInquiries,
  __importInquiries,
  __inquiryCount,
  __reloadPersistedInquiries,
  __resetInquiries,
  __setPersistenceForTests,
  __setRoutes,
  __setTransport,
  getInquiryStatus,
  opsGet,
  prepareInquiry,
  sendInquiry,
  type InquiryTransport,
} from "../src/services/dealer-inquiries";
import {
  __stopInquirySafetySweep,
  runInquirySafetySweep,
  SAFETY_SWEEP_EVERY_MS,
  startInquirySafetySweep,
} from "../src/services/inquiry-safety";
import {
  DELIVERY_RETRY_BACKOFF_MS,
  MAX_DELIVERY_RETRIES,
  QUEUED_ALERT_24H_MS,
  QUEUED_ALERT_2H_MS,
} from "../src/services/inquiry-safety-policy";

type Sent = { emails: { to: string; subject: string; text: string }[]; pushes: { title: string; body: string }[] };

function mockTransport(opts: { email?: boolean; push?: boolean; failEmail?: (m: { to: string }) => Error | null; failPush?: (m: { title: string }) => Error | null } = {}): InquiryTransport & { sent: Sent } {
  const sent: Sent = { emails: [], pushes: [] };
  return {
    sent,
    emailConfigured: () => opts.email ?? true,
    opsPushConfigured: () => opts.push ?? true,
    async sendEmail(m) {
      const err = opts.failEmail?.(m);
      if (!(opts.email ?? true) || err) throw err ?? new Error("email_not_configured");
      sent.emails.push(m);
    },
    async notifyOps(m) {
      const err = opts.failPush?.(m);
      if (!(opts.push ?? true) || err) throw err ?? new Error("ntfy_not_configured");
      sent.pushes.push(m);
    },
  };
}

const unit = () => getInventory().units.find((u) => u.dealer.city === "Fife" && u.status === "available")!;
const lookupUnit = (id: string) => getInventory().byId.get(id);
const shopper = { name: "Pat Tester", email: "pat@example.com", phone: "(253) 555-0142", message: "Is the awning included?" };

async function queueLead(now: number, extra?: { name?: string; email?: string }) {
  const p = prepareInquiry(unit(), { ...shopper, ...extra }, now);
  if (!p.ok) throw new Error("preview failed");
  const r = await sendInquiry({ confirmationToken: p.confirmationToken, confirmed: true, requesterKey: `safety-${extra?.email ?? shopper.email}-${now}`, scope: null, lookupUnit, now });
  if (!r.ok) throw new Error(r.code);
  return r;
}

function ageAlerts(sent: Sent) {
  return sent.pushes.filter((p) => p.title.startsWith("MatchRV lead still queued"));
}

describe("inquiry safety net", () => {
  let mock: ReturnType<typeof mockTransport>;
  beforeEach(() => {
    __resetInquiries();
    __setRoutes({});
    mock = mockTransport();
    __setTransport(mock);
    __setPersistenceForTests(false);
  });
  afterAll(() => { __setTransport(null); __stopInquirySafetySweep(); __setPersistenceForTests(false); });

  it("uses a 10 minute cadence and the 2h / 24h thresholds", () => {
    expect(SAFETY_SWEEP_EVERY_MS).toBe(10 * 60 * 1000);
    expect(QUEUED_ALERT_2H_MS).toBe(2 * 60 * 60 * 1000);
    expect(QUEUED_ALERT_24H_MS).toBe(24 * 60 * 60 * 1000);
    expect(MAX_DELIVERY_RETRIES).toBe(4);
    expect([...DELIVERY_RETRY_BACKOFF_MS]).toEqual([15 * 60 * 1000, 60 * 60 * 1000, 4 * 60 * 60 * 1000, 12 * 60 * 60 * 1000]);
  });

  it("does not alert a queued lead before 2 hours", async () => {
    const t0 = Date.now();
    await queueLead(t0);
    const result = await runInquirySafetySweep(t0 + QUEUED_ALERT_2H_MS - 1);
    expect(result.alertsSent).toEqual([]);
    expect(ageAlerts(mock.sent)).toHaveLength(0);
  });

  it("alerts once at 2 hours with no shopper contact, message, or name", async () => {
    const t0 = Date.now();
    const r = await queueLead(t0);
    mock.sent.pushes.length = 0;
    mock.sent.emails.length = 0;
    const result = await runInquirySafetySweep(t0 + QUEUED_ALERT_2H_MS);
    expect(result.alertsSent.map((a) => a.threshold)).toEqual(["2h"]);
    expect(ageAlerts(mock.sent)).toHaveLength(1);
    const alert = mock.sent.pushes[0];
    expect(alert.title).toMatch(/2 hours/);
    expect(alert.body).toContain(r.inquiry.inquiryId);
    expect(alert.body).toContain("/ops/leads");
    expect(alert.body).not.toMatch(/pat@example.com|555|awning|Pat Tester/i);
    expect(mock.sent.emails.every((e) => !/pat@example.com|555|awning|Pat Tester/i.test(e.text))).toBe(true);
    const again = await runInquirySafetySweep(t0 + QUEUED_ALERT_2H_MS + 60_000);
    expect(again.alertsSent).toEqual([]);
    expect(ageAlerts(mock.sent)).toHaveLength(1);
  });

  it("sends the 24 hour alert once and does not repeat the 2 hour alert", async () => {
    const t0 = Date.now();
    await queueLead(t0);
    await runInquirySafetySweep(t0 + QUEUED_ALERT_2H_MS);
    mock.sent.pushes.length = 0;
    const result = await runInquirySafetySweep(t0 + QUEUED_ALERT_24H_MS);
    expect(result.alertsSent.map((a) => a.threshold)).toEqual(["24h"]);
    expect(mock.sent.pushes.map((p) => p.title).join(" ")).toMatch(/24 hours/);
    expect(mock.sent.pushes.map((p) => p.title).join(" ")).not.toMatch(/2 hours/);
    await runInquirySafetySweep(t0 + QUEUED_ALERT_24H_MS + SAFETY_SWEEP_EVERY_MS);
    expect(mock.sent.pushes).toHaveLength(1);
  });

  it("catch-up: a lead first seen after 24 hours gets both thresholds once", async () => {
    const t0 = Date.now();
    await queueLead(t0);
    mock.sent.pushes.length = 0;
    const result = await runInquirySafetySweep(t0 + QUEUED_ALERT_24H_MS + 60 * 60 * 1000);
    expect(result.alertsSent.map((a) => a.threshold)).toEqual(["2h", "24h"]);
    expect(ageAlerts(mock.sent)).toHaveLength(2);
    const stored = opsGet(result.alertsSent[0].inquiryId)!;
    expect(stored.safety?.alert2hAt).toMatch(/^\d{4}-/);
    expect(stored.safety?.alert24hAt).toMatch(/^\d{4}-/);
    await runInquirySafetySweep(t0 + QUEUED_ALERT_24H_MS + 2 * 60 * 60 * 1000);
    expect(ageAlerts(mock.sent)).toHaveLength(2);
  });

  it("does not repeat a sent threshold after a restart", async () => {
    const t0 = Date.now();
    await queueLead(t0);
    await runInquirySafetySweep(t0 + QUEUED_ALERT_2H_MS);
    const snap = __exportInquiries();
    __resetInquiries();
    __setTransport(mock);
    __importInquiries(snap);
    mock.sent.pushes.length = 0;
    await runInquirySafetySweep(t0 + QUEUED_ALERT_2H_MS + 5 * 60 * 1000);
    expect(ageAlerts(mock.sent)).toHaveLength(0);
  });

  it("persists alert markers to disk so a reloaded process does not resend", async () => {
    const dir = mkdtempSync(join(tmpdir(), "inquiry-safety-"));
    try {
      __setPersistenceForTests(true, join(dir, "dealer-inquiries.json"));
      const t0 = Date.now();
      await queueLead(t0);
      await runInquirySafetySweep(t0 + QUEUED_ALERT_2H_MS);
      __reloadPersistedInquiries();
      __setTransport(mock);
      mock.sent.pushes.length = 0;
      await runInquirySafetySweep(t0 + QUEUED_ALERT_2H_MS + 1000);
      expect(ageAlerts(mock.sent)).toHaveLength(0);
      expect(__inquiryCount()).toBe(1);
    } finally {
      __setPersistenceForTests(false);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("overlapping sweeps send one 2 hour alert", async () => {
    const t0 = Date.now();
    await queueLead(t0);
    mock.sent.pushes.length = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered = 0;
    __setTransport({
      ...mock,
      async notifyOps(m) {
        if (m.title.includes("still queued")) {
          entered += 1;
          await gate;
        }
        mock.sent.pushes.push(m);
      },
    });
    const first = runInquirySafetySweep(t0 + QUEUED_ALERT_2H_MS);
    await new Promise((r) => setTimeout(r, 20));
    const second = runInquirySafetySweep(t0 + QUEUED_ALERT_2H_MS);
    release();
    await Promise.all([first, second]);
    expect(entered).toBe(1);
    expect(ageAlerts(mock.sent)).toHaveLength(1);
  });

  it("skips an alert whose claim is still in flight, then sends when the claim expires unsent", async () => {
    const t0 = Date.now();
    const r = await queueLead(t0);
    const stored = opsGet(r.inquiry.inquiryId)!;
    stored.safety = { alert2hAt: `pending:${t0 + QUEUED_ALERT_2H_MS + 30_000}` };
    mock.sent.pushes.length = 0;
    await runInquirySafetySweep(t0 + QUEUED_ALERT_2H_MS);
    expect(ageAlerts(mock.sent)).toHaveLength(0);
    stored.safety = { alert2hAt: `pending:${t0 + QUEUED_ALERT_2H_MS - 1}` };
    await runInquirySafetySweep(t0 + QUEUED_ALERT_2H_MS);
    expect(ageAlerts(mock.sent)).toHaveLength(1);
  });

  it("does not alert test, dry-run, or forwarded leads", async () => {
    const t0 = Date.now();
    const queued = await queueLead(t0);
    await queueLead(t0, { name: "MatchRV TEST Shopper", email: "test-shopper@example.com" });
    const preview = prepareInquiry(unit(), { ...shopper, email: "dry@example.com" }, t0);
    if (!preview.ok) throw new Error();
    await sendInquiry({ confirmationToken: preview.confirmationToken, confirmed: true, dryRun: true, requesterKey: "dry", scope: null, lookupUnit, now: t0 });
    const { confirmInquiryForwarded } = await import("../src/services/dealer-inquiries");
    expect(confirmInquiryForwarded(queued.inquiry.inquiryId, t0 + 1000).ok).toBe(true);
    mock.sent.pushes.length = 0;
    mock.sent.emails.length = 0;
    const result = await runInquirySafetySweep(t0 + QUEUED_ALERT_24H_MS + 1000);
    expect(result.alertsSent).toEqual([]);
    expect(ageAlerts(mock.sent)).toHaveLength(0);
  });

  it("defers the alert when no ops channel is configured and does not mark it sent", async () => {
    __setTransport(mockTransport({ email: false, push: false }));
    const t0 = Date.now();
    const preview = prepareInquiry(unit(), shopper, t0);
    if (!preview.ok) throw new Error();
    // No channel: the send itself fails. Seed a queued lead by notifying first, then remove the channel.
    mock = mockTransport();
    __setTransport(mock);
    const r = await queueLead(t0);
    __setTransport(mockTransport({ email: false, push: false }));
    const deferred = await runInquirySafetySweep(t0 + QUEUED_ALERT_2H_MS);
    expect(deferred.alertsSent).toEqual([]);
    expect(deferred.alertsDeferred.map((a) => a.reason)).toEqual(["ops_channel_unconfigured"]);
    expect(opsGet(r.inquiry.inquiryId)!.safety?.alert2hAt).toBeUndefined();
    __setTransport(mock);
    mock.sent.pushes.length = 0;
    const sent = await runInquirySafetySweep(t0 + QUEUED_ALERT_2H_MS + 1000);
    expect(sent.alertsSent.map((a) => a.threshold)).toEqual(["2h"]);
    expect(ageAlerts(mock.sent)).toHaveLength(1);
  });

  it("retries a failed ops-queue lead only to MatchRV ops, on the backoff schedule", async () => {
    let forwardAttempts = 0;
    const failing = mockTransport({
      email: false,
      push: true,
      failPush: (m) => {
        if (!m.title.startsWith("MatchRV inquiry to forward")) return null;
        forwardAttempts += 1;
        return forwardAttempts === 1 ? new Error("network down") : null;
      },
    });
    __setTransport(failing);
    const t0 = Date.now();
    const r = await queueLead(t0);
    expect(r.inquiry.status).toBe("failed");
    const stored = opsGet(r.inquiry.inquiryId)!;
    expect(stored.delivery.authorized?.kind).toBe("ops_queue");
    expect(stored.delivery.authorized?.dealerEmail).toBeNull();
    expect(Date.parse(stored.delivery.nextRetryAt!)).toBe(t0 + DELIVERY_RETRY_BACKOFF_MS[0]);

    __setRoutes({ [unit().dealer.id]: "new-route@dealer.test" });
    const early = await runInquirySafetySweep(t0 + DELIVERY_RETRY_BACKOFF_MS[0] - 1);
    expect(early.retries.find((x) => x.inquiryId === r.inquiry.inquiryId)?.outcome).toBe("skipped");
    expect(failing.sent.pushes.filter((p) => p.title.startsWith("MatchRV inquiry to forward"))).toHaveLength(0);
    expect(failing.sent.emails).toHaveLength(0);

    failing.sent.pushes.length = 0;
    const due = await runInquirySafetySweep(t0 + DELIVERY_RETRY_BACKOFF_MS[0]);
    expect(due.retries.map((x) => x.outcome)).toContain("queued");
    expect(failing.sent.emails.map((e) => e.to)).toEqual([]);
    expect(failing.sent.pushes.map((p) => p.title)).toContain("MatchRV inquiry to forward");
    expect(failing.sent.pushes.some((p) => /new-route@dealer.test/.test(p.body))).toBe(false);
    const after = opsGet(r.inquiry.inquiryId)!;
    expect(after.status).toBe("queued_for_matchrv");
    expect(after.preview.message).toBe(shopper.message);
    expect(after.preview.shopper.email).toBe("pat@example.com");
    expect(getInquiryStatus(r.inquiry.inquiryId, r.statusToken)?.status).toBe("queued_for_matchrv");
    failing.sent.pushes.length = 0;
    await runInquirySafetySweep(t0 + DELIVERY_RETRY_BACKOFF_MS[0] + 60_000);
    expect(failing.sent.pushes.filter((p) => p.title.startsWith("MatchRV inquiry to forward"))).toHaveLength(0);
  });

  it("retries a failed dealer email only to the original address and preserves the message", async () => {
    const u = unit();
    __setRoutes({ [u.dealer.id]: "inquiries@dealer.test" });
    const failing = mockTransport({
      email: true,
      push: false,
      failEmail: () => new Error("smtp down"),
    });
    __setTransport(failing);
    const t0 = Date.now();
    const r = await queueLead(t0);
    expect(r.inquiry.status).toBe("failed");
    expect(opsGet(r.inquiry.inquiryId)!.delivery.authorized?.dealerEmail).toBe("inquiries@dealer.test");
    __setRoutes({ [u.dealer.id]: "someone-else@dealer.test" });
    const recovering = mockTransport({ email: true, push: false });
    __setTransport(recovering);
    const result = await runInquirySafetySweep(t0 + DELIVERY_RETRY_BACKOFF_MS[0]);
    expect(result.retries.map((x) => x.outcome)).toContain("sent");
    expect(recovering.sent.emails.map((e) => e.to)).toEqual(["inquiries@dealer.test"]);
    expect(recovering.sent.emails[0].text).toContain(shopper.message);
    expect(recovering.sent.emails[0].text).toContain("pat@example.com");
    expect(opsGet(r.inquiry.inquiryId)!.status).toBe("delivered");
    expect(opsGet(r.inquiry.inquiryId)!.status).not.toBe("forwarded");
    recovering.sent.emails.length = 0;
    await runInquirySafetySweep(t0 + DELIVERY_RETRY_BACKOFF_MS[0] + DELIVERY_RETRY_BACKOFF_MS[1]);
    expect(recovering.sent.emails).toHaveLength(0);
  });

  it("stops on a permanent failure and alerts ops once", async () => {
    const failing = mockTransport({
      email: false,
      push: true,
      failPush: (m) => (m.title.startsWith("MatchRV inquiry to forward") ? new Error("ntfy_http_404") : null),
    });
    __setTransport(failing);
    const t0 = Date.now();
    const r = await queueLead(t0);
    expect(opsGet(r.inquiry.inquiryId)!.delivery.retryState).toBe("permanent");
    failing.sent.pushes.length = 0;
    const first = await runInquirySafetySweep(t0 + 60_000);
    expect(first.retries.filter((x) => x.outcome !== "skipped")).toEqual([]);
    expect(first.alertsSent.map((a) => a.threshold)).toEqual(["retries_exhausted"]);
    expect(failing.sent.pushes).toHaveLength(1);
    expect(failing.sent.pushes[0].body).not.toMatch(/pat@example.com|555|awning|Pat Tester/i);
    expect(failing.sent.pushes[0].body).toContain(r.inquiry.inquiryId);
    await runInquirySafetySweep(t0 + 120_000);
    expect(failing.sent.pushes).toHaveLength(1);
  });

  it("stops after four transient retries and alerts once", async () => {
    const forwardAttempts: string[] = [];
    const failing = mockTransport({
      email: false,
      push: true,
      failPush: (m) => {
        if (!m.title.startsWith("MatchRV inquiry to forward")) return null;
        forwardAttempts.push(m.title);
        return new Error("network down");
      },
    });
    __setTransport(failing);
    const t0 = Date.now();
    const r = await queueLead(t0);
    forwardAttempts.length = 0;
    let now = t0;
    for (let n = 0; n < MAX_DELIVERY_RETRIES; n++) {
      now = Date.parse(opsGet(r.inquiry.inquiryId)!.delivery.nextRetryAt!);
      await runInquirySafetySweep(now);
    }
    const done = opsGet(r.inquiry.inquiryId)!;
    expect(done.delivery.autoRetries).toBe(MAX_DELIVERY_RETRIES);
    expect(done.delivery.retryState).toBe("exhausted");
    expect(done.status).toBe("failed");
    expect(forwardAttempts).toHaveLength(MAX_DELIVERY_RETRIES);
    failing.sent.pushes.length = 0;
    await runInquirySafetySweep(now + 60_000);
    expect(failing.sent.pushes.map((p) => p.title)).toEqual([expect.stringMatching(/needs attention/)]);
    await runInquirySafetySweep(now + 120_000);
    expect(failing.sent.pushes).toHaveLength(1);
    expect(opsGet(r.inquiry.inquiryId)!.status).toBe("failed");
  });

  it("does not deliver twice when a retry is in flight and ops confirms the forward", async () => {
    const u = unit();
    __setRoutes({ [u.dealer.id]: "inquiries@dealer.test" });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const emails: string[] = [];
    let armRetry = false;
    __setTransport({
      emailConfigured: () => true,
      opsPushConfigured: () => false,
      async notifyOps() { throw new Error("ntfy_not_configured"); },
      async sendEmail(m) {
        if (m.to !== "inquiries@dealer.test" || !armRetry) throw new Error("smtp down");
        emails.push(m.to);
        await gate;
      },
    });
    const t0 = Date.now();
    const r = await queueLead(t0);
    expect(r.inquiry.status).toBe("failed");
    armRetry = true;
    const { confirmInquiryForwarded } = await import("../src/services/dealer-inquiries");
    const sweep = runInquirySafetySweep(t0 + DELIVERY_RETRY_BACKOFF_MS[0]);
    for (let i = 0; i < 50 && emails.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(emails).toEqual(["inquiries@dealer.test"]);
    const confirmed = confirmInquiryForwarded(r.inquiry.inquiryId, t0 + DELIVERY_RETRY_BACKOFF_MS[0] + 1);
    expect(confirmed.ok).toBe(true);
    release();
    await sweep;
    expect(emails).toEqual(["inquiries@dealer.test"]);
    expect(opsGet(r.inquiry.inquiryId)!.status).toBe("forwarded");
    await runInquirySafetySweep(t0 + DELIVERY_RETRY_BACKOFF_MS[0] + DELIVERY_RETRY_BACKOFF_MS[1]);
    expect(emails).toEqual(["inquiries@dealer.test"]);
  });

  it("a confirmed forward is visible to the shopper status token and stops further alerts", async () => {
    const t0 = Date.now();
    const r = await queueLead(t0);
    const { confirmInquiryForwarded } = await import("../src/services/dealer-inquiries");
    const confirmed = confirmInquiryForwarded(r.inquiry.inquiryId, t0 + 5000);
    if (!confirmed.ok) throw new Error(confirmed.code);
    expect(confirmed.inquiry.forwarded).toEqual({ at: new Date(t0 + 5000).toISOString(), by: "matchrv_ops" });
    const pub = getInquiryStatus(r.inquiry.inquiryId, r.statusToken);
    expect(pub?.status).toBe("forwarded");
    expect(pub?.statusDetail).toMatch(/Forwarded/);
    expect(pub?.statusDetail).toMatch(/does not mean the dealership has read or answered/);
    expect(pub).not.toHaveProperty("forwarded");
    expect(pub).not.toHaveProperty("safety");
    expect(pub).not.toHaveProperty("fit");
    expect(getInquiryStatus(r.inquiry.inquiryId, "ist_wrongtoken_wrongtoken")).toBeNull();
    const again = confirmInquiryForwarded(r.inquiry.inquiryId, t0 + 9000);
    if (!again.ok) throw new Error();
    expect(again.inquiry.forwarded?.at).toBe(new Date(t0 + 5000).toISOString());
    mock.sent.pushes.length = 0;
    await runInquirySafetySweep(t0 + QUEUED_ALERT_24H_MS);
    expect(ageAlerts(mock.sent)).toHaveLength(0);
  });

  it("does not start the in-process sweep unless INQUIRY_SAFETY_SWEEP=1", () => {
    const prev = process.env.INQUIRY_SAFETY_SWEEP;
    delete process.env.INQUIRY_SAFETY_SWEEP;
    expect(startInquirySafetySweep()).toBe(false);
    process.env.INQUIRY_SAFETY_SWEEP = "1";
    expect(startInquirySafetySweep()).toBe(true);
    __stopInquirySafetySweep();
    if (prev === undefined) delete process.env.INQUIRY_SAFETY_SWEEP;
    else process.env.INQUIRY_SAFETY_SWEEP = prev;
  });
});

describe("ops forward confirmation", () => {
  const OPS_KEY = "test-ops-key-not-real-0123456789";
  let base = "";
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  const prevKey = process.env.INQUIRY_OPS_KEY;
  const pushes: { title: string; body: string }[] = [];
  beforeAll(async () => {
    process.env.INQUIRY_OPS_KEY = OPS_KEY;
    const app = express();
    app.use(express.json());
    app.use("/api", inquiriesRouter);
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.close();
    __setTransport(null);
    if (prevKey === undefined) delete process.env.INQUIRY_OPS_KEY;
    else process.env.INQUIRY_OPS_KEY = prevKey;
  });
  beforeEach(() => {
    __resetInquiries();
    __setRoutes({});
    pushes.length = 0;
    __setTransport({
      emailConfigured: () => false,
      opsPushConfigured: () => true,
      async sendEmail() { throw new Error("email_not_configured"); },
      async notifyOps(m) { pushes.push(m); },
    });
  });
  afterEach(() => __setPersistenceForTests(false));

  async function sendQueued() {
    const u = unit();
    const prev = await (await fetch(`${base}/api/inquiries`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ unit_id: u.id, name: "Pat Tester", email: "pat@example.com", phone: "2535550142", message: "Is the awning included?" }),
    })).json();
    const sent = await (await fetch(`${base}/api/inquiries`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation_token: prev.confirmationToken, confirmed: true }),
    })).json();
    return sent as { inquiry: { inquiryId: string; status: string }; statusToken: string };
  }

  it("requires the ops key and only marks forwarded after confirm_forward succeeds", async () => {
    const sent = await sendQueued();
    expect(sent.inquiry.status).toBe("queued_for_matchrv");
    const noKey = await fetch(`${base}/api/inquiries/ops/sweep`, { method: "POST" });
    expect([401, 503]).toContain(noKey.status);
    const wrong = await fetch(`${base}/api/inquiries/ops/${sent.inquiry.inquiryId}`, {
      method: "POST",
      headers: { authorization: "Bearer wrong-key-wrong-key-wrong-key-00", "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm_forward" }),
    });
    expect(wrong.status).toBe(401);
    expect(getInquiryStatus(sent.inquiry.inquiryId, sent.statusToken)?.status).toBe("queued_for_matchrv");

    const ok = await fetch(`${base}/api/inquiries/ops/${sent.inquiry.inquiryId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${OPS_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm_forward" }),
    });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.inquiry.status).toBe("forwarded");
    expect(body.inquiry.forwarded.by).toBe("matchrv_ops");
    const shopper = await fetch(`${base}/api/inquiries/${sent.inquiry.inquiryId}`, { headers: { "x-inquiry-token": sent.statusToken } });
    const shopperBody = await shopper.json();
    expect(shopperBody.inquiry.status).toBe("forwarded");
    expect(JSON.stringify(shopperBody)).not.toContain("forwarded.by");
    expect(shopperBody.inquiry).not.toHaveProperty("safety");
  });

  it("a failed confirm does not show the lead as forwarded", async () => {
    const sent = await sendQueued();
    const flagged = await fetch(`${base}/api/inquiries/ops/${sent.inquiry.inquiryId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${OPS_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ test: true }),
    });
    expect(flagged.status).toBe(200);
    const refused = await fetch(`${base}/api/inquiries/ops/${sent.inquiry.inquiryId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${OPS_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm_forward" }),
    });
    expect(refused.status).toBe(409);
    expect(getInquiryStatus(sent.inquiry.inquiryId, sent.statusToken)?.status).toBe("queued_for_matchrv");
  });

  it("the sweep endpoint is ops-only and returns no shopper contact", async () => {
    const sent = await sendQueued();
    const t0 = Date.parse(opsGet(sent.inquiry.inquiryId)!.createdAt);
    // The HTTP sweep uses the real clock. Age the lead by rewriting createdAt/queuedAt.
    const row = opsGet(sent.inquiry.inquiryId)!;
    row.createdAt = new Date(t0 - QUEUED_ALERT_2H_MS - 1000).toISOString();
    row.queuedAt = row.createdAt;
    const res = await fetch(`${base}/api/inquiries/ops/sweep`, {
      method: "POST",
      headers: { authorization: `Bearer ${OPS_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alertsSent.map((a: { threshold: string }) => a.threshold)).toContain("2h");
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/pat@example.com|555|awning|Pat Tester/i);
  });

  it("the inbox confirms a forward explicitly and does not treat copy as success", () => {
    expect(OPS_LEADS_HTML).toContain("I sent this to the dealer");
    expect(OPS_LEADS_HTML).toContain("confirm_forward");
    expect(OPS_LEADS_HTML).toContain('data-action": "confirm-forward"');
    expect(OPS_LEADS_HTML).toMatch(/!test && \(i\.status === "queued_for_matchrv" \|\| i\.status === "failed"\)/);
    expect(OPS_LEADS_HTML).not.toMatch(/clipboard\.writeText[\s\S]{0,180}confirm_forward/);
    expect(OPS_LEADS_HTML).toContain("Not marked forwarded");
  });
});
