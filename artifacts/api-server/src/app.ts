import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { DB_MODE } from "@workspace/db";

const app: Express = express();

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
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
  const DB_FREE = /^\/(agent|healthz|outfitter)(\/|$)/;
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

// Single-process deploys: when the web app has been built
// (pnpm build:web), serve it from here with an SPA fallback so one Node
// process is a complete live deployment.
const webDist = resolvePath(import.meta.dirname, "../../rv-marketplace/dist/public");
if (existsSync(resolvePath(webDist, "index.html"))) {
  app.use(express.static(webDist, { maxAge: "1h", index: "index.html" }));
  app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
    res.sendFile(resolvePath(webDist, "index.html"));
  });
  console.log("[startup] serving built web app from", webDist);
}

export default app;
