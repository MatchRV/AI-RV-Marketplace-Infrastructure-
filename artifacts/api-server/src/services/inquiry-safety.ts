/**
 * Safety net for dealer inquiries that are still queued or whose authorized
 * delivery failed.
 *
 * The sweep does not forward a lead to a dealer. Queued leads get one ops
 * alert at 2 hours and another at 24 hours. Failed leads are retried only
 * to the recipient stored when the shopper confirmed. Forwarded leads are
 * left alone.
 *
 * Enable with INQUIRY_SAFETY_SWEEP=1 (in-process, every 10 minutes) or POST
 * /api/inquiries/ops/sweep with the ops key. Neither is on unless configured.
 */

import { randomBytes } from "node:crypto";
import {
  attemptAuthorizedRetry,
  emitOpsAlert,
  isTestInquiry,
  listStoredInquiries,
  persistInquiriesSync,
  type DealerInquiry,
} from "./dealer-inquiries";
import {
  MAX_DELIVERY_RETRIES,
  QUEUED_ALERT_24H_MS,
  QUEUED_ALERT_2H_MS,
  SAFETY_CLAIM_MS,
  SAFETY_SWEEP_EVERY_MS,
  DELIVERY_RETRY_BACKOFF_MS,
} from "./inquiry-safety-policy";

export { DELIVERY_RETRY_BACKOFF_MS, MAX_DELIVERY_RETRIES, QUEUED_ALERT_24H_MS, QUEUED_ALERT_2H_MS, SAFETY_SWEEP_EVERY_MS };

export type AlertThreshold = "2h" | "24h" | "retries_exhausted";
export interface SafetySweepResult {
  alertsSent: { inquiryId: string; threshold: AlertThreshold }[];
  alertsDeferred: { inquiryId: string; threshold: AlertThreshold; reason: "ops_channel_unconfigured" | "notify_failed" }[];
  retries: { inquiryId: string; outcome: "sent" | "queued" | "transient" | "permanent" | "exhausted" | "skipped" }[];
}

const markerField: Record<AlertThreshold, "alert2hAt" | "alert24hAt" | "exhaustedAlertAt"> = {
  "2h": "alert2hAt",
  "24h": "alert24hAt",
  retries_exhausted: "exhaustedAlertAt",
};

function claimMarker(i: DealerInquiry, threshold: AlertThreshold, now: number): boolean {
  i.safety ??= {};
  const field = markerField[threshold];
  const cur = i.safety[field];
  if (cur && !cur.startsWith("pending:")) return false;
  if (cur?.startsWith("pending:")) {
    const until = Number(cur.slice("pending:".length));
    if (Number.isFinite(until) && until > now) return false;
  }
  i.safety[field] = `pending:${now + SAFETY_CLAIM_MS}`;
  persistInquiriesSync();
  return true;
}

function finishMarker(i: DealerInquiry, threshold: AlertThreshold, now: number, sent: boolean): void {
  i.safety ??= {};
  const field = markerField[threshold];
  if (sent) i.safety[field] = new Date(now).toISOString();
  else delete i.safety[field];
  persistInquiriesSync();
}

function queueAlert(i: DealerInquiry, threshold: "2h" | "24h"): { title: string; body: string } {
  const label = threshold === "2h" ? "2 hours" : "24 hours";
  const d = i.preview.dealer;
  const u = i.preview.unit;
  return {
    title: `MatchRV lead still queued (${label})`,
    body: [
      `${i.id} is still queued for MatchRV to forward.`,
      `Threshold: ${label} since it was queued. This alert is not a dealer delivery.`,
      `Dealer: ${d.name}, ${d.city} ${d.state}.`,
      `Unit: ${u.title} (stock ${u.stockNumber ?? "n/a"}).`,
      "Open /ops/leads, send it to the dealer, then confirm with “I sent this to the dealer”.",
      "No shopper contact details are included in this alert.",
    ].join("\n"),
  };
}

function exhaustedAlert(i: DealerInquiry): { title: string; body: string } {
  const kind = i.delivery.authorized?.kind ?? "unknown";
  const why = i.delivery.retryState === "permanent" ? "permanent failure" : "retry limit reached";
  return {
    title: "MatchRV lead delivery needs attention",
    body: [
      `${i.id}: automatic delivery stopped (${why}).`,
      `Authorized channel: ${kind}. The lead was not forwarded to the dealer.`,
      `Dealer: ${i.preview.dealer.name}, ${i.preview.dealer.city} ${i.preview.dealer.state}.`,
      "Open /ops/leads to forward it by hand, then confirm. No shopper contact details are included in this alert.",
    ].join("\n"),
  };
}

async function emitThreshold(i: DealerInquiry, threshold: AlertThreshold, now: number, result: SafetySweepResult): Promise<void> {
  if (i.status === "forwarded" || i.forwarded) return;
  if (threshold !== "retries_exhausted" && i.status !== "queued_for_matchrv") return;
  if (threshold === "retries_exhausted" && i.status !== "failed") return;
  if (!claimMarker(i, threshold, now)) return;
  if (i.forwarded) {
    finishMarker(i, threshold, now, false);
    return;
  }
  const msg = threshold === "retries_exhausted" ? exhaustedAlert(i) : queueAlert(i, threshold);
  const sent = await emitOpsAlert(msg);
  if (sent === "sent") {
    finishMarker(i, threshold, now, true);
    result.alertsSent.push({ inquiryId: i.id, threshold });
    return;
  }
  finishMarker(i, threshold, now, false);
  result.alertsDeferred.push({
    inquiryId: i.id,
    threshold,
    reason: sent === "unconfigured" ? "ops_channel_unconfigured" : "notify_failed",
  });
}

function dueThresholds(i: DealerInquiry, now: number): Array<"2h" | "24h"> {
  if (i.dryRun || i.status !== "queued_for_matchrv" || isTestInquiry(i) || i.forwarded) return [];
  const anchor = Date.parse(i.queuedAt ?? i.createdAt);
  if (!Number.isFinite(anchor)) return [];
  const age = now - anchor;
  const due: Array<"2h" | "24h"> = [];
  if (age >= QUEUED_ALERT_2H_MS) due.push("2h");
  if (age >= QUEUED_ALERT_24H_MS) due.push("24h");
  return due;
}

async function retryOne(i: DealerInquiry, now: number, result: SafetySweepResult): Promise<void> {
  const skip = (outcome: SafetySweepResult["retries"][number]["outcome"] = "skipped") => {
    result.retries.push({ inquiryId: i.id, outcome });
  };
  if (i.dryRun || isTestInquiry(i) || i.forwarded || i.status !== "failed") return;
  if (!i.delivery.authorized) return;
  if (i.delivery.retryState === "permanent" || i.delivery.retryState === "exhausted" || i.delivery.retryState === "stopped" || i.delivery.retryState === "succeeded") {
    return;
  }
  if (!i.delivery.nextRetryAt || Date.parse(i.delivery.nextRetryAt) > now) {
    skip("skipped");
    return;
  }
  if (i.delivery.claim && Date.parse(i.delivery.claim.until) > now) {
    skip("skipped");
    return;
  }
  const token = randomBytes(9).toString("base64url");
  i.delivery.claim = { token, until: new Date(now + SAFETY_CLAIM_MS).toISOString() };
  i.delivery.autoRetries = (i.delivery.autoRetries ?? 0) + 1;
  persistInquiriesSync();
  const stillFailed = () => i.status === "failed" && !i.forwarded && i.delivery.claim?.token === token;
  const outcome = await attemptAuthorizedRetry(i, now, stillFailed);
  if (i.delivery.claim?.token === token) i.delivery.claim = null;
  if (outcome === "skipped" || i.forwarded) {
    persistInquiriesSync();
    skip("skipped");
    return;
  }
  if (outcome === "delivered" || outcome === "queued") {
    i.delivery.retryState = "succeeded";
    i.delivery.nextRetryAt = null;
    persistInquiriesSync();
    result.retries.push({ inquiryId: i.id, outcome: outcome === "delivered" ? "sent" : "queued" });
    return;
  }
  const done = i.delivery.autoRetries ?? 0;
  if (outcome === "permanent" || done >= MAX_DELIVERY_RETRIES) {
    i.delivery.retryState = outcome === "permanent" ? "permanent" : "exhausted";
    i.delivery.nextRetryAt = null;
    persistInquiriesSync();
    result.retries.push({ inquiryId: i.id, outcome: i.delivery.retryState === "permanent" ? "permanent" : "exhausted" });
    return;
  }
  i.delivery.retryState = "active";
  i.delivery.nextRetryAt = new Date(now + DELIVERY_RETRY_BACKOFF_MS[Math.min(done, DELIVERY_RETRY_BACKOFF_MS.length - 1)]).toISOString();
  persistInquiriesSync();
  result.retries.push({ inquiryId: i.id, outcome: "transient" });
}

async function sweepBody(now: number): Promise<SafetySweepResult> {
  const result: SafetySweepResult = { alertsSent: [], alertsDeferred: [], retries: [] };
  const leads = listStoredInquiries();
  for (const i of leads) {
    if (i.forwarded || i.status === "forwarded" || isTestInquiry(i)) continue;
    for (const threshold of dueThresholds(i, now)) {
      await emitThreshold(i, threshold, now, result);
    }
    // Alert only when the lead was already terminal before this pass, so the
    // sweep that uses up the last retry does not also page ops. The next pass
    // sends the one exhaustion alert.
    const alreadyTerminal = i.status === "failed" && (i.delivery.retryState === "permanent" || i.delivery.retryState === "exhausted");
    await retryOne(i, now, result);
    if (alreadyTerminal && i.status === "failed") {
      await emitThreshold(i, "retries_exhausted", now, result);
    }
  }
  return result;
}

let chain: Promise<unknown> = Promise.resolve();

/** One sweep. Concurrent calls queue behind each other so a lead is claimed once. */
export function runInquirySafetySweep(now = Date.now()): Promise<SafetySweepResult> {
  const run = chain.then(() => sweepBody(now));
  chain = run.then(() => undefined, () => undefined);
  return run;
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * In-process scheduler. Off unless INQUIRY_SAFETY_SWEEP=1.
 * Does not create a Render service. The first sweep runs at startup, then
 * every 10 minutes, so a restart catch-up does not wait for the next tick.
 */
export function startInquirySafetySweep(): boolean {
  if (process.env.INQUIRY_SAFETY_SWEEP !== "1") return false;
  if (timer) return true;
  console.log(`[inquiry-safety] sweep on, every ${SAFETY_SWEEP_EVERY_MS / 60000} minutes`);
  const tick = () => {
    void runInquirySafetySweep().catch((err) => {
      const message = err instanceof Error ? err.message : "error";
      console.error("[inquiry-safety] sweep failed:", message.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"));
    });
  };
  tick();
  timer = setInterval(tick, SAFETY_SWEEP_EVERY_MS);
  timer.unref?.();
  return true;
}

export function __stopInquirySafetySweep(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
