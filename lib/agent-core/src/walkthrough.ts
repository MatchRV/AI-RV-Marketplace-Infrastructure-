/**
 * Walkthrough videos and search-refinement guidance for shoppers.
 *
 * Facts only: a dealer video is returned only when the unit's own stored
 * listing data (images or description) contains a YouTube link. Otherwise we
 * return a YouTube *search* URL built from the stored year, make, model and
 * floorplan, clearly labeled as the same model rather than this unit. Nothing
 * is fetched, and no YouTube API or key is used.
 */
import type { CanonicalUnit } from "./types.js";

export type Walkthrough =
  | {
      kind: "dealer_video";
      url: string;
      label: string;
      source: "dealer_listing_images" | "dealer_listing_description";
      /** Linked by the dealer, but not verified to film this exact unit (a description link can be a model tour). */
      note: string;
    }
  | {
      kind: "model_search";
      url: string;
      label: string;
      query: string;
      sameUnit: false;
    };

export const MODEL_WALKTHROUGH_LABEL = "Same model — this unit may differ";
export const DEALER_VIDEO_LABEL = "Video linked in this unit's dealer listing";
export const DEALER_VIDEO_NOTE = "The dealer linked this video in the listing. MatchRV hasn't verified it shows this exact unit, so confirm with the dealer.";

const YT_ID = "([A-Za-z0-9_-]{11})";
const YT_PATTERNS: RegExp[] = [
  new RegExp(`https?://(?:www\\.|m\\.)?youtube\\.com/watch\\?(?:[^\\s"'<>]*&)?v=${YT_ID}`, "i"),
  new RegExp(`https?://(?:www\\.)?youtu\\.be/${YT_ID}`, "i"),
  new RegExp(`https?://(?:www\\.|m\\.)?youtube\\.com/(?:shorts|embed|live)/${YT_ID}`, "i"),
];

/** First YouTube video id in a string, or null. */
export function youtubeVideoId(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const re of YT_PATTERNS) {
    const m = re.exec(text);
    if (m) return m[1];
  }
  return null;
}

/** The dealer's own video link for this unit, if its stored listing data has one. */
export function dealerVideoUrl(unit: Pick<CanonicalUnit, "images" | "description">): { url: string; source: "dealer_listing_images" | "dealer_listing_description" } | null {
  for (const img of unit.images ?? []) {
    const id = youtubeVideoId(img);
    if (id) return { url: `https://www.youtube.com/watch?v=${id}`, source: "dealer_listing_images" };
  }
  const id = youtubeVideoId(unit.description);
  if (id) return { url: `https://www.youtube.com/watch?v=${id}`, source: "dealer_listing_description" };
  return null;
}

/** "year make model floorplan walkthrough" from stored fields only, without repeated words. */
export function walkthroughQuery(unit: Pick<CanonicalUnit, "year" | "make" | "model" | "floorplanCode">): string | null {
  const parts = [unit.year ? String(unit.year) : "", unit.make ?? "", unit.model ?? "", unit.floorplanCode ?? ""];
  const seen = new Set<string>();
  const words: string[] = [];
  for (const part of parts) {
    for (const raw of part.split(/\s+/)) {
      const w = raw.replace(/[^\p{L}\p{N}.\-/]+/gu, "").replace(/^[.\-/]+|[.\-/]+$/g, "");
      if (!w) continue;
      const key = w.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      words.push(w);
    }
  }
  // Need at least a make or model word beyond the year to be a useful search.
  if (words.filter((w) => !/^\d{4}$/.test(w)).length === 0) return null;
  return [...words, "walkthrough"].join(" ");
}

export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query).replace(/%20/g, "+")}`;
}

/** Walkthrough link for a unit: its dealer's own video if stored, else a same-model YouTube search. */
export function walkthroughFor(unit: Pick<CanonicalUnit, "year" | "make" | "model" | "floorplanCode" | "images" | "description">): Walkthrough | null {
  const dealer = dealerVideoUrl(unit);
  if (dealer) return { kind: "dealer_video", url: dealer.url, label: DEALER_VIDEO_LABEL, source: dealer.source, note: DEALER_VIDEO_NOTE };
  const query = walkthroughQuery(unit);
  if (!query) return null;
  return { kind: "model_search", url: youtubeSearchUrl(query), label: MODEL_WALKTHROUGH_LABEL, query, sameUnit: false };
}

// ── Refining a search ────────────────────────────────────────────────────────

/** What a shopper can change when results don't fit, asked about one at a time. */
export const REFINE_OPTIONS = ["price", "length", "floorplan", "distance", "rv_type", "new_vs_used"] as const;
export type RefineOption = (typeof REFINE_OPTIONS)[number];

export const REFINE_ASK =
  "If these aren't quite right, what would you change: the price, the length, the floorplan, how far you'd drive, the type of RV, or new vs. used?";

export const REFINE_RULE =
  "If the shopper doesn't like the results (or results are weak), ask what they'd change (price, length, floorplan, distance, RV type, or new vs used). Change ONE thing at a time, say what you changed, and call search_rvs again with everything else kept the same. Never loosen a hard limit (budget, length, tow rating, area) without their explicit OK.";

export interface RefineInput {
  shown: number;
  requested: number;
  verified: number;
  noLocalMatches: boolean;
}

export interface RefineHint {
  suggested: boolean;
  reason: string | null;
  ask: string;
  options: readonly RefineOption[];
  rule: string;
}

/** Whether results look weak enough to proactively offer a refinement, and how to ask. */
export function refineHint(r: RefineInput): RefineHint {
  let reason: string | null = null;
  if (r.noLocalMatches) reason = "no_local_matches";
  else if (r.shown === 0) reason = "no_results";
  else if (r.verified === 0) reason = "no_fully_verified_matches";
  else if (r.shown < r.requested) reason = "fewer_than_requested";
  return { suggested: reason != null, reason, ask: REFINE_ASK, options: REFINE_OPTIONS, rule: REFINE_RULE };
}
