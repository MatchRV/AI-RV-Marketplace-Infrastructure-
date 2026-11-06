import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { matchRvMcpHandler } from "../src/mcp";

async function rpc(method: string, params: unknown = {}) {
  const response = await matchRvMcpHandler.fetch(new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
  expect(response.status).toBe(200);
  const raw = await response.text();
  const message = JSON.parse(raw.startsWith("event:") || raw.startsWith("data:") ? raw.split("\n").find((l) => l.startsWith("data:"))!.slice(5) : raw);
  expect(message.error).toBeUndefined();
  return message.result;
}

const call = async (name: string, args: Record<string, unknown>) => {
  const result = await rpc("tools/call", { name, arguments: args });
  expect(result.isError).not.toBe(true);
  return JSON.parse(result.content.find((c: { type: string }) => c.type === "text").text);
};

const SWIPE = "https://matchrv.com/swipe";

function expectChoice(d: Record<string, any>, facts: string[]) {
  expect(d.status).toBe("choose_swipe_or_chat");
  expect(d.route).toBe("welcome");
  expect(d.welcome).toContain(SWIPE);
  expect(d.choices?.map((c: { id: string }) => c.id)).toEqual(["swipe", "outfitter"]);
  expect(d.choices[0].url).toBe(SWIPE);
  expect(d.guidance).toMatch(/already exists/);
  expect(d.guidance).toMatch(/do not say swiping is missing/i);
  expect(d.guidance).toMatch(/do not offer to build/i);
  expect(d.guidance).toMatch(/not a ChatGPT swipe/i);
  expect(d.guidance).toMatch(/do not ask nextQuestion in this same message/i);
  expect(d.results ?? []).toEqual([]);
  for (const fact of facts) expect(d.knownSummary.join(" | ")).toContain(fact);
  expect(JSON.stringify(d)).not.toMatch(/build (?:your |a )?swipe deck|create a deck|no swiping feature/i);
}

describe("swipe or chat before the interview", () => {
  it("startup instructions and tool descriptions name the existing page and forbid building one", async () => {
    const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "swipe-or-chat", version: "1" } });
    const instr = init.instructions as string;
    expect(instr).toContain(SWIPE);
    expect(instr).toMatch(/fresh|named RV|returning|restart/i);
    expect(instr).toMatch(/do not say swiping is missing/i);
    expect(instr).toMatch(/do not offer to build/i);
    const { tools } = await rpc("tools/list");
    for (const name of ["outfitter_discovery", "search_rvs"]) {
      const tool = tools.find((t: { name: string }) => t.name === name);
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.description).toContain(SWIPE);
      expect(tool.description).toMatch(/already exists/);
      expect(tool.description).toMatch(/never offer to build/i);
    }
    const discovery = tools.find((t: { name: string; inputSchema: any; annotations: unknown; title: string }) => t.name === "outfitter_discovery");
    const reviewed = JSON.parse(readFileSync(new URL("./fixtures/mcp-tools-v2.2.6.json", import.meta.url), "utf8"));
    const frozen = reviewed.find((t: { name: string }) => t.name === "outfitter_discovery");
    const liveSchema = structuredClone(discovery.inputSchema);
    const frozenSchema = structuredClone(frozen.inputSchema);
    expect(liveSchema.properties.request_kind.enum).toEqual(["find_rv", "general_question", "greeting"]);
    expect(Object.keys(liveSchema.properties).sort()).toEqual(Object.keys(frozenSchema.properties).sort());
    liveSchema.properties.request_kind.description = frozenSchema.properties.request_kind.description;
    expect(liveSchema).toEqual(frozenSchema);
    expect(discovery.annotations).toEqual(frozen.annotations);
    expect(discovery.title).toBe(frozen.title);
  });

  it("a blank greeting, a specific RV, and a greeting that still carries old facts all offer the choice", async () => {
    const blank = await call("outfitter_discovery", { request_kind: "greeting" });
    expectChoice(blank, []);

    const specific = await call("outfitter_discovery", { rv_types: ["class_a"], location: "Tacoma, WA" });
    expectChoice(specific, ["class a", "Tacoma"]);
    expect(specific.nextQuestion.id).toBe("use");

    const restart = await call("outfitter_discovery", {
      request_kind: "greeting",
      rv_types: ["class_a"],
      location: "Tacoma, WA",
      covered_steps: ["use"],
    });
    expectChoice(restart, ["class a", "Tacoma"]);
    expect(restart.knownSummary.join(" | ")).toMatch(/use:|already asked: use/);
  });

  it("search with no interview progress offers the choice and returns no RVs", async () => {
    const d = await call("search_rvs", { rv_types: ["class_a"], location: "Tacoma, WA" });
    expectChoice(d, ["class a", "Tacoma"]);
    expect(d.results).toEqual([]);
  }, 60000);

  it("after chat has started, a find_rv call does not repeat the choice and keeps the next question", async () => {
    const d = await call("outfitter_discovery", {
      request_kind: "find_rv",
      rv_types: ["class_a"],
      location: "Tacoma, WA",
      covered_steps: ["use"],
    });
    expect(d.status).toBe("needs_discovery");
    expect(d.choices).toBeUndefined();
    expect(d.welcome).toBeUndefined();
    expect(d.nextQuestion.id).toBe("activities");
    expect(d.knownSummary.join(" | ")).toContain("class a");
    expect(d.knownSummary.join(" | ")).toContain("Tacoma");
  });

  it("a direct question is still answered, and the same reply can point at the existing page", async () => {
    const d = await call("outfitter_discovery", { request_kind: "general_question" });
    expect(d.route).toBe("education");
    expect(d.status).toBe("answer_directly");
    expect(d.nextQuestions).toEqual([]);
    expect(d.guidance).toContain(SWIPE);
    expect(d.guidance).toMatch(/already exists/);
    expect(d.choices[0].url).toBe(SWIPE);
  });
});
