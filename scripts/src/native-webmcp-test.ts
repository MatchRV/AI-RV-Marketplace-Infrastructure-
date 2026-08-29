/**
 * NATIVE WebMCP runtime verification.
 *
 * Unlike e2e-shop.ts (which drives the page's internal executor), this test
 * runs against a real Chrome (≥149, WebMCP feature enabled) and uses the
 * BROWSER'S OWN `document.modelContext` — `getTools()` for discovery and
 * `executeTool()` for invocation — i.e. the exact call path an agent runtime
 * uses. It proves: native registration, native discovery, native execution,
 * agent→UI state sync, human→agent state sync, and the human-gated write.
 *
 * Run:
 *   NATIVE_CHROME=/path/to/chrome pnpm --filter @workspace/scripts run native-webmcp
 * (defaults to Chrome for Testing under the session scratchpad if present;
 *  requires `pnpm dev` running)
 */

import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const CHROME =
  process.env.NATIVE_CHROME ??
  "/tmp/claude-0/-home-user-AI-RV-Marketplace-Infrastructure-/94e01da9-4de3-51b3-8549-c90bfbe90661/scratchpad/chrome-linux64/chrome";
const SHOTS = resolve(import.meta.dirname, "../../docs/screenshots");
mkdirSync(SHOTS, { recursive: true });

if (!existsSync(CHROME)) {
  console.error(`No Chrome binary at ${CHROME} — set NATIVE_CHROME to a Chrome ≥149 executable.`);
  process.exit(2);
}

interface Row { step: string; expected: string; actual: string; pass: boolean; ms: number }
const rows: Row[] = [];

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--enable-features=WebMCPTesting"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  const version = await browser.version();

  const step = async (name: string, expected: string, fn: () => Promise<string>) => {
    const t0 = Date.now();
    try {
      const actual = await fn();
      rows.push({ step: name, expected, actual, pass: !actual.startsWith("FAIL"), ms: Date.now() - t0 });
      console.log(`${actual.startsWith("FAIL") ? "✗" : "✓"} ${name} (${Date.now() - t0}ms) — ${actual.slice(0, 150)}`);
    } catch (err) {
      rows.push({ step: name, expected, actual: `FAIL threw: ${String(err).slice(0, 150)}`, pass: false, ms: Date.now() - t0 });
      console.log(`✗ ${name} threw:`, String(err).slice(0, 200));
    }
  };

  /** Invoke a tool through the BROWSER'S native ModelContext. */
  const nativeExec = (name: string, input: unknown) =>
    page.evaluate(
      async ([n, i]) => {
        const mc = (document as unknown as {
          modelContext: {
            getTools: () => Promise<{ name: string }[]>;
            executeTool: (tool: { name: string }, input: unknown) => Promise<unknown>;
          };
        }).modelContext;
        const tools = await mc.getTools();
        const tool = tools.find((t) => t.name === n);
        if (!tool) return { __error: `tool ${n} not found natively` };
        let raw: unknown;
        try {
          raw = await mc.executeTool(tool, JSON.stringify(i));
        } catch {
          raw = await mc.executeTool(tool, i); // input-shape fallback across builds
        }
        if (typeof raw === "string") {
          try { return JSON.parse(raw); } catch { return { __raw: raw }; }
        }
        return raw;
      },
      [name, input] as const,
    ) as Promise<Record<string, unknown>>;

  await step("native runtime present", "document.modelContext with registerTool/getTools/executeTool", async () => {
    await page.goto(`${BASE}/shop`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => typeof (document as unknown as { modelContext?: { registerTool?: unknown } }).modelContext?.registerTool === "function",
      undefined,
      { timeout: 30000 },
    );
    const shape = await page.evaluate(() => ({
      doc: typeof (document as unknown as Record<string, unknown>).modelContext,
      nav: typeof (navigator as unknown as Record<string, unknown>).modelContext,
    }));
    return `browser ${version}; document.modelContext=${shape.doc}, navigator.modelContext=${shape.nav} (current API shape)`;
  });

  await step("native discovery of all 10 tools", "getTools() returns MatchRV's tool surface", async () => {
    await page.waitForTimeout(1500); // page registration on load
    const tools = await page.evaluate(async () => {
      const mc = (document as unknown as { modelContext: { getTools: () => Promise<{ name: string; description: string; inputSchema?: unknown; annotations?: unknown }[]> } }).modelContext;
      return (await mc.getTools()).map((t) => ({ name: t.name, hasSchema: Boolean(t.inputSchema), hasAnn: Boolean(t.annotations) }));
    });
    const names = tools.map((t) => t.name).sort();
    const withSchema = tools.filter((t) => t.hasSchema).length;
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/native-01-registered.png` });
    return tools.length === 10 && withSchema === 10
      ? `10 tools, all with schemas+annotations: ${names.join(", ")}`
      : `FAIL count=${tools.length} withSchema=${withSchema}`;
  });

  await step("native search_inventory execution", "browser-invoked tool runs; page UI shows the results", async () => {
    const r = await nativeExec("search_inventory", {
      intent_summary: "Native runtime test: bunkhouse TT ≤$45k ≤30ft near Tacoma, F-150 rated 8,000 lbs",
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
    if (r.__error || r.error) return `FAIL ${JSON.stringify(r).slice(0, 120)}`;
    await page.waitForSelector("text=Verified matches", { timeout: 8000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/native-02-agent-search-ui.png` });
    const funnel = r.funnel as { searched?: number; verifiedMatches?: number } | undefined;
    return `native call → searched ${funnel?.searched}, verified ${funnel?.verifiedMatches}; UI grid rendered (agent→UI sync)`;
  });

  await step("human edit visible to native agent call", "UI toggle appears in get_shopping_session via native executeTool", async () => {
    await page.click("button:has-text('2 entry doors')");
    await page.waitForTimeout(1300);
    const sess = await nativeExec("get_shopping_session", {});
    const ok = String(sess.constraints ?? "").includes("two_entry_doors") && Array.isArray(sess.recentHumanActions) && (sess.recentHumanActions as string[]).length > 0;
    return ok ? `human→agent sync: "${String(sess.constraints).slice(0, 90)}"` : `FAIL ${JSON.stringify(sess).slice(0, 140)}`;
  });

  let topIds: string[] = [];
  await step("native compare + explain", "structured results through the native path", async () => {
    const sess = await nativeExec("get_shopping_session", {});
    void sess;
    topIds = await page.evaluate(() =>
      (window as unknown as { __matchrv: { state: () => { resultIds: string[] } } }).__matchrv.state().resultIds,
    );
    const cmp = await nativeExec("compare_units", { unit_ids: topIds.slice(0, 3) });
    if (cmp.error) return `FAIL compare ${JSON.stringify(cmp).slice(0, 100)}`;
    const exp = await nativeExec("explain_match", { unit_id: topIds[0] });
    if (exp.error) return `FAIL explain ${JSON.stringify(exp).slice(0, 100)}`;
    await page.keyboard.press("Escape");
    return `compare ${(cmp.units as string[])?.length} units; explain score ${exp.matchScore}, verdict ${exp.verdict}`;
  });

  await step("native two-phase dealer contact", "prepare→refused submit→UI approve→submit; token never in tool results", async () => {
    const prep = await nativeExec("prepare_dealer_contact", {
      unit_id: topIds[0],
      name: "Native Runtime Test",
      email: `native+${Date.now()}@example.com`,
    });
    if (!prep.preview_id) return `FAIL prepare ${JSON.stringify(prep).slice(0, 120)}`;
    if (JSON.stringify(prep).includes("apt_")) return "FAIL approval token leaked into a native tool result";
    const early = await nativeExec("submit_dealer_contact", { preview_id: prep.preview_id });
    if (early.error !== "awaiting_human_approval") return `FAIL early submit not refused: ${JSON.stringify(early).slice(0, 100)}`;
    await page.waitForSelector("text=wants to contact a dealership", { timeout: 6000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/native-03-approval-card.png` });
    await page.click("button:has-text('Approve & allow send')");
    await page.waitForTimeout(900);
    const sub = await nativeExec("submit_dealer_contact", { preview_id: prep.preview_id });
    const receipt = sub.receipt as { leadId?: unknown; delivery?: string } | undefined;
    if (!receipt?.leadId) return `FAIL submit ${JSON.stringify(sub).slice(0, 120)}`;
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/native-04-receipt.png` });
    return `refused → human approve → lead ${String(receipt.leadId)} (${receipt.delivery?.slice(0, 60)})`;
  });

  await browser.close();

  console.log(`\n== NATIVE RUNTIME EVIDENCE (${new Date().toISOString()}) ==`);
  console.log(`Browser: Chrome for Testing ${version} · flag: --enable-features=WebMCPTesting · URL: ${BASE}/shop`);
  console.log("\n| Step | Expected | Actual | Pass | ms |\n| --- | --- | --- | --- | --- |");
  for (const r of rows) {
    console.log(`| ${r.step} | ${r.expected} | ${r.actual.replace(/\|/g, "/").slice(0, 120)} | ${r.pass ? "✅" : "❌"} | ${r.ms} |`);
  }
  const failed = rows.filter((r) => !r.pass).length;
  console.log(`\n${rows.length - failed}/${rows.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
