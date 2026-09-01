/**
 * Record the submission demo video: the real product driven through a real
 * Chrome's NATIVE WebMCP runtime (document.modelContext.executeTool), paced
 * to DEMO_SCRIPT.md, with the narration burned in as on-screen captions and
 * title/closing cards rendered inside the page. Output is silent — read
 * docs/demo/NARRATION.md aloud over it (audio is required by the rules).
 *
 * Run against a production server (DISABLE_DB=1 is fine):
 *   E2E_BASE_URL=http://127.0.0.1:5199 pnpm --filter @workspace/scripts run record-demo
 *
 * External assets (dealer photo CDNs, fonts) are fetched through Node with
 * full TLS verification against the sandbox CA bundle and handed to the
 * browser, because the sandbox's Chromium does not trust the egress proxy.
 * Certificate checking is never disabled.
 */

import { chromium, type Page, type Route } from "playwright";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { resolve } from "node:path";
import { chromeBinaryPath } from "./fetch-chrome.mjs";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5199";
const CHROME = process.env.NATIVE_CHROME ?? chromeBinaryPath();
const OUT_DIR = resolve(import.meta.dirname, "../../docs/demo");
const SHOT_DIR = resolve(import.meta.dirname, "../../docs/screenshots");
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(SHOT_DIR, { recursive: true });

if (!existsSync(CHROME)) {
  console.error("Chrome ≥149 not found — run: pnpm --filter @workspace/scripts run fetch-chrome");
  process.exit(2);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const scenes: Array<{ t: number; caption: string }> = [];

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

// ── On-screen captions and cards, rendered inside the page ──
async function installOverlay(page: Page) {
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = `
      #__cap { position: fixed; left: 50%; bottom: 36px; transform: translateX(-50%); z-index: 2147483000;
        max-width: 1500px; padding: 18px 30px; border-radius: 16px; background: rgba(11,17,23,0.90);
        color: #fff; font: 600 30px/1.35 "Inter", "DejaVu Sans", "Liberation Sans", system-ui, sans-serif;
        letter-spacing: 0.1px; text-align: center; box-shadow: 0 12px 40px rgba(0,0,0,0.35);
        transition: opacity 240ms ease; opacity: 0; pointer-events: none; }
      #__cap.on { opacity: 1; }
      #__cap b { color: #00CED1; font-weight: 800; }
      #__card { position: fixed; inset: 0; z-index: 2147483001; background: #0B1117; color: #fff;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px;
        font-family: "Inter", "DejaVu Sans", "Liberation Sans", system-ui, sans-serif; text-align: center;
        transition: opacity 320ms ease; opacity: 0; pointer-events: none; }
      #__card.on { opacity: 1; }
      #__card .h { font-size: 66px; font-weight: 900; letter-spacing: -0.5px; line-height: 1.12; max-width: 1500px; }
      #__card .h b { color: #00CED1; }
      #__card .s { font-size: 30px; font-weight: 600; color: rgba(255,255,255,0.72); max-width: 1300px; line-height: 1.4; }
      #__card .k { margin-top: 14px; font-size: 22px; font-weight: 700; color: #00CED1; letter-spacing: 3px; text-transform: uppercase; }
    `;
    document.head.appendChild(style);
    const cap = document.createElement("div"); cap.id = "__cap"; document.body.appendChild(cap);
    const card = document.createElement("div"); card.id = "__card"; document.body.appendChild(card);
  });
}
async function caption(page: Page, html: string) {
  scenes.push({ t: (Date.now() - t0) / 1000, caption: html.replace(/<[^>]+>/g, "") });
  await page.evaluate((h) => {
    const el = document.getElementById("__cap")!;
    el.innerHTML = h; el.classList.toggle("on", h.length > 0);
  }, html);
}
async function card(page: Page, h: string, s: string, k: string, ms: number) {
  await page.evaluate(([hh, ss, kk]) => {
    const el = document.getElementById("__card")!;
    el.innerHTML = `<div class="h">${hh}</div><div class="s">${ss}</div><div class="k">${kk}</div>`;
    el.classList.add("on");
  }, [h, s, k]);
  await wait(ms);
  await page.evaluate(() => document.getElementById("__card")!.classList.remove("on"));
  await wait(400);
}
const shot = (page: Page, name: string) => page.screenshot({ path: resolve(SHOT_DIR, `demo-${name}.png`) });

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-features=WebMCPTesting"] });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT_DIR, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  const origin = new URL(BASE).origin;
  await page.route((u) => u.origin !== origin, proxyExternal);

  const nativeExec = (name: string, input: unknown) =>
    page.evaluate(
      async ([n, i]) => {
        const mc = (document as unknown as {
          modelContext: { getTools: () => Promise<{ name: string }[]>; executeTool: (t: { name: string }, i: unknown) => Promise<unknown> };
        }).modelContext;
        const tool = (await mc.getTools()).find((t) => t.name === n)!;
        return mc.executeTool(tool, JSON.stringify(i));
      },
      [name, input] as const,
    );

  console.log("Recording…");
  await page.goto(`${BASE}/shop`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => typeof (document as unknown as { modelContext?: { registerTool?: unknown } }).modelContext?.registerTool === "function",
    undefined, { timeout: 30000 },
  );
  await wait(1500);
  await installOverlay(page);

  // 0:00 — title
  await card(page, "Agent-native RV shopping.<br>Built on <b>WebMCP</b>.",
    "Real dealer inventory as ten site tools — one shared session for a shopper and their agent.",
    "MatchRV · OpenAI WebMCP Challenge", 4200);

  // Scene 1 — the problem + the tool surface
  await caption(page, "Buying an RV means <b>30 dealer sites</b> describing the same trailer 30 different ways. On real dealer pages, GVWR is machine-readable <b>under 1%</b> of the time. Agents can't shop on that web.");
  await wait(6500);
  await caption(page, "MatchRV fixes the layer underneath: this page exposes its real inventory as <b>ten structured WebMCP tools</b> — capabilities, not a chatbot.");
  try { await page.click("button:has-text('site tools exposed')", { timeout: 3000 }); } catch { /* chip optional */ }
  await wait(6500);
  await page.keyboard.press("Escape");
  await wait(600);

  // Scene 2 — messy intent → typed search
  await caption(page, "One messy sentence in — <i>F-150, two kids, bunkhouse trailer under $45k, under 30 ft, near Tacoma, we boondock, solar &amp; lithium</i> — and the agent calls <b>search_inventory</b> with typed constraints.");
  await wait(4500);
  await nativeExec("search_inventory", {
    intent_summary: "F-150 family: bunkhouse TT ≤$45k, ≤30ft, 150 mi of Tacoma, boondocking, wants solar+lithium+2 doors",
    mode: "replace", place: "Tacoma", radius_miles: 150, price_max: 45000, rv_types: ["travel_trailer"],
    length_max_ft: 30, sleeps_min: 6, tow_vehicle: "2024 Ford F-150", must_have: ["bunkhouse"],
    prefer: ["solar", "lithium", "two_entry_doors"], boondocking: true,
  });
  await wait(3500);
  await caption(page, "<b>1,056</b> real units searched in ~15 ms. Same results on the page and in the agent — and the funnel says exactly what was excluded, and why.");
  await shot(page, "1-search");
  await wait(5000);
  await page.mouse.wheel(0, 520); await wait(4500);
  await page.mouse.wheel(0, -520); await wait(1500);
  await caption(page, "The tow question is answered honestly: a bare “F-150” is a <b>5,000–13,500 lb</b> range, so the rail states the range and asks for the door-sticker rating instead of guessing.");
  await wait(7000);

  // Scene 3 — receipts and honest unknowns
  const ids = await page.evaluate(() =>
    (window as unknown as { __matchrv: { state: () => { resultIds: string[] } } }).__matchrv.state().resultIds);
  await caption(page, "Every recommendation carries <b>receipts</b>: which hard checks passed on verified data, the exact score math, and what is <b>unknown</b> — solar the dealer never published stays a question mark. Unknown is not no.");
  await nativeExec("explain_match", { unit_id: ids[0] });
  await wait(3000);
  await shot(page, "2-why");
  await wait(9000);
  await page.keyboard.press("Escape"); await wait(800);

  // Scene 4 — shared state, both directions
  await caption(page, "Shared state, both directions. The human clicks a preference <b>by hand</b> — <i>two entry doors</i> — and it lands in the same session the agent reads.");
  await page.click("button:has-text('2 entry doors')");
  await wait(5500);
  await caption(page, "“Drop the budget to $35k.” The agent's next call is a <b>refine</b>: everything else is kept, the whole funnel recomputes, and the ledger shows <b>You</b>, then <b>Agent</b>.");
  await nativeExec("search_inventory", { intent_summary: "Tighten to $35k", mode: "refine", price_max: 35000 });
  await wait(3000);
  await shot(page, "3-refine");
  await wait(7000);

  // Scene 5 — compare on true values
  const ids2 = await page.evaluate(() =>
    (window as unknown as { __matchrv: { state: () => { resultIds: string[] } } }).__matchrv.state().resultIds);
  await caption(page, "<b>compare_units</b> returns true values, not prose — best-in-row markers, tow margins spelled out, and unknown cells left visibly <b>Unknown</b>. The agent reasons over real numbers.");
  await nativeExec("compare_units", { unit_ids: ids2.slice(0, 3) });
  await wait(3000);
  await shot(page, "4-compare");
  await wait(10000);
  await page.keyboard.press("Escape"); await wait(800);

  // Scene 6 — the consequential action, human-gated
  await caption(page, "Now the consequential part. The agent can only <b>stage</b> a dealer contact: here is exactly what would be sent, behind a literal <b>NOT SENT</b> banner. The message it drafted asks the dealer to confirm the unknowns.");
  const prep = (await nativeExec("prepare_dealer_contact", {
    unit_id: ids2[0], name: "Alex Rivera", email: `alex.rivera+${Date.now()}@example.com`, phone: "253-555-0142",
  })) as string;
  const previewId = (JSON.parse(prep) as { preview_id: string }).preview_id;
  await wait(2500);
  await shot(page, "5-not-sent");
  await wait(6500);
  await caption(page, "If the agent tries to submit early, the <b>server refuses</b>. Approval is a single-use token only this page holds — never in any tool result, never in the model's context.");
  await nativeExec("submit_dealer_contact", { preview_id: previewId });
  await wait(6500);
  await caption(page, "The human clicks <b>Approve</b>. Now it goes through — once.");
  await page.click("button:has-text('Approve & allow send')");
  await wait(1500);
  await nativeExec("submit_dealer_contact", { preview_id: previewId });
  await wait(2500);
  await shot(page, "6-receipt");
  await caption(page, "An exact receipt: dealer, unit, time, reference. Duplicates are blocked. And it never claims a real dealership was contacted — this is a demo environment, and it says so.");
  await wait(8000);
  await caption(page, "");
  await wait(600);

  // Closing
  await card(page, "The inventory was always online.<br>Now agents can <b>actually understand it</b>.",
    "WebMCP turns pages agents must interpret into capabilities agents can reliably use. MatchRV turns fragmented RV inventory into an agent-native shopping network.",
    "matchrv-webmcp.onrender.com/shop · MIT · Built on WebMCP", 7500);

  const total = (Date.now() - t0) / 1000;
  await context.close();
  await browser.close();

  const video = readdirSync(OUT_DIR).find((f) => f.endsWith(".webm") && !f.startsWith("native-webmcp-run") && !f.startsWith("matchrv-demo"));
  if (video) {
    const target = resolve(OUT_DIR, "matchrv-demo-raw.webm");
    renameSync(resolve(OUT_DIR, video), target);
    console.log(`Saved ${target} (${(statSync(target).size / 1024 / 1024).toFixed(1)} MB), ${total.toFixed(0)}s`);
  }
  writeFileSync(resolve(OUT_DIR, "demo-scenes.json"), JSON.stringify({ totalSeconds: total, scenes }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
