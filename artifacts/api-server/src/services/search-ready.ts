import { runSearch, type CanonicalUnit, type Constraints, type Fact } from "@workspace/agent-core";
import { getInventory } from "./agent-inventory";

const published = (fact: Fact<number>) => fact.value !== null && fact.value > 0 && (fact.source === "dealer_listing" || fact.source === "derived_text");
export function usablePhotoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      !/^(localhost|\d|\[)/i.test(url.hostname) && url.hostname.includes(".") &&
      !/(placeholder|no[-_ ]?image|no[-_ ]?photo|coming[-_ ]?soon|logo|sold|stock[-_ ]?photo|floor[-_ ]?plan)/i.test(url.pathname);
  } catch { return false; }
}

/** Baseline completeness, not a claim that every optional equipment field is known. */
export function isSearchReady(unit: CanonicalUnit): boolean {
  return unit.status === "available" && unit.year > 1980 &&
    !!unit.make && !!unit.model && !/unknown|unspecified/i.test(`${unit.make} ${unit.model}`) &&
    published(unit.priceUsd) && published(unit.lengthFt) && published(unit.sleeps) &&
    (published(unit.gvwrLbs) || published(unit.dryWeightLbs)) &&
    !!unit.dealer.name && !!unit.dealer.city && !!unit.dealer.state &&
    unit.images.some(usablePhotoUrl);
}

export const readyUnits = () => getInventory().units.filter(isSearchReady);
const photoCache = new Map<string, { expires: number; ok: boolean }>();

export async function checkPhoto(url: string): Promise<boolean> {
  if (!usablePhotoUrl(url)) return false;
  const cached = photoCache.get(url);
  if (cached && cached.expires > Date.now()) return cached.ok;
  let ok = false;
  try {
    // Only known inventory URLs; redirects are rejected rather than followed to another host.
    const response = await fetch(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(3500), headers: { Range: "bytes=0-2047" } });
    ok = response.ok && /^image\/(jpeg|png|webp|avif)/i.test(response.headers.get("content-type") ?? "");
    await response.body?.cancel();
  } catch { /* A missing or unreachable photo makes this listing ineligible for this search. */ }
  if (photoCache.size > 10000) photoCache.clear();
  photoCache.set(url, { ok, expires: Date.now() + (ok ? 3_600_000 : 60_000) });
  return ok;
}

export async function searchReadyInventory(constraints: Constraints, limit = 12, corpus = readyUnits(), photoCheck = checkPhoto) {
  const outcome = runSearch(corpus.filter(isSearchReady), constraints);
  // Unknown hard requirements must not become recommendations.
  const ranked = outcome.results.filter(match => match.hardStatus === "pass");
  const selected: typeof ranked = [];
  let inspected = 0;
  for (let i = 0; i < Math.min(ranked.length, 36) && selected.length < limit; i += 6) {
    const batch = ranked.slice(i, i + 6);
    const checked = await Promise.all(batch.map(async match => {
      const photos = match.unit.images.filter(usablePhotoUrl);
      const candidates = photos.slice(0, 2);
      const valid = await Promise.all(candidates.map(photoCheck));
      const first = candidates.find((_, index) => valid[index]);
      return first ? { ...match, unit: { ...match.unit, images: [first, ...photos.filter(p => p !== first)] } } : null;
    }));
    inspected += batch.length;
    selected.push(...checked.filter((match): match is NonNullable<typeof match> => match !== null));
  }
  return { ...outcome, results: selected.slice(0, limit), coverage: {
    ...outcome.coverage,
    noLocalMatches: Boolean(constraints.location) && selected.length === 0,
  }, readiness: {
    totalInventory: getInventory().units.length,
    eligibleInventory: corpus.filter(isSearchReady).length,
    matchedBeforePhotoCheck: ranked.length,
    inspected,
    photoCheckLimited: inspected < ranked.length && selected.length < limit,
  } };
}
