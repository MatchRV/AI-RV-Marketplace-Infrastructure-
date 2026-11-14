/**
 * Public pages that belong to the current MatchRV website.
 *
 * Keep this list intentionally small. Legacy marketplace, campground, guide,
 * finance, and sell routes must not be advertised to search engines just
 * because the SPA can still render them. Unit pages (/listing/{id}) are
 * advertised separately through the paginated unit sitemaps in sitemap.ts.
 */
export const CORE_SITEMAP_URLS: string[] = [
  "https://matchrv.com/",
  "https://matchrv.com/visibility-report",
  "https://matchrv.com/for-dealers",
  "https://matchrv.com/visibility-solution",
  "https://matchrv.com/lotai",
  "https://matchrv.com/shop",
  "https://matchrv.com/mcp-setup",
  "https://matchrv.com/mcp-docs",
  "https://matchrv.com/about",
  "https://matchrv.com/contact",
  "https://matchrv.com/terms-and-conditions",
  "https://matchrv.com/privacy",
];
