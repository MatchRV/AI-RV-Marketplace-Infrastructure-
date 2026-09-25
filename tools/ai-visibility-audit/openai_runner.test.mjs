import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPrompts,
  buildRequest,
  normalizeProviderResponse,
  runOpenAiCitationTest,
} from "./openai_runner.mjs";

test("buildPrompts preserves the existing ten prompts and flags only the branded review prompt", () => {
  const prompts = buildPrompts({ dealer: "Porter's RV", city: "Coos Bay", state: "OR" });
  assert.equal(prompts.length, 10);
  assert.equal(prompts[0].prompt, "Best RV dealers near Coos Bay, OR");
  assert.equal(prompts[2].prompt, "Porter's RV reviews Coos Bay OR");
  assert.equal(prompts.filter((p) => p.isBranded).length, 1);
  assert.equal(prompts[2].isBranded, true);
});

test("buildRequest enables live web search with approximate dealer location and neutral instructions", () => {
  const body = buildRequest({
    prompt: "Best RV dealers near Coos Bay, OR",
    city: "Coos Bay",
    state: "OR",
    model: "test-model",
  });
  assert.equal(body.model, "test-model");
  assert.equal(body.tool_choice, "required");
  assert.deepEqual(body.include, ["web_search_call.action.sources"]);
  assert.equal(body.tools[0].type, "web_search");
  assert.equal(body.tools[0].external_web_access, true);
  assert.deepEqual(body.tools[0].user_location, {
    type: "approximate",
    country: "US",
    city: "Coos Bay",
    region: "OR",
  });
  assert.match(body.instructions, /do not favor/i);
  assert.doesNotMatch(body.instructions, /Porter/i);
});

test("normalizer extracts response text, citations, sources and search queries", () => {
  const provider = {
    id: "resp_123",
    model: "gpt-test",
    output: [
      {
        type: "web_search_call",
        action: {
          type: "search",
          queries: ["RV dealers Coos Bay Oregon"],
          sources: [
            { type: "url", url: "https://example.com/a", title: "A" },
            { type: "url", url: "https://example.com/a", title: "A duplicate" },
          ],
        },
      },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "Here are current options.",
            annotations: [
              { type: "url_citation", url: "https://example.com/a", title: "A", start_index: 0, end_index: 4 },
            ],
          },
        ],
      },
    ],
  };

  const out = normalizeProviderResponse({
    provider,
    promptMeta: { promptId: "P01", category: "dealer_discovery", prompt: "Best RV dealers near Coos Bay, OR", isBranded: false },
    dealer: "Porter's RV",
    domain: "portersrv.com",
    city: "Coos Bay",
    state: "OR",
    modelRequested: "gpt-test",
    testedAt: "2026-09-25T20:00:00.000Z",
    rawPath: "/tmp/P01.json",
  });

  assert.equal(out.status, "success");
  assert.equal(out.responseText, "Here are current options.");
  assert.deepEqual(out.searchQueries, ["RV dealers Coos Bay Oregon"]);
  assert.equal(out.citations.length, 1);
  assert.equal(out.sources.length, 1);
  assert.equal(out.targetDealer, "Porter's RV");
  assert.equal(out.targetDomain, "portersrv.com");
});

test("runner archives exact raw provider JSON before normalized outputs are written", async () => {
  const dir = await mkdtemp(join(tmpdir(), "matchrv-openai-runner-"));
  let calls = 0;

  const fetchImpl = async (_url, init) => {
    calls++;
    const request = JSON.parse(init.body);
    assert.equal(request.tools[0].external_web_access, true);
    assert.equal(request.tools[0].user_location.city, "Coos Bay");
    const raw = JSON.stringify({
      id: `resp_${calls}`,
      model: "gpt-test",
      output: [
        {
          type: "web_search_call",
          action: {
            type: "search",
            queries: [`query-${calls}`],
            sources: [{ type: "url", url: `https://source.example/${calls}`, title: `Source ${calls}` }],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: `answer-${calls}`,
              annotations: [{ type: "url_citation", url: `https://source.example/${calls}`, title: `Source ${calls}` }],
            },
          ],
        },
      ],
    });
    return new Response(raw, { status: 200, headers: { "content-type": "application/json" } });
  };

  const { summary, observations } = await runOpenAiCitationTest({
    apiKey: "test-key",
    dealer: "Porter's RV",
    domain: "portersrv.com",
    city: "Coos Bay",
    state: "OR",
    model: "gpt-test",
    outDir: dir,
    fetchImpl,
    now: (() => {
      let i = 0;
      return () => new Date(1770000000000 + i++ * 1000);
    })(),
  });

  assert.equal(calls, 10);
  assert.equal(observations.length, 10);
  assert.equal(observations.every((o) => o.status === "success"), true);
  assert.equal(observations.filter((o) => o.isBranded).length, 1);

  const rawFiles = (await readdir(summary.rawDirectory)).filter((name) => /^P\d\d\.json$/.test(name));
  assert.equal(rawFiles.length, 10);
  const rawP01 = JSON.parse(await readFile(join(summary.rawDirectory, "P01.json"), "utf8"));
  assert.equal(rawP01.id, "resp_1");

  const jsonl = (await readFile(summary.observationsJsonl, "utf8")).trim().split("\n");
  assert.equal(jsonl.length, 10);
  const first = JSON.parse(jsonl[0]);
  assert.equal(first.rawResponsePath.endsWith("P01.json"), true);
  assert.equal(first.searchQueries[0], "query-1");

  const requestP01 = JSON.parse(await readFile(join(summary.rawDirectory, "P01.request.json"), "utf8"));
  assert.doesNotMatch(JSON.stringify(requestP01.request), /portersrv\.com/i);
  assert.doesNotMatch(requestP01.request.instructions, /Porter's RV/i);
});

test("runner records rate_limit without discarding the archived provider error JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "matchrv-openai-rate-"));
  const fetchImpl = async () => new Response(
    JSON.stringify({ error: { type: "rate_limit_error", code: "rate_limit_exceeded", message: "slow down" } }),
    { status: 429, headers: { "content-type": "application/json" } },
  );

  const { summary, observations } = await runOpenAiCitationTest({
    apiKey: "test-key",
    dealer: "Dealer",
    domain: "dealer.example",
    city: "Tacoma",
    state: "WA",
    model: "gpt-test",
    outDir: dir,
    fetchImpl,
  });

  assert.equal(observations.every((o) => o.status === "rate_limit"), true);
  const archived = JSON.parse(await readFile(join(summary.rawDirectory, "P01.json"), "utf8"));
  assert.equal(archived.error.code, "rate_limit_exceeded");
});
