/**
 * /swipe deck logic (pure, unit-tested): card facts, the in-session preference model, re-ranking by
 * fit + distance, dealer spreading, and the 20-card stop. No dealer size or volume is ever an input.
 */
import type { PaymentEstimatePayload } from "./payment-calc";

export type RvType = "travel_trailer" | "fifth_wheel" | "toy_hauler" | "class_a" | "class_b" | "class_c" | "popup_camper" | "truck_camper";

/** Mirrors the server's SwipeCard (api-server/src/services/swipe-deck.ts). Optional = unknown, omitted. */
export interface SwipeCard {
  id: string;
  year: number;
  make: string;
  model: string;
  rvType: RvType;
  priceUsd: number;
  lengthFt?: number;
  sleeps?: number;
  condition?: "new" | "used";
  distanceMiles?: number;
  city: string;
  state: string;
  photo: string;
  photos: string[];
  dealerKey: string;
}

export const DECK_LIMIT = 20;
export const DIVERSITY_WINDOW = 10;
export const MAX_PER_DEALER_IN_WINDOW = 2;
export const SWIPE_THRESHOLD_PX = 120;
export const DEFAULT_ZIP = "98444";

export const RV_TYPE_LABELS: Record<RvType, string> = {
  travel_trailer: "Travel trailer", fifth_wheel: "Fifth wheel", toy_hauler: "Toy hauler",
  class_a: "Class A motorhome", class_b: "Class B camper van", class_c: "Class C motorhome",
  popup_camper: "Pop-up camper", truck_camper: "Truck camper",
};

export function formatPrice(usd: number): string {
  return `$${Math.round(usd).toLocaleString("en-US")}`;
}

export function cardTitle(c: Pick<SwipeCard, "year" | "make" | "model">): string {
  return `${c.year} ${c.make} ${c.model}`.replace(/\s+/g, " ").trim();
}

/** The small facts row. Only values we have; an unknown is left out, never guessed. */
export function cardFacts(c: SwipeCard): string[] {
  const out: string[] = [RV_TYPE_LABELS[c.rvType] ?? c.rvType.replace(/_/g, " ")];
  if (c.condition) out.push(c.condition === "new" ? "New" : "Used");
  if (typeof c.lengthFt === "number" && c.lengthFt > 0) out.push(`${Math.round(c.lengthFt)} ft`);
  if (typeof c.sleeps === "number" && c.sleeps > 0) out.push(`Sleeps ${c.sleeps}`);
  return out;
}

/** "23 mi · Fife, WA" — distance only when we could compute it. */
export function cardPlace(c: SwipeCard): string {
  const place = `${c.city}, ${c.state}`;
  return typeof c.distanceMiles === "number" ? `${c.distanceMiles} mi · ${place}` : place;
}

// ── Preference model ─────────────────────────────────────────────────────

export type Dim = "type" | "length" | "price" | "condition";
export type Prefs = Record<Dim, Record<string, number>>;
export const emptyPrefs = (): Prefs => ({ type: {}, length: {}, price: {}, condition: {} });

export function lengthBand(ft?: number): string | null {
  if (typeof ft !== "number" || !(ft > 0)) return null;
  if (ft < 20) return "<20";
  if (ft < 26) return "20-25";
  if (ft < 31) return "26-30";
  if (ft < 36) return "31-35";
  return "36+";
}
export function priceBand(usd: number): string {
  if (usd < 25_000) return "<25k";
  if (usd < 50_000) return "25-50k";
  if (usd < 75_000) return "50-75k";
  if (usd < 100_000) return "75-100k";
  if (usd < 150_000) return "100-150k";
  return "150k+";
}

/** The card's value on each preference dimension; null where the fact is unknown (no signal either way). */
export function cardBands(c: SwipeCard): Record<Dim, string | null> {
  return { type: c.rvType, length: lengthBand(c.lengthFt), price: priceBand(c.priceUsd), condition: c.condition ?? null };
}

const LIKE = 1;
const PASS = -0.6;

export function updatePrefs(prefs: Prefs, card: SwipeCard, liked: boolean): Prefs {
  const next: Prefs = { type: { ...prefs.type }, length: { ...prefs.length }, price: { ...prefs.price }, condition: { ...prefs.condition } };
  const bands = cardBands(card);
  for (const dim of Object.keys(bands) as Dim[]) {
    const v = bands[dim];
    if (v === null) continue;
    next[dim][v] = (next[dim][v] ?? 0) + (liked ? LIKE : PASS);
  }
  return next;
}

const WEIGHTS: Record<Dim, number> = { type: 1.2, length: 0.8, price: 1, condition: 0.6 };
const DISTANCE_WEIGHT = 0.8;

/** Fit to what this shopper has liked/passed so far (squashed so one swipe can't dominate). */
export function fitScore(c: SwipeCard, prefs: Prefs): number {
  const bands = cardBands(c);
  let s = 0;
  for (const dim of Object.keys(bands) as Dim[]) {
    const v = bands[dim];
    if (v === null) continue;
    const raw = prefs[dim][v] ?? 0;
    s += WEIGHTS[dim] * Math.tanh(raw / 2);
  }
  return s;
}

/** 1 at the shopper's ZIP, 0 at the edge of the radius; unknown distance scores 0. */
export function distanceScore(c: SwipeCard, radiusMiles: number): number {
  if (typeof c.distanceMiles !== "number") return 0;
  return Math.max(0, 1 - c.distanceMiles / Math.max(1, radiusMiles));
}

export function cardScore(c: SwipeCard, prefs: Prefs, radiusMiles: number): number {
  return fitScore(c, prefs) + DISTANCE_WEIGHT * distanceScore(c, radiusMiles);
}

/**
 * Pick the next card. Ranked by fit + distance (ties keep the server's fit order). In the first
 * DIVERSITY_WINDOW cards no dealer appears more than MAX_PER_DEALER_IN_WINDOW times; after that we
 * still avoid showing the same dealer twice in a row when another option exists.
 */
export function pickNext(remaining: SwipeCard[], shown: SwipeCard[], prefs: Prefs, radiusMiles: number): SwipeCard | null {
  if (!remaining.length) return null;
  const order = remaining
    .map((c, i) => ({ c, i, s: cardScore(c, prefs, radiusMiles) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
  const counts = new Map<string, number>();
  for (const c of shown.slice(0, DIVERSITY_WINDOW)) counts.set(c.dealerKey, (counts.get(c.dealerKey) ?? 0) + 1);
  const last = shown[shown.length - 1];
  if (shown.length < DIVERSITY_WINDOW) {
    const allowed = order.filter((c) => (counts.get(c.dealerKey) ?? 0) < MAX_PER_DEALER_IN_WINDOW);
    if (allowed.length) return allowed.find((c) => c.dealerKey !== last?.dealerKey) ?? allowed[0];
    // Every remaining card's dealer is already at the cap: end the deck early rather than break the rule.
    return null;
  }
  return order.find((c) => c.dealerKey !== last?.dealerKey) ?? order[0];
}

export interface DeckState {
  pool: SwipeCard[]; shown: SwipeCard[]; liked: SwipeCard[]; prefs: Prefs; current: SwipeCard | null; radiusMiles: number;
  /** Passes in a row (reset by a like). */
  passStreak: number;
  /** RV Outfitter check-ins shown in this deck. */
  checkIns: number;
}

export function startDeck(pool: SwipeCard[], radiusMiles: number, liked: SwipeCard[] = []): DeckState {
  const seen = new Set<string>();
  const unique = pool.filter((c) => c.photo && !seen.has(c.id) && seen.add(c.id));
  const kept = new Map<string, SwipeCard>();
  for (const card of liked) if (card?.id && !kept.has(card.id)) kept.set(card.id, card);
  const saved = [...kept.values()];
  const savedIds = new Set(saved.map((c) => c.id));
  const prefs = emptyPrefs();
  const current = pickNext(unique.filter((c) => !savedIds.has(c.id)), [], prefs, radiusMiles);
  return { pool: unique, shown: current ? [current] : [], liked: saved, prefs, current, radiusMiles, passStreak: 0, checkIns: 0 };
}

export function isComplete(s: DeckState): boolean {
  return s.current === null;
}

/** Record a swipe on the current card and move on. Stops after DECK_LIMIT cards. */
export function swipe(s: DeckState, liked: boolean): DeckState {
  if (!s.current) return s;
  const card = s.current;
  const prefs = updatePrefs(s.prefs, card, liked);
  const likedList = liked ? [...s.liked, card] : s.liked;
  if (s.shown.length >= DECK_LIMIT) return { ...s, prefs, liked: likedList, current: null, passStreak: liked ? 0 : s.passStreak + 1 };
  const shownIds = new Set(s.shown.map((c) => c.id));
  const remaining = s.pool.filter((c) => !shownIds.has(c.id));
  const next = pickNext(remaining, s.shown, prefs, s.radiusMiles);
  return { ...s, prefs, liked: likedList, current: next, shown: next ? [...s.shown, next] : s.shown, passStreak: liked ? 0 : s.passStreak + 1 };
}

/** Drop a card whose photo failed to load (not a pass: no preference signal) and pick another. */
export function skipBroken(s: DeckState): DeckState {
  if (!s.current) return s;
  const broken = s.current.id;
  const pool = s.pool.filter((c) => c.id !== broken);
  const shown = s.shown.filter((c) => c.id !== broken);
  const shownIds = new Set(shown.map((c) => c.id));
  const next = pickNext(pool.filter((c) => !shownIds.has(c.id)), shown, s.prefs, s.radiusMiles);
  return { ...s, pool, current: next, shown: next ? [...shown, next] : shown };
}

// ── Inquiry ──────────────────────────────────────────────────────────────

export interface InquiryForm { name: string; email: string; phone: string; message: string }

export function defaultInquiryMessage(c: Pick<SwipeCard, "year" | "make" | "model">): string {
  return `I'd like to see the ${cardTitle(c)} in person. Is it still available, and when could I come by?`;
}

/** Payload for sendDealerInquiry → POST /api/inquiries (same system as the listing page's Contact Dealer). */
export function inquiryPayload(unitId: string, form: InquiryForm, share?: { sharePayment: boolean; estimate: PaymentEstimatePayload | null }) {
  return {
    unitId,
    name: form.name.trim(),
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    message: form.message.trim(),
    // Off by default: the shopper's numbers leave the device only when they tick the share box.
    ...(share?.sharePayment && share.estimate ? { paymentEstimate: share.estimate } : {}),
  };
}

export function inquiryFormValid(form: InquiryForm): boolean {
  return form.name.trim().length > 0 && (form.email.trim().length > 0 || form.phone.trim().length > 0) && form.message.trim().length > 0;
}

// ── RV Outfitter check-in ────────────────────────────────────────────────

export const CHECKIN_MAX_PER_DECK = 2;
export const CHECKIN_PASS_STREAK = 6;
export const CHECKIN_AT_CARD = 8;
/** Never on cards 1-3: the shopper hasn't told us anything yet. */
export const CHECKIN_EARLIEST_CARD = 4;

/**
 * Rule (no randomness, so it's testable and predictable): before the card at `position` (1-based) is
 * shown, ask "Want to change anything?" when the shopper has passed CHECKIN_PASS_STREAK in a row, or
 * once when they reach card CHECKIN_AT_CARD without a check-in yet. At most CHECKIN_MAX_PER_DECK per deck.
 */
export function shouldCheckIn(s: Pick<DeckState, "shown" | "passStreak" | "checkIns" | "current">): boolean {
  if (!s.current) return false;
  const position = s.shown.length;
  if (position < CHECKIN_EARLIEST_CARD || s.checkIns >= CHECKIN_MAX_PER_DECK) return false;
  if (s.passStreak >= CHECKIN_PASS_STREAK) return true;
  return position === CHECKIN_AT_CARD && s.checkIns === 0;
}

/** Mark a check-in as handled (dismissed or changed). Resets the pass streak so it can't re-fire on the next card. */
export function markCheckIn(s: DeckState): DeckState {
  return { ...s, checkIns: s.checkIns + 1, passStreak: 0 };
}

export interface CheckInEdits { rvType?: RvType | null; priceMaxUsd?: number | null; radiusMiles?: number | null; sleepsMin?: number | null }

/** Does a card satisfy the shopper's edited filters? Unknown sleeps fails a sleeps filter (never guessed). */
export function matchesEdits(c: SwipeCard, e: CheckInEdits): boolean {
  if (e.rvType && c.rvType !== e.rvType) return false;
  if (e.priceMaxUsd && c.priceUsd > e.priceMaxUsd) return false;
  if (e.radiusMiles && typeof c.distanceMiles === "number" && c.distanceMiles > e.radiusMiles) return false;
  if (e.sleepsMin && !(typeof c.sleeps === "number" && c.sleeps >= e.sleepsMin)) return false;
  return true;
}

/**
 * Apply check-in edits: keep the cards already shown and the likes, drop remaining cards that no longer
 * fit, merge in fresh cards from the server (already-shown ids excluded), and pick the next card with
 * the shopper's existing preferences. The 20-card limit still counts from the start of the deck.
 */
export function applyCheckIn(s: DeckState, edits: CheckInEdits, fresh: SwipeCard[]): DeckState {
  const shownIds = new Set(s.shown.map((c) => c.id));
  const current = s.current;
  const prior = current ? s.shown.filter((c) => c.id !== current.id) : s.shown;
  const priorIds = new Set(prior.map((c) => c.id));
  const kept = s.pool.filter((c) => !shownIds.has(c.id) && matchesEdits(c, edits));
  const seen = new Set<string>([...s.pool.map((c) => c.id)]);
  const added = fresh.filter((c) => c.photo && !priorIds.has(c.id) && !seen.has(c.id) && matchesEdits(c, edits) && seen.add(c.id));
  // The card on screen when the check-in appeared hasn't been swiped yet: it goes back in the running.
  const back = current && matchesEdits(current, edits) ? [current] : [];
  const remaining = [...back, ...kept, ...added];
  const radiusMiles = edits.radiusMiles ?? s.radiusMiles;
  const next = pickNext(remaining, prior, s.prefs, radiusMiles);
  const pool = [...prior, ...remaining];
  return { ...markCheckIn({ ...s, pool, radiusMiles }), shown: next ? [...prior, next] : prior, current: next };
}
