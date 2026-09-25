import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { matchRvMcpNodeHandler } from "./mcp";
import { DB_MODE } from "@workspace/db";
import { getInventory } from "./services/agent-inventory";
import { injectListingIntoShell } from "./lib/listing-seo";
import {
  renderSitemapIndex,
  renderCoreSitemap,
  renderUnitSitemapPage,
} from "./lib/sitemap";

const app: Express = express();

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
// MCP must receive the raw request body; mount it before Express JSON parsing.
app.all("/mcp", matchRvMcpNodeHandler);

// OpenAI plugin-directory domain verification. The submission portal supplies
// a token; set OPENAI_APPS_CHALLENGE on the production MCP service to that
// exact value. Return only the token, never JSON or multiple values.
app.get("/.well-known/openai-apps-challenge", (_req: Request, res: Response) => {
  const token = process.env.OPENAI_APPS_CHALLENGE?.trim();
  if (!token) {
    res.status(404).type("text/plain").send("not configured");
    return;
  }
  res.type("text/plain").send(token);
});
// sendBeacon may post text/plain — accept it for the WebMCP event endpoint only.
app.use(
  "/api/webmcp/event",
  express.text({ type: ["text/plain", "application/json", "*/*"], limit: "16kb" }),
  (req: Request, _res: Response, next: NextFunction) => {
    if (typeof req.body === "string") {
      try {
        req.body = JSON.parse(req.body);
      } catch {
        /* leave as string; route will 400 */
      }
    }
    next();
  },
);
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Security headers — applied to all API responses
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader(
    "Content-Security-Policy-Report-Only",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://www.google-analytics.com",
    ].join("; "),
  );
  next();
});

// Clerk auth is optional: without keys the app runs in anonymous mode
// (mirrors the frontend's local-auth fallback). Clerk-gated routes
// (/api/user/*, /api/trips/*) return 503 instead of crashing every request.
const isClerkConfigured = Boolean(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
if (isClerkConfigured) {
  app.use(clerkMiddleware());
} else {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (/^\/api\/(user|trips)(\/|$)/.test(req.path) || /^\/api\/listings\/[^/]+\/save/.test(req.path)) {
      res.status(503).json({ error: "auth_not_configured", detail: "Clerk keys are not set in this environment; account features are disabled." });
      return;
    }
    next();
  });
}

const AI_CRAWLERS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "PerplexityBot", "Perplexity-User",
  "Google-Extended", "ClaudeBot", "Claude-Web", "anthropic-ai",
  "Applebot-Extended", "CCBot",
];

app.use((req: Request, _res: Response, next: NextFunction) => {
  const ua = req.get("user-agent") || "";
  const matched = AI_CRAWLERS.find(bot => ua.toLowerCase().includes(bot.toLowerCase()));
  if (matched) {
    console.log(`[ai-crawler] ${matched} — ${req.method} ${req.path} — ${new Date().toISOString()}`);
  }
  next();
});

// Without a database (DISABLE_DB=1), the endpoints that read the inventory
// snapshot still work — the WebMCP agent tools at /api/agent/*, and the AI
// Outfitter chat, which falls back to the same snapshot for candidate
// selection. The classic marketplace endpoints cannot. Answer those with an
// explicit 503 rather than letting a database error surface as a 500.
if (DB_MODE === "none") {
  const DB_FREE = /^\/(agent|healthz|outfitter|webmcp)(\/|$)/;
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (DB_FREE.test(req.path)) return next();
    res.status(503).json({
      error: "database_disabled",
      message:
        "This demo deployment runs without a database. The WebMCP agent tools " +
        "at /api/agent/* serve from the inventory snapshot and are fully " +
        "functional; classic marketplace endpoints are not available here.",
    });
  });
}

app.use("/api", router);

// ── Dynamic sitemaps (must be registered BEFORE express.static so a leftover
//    public/sitemap.xml cannot shadow them) ─────────────────────────────────
app.get("/sitemap.xml", (_req: Request, res: Response) => {
  try {
    res.type("application/xml").send(renderSitemapIndex());
  } catch (err) {
    console.error("[sitemap] index failed:", err);
    res.status(503).type("text/plain").send("sitemap unavailable");
  }
});
app.get("/sitemaps/core.xml", (_req: Request, res: Response) => {
  res.type("application/xml").send(renderCoreSitemap());
});
app.get("/sitemaps/units-:page.xml", (req: Request, res: Response) => {
  const page = Number(req.params.page);
  try {
    const xml = renderUnitSitemapPage(page);
    if (!xml) {
      res.status(404).type("text/plain").send("sitemap page not found");
      return;
    }
    res.type("application/xml").send(xml);
  } catch (err) {
    console.error("[sitemap] units page failed:", err);
    res.status(503).type("text/plain").send("sitemap unavailable");
  }
});

// Single-process deploys: when the web app has been built
// (pnpm build:web), serve it from here with an SPA fallback so one Node
// process is a complete live deployment.
const webDist = resolvePath(import.meta.dirname, "../../rv-marketplace/dist/public");
if (existsSync(resolvePath(webDist, "index.html"))) {
  const indexPath = resolvePath(webDist, "index.html");
  // Cache the shell template in memory (O(1) per request after first read).
  const shellTemplate = readFileSync(indexPath, "utf-8");
  // On a database-free deployment the classic marketplace pages cannot
  // render, so the root becomes the agent-native /shop experience and the
  // SPA is told it is in demo mode (the layout trims links that would lead
  // to disabled pages). Everything else is byte-identical.
  const demo = DB_MODE === "none";
  const indexHtml = demo
    ? shellTemplate.replace(
        "</head>",
        '  <meta name="matchrv-mode" content="demo">\n  </head>',
      )
    : shellTemplate;
  if (demo) {
    app.get("/", (_req: Request, res: Response) => res.redirect(302, "/shop"));
  }
  app.use(express.static(webDist, { maxAge: "1h", index: false }));

  app.get(/^\/(?!api\/).*/, (req: Request, res: Response) => {
    // MAT-32: inject unit-specific title/meta/JSON-LD/summary for /listing/:id
    // Same HTML for humans and bots — no UA sniffing.
    const listingMatch = req.path.match(/^\/listing\/(.+)$/);
    if (listingMatch) {
      let unitId = listingMatch[1];
      try {
        unitId = decodeURIComponent(unitId);
      } catch {
        /* keep raw */
      }
      let unit = null;
      try {
        unit = getInventory().byId.get(unitId) ?? null;
      } catch (err) {
        console.warn("[listing-seo] inventory unavailable:", err);
      }
      const html = injectListingIntoShell(indexHtml, unit, unitId);
      // Unknown id: still return the SPA shell (client route works) with noindex;
      // use 404 status so crawlers don't index ghosts.
      res.status(unit ? 200 : 404).type("html").send(html);
      return;
    }

    if (demo) {
      res.type("html").send(indexHtml);
    } else {
      res.type("html").send(shellTemplate);
    }
  });
  console.log(`[startup] serving built web app from ${webDist}${demo ? " (demo mode: / -> /shop)" : ""}`);
}

export default app;
