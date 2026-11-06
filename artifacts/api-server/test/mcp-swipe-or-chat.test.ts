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

const OFFER = "Would you like your RV Outfitter to keep helping you find the right fit, or try swiping through RVs yourself and compare your favorites?";

function expectBasics(d: Record<string, any>, id: string) {
  expect(d.status).toBe("needs_discovery");
  expect(d.route).toBe("basics");
  expect(d.choices).toBeUndefined();
  expect(d.nextQuestion.id).toBe(id);
  expect(d.nextQuestions).toHaveLength(1);
  expect(d.guidance).toMatch(/ask this one question/i);
  expect(d.guidance).toMatch(/if they ask to swipe/i);
  expect(d.results ?? []).toEqual([]);
}

function expectOffer(d: Record<string, any>, facts: string[]) {
  expect(d.status).toBe("choose_swipe_or_chat");
  expect(d.offer).toBe(OFFER);
  expect(d.choices.map((c: { id: string }) => c.id)).toEqual(["outfitter", "swipe"]);
  expect(d.choices[1].url).toMatch(/^https:\/\/matchrv\.com\/swipe/);
  expect(d.guidance).toMatch(/do not assume they have owned an RV/i);
  expect(d.guidance).toMatch(/over or at least is a price floor/i);
  expect(d.guidance).toMatch(/diesel and brand are not filters/i);
  expect(d.guidance).toMatch(/if they ask to swipe/i);
  for (const fact of facts) expect(d.knownSummary.join(" | ")).toContain(fact);
}

describe("type and price, then outfitter or swipe", () => {
  it("startup instructions ask type then price before the offer", async () => {
    const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "type-price", version: "1" } });
    const instr = init.instructions as string;
    expect(instr).toContain(OFFER);
    expect(instr).toMatch(/ask what kind of RV/i);
    expect(instr).toMatch(/rough price range/i);
    expect(instr).toMatch(/if they ask to swipe/i);
    expect(instr).toMatch(/do not assume they have owned an RV/i);
    const { tools } = await rpc("tools/list");
    for (const name of ["outfitter_discovery", "search_rvs"]) {
      const tool = tools.find((t: { name: string }) => t.name === name);
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.description).toContain("https://matchrv.com/swipe");
      expect(tool.description).toMatch(/rough price range/i);
    }
    const discovery = tools.find((t: { name: string; inputSchema: any }) => t.name === "outfitter_discovery");
    const reviewed = JSON.parse(readFileSync(new URL("./fixtures/mcp-tools-v2.2.6.json", import.meta.url), "utf8"));
    const frozen = reviewed.find((t: { name: string }) => t.name === "outfitter_discovery");
    expect(Object.keys(discovery.inputSchema.properties).sort()).toEqual(Object.keys(frozen.inputSchema.properties).sort());
    expect(discovery.inputSchema.properties.request_kind.enum).toEqual(["find_rv", "general_question", "greeting"]);
  });

  it("asks type, then price, then offers; skips facts already given", async () => {
    const fresh = await call("outfitter_discovery", {});
    expectBasics(fresh, "rv_type");

    const typed = await call("outfitter_discovery", { rv_types: ["class_a"], covered_steps: ["rv_type"] });
    expectBasics(typed, "price_range");
    expect(typed.knownSummary.join(" | ")).toContain("class a");
    expect(typed.guidance).toMatch(/do not pass budget_max_usd for a floor/i);

    const both = await call("outfitter_discovery", { rv_types: ["class_a"], budget_max_usd: 150000, location: "Tacoma, WA" });
    expectOffer(both, ["class a", "Tacoma"]);
    expect(both.choices[1].url).toContain("type=class_a");
    expect(both.choices[1].url).toContain("price_max=150000");
    expect(both.choices[1].url).toContain("place=");
    expect(both.choices[1].url).not.toContain("98444");
  });

  it("does not trap someone who is not sure, and does not repeat the offer after they choose the Outfitter", async () => {
    const unsure = await call("outfitter_discovery", { declined_questions: ["rv_type", "payment"] });
    expectOffer(unsure, []);
    expect(unsure.knownSummary.join(" | ")).toMatch(/prefers not to answer: rv_type, payment/);

    const chatting = await call("outfitter_discovery", {
      request_kind: "find_rv",
      rv_types: ["class_a"],
      budget_max_usd: 150000,
      covered_steps: ["rv_type", "payment", "use"],
    });
    expect(chatting.status).toBe("needs_discovery");
    expect(chatting.choices).toBeUndefined();
    expect(chatting.offer).toBeUndefined();
    expect(chatting.nextQuestion.id).not.toBe("rv_type");
    expect(chatting.nextQuestion.id).not.toBe("price_range");
    expect(chatting.knownSummary.join(" | ")).toContain("class a");
  });

  it("a restart that still has type and price offers again and keeps the facts", async () => {
    const restart = await call("outfitter_discovery", {
      request_kind: "greeting",
      rv_types: ["class_a"],
      budget_max_usd: 200000,
      location: "Tacoma, WA",
      covered_steps: ["use"],
    });
    expectOffer(restart, ["class a", "Tacoma"]);
    expect(restart.knownSummary.join(" | ")).toMatch(/already asked: use/);
  });
});
