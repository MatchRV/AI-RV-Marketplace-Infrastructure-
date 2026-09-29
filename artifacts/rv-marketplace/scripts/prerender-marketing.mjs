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
  ["/", "/src/pages/dealer-home.tsx", "DealerHome", "home"],
  ["/for-dealers", "/src/pages/for-dealers.tsx", "ForDealers", "for-dealers"],
  ["/visibility-report", "/src/pages/dealer-home.tsx", "VisibilityReport", "visibility-report"],
  ["/about", "/src/pages/about.tsx", "About", "about"],
];

const vite = await createServer({
  configFile: resolve(root, "vite.config.ts"),
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  await mkdir(prerenderDir, { recursive: true });
  for (const [path, modulePath, exportName, filename] of pages) {
    const component = (await vite.ssrLoadModule(modulePath))[exportName];
    const rendered = renderToString(
      React.createElement(HelmetProvider, {},
        React.createElement(Router, { hook: () => [path, () => {}] },
          React.createElement(component))),
    );
    const bodyStart = rendered.indexOf('<div class="matchrv-brand"');
    if (bodyStart < 0) throw new Error(`Missing page body for ${path}`);
    const metadata = rendered.slice(0, bodyStart);
    const body = rendered.slice(bodyStart);
    if (!metadata.includes("<title>") || !metadata.includes('name="description"')) {
      throw new Error(`Missing title or description for ${path}`);
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
