/**
 * Dynamic sitemap index + paginated unit sitemaps (MAT-32).
 */
import { CORE_SITEMAP_URLS } from "./sitemap-core-urls";
import { getInventory } from "../services/agent-inventory";
import { datasetInfo, sitemapEntries } from "../services/inventory-access";
import { usingInventoryDb } from "../services/inventory-source";

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

export function unitSitemapPageCount(): number {
  const n = getInventory().units.length;
  return Math.max(1, Math.ceil(n / UNITS_PER_SITEMAP));
}

export function renderSitemapIndex(): string {
  const lastmod = new Date().toISOString().slice(0, 10);
  const entries: string[] = [];
  entries.push(`  <sitemap>
    <loc>${SITE}/sitemaps/core.xml</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</sitemapindex>
`;
}

export function renderCoreSitemap(): string {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = CORE_SITEMAP_URLS.map(
    (loc) => `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

export function renderUnitSitemapPage(page: number): string | null {
  if (!Number.isInteger(page) || page < 1) return null;
  const { units } = getInventory();
  const pages = Math.max(1, Math.ceil(units.length / UNITS_PER_SITEMAP));
  if (page > pages) return null;
  const start = (page - 1) * UNITS_PER_SITEMAP;
  const slice = units.slice(start, start + UNITS_PER_SITEMAP);
  const urls = slice.map((u) => {
    const lastmod = (u.provenance.lastSeenAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    // Encode only characters that break XML/URL paths; keep : for readability.
    const loc = `${SITE}/listing/${encodeURI(u.id)}`;
    return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
    <changefreq>daily</changefreq>
  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

function unitUrlset(entries: { id: string; lastSeenAt: string }[]): string {
  const urls = entries.map((u) => {
    const lastmod = (u.lastSeenAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    const loc = `${SITE}/listing/${encodeURI(u.id)}`;
    return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
    <changefreq>daily</changefreq>
  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

/** Same output as renderUnitSitemapPage, from whichever inventory source is configured. */
export async function renderUnitSitemapPageFromSource(page: number): Promise<string | null> {
  if (!usingInventoryDb()) return renderUnitSitemapPage(page);
  if (!Number.isInteger(page) || page < 1) return null;
  const n = (await datasetInfo()).units;
  const pages = Math.max(1, Math.ceil(n / UNITS_PER_SITEMAP));
  if (page > pages) return null;
  return unitUrlset(await sitemapEntries((page - 1) * UNITS_PER_SITEMAP, UNITS_PER_SITEMAP));
}

export function countUrlsInXml(xml: string): number {
  return (xml.match(/<loc>/g) || []).length;
}
