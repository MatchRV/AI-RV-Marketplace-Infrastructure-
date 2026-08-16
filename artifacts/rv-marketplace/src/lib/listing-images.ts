const NON_PHOTO_PATTERNS = [
  /\/dealers?\//i,
  /banner/i,
  /\blogo\b/i,
  /coming[-_]?soon/i,
  /placeholder/i,
  /sprite/i,
  /favicon/i,
];

function normalizeKey(url: string): string {
  let key = url.split("?")[0];
  key = key.replace(/-thumb(?=\.[a-z0-9]+$)/i, "");
  return key.toLowerCase();
}

/**
 * Returns only the genuine photos that belong to a specific listing.
 * Strips dealer marketing banners/logos and collapses duplicate resolution
 * or thumbnail variants of the same image so the gallery and its photo
 * counter reflect the real set of images for that unit.
 */
export function cleanListingImages(images?: string[] | null): string[] {
  if (!images || !images.length) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of images) {
    if (typeof raw !== "string") continue;
    const url = raw.trim();
    if (!url) continue;
    if (NON_PHOTO_PATTERNS.some((pattern) => pattern.test(url))) continue;
    const key = normalizeKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(url);
  }
  return result;
}
