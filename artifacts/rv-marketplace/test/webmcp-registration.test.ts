/**
 * WebMCP registration against a mocked, current-shape `document.modelContext`
 * (registerTool per the Chrome/OpenAI imperative API). Verifies what a real
 * runtime would receive at page load: all ten tools, valid JSON Schemas,
 * annotations, idempotent re-registration, and no approval-capability leak.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";

interface RegisteredTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  execute: (input: unknown) => Promise<unknown>;
}

const registered: RegisteredTool[] = [];
const registerTool = vi.fn((tool: RegisteredTool) => {
  registered.push(tool);
});

let webmcp: typeof import("../src/agent/webmcp");

beforeAll(async () => {
  // Minimal browser surface: the module feature-detects document.modelContext
  // and publishes its test bridge on window.
  (globalThis as Record<string, unknown>).document = { modelContext: { registerTool } };
  (globalThis as Record<string, unknown>).window = globalThis;
  (globalThis as Record<string, unknown>).location = { pathname: "/shop" };
  webmcp = await import("../src/agent/webmcp");
});

describe("registerMatchrvTools against a mocked modelContext", () => {
  it("registers exactly the ten contracted tools once, and reports native runtime", () => {
    const runtime = webmcp.registerMatchrvTools();
    expect(runtime).toBe("native");
    expect(registerTool).toHaveBeenCalledTimes(10);
    expect(registered.map((t) => t.name)).toEqual([
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

  it("is idempotent on remount — a second call registers nothing new", () => {
    webmcp.registerMatchrvTools();
    webmcp.registerMatchrvTools();
    expect(registerTool).toHaveBeenCalledTimes(10);
  });

  it("hands the runtime valid JSON Schemas and annotations", () => {
    for (const tool of registered) {
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.description.length).toBeLessThanOrEqual(500);
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(tool.inputSchema.$schema).toBeUndefined();
      expect(typeof tool.execute).toBe("function");
      expect(tool.annotations).toBeDefined();
    }
    const readOnly = registered.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
    expect(readOnly).toContain("search_inventory");
    expect(readOnly).toContain("get_shopping_session");
    expect(readOnly).not.toContain("submit_dealer_contact");
  });

  it("exposes no approval capability to agents", () => {
    // The human-approval step must not be reachable through the tool surface.
    for (const tool of registered) {
      expect(tool.name).not.toMatch(/approve|reject/);
      expect(JSON.stringify(tool.inputSchema)).not.toMatch(/approval_token/);
    }
  });

  it("rejects malformed arguments in the execute path without a network call", async () => {
    const search = registered.find((t) => t.name === "search_inventory")!;
    const result = (await search.execute({ price_max: "cheap" })) as { error?: string; issues?: string[] };
    expect(result.error).toBe("invalid_arguments");
    expect(result.issues?.length).toBeGreaterThan(0);
  });

  it("keeps the internal test bridge read-only about lead secrets", () => {
    const bridge = (globalThis as unknown as { __matchrv: { state: () => Record<string, unknown> } }).__matchrv;
    const state = bridge.state();
    expect(JSON.stringify(state)).not.toMatch(/apt_|approval/i);
  });
});
