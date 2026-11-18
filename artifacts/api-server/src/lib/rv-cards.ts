/**
 * RV card payload: the typed, versioned data the RV cards widget
 * (ui://matchrv/rv-cards-v1.html) renders. Three views only:
 *
 *   results  a list of RV cards (search_rvs)
 *   compare  2-4 units side by side (compare_rvs)
 *   detail   one unit (get_rv)
 *
 * Rules (the same rules as the rest of MatchRV):
 *  - A field the record does not state is left out of the card entirely.
 *    No 0s, no "Unknown" strings, no placeholder photos, no computed CCC.
 *  - Text is plain text. The widget renders it with textContent, never HTML.
 *  - Every URL is http(s) or it is dropped. Photos must be https (the widget
 *    runs in an https iframe; http images would be blocked as mixed content).
 *
 * The payload rides in a tool result's _meta under CARDS_META_KEY, so the
 * text content and structuredContent the model sees are unchanged.
 */
import { publicListingId, type CanonicalUnit, type Fact } from "@workspace/agent-core";
import { isBoilerplateDescription } from "./description-boilerplate";

export const CARDS_SCHEMA = "matchrv.rv-cards";
export const CARDS_VERSION = 1;
/** Tool-result _meta key that carries the card payload. */
export const CARDS_META_KEY = "matchrv/cards";

const SITE = "https://matchrv.com";
const MAX_TEXT = 160;
const MAX_DESCRIPTION = 420;

export type RvCardsView = "results" | "compare" | "detail";

export interface RvCardUnit {
  id: string;
  /** Canonical MatchRV listing page. Always present (built from the id). */
  url: string;
  title: string;
  photo?: string;
  year?: number;
  make?: string;
  model?: string;
  condition?: "new" | "used";
  /** Only for non-available states the shopper must see: pending, sold, removed. */
  status?: "pending" | "sold" | "removed";
  priceUsd?: number;
  dealerName?: string;
  dealerLocation?: string;
  /** RV type code (travel_trailer, class_a, ...) and its display label. */
  type?: string;
  typeLabel?: string;
  gvwrLbs?: number;
  dryWeightLbs?: number;
  /** Published cargo carrying capacity only (never GVWR minus dry weight). */
  cccLbs?: number;
  lengthFt?: number;
  sleeps?: number;
  /** Detail view only. */
  slideouts?: number;
  /** The dealer's own listing text, trimmed. Quoted as theirs, not MatchRV's. */
  description?: string;
  dealerListingUrl?: string;
}

export interface RvCardsPayload {
  schema: typeof CARDS_SCHEMA;
  version: typeof CARDS_VERSION;
  view: RvCardsView;
  units: RvCardUnit[];
  /** The tool's own status when it returned no units on purpose (e.g. needs_discovery). */
  status?: string;
}

export const RV_TYPE_LABELS: Record<string, string> = {
  travel_trailer: "Travel trailer",
  fifth_wheel: "Fifth wheel",
  toy_hauler: "Toy hauler",
  class_a: "Class A motorhome",
  class_b: "Class B camper van",
  class_c: "Class C motorhome",
  truck_camper: "Truck camper",
  popup_camper: "Pop-up camper",
};

/** Plain text: control characters removed, whitespace collapsed, length capped. Empty -> undefined. */
export function cleanText(value: unknown, max = MAX_TEXT): string | undefined {
  if (typeof value !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const s = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** http(s) URL or undefined. `httpsOnly` for photos. */
export function safeUrl(value: unknown, httpsOnly = false): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  let u: URL;
  try {
    u = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" && (httpsOnly || u.protocol !== "http:")) return undefined;
  if (u.username || u.password) return undefined;
  return u.href;
}

/** A positive, finite number from a Fact, else undefined. 0 is never a real price, weight, length or capacity. */
function positive(f: Fact<number> | undefined | null, max: number): number | undefined {
  const v = f?.value;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > max) return undefined;
  return v;
}

export function cardListingUrl(unitId: string): string {
  return `${SITE}/listing/${encodeURI(publicListingId(unitId))}`;
}

/** Dealer display name: the dealer's own name, prettified only when it is a bare domain slug. */
function dealerName(raw: string | null | undefined): string | undefined {
  const n = cleanText(raw ?? undefined);
  if (!n) return undefined;
  if (/\s/.test(n) || !/^[a-z0-9.-]+$/i.test(n)) return n;
  if (!/[-.]/.test(n)) return n;
  return n
    .replace(/\.(com|net|org)$/i, "")
    .split(/[-_.]/)
    .filter(Boolean)
    .map((w) => (/^rvs?$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function set<K extends keyof RvCardUnit>(out: RvCardUnit, key: K, value: RvCardUnit[K] | undefined): void {
  if (value !== undefined) out[key] = value;
}

export interface CardOptions {
  /** Detail view adds slideouts, a short description and the dealer's own listing link. */
  detail?: boolean;
}

/** One unit -> one card. Missing facts are omitted, never defaulted. */
export function buildCardUnit(unit: CanonicalUnit, opts: CardOptions = {}): RvCardUnit {
  const out: RvCardUnit = {
    id: String(unit.id),
    url: cardListingUrl(String(unit.id)),
    title: cleanText(unit.title) ?? cleanText([unit.year, unit.make, unit.model].filter(Boolean).join(" ")) ?? "RV listing",
  };
  const photo = (unit.images ?? []).map((i) => safeUrl(i, true)).find(Boolean);
  set(out, "photo", photo);
  set(out, "year", Number.isInteger(unit.year) && unit.year >= 1950 && unit.year <= 2100 ? unit.year : undefined);
  set(out, "make", cleanText(unit.make, 60));
  set(out, "model", cleanText(unit.model, 80));
  set(out, "condition", unit.condition === "new" || unit.condition === "used" ? unit.condition : undefined);
  set(out, "status", unit.status === "pending" || unit.status === "sold" || unit.status === "removed" ? unit.status : undefined);
  set(out, "priceUsd", positive(unit.priceUsd, 5_000_000));
  set(out, "dealerName", dealerName(unit.dealer?.name));
  set(out, "dealerLocation", cleanText([unit.dealer?.city, unit.dealer?.state].map((s) => (s ?? "").trim()).filter(Boolean).join(", "), 80));
  if (unit.rvType && RV_TYPE_LABELS[unit.rvType]) {
    out.type = unit.rvType;
    out.typeLabel = RV_TYPE_LABELS[unit.rvType];
  }
  set(out, "gvwrLbs", positive(unit.gvwrLbs, 100_000));
  set(out, "dryWeightLbs", positive(unit.dryWeightLbs, 100_000));
  set(out, "cccLbs", positive(unit.towing?.cargoCapacityLbs, 50_000));
  set(out, "lengthFt", positive(unit.lengthFt, 80));
  const sleeps = positive(unit.sleeps, 20);
  set(out, "sleeps", sleeps != null && Number.isInteger(sleeps) ? sleeps : undefined);
  if (opts.detail) {
    const slides = unit.slideouts?.value;
    // 0 slides is a real, stated fact for a unit; keep it only when the record states it.
    set(out, "slideouts", typeof slides === "number" && Number.isInteger(slides) && slides >= 0 && slides <= 8 && unit.slideouts?.source ? slides : undefined);
    // Same rule as the listing page: the dealer's own text, only when it is about the RV.
    const desc = cleanText(unit.description ?? undefined, 100_000);
    set(out, "description", desc && desc.length >= 80 && !isBoilerplateDescription(desc) ? cleanText(desc, MAX_DESCRIPTION) : undefined);
    set(out, "dealerListingUrl", safeUrl(unit.provenance?.listingUrl));
  }
  return out;
}

export function buildCardsPayload(view: RvCardsView, units: CanonicalUnit[], extra: { status?: string } = {}): RvCardsPayload {
  const max = view === "detail" ? 1 : view === "compare" ? 4 : 10;
  return {
    schema: CARDS_SCHEMA,
    version: CARDS_VERSION,
    view,
    units: units.slice(0, max).map((u) => buildCardUnit(u, { detail: view === "detail" })),
    ...(extra.status ? { status: cleanText(extra.status, 40) } : {}),
  };
}

/** https origins of listing photos, for the widget's CSP resourceDomains. */
export function photoOrigins(units: Iterable<CanonicalUnit>, cap = 400): string[] {
  const counts = new Map<string, number>();
  for (const u of units) {
    const photo = (u.images ?? []).map((i) => safeUrl(i, true)).find(Boolean);
    if (!photo) continue;
    const origin = new URL(photo).origin;
    counts.set(origin, (counts.get(origin) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, cap).map(([o]) => o).sort();
}
