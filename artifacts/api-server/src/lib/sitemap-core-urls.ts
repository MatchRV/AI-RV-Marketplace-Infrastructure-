/**
 * Public pages on the current MatchRV site.
 *
 * A URL belongs here when the route returns HTTP 200, is meant to be indexed,
 * and the server-rendered HTML has a real title, description, and canonical.
 * That covers dealer services, shopper tools that read the live inventory,
 * and educational pages that do not invent marketplace facts.
 * Unit pages (/listing/{id}) are advertised separately through the paginated
 * unit sitemaps in sitemap.ts.
 *
 * Leave out account, admin, login, saved, messages, alerts, searches,
 * sign-in, and dealer dashboards. Leave out pages marked noindex (such as
 * /swipe), demo-only reports (/browse), and legacy pages that claim a
 * deal-scoring marketplace or a dealer directory this site does not have.
 * Redirects stay redirects: advertise the destination, not the old path.
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
  "https://matchrv.com/book",
  "https://matchrv.com/terms",
  "https://matchrv.com/privacy",
  "https://matchrv.com/tow-guide",
  "https://matchrv.com/answers",
  "https://matchrv.com/outfitter",
  "https://matchrv.com/match",
  "https://matchrv.com/dealer-tools",
  "https://matchrv.com/dealers/chatgpt-advertising",
  "https://matchrv.com/find-the-right-rv-for-your-tow-vehicle",
  "https://matchrv.com/guides/best-rvs-for-full-time-living",
  "https://matchrv.com/guides/rv-cost-guide",
  "https://matchrv.com/guides/tow-vehicle-guide",
  "https://matchrv.com/guides/travel-trailer-vs-fifth-wheel",
  "https://matchrv.com/rv-financing",
  "https://matchrv.com/rv-financing/what-credit-score-do-you-need-to-buy-an-rv",
  "https://matchrv.com/rv-financing/bad-credit-rv-financing",
  "https://matchrv.com/rv-financing/rv-loan-calculator",
  "https://matchrv.com/rv-financing/find-rvs-by-monthly-payment",
  "https://matchrv.com/rv-financing/rv-pre-approval-before-shopping",
  "https://matchrv.com/rv-financing/used-rv-financing",
];
