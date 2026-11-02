/**
 * Listing-page claims must be backed by data (CSO ruling, Nov 2).
 *
 * The snapshot-backed deploy has no market-value model: marketValue is the
 * price itself, dealSavings is 0, dealScore defaults to "fair_deal" and
 * daysOnMarket defaults to 0. Showing those as a "Fair Deal" badge, a
 * struck-through "Est." price or "0 days on market" states facts we don't
 * have. These helpers decide what the page may claim.
 */
export interface ClaimInputs {
  price?: number | null;
  marketValue?: number | null;
  dealSavings?: number | null;
  daysOnMarket?: number | null;
  firstSeenAt?: string | null;
}

/** A price analysis exists only when an independent market value differs from the price. */
export function hasPriceAnalysis(l: ClaimInputs): boolean {
  const price = Number(l.price);
  const mv = Number(l.marketValue);
  const savings = Number(l.dealSavings);
  return Number.isFinite(price) && price > 0 && Number.isFinite(mv) && mv > 0 && Math.round(mv) !== Math.round(price) && Number.isFinite(savings) && savings !== 0;
}

/** "X days on market" only from a real first-seen timestamp. */
export function daysOnMarketLabel(l: ClaimInputs, now = Date.now()): string | null {
  if (!l.firstSeenAt) return null;
  const t = Date.parse(l.firstSeenAt);
  if (!Number.isFinite(t) || t > now) return null;
  const days = Math.floor((now - t) / 86_400_000);
  return `${days} ${days === 1 ? "day" : "days"} on market`;
}

const BOILERPLATE_START = [
  /^this (web ?)?site uses cookies/i,
  /^we use cookies/i,
  /^(by (using|continuing|browsing)|cookies? (policy|settings|notice|consent))/i,
  /^(accept|allow) (all )?cookies/i,
  /^(please )?enable javascript/i,
  /^javascript (is )?(disabled|required)/i,
  /^your browser (is )?(out of date|not supported)/i,
];
const BOILERPLATE_ANYWHERE = /\b(uses cookies to (improve|enhance|give)|accept (all )?cookies|cookie (policy|preferences)|enable javascript to)\b/i;

/** Cookie banners and site boilerplate scraped as "descriptions" are not about the RV. */
export function isBoilerplateDescription(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return true;
  if (BOILERPLATE_START.some((re) => re.test(t))) return true;
  return t.length < 400 && BOILERPLATE_ANYWHERE.test(t);
}
export function cleanDescription(text: string | null | undefined): string | null {
  return isBoilerplateDescription(text) ? null : (text ?? "").trim();
}

/** Tri-state feature facts: unknown stays unknown, never "No". */
export function featureLabel(v: boolean | null | undefined): "Yes" | "No" | "Unknown" {
  return v === true ? "Yes" : v === false ? "No" : "Unknown";
}
