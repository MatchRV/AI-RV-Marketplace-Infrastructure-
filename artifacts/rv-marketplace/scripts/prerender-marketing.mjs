import { createServer } from "vite";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { HelmetProvider } from "react-helmet-async";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist/public");
const prerenderDir = resolve(root, "dist/prerender");
const shell = await readFile(resolve(dist, "index.html"), "utf8");
const pages = [
  ["/", "/src/pages/home.tsx", "Home", "consumer-home", "consumer"],
  ["/", "/src/pages/dealer-home.tsx", "DealerHome", "dealer-home", "dealer"],
  ["/for-dealers", "/src/pages/for-dealers.tsx", "ForDealers", "for-dealers", "dealer"],
  ["/visibility-report", "/src/pages/visibility-report.tsx", "VisibilityReport", "visibility-report", "dealer"],
  ["/visibility-solution", "/src/pages/visibility-solution.tsx", "VisibilitySolution", "visibility-solution", "dealer"],
  ["/lotai", "/src/pages/lotai.tsx", "LotAI", "lotai", "dealer"],
  ["/shop", "/src/pages/shop.tsx", "Shop", "shop", "consumer"],
  ["/mcp-setup", "/src/pages/mcp-setup.tsx", "McpSetup", "mcp-setup", "consumer"],
  ["/about", "/src/pages/about.tsx", "About", "about", "consumer"],
  ["/about", "/src/pages/about.tsx", "About", "about-dealer", "dealer"],
  ["/contact", "/src/pages/contact.tsx", "Contact", "contact", "consumer"],
  ["/contact", "/src/pages/contact.tsx", "Contact", "contact-dealer", "dealer"],
  ["/privacy", "/src/pages/privacy.tsx", "Privacy", "privacy", "consumer"],
  ["/privacy", "/src/pages/privacy.tsx", "Privacy", "privacy-dealer", "dealer"],
  ["/terms", "/src/pages/terms.tsx", "Terms", "terms", "consumer"],
  ["/terms", "/src/pages/terms.tsx", "Terms", "terms-dealer", "dealer"],
  ["/book", "/src/pages/book.tsx", "BookReportCall", "book", "dealer"],
  ["/tow-guide", "/src/pages/tow-guide.tsx", "TowGuide", "tow-guide", "consumer"],
  ["/answers", "/src/pages/answer-engine.tsx", "AnswerEngine", "answers", "consumer"],
  ["/outfitter", "/src/pages/outfitter.tsx", "Outfitter", "outfitter", "consumer"],
  ["/match", "/src/pages/match.tsx", "Match", "match", "consumer"],
  ["/dealer-tools", "/src/pages/dealer-aeo-toolkit.tsx", "DealerAeoToolkit", "dealer-tools", "dealer"],
  ["/dealers/chatgpt-advertising", "/src/pages/chatgpt-advertising.tsx", "ChatGPTAdvertising", "dealers-chatgpt-advertising", "dealer"],
  ["/find-the-right-rv-for-your-tow-vehicle", "/src/pages/find-the-right-rv-for-your-tow-vehicle.tsx", "FindTheRightRvForYourTowVehicle", "find-the-right-rv", "consumer"],
  ["/guides/best-rvs-for-full-time-living", "/src/pages/guides/best-rvs-for-full-time-living.tsx", "BestRvsForFullTimeLiving", "guides-best-rvs-for-full-time-living", "consumer"],
  ["/guides/rv-cost-guide", "/src/pages/guides/rv-cost-guide.tsx", "RvCostGuide", "guides-rv-cost-guide", "consumer"],
  ["/guides/tow-vehicle-guide", "/src/pages/guides/tow-vehicle-guide.tsx", "TowVehicleGuide", "guides-tow-vehicle-guide", "consumer"],
  ["/guides/travel-trailer-vs-fifth-wheel", "/src/pages/guides/travel-trailer-vs-fifth-wheel.tsx", "TravelTrailerVsFifthWheel", "guides-travel-trailer-vs-fifth-wheel", "consumer"],
  ["/rv-financing", "/src/pages/rv-financing/index.tsx", "RvFinancing", "rv-financing", "consumer"],
  ["/rv-financing/what-credit-score-do-you-need-to-buy-an-rv", "/src/pages/rv-financing/what-credit-score-do-you-need-to-buy-an-rv.tsx", "CreditScoreToBuyRv", "rv-financing-credit-score", "consumer"],
  ["/rv-financing/bad-credit-rv-financing", "/src/pages/rv-financing/bad-credit-rv-financing.tsx", "BadCreditRvFinancing", "rv-financing-bad-credit", "consumer"],
  ["/rv-financing/rv-loan-calculator", "/src/pages/rv-financing/rv-loan-calculator.tsx", "RvLoanCalculator", "rv-financing-loan-calculator", "consumer"],
  ["/rv-financing/find-rvs-by-monthly-payment", "/src/pages/rv-financing/find-rvs-by-monthly-payment.tsx", "FindRvsByMonthlyPayment", "rv-financing-monthly-payment", "consumer"],
  ["/rv-financing/rv-pre-approval-before-shopping", "/src/pages/rv-financing/rv-pre-approval-before-shopping.tsx", "RvPreApproval", "rv-financing-pre-approval", "consumer"],
  ["/rv-financing/used-rv-financing", "/src/pages/rv-financing/used-rv-financing.tsx", "UsedRvFinancing", "rv-financing-used", "consumer"],
];

const vite = await createServer({
  configFile: resolve(root, "vite.config.ts"),
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const { AuthProvider } = await vite.ssrLoadModule("/src/contexts/auth-context.tsx");
  const siteHost = await vite.ssrLoadModule("/src/lib/site-host.ts");
  const rq = await vite.ssrLoadModule("@tanstack/react-query");
  const queryClient = new rq.QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  await mkdir(prerenderDir, { recursive: true });
  for (const [path, modulePath, exportName, filename, site] of pages) {
    siteHost.setPrerenderSite(site);
    const component = (await vite.ssrLoadModule(modulePath))[exportName];
    const rendered = renderToString(
      React.createElement(rq.QueryClientProvider, { client: queryClient },
        React.createElement(AuthProvider, {},
          React.createElement(HelmetProvider, {},
            React.createElement(Router, { hook: () => [path, () => {}] },
              React.createElement(component))))),
    );
    // Page bodies start at the layout root: SiteLayout (mrv-site), BrandLayout, or the shopper Layout.
    const bodyStart = rendered.search(/<div class="(?:mrv-site|matchrv-brand|min-h-screen)[ "]/);
    if (bodyStart < 0) throw new Error(`Missing page body for ${path}`);
    const metadata = rendered.slice(0, bodyStart);
    const body = rendered.slice(bodyStart);
    if (!metadata.includes("<title>") || !metadata.includes('name="description"')) {
      throw new Error(`Missing title or description for ${path}`);
    }
    if (!metadata.includes('rel="canonical"')) {
      throw new Error(`Missing canonical for ${path}`);
    }
    if (/noindex/i.test(metadata)) {
      throw new Error(`noindex page cannot be prerendered for the sitemap: ${path}`);
    }
    if (metadata.includes("matchrv.comhttps://") || metadata.includes("matchrv.commatchrv.com")) {
      throw new Error(`Doubled canonical origin for ${path}`);
    }
    const html = shell
      .replace(/<title>[^<]*<\/title>/, "")
      .replace(/\s*<meta data-rh="true" name="description"[^>]*>/, "")
      .replace(/\s*<meta data-rh="true" property="og:description"[^>]*>/, "")
      .replace(/\s*<meta data-rh="true" name="twitter:description"[^>]*>/, "")
      .replace("</head>", `${metadata}\n  </head>`)
      .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
    await writeFile(resolve(prerenderDir, `${filename}.html`), html);
    console.log(`prerendered ${path}`);
  }
} finally {
  await vite.close();
}
