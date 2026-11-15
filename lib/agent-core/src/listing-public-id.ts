/**
 * Public listing path segment.
 *
 * Most unit ids (`vin:…`, `stk:…`, `key:u:…` that are not URLs) are already
 * safe in a path and must be returned unchanged. Ids that embed a dealer URL
 * (`key:u:https://dealer.example/product/…`) are not: a sitemap loc would
 * contain a second URL. Those get a short stable slug derived only from the
 * stored id, so the same unit always maps to the same path.
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

/** FNV-1a 64-bit, hex. ASCII unit ids hash the same in every runtime. */
function fnv1a64(text: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * FNV_PRIME) & FNV_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

/** True when the stored id itself contains an http(s) URL. */
export function listingIdEmbedsUrl(unitId: string): boolean {
  return /^key:u:https?:\/\//i.test(unitId);
}

/**
 * Id used in `/listing/{id}`, the sitemap, and the canonical URL.
 * Every id that does not embed a URL is returned unchanged.
 */
export function publicListingId(unitId: string): string {
  if (!listingIdEmbedsUrl(unitId)) return unitId;
  return `key:h:${fnv1a64(unitId)}`;
}
