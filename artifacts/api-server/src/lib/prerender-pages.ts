/**
 * Pages whose HTML is written to dist/prerender/{file}.html and served
 * instead of the empty SPA shell. `file` must match prerender-marketing.mjs.
 *
 * `site` picks which host receives that file. Shared paths are rendered
 * twice so each host's canonical and navigation match the hostname.
 */
export type PrerenderSite = "consumer" | "dealer";

export const PRERENDER_PAGES: ReadonlyArray<{ path: string; file: string; site: PrerenderSite }> = [
  { path: "/", file: "consumer-home", site: "consumer" },
  { path: "/", file: "dealer-home", site: "dealer" },
  { path: "/for-dealers", file: "for-dealers", site: "dealer" },
  { path: "/visibility-report", file: "visibility-report", site: "dealer" },
  { path: "/visibility-solution", file: "visibility-solution", site: "dealer" },
  { path: "/lotai", file: "lotai", site: "dealer" },
  { path: "/shop", file: "shop", site: "consumer" },
  { path: "/mcp-setup", file: "mcp-setup", site: "consumer" },
  { path: "/about", file: "about", site: "consumer" },
  { path: "/about", file: "about-dealer", site: "dealer" },
  { path: "/contact", file: "contact", site: "consumer" },
  { path: "/contact", file: "contact-dealer", site: "dealer" },
  { path: "/privacy", file: "privacy", site: "consumer" },
  { path: "/privacy", file: "privacy-dealer", site: "dealer" },
  { path: "/terms", file: "terms", site: "consumer" },
  { path: "/terms", file: "terms-dealer", site: "dealer" },
  { path: "/book", file: "book", site: "dealer" },
  { path: "/tow-guide", file: "tow-guide", site: "consumer" },
  { path: "/answers", file: "answers", site: "consumer" },
  { path: "/outfitter", file: "outfitter", site: "consumer" },
  { path: "/match", file: "match", site: "consumer" },
  { path: "/dealer-tools", file: "dealer-tools", site: "dealer" },
  { path: "/dealers/chatgpt-advertising", file: "dealers-chatgpt-advertising", site: "dealer" },
  { path: "/find-the-right-rv-for-your-tow-vehicle", file: "find-the-right-rv", site: "consumer" },
  { path: "/guides/best-rvs-for-full-time-living", file: "guides-best-rvs-for-full-time-living", site: "consumer" },
  { path: "/guides/rv-cost-guide", file: "guides-rv-cost-guide", site: "consumer" },
  { path: "/guides/tow-vehicle-guide", file: "guides-tow-vehicle-guide", site: "consumer" },
  { path: "/guides/travel-trailer-vs-fifth-wheel", file: "guides-travel-trailer-vs-fifth-wheel", site: "consumer" },
  { path: "/rv-financing", file: "rv-financing", site: "consumer" },
  { path: "/rv-financing/what-credit-score-do-you-need-to-buy-an-rv", file: "rv-financing-credit-score", site: "consumer" },
  { path: "/rv-financing/bad-credit-rv-financing", file: "rv-financing-bad-credit", site: "consumer" },
  { path: "/rv-financing/rv-loan-calculator", file: "rv-financing-loan-calculator", site: "consumer" },
  { path: "/rv-financing/find-rvs-by-monthly-payment", file: "rv-financing-monthly-payment", site: "consumer" },
  { path: "/rv-financing/rv-pre-approval-before-shopping", file: "rv-financing-pre-approval", site: "consumer" },
  { path: "/rv-financing/used-rv-financing", file: "rv-financing-used", site: "consumer" },
];

export function prerenderFileFor(path: string, site: PrerenderSite): string | undefined {
  const rows = PRERENDER_PAGES.filter((page) => page.path === path);
  return rows.find((page) => page.site === site)?.file ?? rows[0]?.file;
}
