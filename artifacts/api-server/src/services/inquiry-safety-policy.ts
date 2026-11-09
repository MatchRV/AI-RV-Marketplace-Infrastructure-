/**
 * Lead safety-net timing. The sweep is the only scheduler; these constants
 * are the policy both the job and the tests share.
 *
 * A lead is eligible at the threshold, not at a wall-clock hour. With a
 * 10-minute cadence the alert lands on the first sweep at or after the
 * threshold, so a running process alerts between 2h00m and about 2h10m
 * (and the same for 24h). A sweep that first sees a lead after 24h sends
 * each crossed threshold once in that run (catch-up). Markers on the lead
 * make a later sweep, a restart, or an overlapping run skip them.
 */

export const QUEUED_ALERT_2H_MS = 2 * 60 * 60 * 1000;
export const QUEUED_ALERT_24H_MS = 24 * 60 * 60 * 1000;
/** In-process cadence when INQUIRY_SAFETY_SWEEP=1. Not a Render cron. */
export const SAFETY_SWEEP_EVERY_MS = 10 * 60 * 1000;
/**
 * Waits after the initial failure, then after each automatic retry.
 * Four retries: 15m, 1h, 4h, 12h. The fifth failure stops.
 */
export const DELIVERY_RETRY_BACKOFF_MS = [
  15 * 60 * 1000,
  60 * 60 * 1000,
  4 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
] as const;
export const MAX_DELIVERY_RETRIES = DELIVERY_RETRY_BACKOFF_MS.length;
/** In-flight claim. A crashed sweep can be picked up after this. */
export const SAFETY_CLAIM_MS = 60 * 1000;
