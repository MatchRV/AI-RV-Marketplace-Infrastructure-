import { describe, expect, it } from "vitest";
import { evaluatePayloadFit, evaluateTowFit, resolveTowVehicle, TOWABLE_TYPES, type CanonicalUnit } from "@workspace/agent-core";
import { getInventory } from "../src/services/agent-inventory";
import { towMatch } from "../src/lib/tow-match";

const units = () => getInventory().units as CanonicalUnit[];
/** A real towable from the snapshot, with the weights set for the case under test. */
function trailer(over: { gvwr?: number | null; dry?: number | null; hitch?: number | null; type?: CanonicalUnit["rvType"] }): CanonicalUnit {
  const u = structuredClone(units().find((x) => x.rvType === "travel_trailer")!);
  const f = (v: number | null | undefined) => ({ value: v ?? null, source: v != null ? ("dealer_listing" as const) : null, confidence: v != null ? ("high" as const) : null });
  u.gvwrLbs = f(over.gvwr) as CanonicalUnit["gvwrLbs"];
  u.dryWeightLbs = f(over.dry) as CanonicalUnit["dryWeightLbs"];
  u.hitchWeightLbs = f(over.hitch) as CanonicalUnit["hitchWeightLbs"];
  if (over.type) u.rvType = over.type;
  return u;
}
const run = (u: CanonicalUnit, vehicle: string | null, payload: number | null) => {
  const res = vehicle ? resolveTowVehicle(vehicle) : null;
  const fit = res ? evaluateTowFit(u, res) : null;
  const pay = payload != null ? evaluatePayloadFit(u, { truckPayloadLbs: payload, passengersLbs: 400, cargoLbs: 100 }) : null;
  return towMatch(u, fit, pay, { ratingIsExact: Boolean(res && res.statedRatingLbs != null) });
};

describe("towMatch: one answer to 'can my truck tow this RV?'", () => {
  it("clears with margin only when an exact rating and the payload both clear on a published GVWR", () => {
    const m = run(trailer({ gvwr: 6000, dry: 4800 }), "F-150 rated 11,000 lbs", 2200);
    expect(m.answer).toBe("clears_checked_limits_with_margin");
    expect(m.headline).toContain("Not a safety guarantee");
    expect(m.weightsUsed.gvwrLbs).toEqual({ value: 6000, source: "dealer_listing" });
    expect(m.stillToConfirm.join(" ")).toContain("scale");
  });

  it("says over_limit and names payload when payload is what runs out", () => {
    const m = run(trailer({ gvwr: 7000, dry: 5600 }), "F-150 rated 11,000 lbs", 1500);
    expect(m.answer).toBe("over_limit");
    expect(m.limitingFactor).toBe("payload");
    expect(m.checks.towRating.status).toBe("clears_with_margin");
  });

  it("says over_limit on tow rating when the trailer outweighs it", () => {
    const m = run(trailer({ gvwr: 9000 }), "Tacoma rated 6,400 lbs", null);
    expect(m.answer).toBe("over_limit");
    expect(m.limitingFactor).toBe("tow_rating");
  });

  it("a model name alone gives depends_on_truck_configuration, and asks for the exact rating", () => {
    const m = run(trailer({ gvwr: 7000 }), "Ford F-150", 2500);
    expect(m.answer).toBe("depends_on_truck_configuration");
    expect(m.stillToConfirm.join(" ")).toContain("exact tow rating");
  });

  it("is not_yet_confirmed when payload was never given, even if the tow rating clears", () => {
    const m = run(trailer({ gvwr: 6000 }), "F-150 rated 11,000 lbs", null);
    expect(m.answer).toBe("not_yet_confirmed");
    expect(m.headline).toContain("tow rating");
    expect(m.stillToConfirm.join(" ")).toContain("yellow sticker");
  });

  it("is never better than tight when the dealer publishes only dry weight", () => {
    const m = run(trailer({ gvwr: null, dry: 4000 }), "F-150 rated 11,000 lbs", 2500);
    expect(m.answer).toBe("clears_checked_limits_tight");
    expect(m.stillToConfirm.join(" ")).toContain("GVWR");
  });

  it("is not_yet_confirmed when no weight is published at all", () => {
    const m = run(trailer({ gvwr: null, dry: null }), "F-150 rated 11,000 lbs", 2500);
    expect(m.answer).toBe("not_yet_confirmed");
    expect(m.weightsUsed.gvwrLbs).toEqual({ value: null, source: null });
  });

  it("calls a motorhome not_towable", () => {
    const mh = units().find((x) => !TOWABLE_TYPES.includes(x.rvType))!;
    expect(run(mh, "F-150 rated 11,000 lbs", 2000).answer).toBe("not_towable");
  });

  it("never uses the word safe as a verdict", () => {
    for (const u of [trailer({ gvwr: 6000 }), trailer({ gvwr: 9000 }), trailer({ gvwr: null, dry: null })]) {
      const m = run(u, "F-150 rated 11,000 lbs", 2200);
      expect(m.answer).not.toMatch(/safe/i);
      expect(m.headline.replace("Not a safety guarantee", "")).not.toMatch(/\bsafe\b/i);
    }
  });
});

describe("evaluate_tow_fit over MCP returns the combined answer", () => {
  it("adds towMatch, worst first, alongside the existing fields", async () => {
    const { matchRvMcpHandler } = await import("../src/mcp");
    // The MCP server answers from the screened inventory, so pick ids from it.
    const { getScreenedInventory } = await import("../src/services/screened-inventory");
    const towables = (getScreenedInventory().units as CanonicalUnit[]).filter((u) => u.rvType === "travel_trailer" && u.gvwrLbs.value != null).slice(0, 3).map((u) => u.id);
    const response = await matchRvMcpHandler.fetch(new Request("http://localhost/mcp", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "evaluate_tow_fit", arguments: { vehicle: "Ford F-150 rated 9,000 lbs", unit_ids: towables, truck_payload_lbs: 1700, passengers_lbs: 400, cargo_lbs: 100 } } }),
    }));
    const raw = await response.text();
    const message = JSON.parse(raw.startsWith("event:") || raw.startsWith("data:") ? raw.split("\n").find((l) => l.startsWith("data:"))!.slice(5) : raw);
    const data = JSON.parse(message.result.content.find((c: { type: string }) => c.type === "text").text);
    expect(data.towMatch).toHaveLength(towables.length);
    expect(data.fits).toHaveLength(towables.length);
    expect(data.payloadFits).toHaveLength(towables.length);
    const rank = ["over_limit", "depends_on_truck_configuration", "not_yet_confirmed", "clears_checked_limits_tight", "clears_checked_limits_with_margin", "not_towable"];
    const order = data.towMatch.map((m: { answer: string }) => rank.indexOf(m.answer));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const m of data.towMatch) expect(m.stillToConfirm.length).toBeGreaterThan(0);
  });
});
