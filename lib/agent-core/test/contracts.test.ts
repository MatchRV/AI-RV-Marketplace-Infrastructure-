import { describe, expect, it } from "vitest";
import {
  TOOL_CONTRACTS,
  toInputSchema,
  searchInventoryInput,
  prepareDealerContactInput,
  compareUnitsInput,
  searchInputToConstraints,
} from "../src/index.js";

describe("tool contracts (WebMCP surface)", () => {
  it("exposes exactly the intended 10 tools", () => {
    expect(TOOL_CONTRACTS.map((t) => t.name)).toEqual([
      "search_inventory",
      "get_unit_details",
      "compare_units",
      "explain_match",
      "check_availability",
      "evaluate_tow_fit",
      "get_shopping_session",
      "update_shortlist",
      "prepare_dealer_contact",
      "submit_dealer_contact",
    ]);
  });

  it("respects WebMCP naming and description size guidance", () => {
    for (const t of TOOL_CONTRACTS) {
      expect(t.name.length).toBeLessThanOrEqual(30);
      expect(/^[A-Za-z0-9_.-]+$/.test(t.name)).toBe(true);
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.description.length).toBeLessThanOrEqual(500);
    }
  });

  it("marks read tools readOnlyHint and write tools not", () => {
    const readonly = TOOL_CONTRACTS.filter((t) => t.annotations.readOnlyHint).map((t) => t.name);
    expect(readonly).toContain("search_inventory");
    expect(readonly).toContain("explain_match");
    expect(readonly).not.toContain("submit_dealer_contact");
    expect(readonly).not.toContain("prepare_dealer_contact");
  });

  it("compiles every schema to a valid-looking JSON Schema without $schema noise", () => {
    for (const t of TOOL_CONTRACTS) {
      const js = toInputSchema(t) as { type?: string; properties?: Record<string, { description?: string }>; $schema?: string };
      expect(js.$schema).toBeUndefined();
      expect(js.type).toBe("object");
      for (const [, prop] of Object.entries(js.properties ?? {})) {
        if (prop.description) expect(prop.description.length).toBeLessThanOrEqual(160);
      }
    }
  });

  it("rejects malformed agent input strictly", () => {
    expect(searchInventoryInput.safeParse({ price_max: "cheap" }).success).toBe(false);
    expect(searchInventoryInput.safeParse({ rv_types: ["spaceship"] }).success).toBe(false);
    expect(searchInventoryInput.safeParse({ limit: 99 }).success).toBe(false);
    expect(compareUnitsInput.safeParse({ unit_ids: ["only-one"] }).success).toBe(false);
    expect(prepareDealerContactInput.safeParse({ unit_id: "vin:x", name: "A", email: "not-an-email" }).success).toBe(false);
  });

  it("accepts raw natural inputs (agent shouldn't pre-transform)", () => {
    const parsed = searchInventoryInput.safeParse({
      tow_vehicle: "my 2024 F-150, sticker says 8,000 lbs",
      place: "Tacoma",
      price_max: 45000,
    });
    expect(parsed.success).toBe(true);
  });

  it("maps tool input to engine constraints incl. clear ops", () => {
    const parsed = searchInventoryInput.parse({
      place: "Tacoma",
      price_max: 45000,
      must_have: ["bunkhouse"],
      clear: ["tow_vehicle"],
      mode: "refine",
    });
    const { incoming, clear, mode } = searchInputToConstraints(parsed);
    expect(incoming.location).toEqual({ place: "Tacoma", radiusMiles: 150 });
    expect(incoming.priceMaxUsd).toBe(45000);
    expect(clear).toEqual(["towVehicle"]);
    expect(mode).toBe("refine");
  });
});
