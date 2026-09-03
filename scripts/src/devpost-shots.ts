/**
 * Gallery screenshots for the Devpost submission — the real product, driven
 * through Chrome's NATIVE WebMCP runtime (document.modelContext.executeTool),
 * captured as crisp stills at 1920×1080 (2× device scale by default):
 *
 *   1-cover-results.png   search results + shared-session rail + funnel
 *   2-trust-why.png       Why-this-match panel: receipts, score math,
 *                         unknowns, dealer-site freshness (viewport grown so
 *                         nothing is cut off)
 *   3-action-not-sent.png staged dealer contact behind the NOT SENT banner,
 *                         waiting for the human's approval
 *   4-compare.png         compare_units: true values, Unknown stays Unknown
 *   5-receipt.png         exact receipt after the human approves
 *
 * Run (requires `pnpm dev` running, DISABLE_DB=1 is fine):
 *   pnpm --filter @workspace/scripts run devpost-shots
 *   SHOT_DIR=/some/dir SHOT_SCALE=1 pnpm --filter @workspace/scripts run devpost-shots
 *
 * External assets (fonts, photo CDNs) are fetched through Node with full TLS
 * verification against the sandbox CA bundle and handed to the browser,
 * exactly as record-demo.ts does. Certificate checking is never disabled.
 */

import { chromium, type Page, type Route } from "playwright";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { resolve } from "node:path";
import { chromeBinaryPath } from "./fetch-chrome.mjs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const CHROME = process.env.NATIVE_CHROME ?? chromeBinaryPath();
const OUT = resolve(process.env.SHOT_DIR ?? resolve(import.meta.dirname, "../../docs/screenshots/devpost"));
const SCALE = Number(process.env.SHOT_SCALE ?? 2);
const W = 1920;
const H = 1080;
mkdirSync(OUT, { recursive: true });

if (!existsSync(CHROME)) {
  console.error(`No Chrome at ${CHROME}. Run: pnpm --filter @workspace/scripts run fetch-chrome`);
  process.exit(2);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── External requests via Node (verified TLS through the egress proxy) ──
const CA_PATH = "/root/.ccr/ca-bundle.crt";
const ca = existsSync(CA_PATH) ? readFileSync(CA_PATH) : undefined;
let proxyAgent: unknown;
async function agentFor(): Promise<unknown> {
  if (proxyAgent !== undefined) return proxyAgent;
  const proxy = process.env.HTTPS_PROXY;
  if (!proxy) return (proxyAgent = null);
  try {
    const mod = (await import(
      "/home/user/AI-RV-Marketplace-Infrastructure-/node_modules/.pnpm/https-proxy-agent@7.0.6/node_modules/https-proxy-agent/dist/index.js"
    )) as unknown as { HttpsProxyAgent: new (p: string, o: object) => unknown };
    proxyAgent = new mod.HttpsProxyAgent(proxy, ca ? { ca } : {});
  } catch {
    proxyAgent = null;
  }
  return proxyAgent;
}
function nodeFetch(url: string): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  return new Promise(async (res, rej) => {
    const u = new URL(url);
    const isHttps = u.protocol === "https:";
    const agent = isHttps ? await agentFor() : undefined;
    const req = (isHttps ? httpsRequest : httpRequest)(
      {
        host: u.hostname, port: u.port || (isHttps ? 443 : 80), path: u.pathname + u.search, method: "GET",
        headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/152", accept: "*/*" },
        ...(isHttps ? { ca, servername: u.hostname } : {}),
        ...(agent ? { agent: agent as never } : {}),
        timeout: 15000,
      },
      (r) => {
        const chunks: Buffer[] = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(r.headers)) if (typeof v === "string") headers[k] = v;
          res({ status: r.statusCode ?? 502, headers, body: Buffer.concat(chunks) });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", rej);
    req.end();
  });
}
async function proxyExternal(route: Route) {
  const url = route.request().url();
  try {
    const r = await nodeFetch(url);
    const ct = r.headers["content-type"] ?? "application/octet-stream";
    await route.fulfill({ status: r.status, contentType: ct, body: r.body, headers: { "access-control-allow-origin": "*" } });
  } catch {
    await route.abort();
  }
}

/** Keep the unrelated legacy chat bubble out of frame (React may re-mount it, so run before every shot). */
async function tidy(page: Page) {
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll("button"))) {
      if (el.textContent?.includes("Ask me anything")) {
        const host = (el.closest("div[class*='fixed']") ?? el) as HTMLElement;
        host.style.display = "none";
      }
    }
  });
}

/** Grow the viewport until the top-most open dialog shows all of its content (no inner scroll). */
async function fitDialog(page: Page): Promise<number> {
  let height = H;
  for (let i = 0; i < 6; i++) {
    const overflow = await page.evaluate(() => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')) as HTMLElement[];
      const d = dialogs[dialogs.length - 1];
      if (!d) return 0;
      let extra = 0;
      for (const el of [d, ...Array.from(d.querySelectorAll("*"))] as HTMLElement[]) {
        const o = el.scrollHeight - el.clientHeight;
        if (o > 4 && getComputedStyle(el).overflowY !== "visible") extra = Math.max(extra, o);
      }
      const rect = d.getBoundingClientRect();
      const below = Math.max(0, rect.bottom - window.innerHeight);
      return Math.max(extra, below);
    });
    if (overflow <= 0) break;
    height = Math.min(2400, height + overflow + 80);
    await page.setViewportSize({ width: W, height });
    await wait(500);
  }
  return height;
}

async function shot(page: Page, name: string) {
  await tidy(page);
  await wait(500);
  const path = resolve(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  const vp = page.viewportSize()!;
  console.log(`  saved ${path} (${vp.width * SCALE}×${vp.height * SCALE})`);
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-features=WebMCPTesting"] });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  const page = await context.newPage();
  const origin = new URL(BASE).origin;
  await page.route((u) => u.origin !== origin, proxyExternal);

  const nativeExec = (name: string, input: unknown) =>
    page.evaluate(
      async ([n, i]) => {
        const mc = (document as unknown as {
          modelContext: { getTools: () => Promise<{ name: string }[]>; executeTool: (t: { name: string }, i: unknown) => Promise<unknown> };
        }).modelContext;
        const tool = (await mc.getTools()).find((t) => t.name === n);
        if (!tool) throw new Error(`tool ${n} not registered natively`);
        const raw = await mc.executeTool(tool, JSON.stringify(i));
        return typeof raw === "string" ? JSON.parse(raw) : raw;
      },
      [name, input] as const,
    ) as Promise<Record<string, unknown>>;
  const resultIds = () =>
    page.evaluate(() => (window as unknown as { __matchrv: { state: () => { resultIds: string[] } } }).__matchrv.state().resultIds);

  console.log(`Chrome ${await browser.version()} → ${BASE}/shop`);
  await page.goto(`${BASE}/shop`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => typeof (document as unknown as { modelContext?: { registerTool?: unknown } }).modelContext?.registerTool === "function",
    undefined, { timeout: 30000 },
  );
  await wait(2000);

  // ── 1. The judge's opening ask → typed search_inventory ──
  const s1 = await nativeExec("search_inventory", {
    intent_summary: "F-150 family: bunkhouse TT ≤$45k, ≤30ft, 150 mi of Tacoma, boondocking, wants solar+lithium+2 doors",
    mode: "replace", place: "Tacoma", radius_miles: 150, price_max: 45000, rv_types: ["travel_trailer"],
    length_max_ft: 30, sleeps_min: 6, tow_vehicle: "2024 Ford F-150", must_have: ["bunkhouse"],
    prefer: ["solar", "lithium", "two_entry_doors"], boondocking: true,
  });
  const funnel = s1.funnel as { searched: number; verifiedMatches: number; unverified: number };
  console.log(`search: ${funnel.searched} → ${funnel.verifiedMatches} verified · ${funnel.unverified} unverified`);
  await page.waitForSelector("text=Verified matches", { timeout: 8000 });
  await wait(2500); // fonts + images

  // Cover A: page top (pitch line, tool chips, rail, first row of matches)
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(400);
  await shot(page, "1a-cover-top");

  // Cover B: scrolled so the results grid, the rail's constraints / preferences /
  // assumptions / funnel, and the "Why this match?" buttons are all in frame.
  await page.evaluate(() => {
    const aside = document.querySelector("aside");
    const top = (aside?.getBoundingClientRect().top ?? 0) + window.scrollY;
    window.scrollTo(0, Math.max(0, top - 84));
  });
  await wait(600);
  await shot(page, "1b-cover-results");

  const ids = await resultIds();
  console.log(`top ids: ${ids.slice(0, 3).join(", ")}`);

  // ── 2. TRUST — Why this match: receipts, score math, unknowns, freshness ──
  await nativeExec("explain_match", { unit_id: ids[0] });
  await page.waitForSelector("text=Why this match", { timeout: 8000 });
  await wait(1200);
  const whyH = await fitDialog(page);
  await shot(page, "2-trust-why");
  console.log(`why panel fit at ${W}×${whyH}`);
  await page.keyboard.press("Escape");
  await wait(600);
  await page.setViewportSize({ width: W, height: H });
  await wait(400);

  // ── 4. compare_units on the best three (extra) ──
  await nativeExec("compare_units", { unit_ids: ids.slice(0, 3) });
  await page.waitForSelector("text=Side-by-side", { timeout: 8000 });
  await wait(1200);
  await fitDialog(page);
  await shot(page, "4-compare");
  await page.keyboard.press("Escape");
  await wait(600);
  await page.setViewportSize({ width: W, height: H });
  await wait(400);

  // ── 3. ACTION — staged dealer contact, NOT SENT, waiting for the human ──
  const prep = await nativeExec("prepare_dealer_contact", {
    unit_id: ids[0], name: "Alex Rivera", email: `alex.rivera+${Date.now()}@example.com`, phone: "253-555-0142",
  });
  const previewId = String(prep.preview_id);
  await page.waitForSelector("text=wants to contact a dealership", { timeout: 8000 });
  await wait(1200);
  // The agent tries to submit before approval: the server refuses (no visible change, by design).
  const early = await nativeExec("submit_dealer_contact", { preview_id: previewId });
  console.log(`early submit → ${String(early.error)}`);
  await fitDialog(page);
  await shot(page, "3-action-not-sent");

  // ── 5. Human approves → exact receipt (extra) ──
  await page.click("button:has-text('Approve & allow send')");
  await wait(900);
  await nativeExec("submit_dealer_contact", { preview_id: previewId });
  await page.waitForSelector("text=Lead sent", { timeout: 8000 });
  await wait(1200);
  await fitDialog(page);
  await shot(page, "5-receipt");

  await context.close();
  await browser.close();
  console.log(`done → ${OUT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
