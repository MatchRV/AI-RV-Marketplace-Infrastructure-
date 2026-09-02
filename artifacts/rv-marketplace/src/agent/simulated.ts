/**
 * Guided demo: replays the exact tool-call sequence a connected agent would
 * make, through the same executor the WebMCP tools use. Honest labeling —
 * it never pretends a real agent is present; it exists so anyone can watch
 * the human+agent flow (and so tests can exercise the full path) without a
 * WebMCP runtime.
 */

import { executeToolByName } from "./webmcp";
import { getSession, logLedger, setGuidedDemo } from "./session";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runGuidedDemo(): Promise<void> {
  if (getSession().guidedDemoRunning) return;
  setGuidedDemo(true);
  logLedger(
    "system",
    "Guided demo started — simulating the WebMCP tool calls a connected agent would make. In ChatGPT's browser or Chrome (WebMCP flag), your real agent drives these same tools.",
  );

  try {
    await wait(600);
    await executeToolByName("search_inventory", {
      intent_summary:
        "Bunkhouse travel trailer an F-150 (rated ~8,000 lbs) can tow — under $45k, under 30 ft, sleeps 6+, within 150 mi of Tacoma, boondocking-friendly",
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

    await wait(2200);
    await executeToolByName("search_inventory", {
      intent_summary: "Refined: keep everything, tighten budget to $35k and prefer an outdoor kitchen too",
      mode: "refine",
      price_max: 35000,
      prefer: ["solar", "lithium", "outdoor_kitchen"],
    });

    await wait(2200);
    const s = getSession();
    const top = s.results.slice(0, 3).map((m) => m.unit.id);
    if (top.length >= 2) {
      await executeToolByName("compare_units", { unit_ids: top.slice(0, 3) });
      await wait(2600);
      await executeToolByName("explain_match", { unit_id: top[0] });
      await wait(2200);
      await executeToolByName("update_shortlist", { add: top.slice(0, 2) });
      await wait(1600);
      await executeToolByName("evaluate_tow_fit", { vehicle: "Ford F-150 rated 8,000 lbs", unit_ids: top.slice(0, 2) });
      await wait(2200);
      await executeToolByName("check_availability", { unit_id: top[0] });
      await wait(1800);
      await executeToolByName("prepare_dealer_contact", {
        unit_id: top[0],
        name: "Alex Rivera",
        email: "alex.rivera@example.com",
        phone: "253-555-0142",
      });
      logLedger(
        "system",
        "Guided demo paused — the contact preview needs YOUR approval. Approve or decline it in the panel; approving lets the demo submit it (demo environment: nothing reaches a real dealership).",
      );

      // Wait for the human decision (up to 3 minutes), then finish the flow.
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        const status = getSession().leadPreview?.status;
        if (status === "approved") {
          await wait(700);
          await executeToolByName("submit_dealer_contact", {
            preview_id: getSession().leadPreview!.previewId,
          });
          break;
        }
        if (status === "rejected" || status === undefined) {
          logLedger("system", "Guided demo: contact request declined — nothing was sent. That's the point.");
          break;
        }
        if (status === "submitted") break;
        await wait(500);
      }
    }
    logLedger("system", "Guided demo finished. Every step you watched is a structured WebMCP tool call any agent can make.");
  } finally {
    setGuidedDemo(false);
  }
}
