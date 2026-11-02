/** Cookie banners and site boilerplate scraped as listing "descriptions" (mirrors rv-marketplace/src/lib/listing-claims.ts). */
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
