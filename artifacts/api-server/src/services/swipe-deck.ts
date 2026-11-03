/**
 * Website swipe deck (/swipe) — server side.
 *
 * Eligibility is the MCP search_rvs screen (getScreenedInventory: stale listings, implausible prices and
 * category conflicts are held back) plus the deck's own floor: the unit is available, has a dealer-published
 * asking price (never MSRP: msrpUsd is a separate fact and is never read here), and has at least one real
 * dealer photo. Cards carry only facts we have; unknowns are omitted, never guessed. Cards never carry the
 * dealer's name — the detail view (unitDetail) reveals it.
 */
import { createHash } from "node:crypto";
import { dealerVideoUrl, youtubeVideoId, runSearch, unitMakeModel, type CanonicalUnit, type Constraints, type Fact, type RvType, type UnitMatch } from "@workspace/agent-core";
import { getScreenedInventory } from "./screened-inventory";
import { checkPhoto, usablePhotoUrl } from "./search-ready";
import { isBoilerplateDescription } from "../lib/description-boilerplate";

export const DECK_POOL_SIZE = 60;
export const DECK_PER_DEALER_CAP = 6;
export const DEFAULT_DECK_ZIP = "98444";
export const DEFAULT_DECK_RADIUS_MILES = 150;
export const RV_TYPES: RvType[] = ["travel_trailer", "fifth_wheel", "toy_hauler", "class_a", "class_b", "class_c", "popup_camper", "truck_camper"];

export interface SwipeCard {
  id: string;
  year: number;
  make: string;
  model: string;
  rvType: RvType;
  priceUsd: number;
  /** Present only when the dealer listing (or a sourced manufacturer spec) states it. */
  lengthFt?: number;
  sleeps?: number;
  condition?: "new" | "used";
  distanceMiles?: number;
  city: string;
  state: string;
  photo: string;
  photos: string[];
  /** Opaque dealer key for spreading cards across dealers. Not reversible to a name. */
  dealerKey: string;
}

/** Asking price the dealer shows the shopper. MSRP lives in msrpUsd and is never used. */
const PRICE_SOURCES = new Set(["dealer_listing", "derived_text"]);
/** Spec values we can stand behind on a card: the dealer's listing, or a manufacturer spec with a source URL. */
const SPEC_SOURCES = new Set(["dealer_listing", "derived_text", "manufacturer_spec"]);

export function publishedPrice(u: CanonicalUnit): number | null {
  const p = u.priceUsd;
  return p.value !== null && p.value > 0 && p.source !== null && PRICE_SOURCES.has(p.source) ? p.value : null;
}
function knownSpec(f: Fact<number> | undefined): number | undefined {
  if (!f || f.value === null || !(f.value > 0) || !f.source || !SPEC_SOURCES.has(f.source)) return undefined;
  if (f.source === "manufacturer_spec" && !f.sourceUrl) return undefined;
  return f.value;
}

/** Deck photos must be the dealer's own shots: drop catalog/stock images some feeds mix in (e.g. ".../sku/.../originals/..."). */
export const deckPhoto = (url: string) => usablePhotoUrl(url) && !/\/sku\//i.test(new URL(url).pathname);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** The make field sometimes holds the dealer's own name ("Camper City"); that is not a brand and would leak the dealer. */
export function displayMake(u: CanonicalUnit): string | null {
  const mm = unitMakeModel(u);
  const brand = (mm.brand || "").trim();
  if (!brand || /unknown|unspecified/i.test(brand)) return null;
  if (mm.brandSource === "raw_make") {
    const b = norm(brand), d = norm(u.dealer.name ?? "");
    if (b && d && (d.includes(b) || b.includes(d))) return null;
  }
  return brand;
}

export function dealerKey(u: CanonicalUnit): string {
  const basis = u.provenance?.dealerDomain || u.dealer.id || u.dealer.name;
  return createHash("sha256").update(`matchrv-swipe:${basis}`).digest("hex").slice(0, 12);
}

export function deckEligible(u: CanonicalUnit): boolean {
  return u.status === "available" && u.year > 1980 && publishedPrice(u) !== null &&
    !!u.model && !/unknown|unspecified/i.test(u.model) && displayMake(u) !== null &&
    !!u.dealer?.name && !!u.dealer.city && !!u.dealer.state &&
    u.images.some(deckPhoto);
}

export function toCard(u: CanonicalUnit, distanceMiles: number | null, photo?: string): SwipeCard {
  const photos = u.images.filter(deckPhoto);
  const first = photo && photos.includes(photo) ? photo : photos[0];
  const card: SwipeCard = {
    id: u.id, year: u.year, make: displayMake(u)!, model: u.model.trim(), rvType: u.rvType,
    priceUsd: publishedPrice(u)!, city: u.dealer.city, state: u.dealer.state,
    photo: first, photos: [first, ...photos.filter((p) => p !== first)].slice(0, 6), dealerKey: dealerKey(u),
  };
  const len = knownSpec(u.lengthFt); if (len !== undefined) card.lengthFt = len;
  const sl = knownSpec(u.sleeps); if (sl !== undefined) card.sleeps = Math.round(sl);
  if (u.condition === "new" || u.condition === "used") card.condition = u.condition;
  if (distanceMiles !== null && Number.isFinite(distanceMiles)) card.distanceMiles = Math.round(distanceMiles);
  return card;
}

export interface DeckQuery { rvTypes?: RvType[]; priceMaxUsd?: number; zip?: string; radiusMiles?: number; sleepsMin?: number }

export function deckConstraints(q: DeckQuery): Constraints {
  const c: Constraints = { sort: "best_match" };
  if (q.rvTypes?.length) c.rvTypes = q.rvTypes;
  if (q.priceMaxUsd && q.priceMaxUsd > 0) c.priceMaxUsd = q.priceMaxUsd;
  if (q.sleepsMin && q.sleepsMin > 0) c.sleepsMin = q.sleepsMin;
  c.location = { place: q.zip || DEFAULT_DECK_ZIP, radiusMiles: q.radiusMiles || DEFAULT_DECK_RADIUS_MILES };
  return c;
}

/**
 * Candidate pool for one deck. Ranked by fit to the filters plus distance (runSearch best_match: hard
 * filters, then score, which includes distance points) — never by dealer size or volume. At most
 * DECK_PER_DEALER_CAP units per dealer enter the pool so a large lot can't flood it; the client spreads
 * the first cards further (max 2 per dealer in the first 10).
 */
export async function buildDeckPool(q: DeckQuery, opts: { corpus?: CanonicalUnit[]; photoCheck?: (url: string) => Promise<boolean>; poolSize?: number; perDealerCap?: number; exclude?: Set<string> } = {}) {
  const corpus = (opts.corpus ?? getScreenedInventory().units).filter((u) => deckEligible(u) && !opts.exclude?.has(u.id));
  const poolSize = opts.poolSize ?? DECK_POOL_SIZE;
  const cap = opts.perDealerCap ?? DECK_PER_DEALER_CAP;
  const photoCheck = opts.photoCheck ?? checkPhoto;
  const constraints = deckConstraints(q);
  const outcome = runSearch(corpus, constraints);
  const ranked = outcome.results.filter((m) => m.hardStatus === "pass");
  const perDealer = new Map<string, number>();
  const candidates: UnitMatch[] = [];
  for (const m of ranked) {
    const k = dealerKey(m.unit);
    const n = perDealer.get(k) ?? 0;
    if (n >= cap) continue;
    perDealer.set(k, n + 1);
    candidates.push(m);
    if (candidates.length >= poolSize * 2) break;
  }
  const cards: SwipeCard[] = [];
  let photoRejected = 0;
  for (let i = 0; i < candidates.length && cards.length < poolSize; i += 12) {
    const batch = candidates.slice(i, i + 12);
    const checked = await Promise.all(batch.map(async (m) => {
      const photos = m.unit.images.filter(deckPhoto).slice(0, 2);
      for (const p of photos) if (await photoCheck(p)) return toCard(m.unit, m.distanceMiles, p);
      return null;
    }));
    for (const c of checked) { if (c) cards.push(c); else photoRejected++; }
  }
  return {
    cards: cards.slice(0, poolSize),
    appliedConstraints: constraints,
    locationResolution: outcome.locationResolution ?? null,
    stats: { matched: ranked.length, photoRejected },
  };
}

export interface SpecFact { label: string; value: string; source: "dealer_listing" | "derived_text" | "manufacturer_spec" }
export interface UnitDetail {
  card: SwipeCard;
  dealer: { name: string; city: string; state: string };
  hasDealerPage: boolean;
  /** The dealer's description exactly as stored (cookie banners/site boilerplate dropped). Null = none stored. */
  description: string | null;
  /** True when the stored text ends in an ellipsis: the dealer page has more. */
  descriptionShortened: boolean;
  /** Options/features as listed by the dealer, minus page navigation and share buttons the harvest picked up. */
  features: string[];
  /** Spec facts we have, each with its source. Unknowns are left out. */
  specs: SpecFact[];
  /** The dealer's own YouTube link from this unit's listing data, if any. */
  video: { youtubeId: string; url: string; source: "dealer_listing_images" | "dealer_listing_description"; note: string } | null;
}

/** Page chrome that dealer-site harvests sometimes stored as "features" (tabs, share buttons). Not options. */
const FEATURE_CHROME = new Set([
  "description", "overview", "similar rvs", "similar units", "share this rv", "share this unit", "share", "tweet", "pin it", "pin",
  "send to a friend", "email a friend", "copy link", "print", "print this page", "specifications", "specs", "floorplan", "floor plan",
  "features", "reviews", "photos", "videos", "video", "virtual tour", "get directions", "contact us", "apply for financing",
  "value your trade", "get a quote", "request info", "more info", "details", "options", "facebook", "twitter", "pinterest", "email",
  "contact sales", "contact us today", "call now", "text us", "schedule a test drive", "schedule a visit", "make an offer", "apply now",
  "get pre-approved", "unlock lower price", "unlock price", "get e-price", "get today's price", "trade-in", "calculate payment", "payment calculator", "compare", "save", "favorite", "back to results", "view all",
]);
export function cleanFeatures(list: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    if (typeof raw !== "string") continue;
    const f = raw.replace(/\s+/g, " ").trim();
    const key = f.toLowerCase().replace(/[:\s]+$/, "");
    if (f.length < 3 || f.length > 200 || FEATURE_CHROME.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
/**
 * Some dealer-site harvests stored a customer testimonial widget as the unit's description
 * ("My salesman was Mike…"). That isn't the dealer describing this RV, so it is withheld rather
 * than shown as "Dealer's description". Conservative: a real description that trips this is hidden
 * (the shopper still gets specs and the dealer link), never mislabeled.
 */
const CUSTOMER_REVIEW = /\b(salesperson|sales person|salesman|highly recommend|would recommend|we (bought|purchased)|our (new )?(truck|camper|trailer|rv)\b|great experience|5 stars|five stars|thank you .* team|walk-?through, he)/i;
const REVIEW_PHRASES = /\b(recommend(ed)? (them|this dealer|working with|to anyone|.{0,20}dealership)|helped (me|us)|helping (me|us)|(purchase|purchasing|buying|shopping) experience|(was|were) (amazing|excellent|wonderful|fantastic|so helpful|very helpful|great to work with)|excellent staff|service dep(t|artment)|treated (me|us)|answered all (my|our) questions|(fantastic|great|wonderful|amazing|excellent|awesome) experience|we (have )?purchased|we love how|thank you to)\b/i;
export function looksLikeCustomerReview(text: string): boolean {
  if (CUSTOMER_REVIEW.test(text) || REVIEW_PHRASES.test(text)) return true;
  // Dealer copy is written as "we"/"you"; a shopper writes "I"/"my".
  return (text.match(/\b(I|me|my|I'm|I've|I'd|I\u2019m|I\u2019ve)\b/g) ?? []).length >= 2;
}
export function cleanDescriptionText(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  return !t || isBoilerplateDescription(t) || looksLikeCustomerReview(t) ? null : t;
}

const fmtN = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const SPEC_FIELDS: { key: keyof CanonicalUnit; label: string; unit: string }[] = [
  { key: "lengthFt", label: "Length", unit: "ft" }, { key: "sleeps", label: "Sleeps", unit: "" },
  { key: "slideouts", label: "Slide-outs", unit: "" }, { key: "dryWeightLbs", label: "Dry weight", unit: "lbs" },
  { key: "gvwrLbs", label: "GVWR", unit: "lbs" }, { key: "hitchWeightLbs", label: "Hitch weight", unit: "lbs" },
  { key: "freshWaterGal", label: "Fresh water", unit: "gal" }, { key: "greyWaterGal", label: "Grey water", unit: "gal" },
  { key: "blackWaterGal", label: "Black water", unit: "gal" },
];
export function specFacts(u: CanonicalUnit): SpecFact[] {
  const out: SpecFact[] = [];
  for (const f of SPEC_FIELDS) {
    const fact = u[f.key] as Fact<number> | undefined;
    const v = knownSpec(fact);
    if (v === undefined || !fact?.source) continue;
    out.push({ label: f.label, value: f.unit ? `${fmtN(v)} ${f.unit}` : fmtN(v), source: fact.source as SpecFact["source"] });
  }
  return out;
}

export function dealerVideo(u: CanonicalUnit): UnitDetail["video"] {
  const v = dealerVideoUrl(u);
  const id = v ? youtubeVideoId(v.url) : null;
  if (!v || !id) return null;
  return { youtubeId: id, url: v.url, source: v.source, note: "The dealer linked this video in the listing. MatchRV hasn't checked that it shows this exact unit." };
}

export function outboundTarget(u: CanonicalUnit): string | null {
  for (const raw of [u.provenance?.listingUrl, u.dealer.website]) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && url.hostname.includes(".")) return url.toString();
    } catch { /* try the next one */ }
  }
  return null;
}

export function unitDetail(id: string, corpus = getScreenedInventory()): UnitDetail | null {
  const u = corpus.byId.get(id);
  if (!u || !deckEligible(u)) return null;
  const description = cleanDescriptionText(u.description);
  return {
    card: toCard(u, null), dealer: { name: u.dealer.name, city: u.dealer.city, state: u.dealer.state }, hasDealerPage: outboundTarget(u) !== null,
    description, descriptionShortened: !!description && /(\u2026|\.\.\.)$/.test(description),
    features: cleanFeatures(u.features), specs: specFacts(u), video: dealerVideo(u),
  };
}

/** Adds utm_source=matchrv (plus medium/campaign) without dropping the dealer's own query string. */
export function withUtm(target: string, campaign = "swipe_deck"): string {
  const url = new URL(target);
  url.searchParams.set("utm_source", "matchrv");
  url.searchParams.set("utm_medium", "referral");
  url.searchParams.set("utm_campaign", campaign);
  return url.toString();
}

/** Deck coverage numbers for reporting (eligible = price + photo, out of the searchable total). */
export function deckCoverage(corpus = getScreenedInventory().units) {
  let eligible = 0;
  const missingPhotoByDealer = new Map<string, { missing: number; total: number }>();
  for (const u of corpus) {
    const ok = deckEligible(u);
    if (ok) eligible++;
    if (u.status === "available" && publishedPrice(u) !== null) {
      const row = missingPhotoByDealer.get(u.dealer.name) ?? { missing: 0, total: 0 };
      row.total++;
      if (!u.images.some(deckPhoto)) row.missing++;
      missingPhotoByDealer.set(u.dealer.name, row);
    }
  }
  return { searchable: corpus.length, eligible, missingPhotoByDealer };
}
