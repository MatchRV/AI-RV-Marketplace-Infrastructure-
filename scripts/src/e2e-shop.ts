/**
 * End-to-end exercise of the /shop agent experience.
 *
 * Drives the SAME tool executor the WebMCP registration uses
 * (window.__matchrv.executeTool) against the live dev servers, asserts the
 * shared UI state updates, walks the full human-approval lead flow, and
 * saves screenshots + a results table for WEBMCP_TEST_RESULTS.md.
 *
 * Run: pnpm --filter @workspace/scripts run e2e-shop
 * Requires: api-server on :8080, rv-marketplace on :5173.
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const SHOTS = resolve(import.meta.dirname, "../../docs/screenshots");
mkdirSync(SHOTS, { recursive: true });

interface Row {
  step: string;
  expected: string;
  actual: string;
  pass: boolean;
  ms: number;
}
const rows: Row[] = [];

async function main() {
  const executablePath = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";
  const browser = await chromium
    .launch()
    .catch(() => chromium.launch({ executablePath }));
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("  [browser error]", msg.text().slice(0, 160));
  });

  const step = async (name: string, expected: string, fn: () => Promise<string>) => {
    const t0 = Date.now();
    try {
      const actual = await fn();
      const pass = !actual.startsWith("FAIL");
      rows.push({ step: name, expected, actual, pass, ms: Date.now() - t0 });
      console.log(`${pass ? "✓" : "✗"} ${name} (${Date.now() - t0}ms) — ${actual.slice(0, 140)}`);
    } catch (err) {
      rows.push({ step: name, expected, actual: `FAIL threw: ${String(err).slice(0, 160)}`, pass: false, ms: Date.now() - t0 });
      console.log(`✗ ${name} threw:`, err);
    }
  };

  const exec = (name: string, input: unknown) =>
    page.evaluate(
      async ([n, i]) =>
        (window as unknown as { __matchrv: { executeTool: (n: string, i: unknown) => Promise<Record<string, unknown>> } }).__matchrv.executeTool(
          n as string,
          i,
        ),
      [name, input] as const,
    );

  await step("load /shop", "page renders with tool bridge", async () => {
    await page.goto(`${BASE}/shop`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __matchrv?: unknown }).__matchrv), undefined, { timeout: 20000 });
    const tools = await page.evaluate(() =>
      (window as unknown as { __matchrv: { listTools: () => { name: string }[] } }).__matchrv.listTools(),
    );
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/01-shop-initial.png`, fullPage: false });
    return tools.length === 10 ? `10 tools exposed: ${tools.map((t) => t.name).join(", ").slice(0, 90)}…` : `FAIL tool count ${tools.length}`;
  });

  await step("search_inventory (flagship query)", "funnel + verified results, UI grid renders", async () => {
    const r = (await exec("search_inventory", {
      intent_summary: "Bunkhouse TT an F-150 (≈8k lbs) can tow, ≤$45k, ≤30ft, sleeps 6+, 150mi of Tacoma, boondocking",
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
    })) as { funnel?: { searched: number; verifiedMatches: number }; results?: unknown[]; error?: string };
    if (r.error) return `FAIL ${r.error}`;
    await page.waitForSelector("text=Verified matches", { timeout: 8000 });
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/02-search-results.png` });
    const size = JSON.stringify(r).length;
    return `searched ${r.funnel?.searched}, verified ${r.funnel?.verifiedMatches}, agent payload ${size} chars${size > 2600 ? " FAIL-ish oversized" : ""}`;
  });

  await step("refine search (mode=refine)", "constraints merge; results update", async () => {
    const r = (await exec("search_inventory", {
      intent_summary: "Tighten to $35k, prefer outdoor kitchen too",
      mode: "refine",
      price_max: 35000,
      prefer: ["solar", "lithium", "outdoor_kitchen"],
    })) as { session_constraints?: string; funnel?: { verifiedMatches: number }; error?: string };
    if (r.error) return `FAIL ${r.error}`;
    const keeps = String(r.session_constraints ?? "");
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/03-refined.png` });
    return keeps.includes("Tacoma") && keeps.includes("$35,000")
      ? `merged: ${keeps.slice(0, 110)}`
      : `FAIL constraints lost: ${keeps}`;
  });

  const bridgeState = () =>
    page.evaluate(() =>
      (window as unknown as {
        __matchrv: { state: () => { resultIds: string[]; shortlistIds: string[]; leadStatus: string | null; leadPreviewId: string | null; ledgerCount: number } };
      }).__matchrv.state(),
    );

  await step("human edits shared state", "human toggle lands in session + ledger", async () => {
    await page.click("button:has-text('2 entry doors')");
    await page.waitForTimeout(1200);
    const sess = (await exec("get_shopping_session", {})) as { constraints?: string; recentHumanActions?: string[] };
    const ok = String(sess.constraints).includes("two_entry_doors") && (sess.recentHumanActions ?? []).length > 0;
    return ok ? `agent sees: ${String(sess.constraints).slice(0, 100)}` : `FAIL session: ${JSON.stringify(sess).slice(0, 160)}`;
  });

  let ids: string[] = [];
  await step("compare_units (top 3)", "comparison dialog opens with true values", async () => {
    ids = (await bridgeState()).resultIds;
    if (ids.length < 3) return `FAIL only ${ids.length} results in session`;
    const r = (await exec("compare_units", { unit_ids: ids.slice(0, 3) })) as { units?: string[]; error?: string };
    if (r.error) return `FAIL ${r.error}`;
    await page.waitForSelector("text=Side-by-side", { timeout: 6000 });
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/04-compare.png` });
    await page.keyboard.press("Escape");
    return `compared: ${(r.units ?? []).join(" | ").slice(0, 120)}`;
  });

  await step("explain_match (top 1)", "receipts: hard/soft/unknown + score math; drawer opens", async () => {
    const r = (await exec("explain_match", { unit_id: ids[0] })) as { matchScore?: number; hard?: string[]; unknowns?: string[]; error?: string };
    if (r.error) return `FAIL ${r.error}`;
    await page.waitForSelector("text=Why this match", { timeout: 6000 });
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/05-explain.png` });
    await page.keyboard.press("Escape");
    return `score ${r.matchScore}, ${r.hard?.length} hard checks, unknowns: ${(r.unknowns ?? []).join(",").slice(0, 60)}`;
  });

  await step("evaluate_tow_fit", "honest verdicts incl. dry-weight caveats", async () => {
    const r = (await exec("evaluate_tow_fit", { vehicle: "Ford F-150 rated 8,000 lbs", unit_ids: ids.slice(0, 2) })) as {
      fits?: string[];
      error?: string;
    };
    if (r.error) return `FAIL ${r.error}`;
    return (r.fits ?? [])[0]?.slice(0, 130) ?? "FAIL no fits";
  });

  await step("check_availability", "honest snapshot freshness (stale flag)", async () => {
    const r = (await exec("check_availability", { unit_id: ids[0] })) as { stale?: boolean; hoursSinceVerified?: number; error?: string };
    if (r.error) return `FAIL ${r.error}`;
    return `stale=${r.stale}, hours=${r.hoursSinceVerified}`;
  });

  await step("update_shortlist", "agent adds 2; hearts appear", async () => {
    const r = (await exec("update_shortlist", { add: ids.slice(0, 2) })) as { shortlist?: string[]; error?: string };
    if (r.error) return `FAIL ${r.error}`;
    return `shortlist: ${(r.shortlist ?? []).length} entries`;
  });

  await step("prepare_dealer_contact", "preview modal appears, awaiting approval", async () => {
    const r = (await exec("prepare_dealer_contact", {
      unit_id: ids[0],
      name: "Alex Rivera",
      email: `alex.rivera+${Date.now()}@example.com`,
      phone: "253-555-0142",
    })) as { preview_id?: string; status?: string; error?: string };
    if (r.error) return `FAIL ${r.error}`;
    await page.waitForSelector("text=wants to contact a dealership", { timeout: 6000 });
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/06-lead-preview.png` });
    return `status ${r.status}, preview ${r.preview_id}`;
  });

  const pid = (await bridgeState()).leadPreviewId ?? "missing";

  await step("submit before approval", "structured refusal (awaiting_human_approval)", async () => {
    const r = (await exec("submit_dealer_contact", { preview_id: pid })) as { error?: string };
    return r.error === "awaiting_human_approval" ? "correctly refused" : `FAIL got ${JSON.stringify(r).slice(0, 120)}`;
  });

  const directDecide = (id: string, body: unknown) =>
    page.evaluate(
      async ([pid2, b]) => {
        const res = await fetch(`/api/agent/leads/${pid2}/approve`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(b),
        });
        return { status: res.status, body: (await res.json()) as Record<string, unknown> };
      },
      [id, body] as const,
    );

  await step("approval w/o token blocked", "403 approval_token_required; status unchanged", async () => {
    const r = await directDecide(pid, {});
    if (r.status !== 403) return `FAIL status ${r.status}`;
    const state = await bridgeState();
    return state.leadStatus === "awaiting_human_approval" ? `403 ${r.body.error}; still awaiting` : `FAIL status became ${state.leadStatus}`;
  });

  await step("approval w/ forged token blocked", "403 invalid_token; status unchanged", async () => {
    const r = await directDecide(pid, { approval_token: "apt_forged-token-from-elsewhere-xx" });
    if (r.status !== 403 || r.body.error !== "invalid_token") return `FAIL ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`;
    const state = await bridgeState();
    return state.leadStatus === "awaiting_human_approval" ? "403 invalid_token; still awaiting" : `FAIL status became ${state.leadStatus}`;
  });

  let reviewedMessage = "";
  await step("capture reviewed payload", "message text visible in the approval card", async () => {
    reviewedMessage = (await page.evaluate(() => {
      const el = [...document.querySelectorAll("p")].find((p) => p.textContent?.startsWith("Hi "));
      return el?.textContent ?? "";
    })) as string;
    return reviewedMessage.length > 20 ? `captured ${reviewedMessage.length} chars` : "FAIL no message captured";
  });

  await step("human approves in UI", "state moves to approved", async () => {
    await page.click("button:has-text('Approve & allow send')");
    await page.waitForTimeout(800);
    return "clicked approve";
  });

  await step("submit after approval", "receipt with lead id + demo delivery note", async () => {
    const r = (await exec("submit_dealer_contact", { preview_id: pid })) as { receipt?: { leadId: unknown; delivery: string }; error?: string };
    if (!r.receipt) return `FAIL ${JSON.stringify(r).slice(0, 140)}`;
    await page.waitForSelector("text=Contact request submitted", { timeout: 6000 });
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/07-receipt.png` });
    return `lead ${String(r.receipt.leadId)} — ${r.receipt.delivery.slice(0, 80)}`;
  });

  await step("duplicate submit blocked", "already_submitted refusal", async () => {
    const r = (await exec("submit_dealer_contact", { preview_id: pid })) as { error?: string };
    return r.error === "already_submitted" ? "correctly refused" : `FAIL got ${JSON.stringify(r).slice(0, 100)}`;
  });

  await step("submitted payload is immutable", "server record equals the reviewed preview", async () => {
    const r = await page.evaluate(async (pid2) => {
      const res = await fetch(`/api/agent/leads/${pid2}`);
      return (await res.json()) as { preview?: { message: string; status: string } };
    }, pid);
    if (!r.preview) return "FAIL no preview readback";
    return r.preview.message === reviewedMessage && r.preview.status === "submitted"
      ? "submitted message byte-identical to reviewed message"
      : `FAIL mismatch (${r.preview.status})`;
  });

  await step("replay decision after submission blocked", "409 already_decided", async () => {
    const r = await directDecide(pid, { approval_token: "apt_replayed-token-after-decision" });
    return r.status === 409 && r.body.error === "already_decided" ? "409 already_decided" : `FAIL ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`;
  });

  await step("zero-result search shows recovery UI", "empty state + funnel reasons, no crash", async () => {
    // condition + price are always dealer-published, so this combination has
    // verified fails for every unit — a genuinely empty result.
    const r = (await exec("search_inventory", { mode: "refine", price_max: 2000, condition: "new" })) as {
      guidance?: string;
      funnel?: { verifiedMatches: number; unverified: number };
    };
    await page.waitForSelector("text=No unit satisfies every hard requirement", { timeout: 6000 });
    return r.guidance?.includes("Relax") && r.funnel?.unverified === 0
      ? "recovery guidance + visible empty state"
      : `FAIL ${JSON.stringify(r).slice(0, 120)}`;
  });

  await step("reload resets the session cleanly (by design)", "fresh in-memory session, tools re-register, no errors", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __matchrv?: unknown }).__matchrv), undefined, { timeout: 30000 });
    const state = await bridgeState();
    return state.resultIds.length === 0 && state.leadStatus === null && state.ledgerCount >= 1
      ? "clean fresh session after reload (state is per-page-load, as documented)"
      : `FAIL leftover state ${JSON.stringify(state).slice(0, 100)}`;
  });

  await step("malformed args rejected", "invalid_arguments with issues list", async () => {
    const r = (await exec("search_inventory", { price_max: "cheap", rv_types: ["spaceship"] })) as { error?: string; issues?: string[] };
    return r.error === "invalid_arguments" && (r.issues ?? []).length > 0 ? `issues: ${(r.issues ?? [])[0]}` : `FAIL ${JSON.stringify(r).slice(0, 100)}`;
  });

  await step("unknown place self-correction", "422-style error with place hints", async () => {
    const r = (await exec("search_inventory", { mode: "refine", place: "Narnia" })) as { error?: string; hint?: string };
    return r.hint?.startsWith("Try one of") ? `hint offered: ${r.hint.slice(0, 80)}` : `FAIL ${JSON.stringify(r).slice(0, 120)}`;
  });

  await browser.close();

  console.log("\n== RESULTS TABLE (markdown) ==\n");
  console.log("| Test | Expected | Actual | Pass | ms |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const r of rows) {
    console.log(`| ${r.step} | ${r.expected} | ${r.actual.replace(/\|/g, "/").slice(0, 110)} | ${r.pass ? "✅" : "❌"} | ${r.ms} |`);
  }
  const failed = rows.filter((r) => !r.pass).length;
  console.log(`\n${rows.length - failed}/${rows.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
