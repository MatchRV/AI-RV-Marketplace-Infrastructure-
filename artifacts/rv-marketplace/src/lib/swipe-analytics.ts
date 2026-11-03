import { trackEvent } from "@/lib/analytics";

/**
 * Swipe-deck events. They go through the site's existing trackEvent(): POST /api/analytics/event (stored
 * when the deployment has a database; the database-free deployment answers stored:false) and window.gtag
 * when the Google tag is on the page.
 *
 * GA4 HOOK: once the GA4 property is set up, mark `inquiry_submitted` as a key event there; no code change
 * is needed for the events to arrive. To send them somewhere else as well, set window.matchrvSwipeHook.
 * Every call soft-fails: analytics can never break the deck.
 */
export type SwipeEvent = "swipe_like" | "swipe_pass" | "deck_complete" | "inquiry_submitted";

declare global {
  interface Window { matchrvSwipeHook?: (event: SwipeEvent, params: Record<string, unknown>) => void }
}

export function trackSwipe(event: SwipeEvent, params: Record<string, unknown> = {}): void {
  const metadata = { ...params, surface: "swipe_deck" };
  try { trackEvent(event, { metadata }); } catch { /* soft-fail */ }
  try { if (typeof window !== "undefined") window.matchrvSwipeHook?.(event, metadata); } catch { /* soft-fail */ }
}
