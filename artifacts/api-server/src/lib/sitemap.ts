/**
 * Dynamic sitemap index + paginated unit sitemaps (MAT-32).
 */
import { publicListingId } from "@workspace/agent-core";
import { CORE_SITEMAP_URLS } from "./sitemap-core-urls";
import { getInventory, perSnapshot } from "../services/agent-inventory";
import { isIndexableUnit } from "./unit-insights";
import { listHubUrls } from "./inventory-hubs";

const SITE = "https://matchrv.com";
/** Sitemap protocol soft limit is 50k; stay under for safety. */
export const UNITS_PER_SITEMAP = 45_000;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Units advertised to crawlers: only pages worth indexing. That leaves out
 * units the dealer has taken down, listings not seen recently (likely sold),
 * prices that fail a sanity check, and thin pages that add nothing over the
 * dealer's own listing (those carry noindex too). The sitemap carries only
 * the MatchRV listing URL and a date — never how or where MatchRV got the
 * record.
 */
/** Built once per loaded snapshot. */
const sitemapUnitsFor = perSnapshot((inv) => inv.units.filter((u) => u.status !== "removed" && isIndexableUnit(u)));
function sitemapUnits() {
  return sitemapUnitsFor();
}

const today = () => new Date().toISOString().slice(0, 10);
const dayOf = (iso: string | undefined) => (/^\d{4}-\d{2}-\d{2}/.test(iso ?? "") ? iso!.slice(0, 10) : null);

/** Newest unit date in one unit sitemap page, so lastmod changes only when its units do. */
function unitPageLastmod(page: number): string {
  const units = sitemapUnits();
  const start = (page - 1) * UNITS_PER_SITEMAP;
  let max = "";
  for (const u of units.slice(start, start + UNITS_PER_SITEMAP)) {
    const d = dayOf(u.provenance.lastSeenAt);
    if (d && d > max) max = d;
  }
  return max || today();
}

/** Hubs change when the snapshot does. */
function snapshotDay(): string {
  return dayOf(getInventory().snapshot?.builtAt) ?? today();
}

export function unitSitemapPageCount(): number {
  const n = sitemapUnits().length;
  return Math.max(1, Math.ceil(n / UNITS_PER_SITEMAP));
}

export function renderSitemapIndex(): string {
  const entries: string[] = [];
  entries.push(`  <sitemap>
    <loc>${SITE}/sitemaps/core.xml</loc>
    <lastmod>${today()}</lastmod>
  </sitemap>`);
  entries.push(`  <sitemap>
    <loc>${SITE}/sitemaps/hubs.xml</loc>
    <lastmod>${snapshotDay()}</lastmod>
  </sitemap>`);
  const pages = unitSitemapPageCount();
  for (let i = 1; i <= pages; i++) {
    entries.push(`  <sitemap>
    <loc>${SITE}/sitemaps/units-${i}.xml</loc>
    <lastmod>${unitPageLastmod(i)}</lastmod>
  </sitemap>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</sitemapindex>
`;
}

export function renderCoreSitemap(): string {
  const lastmod = today();
  const urls = CORE_SITEMAP_URLS.map(
    (loc) => `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

/** State and state × type × price shopping hubs (see inventory-hubs.ts). */
export function renderHubSitemap(): string {
  const lastmod = snapshotDay();
  const urls = listHubUrls().map(
    (loc) => `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

export function unitSitemapLoc(unitId: string): string {
  // Encode only characters that break XML/URL paths; keep : for readability.
  // URL-shaped ids are replaced with a stable slug first. Every other id
  // is passed through unchanged, so those locs stay byte-identical.
  return `${SITE}/listing/${encodeURI(publicListingId(unitId))}`;
}

export function renderUnitSitemapPage(page: number): string | null {
  if (!Number.isInteger(page) || page < 1) return null;
  const units = sitemapUnits();
  const pages = Math.max(1, Math.ceil(units.length / UNITS_PER_SITEMAP));
  if (page > pages) return null;
  const start = (page - 1) * UNITS_PER_SITEMAP;
  const slice = units.slice(start, start + UNITS_PER_SITEMAP);
  const urls = slice.map((u) => {
    const lastmod = dayOf(u.provenance.lastSeenAt) ?? today();
    const loc = unitSitemapLoc(u.id);
    return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

export function countUrlsInXml(xml: string): number {
  return (xml.match(/<loc>/g) || []).length;
}
