/**
 * Live inventory IDs are strings (e.g. "stk:dealer.com:id-…"), but the older
 * buyer_leads / analytics_events tables store listing_id and dealer_id as
 * integers. Inserting a string there makes Postgres reject the whole row, so
 * the lead or event is lost. Store the integer only when the value really is
 * one, and keep the original reference in the row's JSON so nothing is lost.
 */
export function toIntegerId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d{1,15}$/.test(value.trim())) return Number(value.trim());
  return null;
}

export function idRef(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value);
}
