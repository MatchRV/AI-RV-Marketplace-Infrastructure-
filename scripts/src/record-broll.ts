/**
 * Record silent fallback footage of the real product driven through the
 * NATIVE WebMCP runtime (document.modelContext.executeTool in a real Chrome
 * ≥149) — the DEMO_CHECKLIST's "fallback recording plan". Produces
 * docs/demo/native-webmcp-run.webm; narrate over it per DEMO_SCRIPT.md.
 *
 * Run (with `pnpm dev` running):
 *   pnpm --filter @workspace/scripts run fetch-chrome   # once
 *   pnpm --filter @workspace/scripts run record-broll
 */

import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { chromeBinaryPath } from "./fetch-chrome.mjs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const CHROME = process.env.NATIVE_CHROME ?? chromeBinaryPath();
const OUT_DIR = resolve(import.meta.dirname, "../../docs/demo");
mkdirSync(OUT_DIR, { recursive: true });

if (!existsSync(CHROME)) {
  console.error("Chrome ≥149 not found — run: pnpm --filter @workspace/scripts run fetch-chrome");
  process.exit(2);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--enable-features=WebMCPTesting"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();

  const nativeExec = (name: string, input: unknown) =>
    page.evaluate(
      async ([n, i]) => {
        const mc = (document as unknown as {
          modelContext: {
            getTools: () => Promise<{ name: string }[]>;
            executeTool: (tool: { name: string }, input: unknown) => Promise<unknown>;
          };
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
    undefined,
    { timeout: 30000 },
  );
  await wait(3500); // hero + status chips on screen

  // Scene: agent searches with the messy flagship request
  await nativeExec("search_inventory", {
    intent_summary: "Bunkhouse trailer the F-150 (≈8k lbs) can tow — ≤$45k, ≤30ft, sleeps 6+, 150 mi of Tacoma, boondocking",
    mode: "replace",
    place: "Tacoma",
    radius_miles: 150,
    price_max: 45000,
    rv_types: ["travel_trailer"],
    length_max_ft: 30,
    tow_vehicle: "Ford F-150 rated 8,000 lbs",
    sleeps_min: 6,
    must_have: ["bunkhouse"],
    prefer: ["solar", "lithium"],
    boondocking: true,
  });
  await wait(4500);
  await page.mouse.wheel(0, 500);
  await wait(2500);
  await page.mouse.wheel(0, -500);
  await wait(1500);

  // Scene: human refines by hand — shared state
  await page.click("button:has-text('2 entry doors')");
  await wait(3000);

  // Scene: agent tightens the budget (refine keeps everything else)
  await nativeExec("search_inventory", {
    intent_summary: "Tighten to $35k",
    mode: "refine",
    price_max: 35000,
  });
  await wait(3500);

  // Scene: explain receipts on the top match
  const ids = await page.evaluate(() =>
    (window as unknown as { __matchrv: { state: () => { resultIds: string[] } } }).__matchrv.state().resultIds,
  );
  await nativeExec("explain_match", { unit_id: ids[0] });
  await wait(4500);
  await page.keyboard.press("Escape");
  await wait(800);

  // Scene: compare finalists
  await nativeExec("compare_units", { unit_ids: ids.slice(0, 3) });
  await wait(4500);
  await page.keyboard.press("Escape");
  await wait(800);

  // Scene: two-phase dealer contact with human approval
  const prep = (await nativeExec("prepare_dealer_contact", {
    unit_id: ids[0],
    name: "Alex Rivera",
    email: `alex.rivera+${Date.now()}@example.com`,
    phone: "253-555-0142",
  })) as string;
  const previewId = (JSON.parse(prep) as { preview_id: string }).preview_id;
  await wait(4000); // approval card readable
  await page.click("button:has-text('Approve & allow send')");
  await wait(1200);
  await nativeExec("submit_dealer_contact", { preview_id: previewId });
  await wait(3500); // receipt on screen

  await context.close();
  await browser.close();

  // Playwright names the file with a hash; rename it.
  const video = readdirSync(OUT_DIR).find((f) => f.endsWith(".webm") && !f.startsWith("native-webmcp-run"));
  if (video) {
    const target = resolve(OUT_DIR, "native-webmcp-run.webm");
    renameSync(resolve(OUT_DIR, video), target);
    const mb = (statSync(target).size / 1024 / 1024).toFixed(1);
    console.log(`Saved ${target} (${mb} MB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
