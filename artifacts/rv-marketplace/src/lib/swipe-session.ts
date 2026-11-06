import { RV_TYPE_LABELS, type RvType, type SwipeCard } from "./swipe-deck";

const TYPES = new Set<string>(Object.keys(RV_TYPE_LABELS));
const LIKES_KEY = "matchrv_swipe_likes";

export interface SwipeQuery {
  rvType: RvType | "";
  priceMinUsd: number | null;
  priceMaxUsd: number | null;
  /** Rough "around $X" target. Never becomes a hard floor or ceiling. */
  priceTargetUsd: number | null;
  place: string;
  zip: string;
  lengthMinFt: number | null;
  lengthMaxFt: number | null;
}

const blank = (): SwipeQuery => ({
  rvType: "", priceMinUsd: null, priceMaxUsd: null, priceTargetUsd: null, place: "", zip: "", lengthMinFt: null, lengthMaxFt: null,
});

function money(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1000 && n <= 2_000_000 ? n : null;
}
function feet(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 8 && n <= 60 ? n : null;
}

/** Only shopper RV-fit facts. Unknown keys, tokens, and malformed numbers are ignored. */
export function parseSwipeSearch(search: string): SwipeQuery {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out = blank();
  const type = q.get("type") ?? "";
  if (TYPES.has(type)) out.rvType = type as RvType;
  out.priceMinUsd = money(q.get("price_min"));
  out.priceMaxUsd = money(q.get("price_max"));
  out.priceTargetUsd = money(q.get("price_target"));
  if (out.priceMinUsd != null && out.priceMaxUsd != null && out.priceMinUsd > out.priceMaxUsd) {
    out.priceMinUsd = null;
    out.priceMaxUsd = null;
  }
  const place = (q.get("place") ?? "").trim();
  if (place.length >= 2 && place.length <= 80 && /^[A-Za-z0-9 .,'-]+$/.test(place)) out.place = place;
  const zip = q.get("zip") ?? "";
  if (/^\d{5}$/.test(zip)) out.zip = zip;
  out.lengthMinFt = feet(q.get("length_min"));
  out.lengthMaxFt = feet(q.get("length_max"));
  if (out.lengthMinFt != null && out.lengthMaxFt != null && out.lengthMinFt > out.lengthMaxFt) {
    out.lengthMinFt = null;
    out.lengthMaxFt = null;
  }
  return out;
}

export function loadLikes(storage: Pick<Storage, "getItem"> | null): SwipeCard[] {
  if (!storage) return [];
  try {
    const raw = JSON.parse(storage.getItem(LIKES_KEY) ?? "[]") as SwipeCard[];
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw.filter((c) => c && typeof c.id === "string" && c.id && !seen.has(c.id) && seen.add(c.id));
  } catch {
    return [];
  }
}

/** True only when a deck is loaded and this like is not in it. No deck means the like is still kept, not "outside". */
export function likedOutsideDeck(activeIds: ReadonlySet<string> | null, id: string): boolean {
  return activeIds != null && !activeIds.has(id);
}

export function saveLikes(storage: Pick<Storage, "setItem"> | null, likes: SwipeCard[]): void {
  if (!storage) return;
  const seen = new Set<string>();
  const unique = likes.filter((c) => c?.id && !seen.has(c.id) && seen.add(c.id));
  try { storage.setItem(LIKES_KEY, JSON.stringify(unique)); } catch { /* storage full or blocked */ }
}
