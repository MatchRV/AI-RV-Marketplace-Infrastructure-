/**
 * Resolve a public listing slug back to the stored unit id.
 * The slug map is built from the same snapshot the sitemap lists.
 */
import { listingIdEmbedsUrl, publicListingId } from "@workspace/agent-core";
import { getInventory, perSnapshot } from "../services/agent-inventory";

/** Built once per loaded snapshot. */
const slugIndex = perSnapshot((inv): Map<string, string> => {
  const map = new Map<string, string>();
  for (const unit of inv.units) {
    if (!listingIdEmbedsUrl(unit.id)) continue;
    const slug = publicListingId(unit.id);
    const prev = map.get(slug);
    if (prev && prev !== unit.id) {
      throw new Error(`public listing id collision for ${slug}`);
    }
    map.set(slug, unit.id);
  }
  return map;
});

/** Build the slug map for the current snapshot now (startup / reload warm). */
export function warmListingPublicIds(): number {
  return slugIndex().size;
}

/**
 * Stored unit id for a sitemap/listing request.
 * A stored id is returned as itself. A public slug returns the stored id.
 * Anything else is returned unchanged so a miss stays a miss.
 */
export function resolveCatalogUnitId(requested: string): string {
  const inv = getInventory();
  if (inv.byId.has(requested)) return requested;
  return slugIndex(inv).get(requested) ?? requested;
}

export interface ListingRequestDecision {
  /** Stored id when the request names a live unit. */
  unitId: string | null;
  /** Path to send when the request is not already the public canonical. */
  redirect: string | null;
}

/**
 * Old embedded-URL ids 301 to the public slug. The public slug and every
 * other unit id render in place. Unknown ids render the not-found shell.
 * A single extra or missing trailing slash still finds a URL-shaped id.
 */
export function decideListingRequest(requested: string): ListingRequestDecision {
  const candidates = [requested];
  if (requested.endsWith("/") && requested.length > 1) candidates.push(requested.slice(0, -1));
  else candidates.push(`${requested}/`);

  const inv = getInventory();
  for (const candidate of candidates) {
    const id = resolveCatalogUnitId(candidate);
    const unit = inv.byId.get(id);
    if (!unit) continue;
    const pub = publicListingId(unit.id);
    if (requested !== pub) {
      return { unitId: unit.id, redirect: `/listing/${encodeURI(pub)}` };
    }
    return { unitId: unit.id, redirect: null };
  }
  return { unitId: null, redirect: null };
}
