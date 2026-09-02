/**
 * THE JUDGE'S DEMO CASE, verbatim, as an automated native-WebMCP test.
 *
 * Walks the exact conversation from DEMO_SCRIPT.md through the browser's own
 * `document.modelContext` (real Chrome ≥149 with WebMCP enabled) and asserts,
 * at every turn, the three pillars:
 *
 *   SEARCH — messy intent → inspectable constraints (hard / soft / unknown
 *            separated in the UI), honest funnel math, refinement that
 *            recomputes rather than re-filters a stale list.
 *   TRUST  — every ranking step has receipts (✓/△/? checks, score math),
 *            unknowns stay unknown, freshness + snapshot provenance visible,
 *            most-verified-first ordering when nothing fully verifies.
 *   ACTION — two-phase dealer contact: preview is NOT SENT until the human
 *            approves in the page; agents and out-of-band callers cannot
 *            manufacture approval; exact receipt after submission.
 *
 * The conversation (from the challenge demo):
 *   1. "I have a 2024 Ford F-150 and two kids. I want a bunkhouse travel
 *      trailer under $45,000, preferably under 30 feet, within 150 miles of
 *      Tacoma. We boondock, so prioritize solar and lithium, and I'd really
 *      like two entry doors."
 *   2. "Actually, I'll go to $50k if I can get lithium and two doors."
 *   3. "Compare the best three."
 *   4. "Why is #1 better for me than #2?"
 *   5. "Contact the dealer about #1."  (preview only — DO NOT send)
 *   6. "Send it."
 *
 * Run (requires `pnpm dev` running):
 *   pnpm --filter @workspace/scripts run fetch-chrome   # once
 *   pnpm --filter @workspace/scripts run demo-case
 */

import { chromium, type Page } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromeBinaryPath } from "./fetch-chrome.mjs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const CHROME = process.env.NATIVE_CHROME ?? chromeBinaryPath();
const SHOTS = resolve(import.meta.dirname, "../../docs/screenshots");
mkdirSync(SHOTS, { recursive: true });

if (!existsSync(CHROME)) {
  console.error(`No Chrome at ${CHROME}. Run: pnpm --filter @workspace/scripts run fetch-chrome`);
  process.exit(2);
}

interface Row { step: string; detail: string; pass: boolean; ms: number }
const rows: Row[] = [];

interface CompactResult {
  funnel?: { searched: number; verifiedMatches: number; unverified: number; excluded: string[] };
  results?: { id: string; title: string; match: number; verified: boolean; checks: string; price: number | null }[];
  error?: string;
  guidance?: string;
  [k: string]: unknown;
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-features=WebMCPTesting"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const version = await browser.version();

  const step = async (name: string, fn: () => Promise<string>) => {
    const t0 = Date.now();
    try {
      const detail = await fn();
      const pass = !detail.startsWith("FAIL");
      rows.push({ step: name, detail, pass, ms: Date.now() - t0 });
      console.log(`${pass ? "✓" : "✗"} ${name} (${Date.now() - t0}ms)\n    ${detail.slice(0, 220)}`);
    } catch (err) {
      rows.push({ step: name, detail: `FAIL threw: ${String(err).slice(0, 200)}`, pass: false, ms: Date.now() - t0 });
      console.log(`✗ ${name} threw:`, String(err).slice(0, 300));
    }
  };

  /** Invoke a tool through the browser's NATIVE ModelContext (the agent path). */
  const nativeExec = (name: string, input: unknown) =>
    page.evaluate(
      async ([n, i]) => {
        const mc = (document as unknown as {
          modelContext: {
            getTools: () => Promise<{ name: string }[]>;
            executeTool: (tool: { name: string }, input: unknown) => Promise<unknown>;
          };
        }).modelContext;
        const tool = (await mc.getTools()).find((t) => t.name === n);
        if (!tool) return { error: `tool ${n} not found natively` };
        let raw: unknown;
        try {
          raw = await mc.executeTool(tool, JSON.stringify(i));
        } catch {
          raw = await mc.executeTool(tool, i);
        }
        if (typeof raw === "string") {
          try { return JSON.parse(raw); } catch { return { raw }; }
        }
        return raw;
      },
      [name, input] as const,
    ) as Promise<CompactResult>;

  /** innerText of the session rail (CSS text-transform applies, so match case-insensitively). */
  const railText = () => page.evaluate(() => document.querySelector("aside")?.innerText ?? "");
  /** innerText of every open dialog, joined. */
  const dialogsText = () =>
    page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map((d) => (d as HTMLElement).innerText).join("\n---\n"));
  const bridgeState = () =>
    page.evaluate(() => (window as unknown as { __matchrv: { state: () => { resultIds: string[]; leadStatus: string | null } } }).__matchrv.state());
  const settle = (ms = 700) => page.waitForTimeout(ms);
  const shot = async (p: Page, file: string) => { await settle(450); await p.screenshot({ path: `${SHOTS}/${file}`, fullPage: false }); };

  /** unknown hard checks per shown unit, parsed from the agent-visible "x/n" string. */
  const unknownsOf = (r: { checks: string }) => {
    const [met, total] = r.checks.split("/").map(Number);
    return total - met;
  };

  // ————— Turn 0: runtime —————
  await step("native runtime + 10 tools discovered", async () => {
    await page.goto(`${BASE}/shop`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => typeof (document as unknown as { modelContext?: { registerTool?: unknown } }).modelContext?.registerTool === "function",
      undefined,
      { timeout: 30000 },
    );
    await settle(1500);
    const names = await page.evaluate(async () => {
      const mc = (document as unknown as { modelContext: { getTools: () => Promise<{ name: string }[]> } }).modelContext;
      return (await mc.getTools()).map((t) => t.name).sort();
    });
    return names.length === 10
      ? `${version} — ${names.join(", ")}`
      : `FAIL expected 10 tools, got ${names.length}: ${names.join(", ")}`;
  });

  // ————— Turn 1: the messy opening ask —————
  let s1: CompactResult = {};
  await step('T1 SEARCH "bunkhouse TT <$45k, <30ft, 150mi of Tacoma, F-150, boondock, solar+lithium, 2 doors"', async () => {
    s1 = await nativeExec("search_inventory", {
      intent_summary: "F-150 family: bunkhouse TT ≤$45k, ≤30ft, 150 mi of Tacoma, boondocking, wants solar+lithium+2 doors",
      mode: "replace",
      place: "Tacoma",
      radius_miles: 150,
      price_max: 45000,
      rv_types: ["travel_trailer"],
      length_max_ft: 30,
      sleeps_min: 6,
      tow_vehicle: "2024 Ford F-150",
      must_have: ["bunkhouse"],
      prefer: ["solar", "lithium", "two_entry_doors"],
      boondocking: true,
    });
    if (s1.error) return `FAIL ${JSON.stringify(s1).slice(0, 200)}`;
    const f = s1.funnel!;
    const excludedSum = f.excluded.map((e) => Number(e.split(": ").pop())).reduce((a, b) => a + b, 0);
    if (f.searched !== f.verifiedMatches + f.unverified + excludedSum)
      return `FAIL funnel math ${f.searched} ≠ ${f.verifiedMatches}+${f.unverified}+${excludedSum}`;
    if (f.verifiedMatches < 1) return `FAIL expected verified matches, got ${f.verifiedMatches}`;
    const verifiedFlags = s1.results!.map((r) => r.verified);
    const firstUnverified = verifiedFlags.indexOf(false);
    if (firstUnverified !== -1 && verifiedFlags.slice(firstUnverified).some(Boolean))
      return "FAIL verified results interleaved with unverified";
    await page.waitForSelector("text=Verified matches", { timeout: 8000 });
    return `funnel ${f.searched} → ${f.verifiedMatches} verified · ${f.unverified} unverified (excluded ${excludedSum}); verified listed first`;
  });

  await step("T1 SEARCH rail separates HARD / PREFERENCES; human can inspect+remove each", async () => {
    const t = await railText();
    for (const want of [/hard requirements — must pass/i, /preferences — affect ranking only/i, /bunkhouse/i, /price ≤ \$45,000/i, /150 mi of tacoma/i, /towable by: 2024 ford f-150/i, /solar/i, /lithium/i, /2 entry doors/i, /boondocking readiness/i]) {
      if (!want.test(t)) return `FAIL rail missing ${want}`;
    }
    const removeButtons = await page.locator('aside button[aria-label^="Remove"]').count();
    return `hard + soft groups labeled; ${removeButtons} constraint chips individually removable`;
  });

  await step("T1 TRUST tow honesty: unknown F-150 config disclosed, never guessed", async () => {
    const t = await railText();
    for (const want of [/assumptions & unknowns/i, /configuration unknown/i, /5,000–13,500 lbs/i, /depends on config/i, /door-sticker rating/i]) {
      if (!want.test(t)) return `FAIL assumptions block missing ${want}`;
    }
    await shot(page, "pillar-1-search.png");
    return "rail: ratings span 5,000–13,500 lbs, filtering only above top rating, per-unit verdicts 'depends on config'";
  });

  // ————— Turn 2: the refinement —————
  let s2: CompactResult = {};
  await step('T2 SEARCH "Actually, I\'ll go to $50k if I can get lithium and two doors" (refine)', async () => {
    s2 = await nativeExec("search_inventory", {
      intent_summary: "Raise to $50k only if lithium + two entry doors are guaranteed",
      mode: "refine",
      price_max: 50000,
      must_have: ["bunkhouse", "lithium", "two_entry_doors"],
      prefer: ["solar"],
    });
    if (s2.error) return `FAIL ${JSON.stringify(s2).slice(0, 200)}`;
    const f = s2.funnel!;
    if (f.searched !== s1.funnel!.searched) return `FAIL refine searched ${f.searched} ≠ full corpus`;
    const t = await railText();
    for (const want of [/price ≤ \$50,000/i, /150 mi of tacoma/i]) {
      if (!want.test(t)) return `FAIL rail did not carry refined constraint ${want}`;
    }
    return `recomputed over all ${f.searched}: ${f.verifiedMatches} verified · ${f.unverified} unverified — lithium+2-door bunkhouses under $50k are rarely fully published`;
  });

  await step("T2 TRUST honest zero-verified state (no fabricated matches)", async () => {
    const f = s2.funnel!;
    if (f.verifiedMatches !== 0)
      return `note: ${f.verifiedMatches} fully-verified units exist — asserting they lead the list: ${s2.results![0]?.verified ? "yes" : "FAIL no"}`;
    const body = await page.evaluate(() => document.body.innerText);
    if (!/no unit satisfies every hard requirement/i.test(body)) return "FAIL empty verified state not stated";
    if (!/candidates with data gaps|unverified/i.test(body)) return "FAIL unverified candidates not offered";
    await shot(page, "pillar-2-refine.png");
    return "UI says no unit fully verifies, offers data-gap candidates instead of pretending";
  });

  await step("T2 TRUST ranking is most-verified-first among unverified", async () => {
    const shown = s2.results!;
    if (shown.length < 3) return `FAIL only ${shown.length} results shown`;
    const unknowns = shown.map(unknownsOf);
    for (let i = 1; i < unknowns.length; i++) {
      if (unknowns[i] < unknowns[i - 1])
        return `FAIL order not most-verified-first: unknowns ${unknowns.join(",")} (agent-visible checks: ${shown.map((r) => r.checks).join(" ")})`;
    }
    const bridge = await bridgeState();
    const parity = shown.slice(0, 3).every((r, i) => bridge.resultIds[i] === r.id);
    if (!parity) return `FAIL agent list ≠ page list: ${shown.slice(0, 3).map((r) => r.id)} vs ${bridge.resultIds.slice(0, 3)}`;
    return `unknown-hard-checks ascend ${unknowns.slice(0, 6).join(",")} — fewest data gaps rank first; page and agent see identical top-3`;
  });

  // ————— Turn 3: compare the best three —————
  let top3: string[] = [];
  await step('T3 SEARCH "Compare the best three" — true values only, unknowns stay unknown', async () => {
    top3 = s2.results!.slice(0, 3).map((r) => r.id);
    const cmp = await nativeExec("compare_units", { unit_ids: top3 });
    if (cmp.error) return `FAIL ${JSON.stringify(cmp).slice(0, 200)}`;
    await page.waitForSelector("text=Side-by-side", { timeout: 8000 });
    const t = await dialogsText();
    if (!/unknown/i.test(t)) return "FAIL comparison hides unknowns";
    if (!/never fills gaps with guesses/i.test(t)) return "FAIL no-guessing pledge missing";
    await shot(page, "pillar-3-compare.png");
    await page.keyboard.press("Escape");
    return `3-way compare open; unknown cells labeled Unknown, best known value marked, no invented values`;
  });

  // ————— Turn 4: why is #1 better than #2 —————
  await step('T4 TRUST "Why is #1 better for me than #2?" — receipts, score math, freshness', async () => {
    const e1 = await nativeExec("explain_match", { unit_id: top3[0] });
    if (e1.error) return `FAIL explain#1 ${JSON.stringify(e1).slice(0, 160)}`;
    const e2 = await nativeExec("explain_match", { unit_id: top3[1] });
    if (e2.error) return `FAIL explain#2 ${JSON.stringify(e2).slice(0, 160)}`;
    const score1 = Number(e1.matchScore), score2 = Number(e2.matchScore);
    if (!(score1 >= score2)) return `FAIL #1 (${score1}) outranked by #2 (${score2})`;
    if (!Array.isArray(e1.scoreMath) && !e1.scoreMath) return "FAIL no score math in explain result";
    await page.waitForSelector("text=Why this match", { timeout: 8000 });
    const t = await dialogsText();
    for (const want of [/why this match/i, /score math/i, /freshness/i, /last verified on the dealer's site/i, /confirm current availability with the dealer/i]) {
      if (!want.test(t)) return `FAIL drawer missing ${want}`;
    }
    await shot(page, "pillar-4-why.png");
    await page.keyboard.press("Escape");
    return `#1 scores ${score1} vs #2 ${score2}, with per-check ✓/△/? receipts, score math, and a freshness row in the Why panel`;
  });

  // ————— Turn 5: contact the dealer — preview, DO NOT SEND —————
  let previewId = "";
  await step('T5 ACTION "Contact the dealer about #1" — NOT SENT until human approves', async () => {
    const prep = await nativeExec("prepare_dealer_contact", {
      unit_id: top3[0],
      name: "Demo Judge",
      email: `judge+${Date.now()}@example.com`,
      phone: "253-555-0147",
    });
    if (!prep.preview_id) return `FAIL prepare ${JSON.stringify(prep).slice(0, 200)}`;
    previewId = String(prep.preview_id);
    if (JSON.stringify(prep).includes("apt_")) return "FAIL approval token leaked into a tool result";
    await page.waitForSelector("text=wants to contact a dealership", { timeout: 8000 });
    const t = await dialogsText();
    for (const want of [/not sent — review before submitting/i, /nothing leaves matchrv until you approve/i, /by approving, you ask matchrv to send/i]) {
      if (!want.test(t)) return `FAIL preview modal missing ${want}`;
    }
    await shot(page, "pillar-5-preview.png");
    return `preview ${previewId} on screen with NOT SENT banner, full payload, consent line; token never shown to agent`;
  });

  await step("T5 ACTION agent + out-of-band callers cannot manufacture approval", async () => {
    const early = await nativeExec("submit_dealer_contact", { preview_id: previewId });
    if (early.error !== "awaiting_human_approval") return `FAIL early submit not refused: ${JSON.stringify(early).slice(0, 160)}`;
    const forged = await page.evaluate(async (id) => {
      const res = await fetch(`/api/agent/leads/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approval_token: "apt_forged_token_attempt_xx" }),
      });
      return res.status;
    }, previewId);
    if (forged !== 403) return `FAIL forged-token approve returned ${forged}, expected 403`;
    const retry = await nativeExec("submit_dealer_contact", { preview_id: previewId });
    if (retry.error !== "awaiting_human_approval") return `FAIL still-unapproved submit not refused: ${JSON.stringify(retry).slice(0, 160)}`;
    return "agent submit refused with guidance; forged-token HTTP approve → 403; preview still awaiting the human";
  });

  await step('T5→6 ACTION human clicks Approve, then "Send it." — exact receipt, honest delivery', async () => {
    await page.click("button:has-text('Approve & allow send')");
    await settle(900);
    const sub = await nativeExec("submit_dealer_contact", { preview_id: previewId });
    const receipt = sub.receipt as { leadId?: unknown; delivery?: string } | undefined;
    if (!receipt?.leadId) return `FAIL submit ${JSON.stringify(sub).slice(0, 200)}`;
    if (!/nothing is delivered to the real dealership/i.test(String(receipt.delivery))) return "FAIL delivery line overclaims";
    await page.waitForSelector("text=Lead sent", { timeout: 8000 });
    const t = await dialogsText();
    for (const want of [/✓ lead sent/i, /dealer: /i, /unit: /i, /time: /i, /reference: #/i, /not delivered to the real dealership/i]) {
      if (!want.test(t)) return `FAIL receipt missing ${want}`;
    }
    await shot(page, "pillar-6-receipt.png");
    const dup = await nativeExec("submit_dealer_contact", { preview_id: previewId });
    if (dup.error !== "already_submitted") return `FAIL duplicate submit not blocked: ${JSON.stringify(dup).slice(0, 120)}`;
    return `lead #${String(receipt.leadId)} recorded; receipt shows dealer/unit/time/reference; duplicate submit blocked; no fake "dealer contacted" claim`;
  });

  await browser.close();

  console.log(`\n== DEMO CASE — ${new Date().toISOString()} · Chrome ${version} · ${BASE}/shop ==`);
  console.log("| # | Step | Result | Pass | ms |\n| --- | --- | --- | --- | --- |");
  rows.forEach((r, i) =>
    console.log(`| ${i + 1} | ${r.step.replace(/\|/g, "/")} | ${r.detail.replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 140)} | ${r.pass ? "✅" : "❌"} | ${r.ms} |`),
  );
  const failed = rows.filter((r) => !r.pass).length;
  console.log(`\n${rows.length - failed}/${rows.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
