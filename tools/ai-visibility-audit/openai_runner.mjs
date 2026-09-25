#!/usr/bin/env node
/**
 * MAT-39 OpenAI citation runner.
 *
 * Scope: OpenAI only. Runs the ten existing dealer citation prompts through
 * Responses API + live web_search, archives the exact provider JSON body
 * BEFORE application parsing/normalization, then writes normalized evidence.
 *
 * No dealer name/domain is added to non-branded prompts. targetDealer and
 * targetDomain are metadata only. The one existing branded review prompt is
 * preserved and explicitly flagged isBranded=true for later denominator rules.
 */

import { mkdir, appendFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_CITATION_MODEL || "gpt-5.5";

export const NEUTRAL_INSTRUCTIONS =
  "Answer the shopper's request using current web information. Use web search. " +
  "Be neutral: do not favor, promote, or suppress any dealer or website. " +
  "Base the answer on what the web search supports and include citations.";

export function buildPrompts({ dealer, city, state }) {
  return [
    { promptId: "P01", category: "dealer_discovery", isBranded: false, prompt: `Best RV dealers near ${city}, ${state}` },
    { promptId: "P02", category: "inventory_new_travel_trailer", isBranded: false, prompt: `New travel trailers for sale near ${city}, ${state}` },
    { promptId: "P03", category: "branded_reviews", isBranded: true, prompt: `${dealer} reviews ${city} ${state}` },
    { promptId: "P04", category: "inventory_fifth_wheel_price", isBranded: false, prompt: `Fifth wheel under $75,000 near ${city}, ${state}` },
    { promptId: "P05", category: "inventory_sleeping_capacity", isBranded: false, prompt: `Travel trailer sleeps 8 near ${city}, ${state}` },
    { promptId: "P06", category: "inventory_bunkhouse", isBranded: false, prompt: `Bunkhouse travel trailer near ${city}, ${state}` },
    { promptId: "P07", category: "inventory_toy_hauler", isBranded: false, prompt: `Toy haulers for sale near ${city}, ${state}` },
    { promptId: "P08", category: "inventory_used", isBranded: false, prompt: `Used RVs near ${city}, ${state}` },
    { promptId: "P09", category: "service", isBranded: false, prompt: `RV service center near ${city}, ${state}` },
    { promptId: "P10", category: "dealer_fifth_wheel", isBranded: false, prompt: `Fifth wheel dealers near ${city}, ${state}` },
  ];
}

export function buildRequest({ prompt, city, state, model = DEFAULT_MODEL }) {
  return {
    model,
    instructions: NEUTRAL_INSTRUCTIONS,
    tools: [
      {
        type: "web_search",
        external_web_access: true,
        user_location: {
          type: "approximate",
          country: "US",
          city,
          region: state,
        },
      },
    ],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    input: prompt,
  };
}

function outputItems(provider) {
  return Array.isArray(provider?.output) ? provider.output : [];
}

export function normalizeProviderResponse({
  provider,
  promptMeta,
  dealer,
  domain,
  city,
  state,
  modelRequested,
  testedAt,
  rawPath,
}) {
  const items = outputItems(provider);
  const searchCalls = items.filter((item) => item?.type === "web_search_call");
  const messages = items.filter((item) => item?.type === "message");

  const responseTexts = [];
  const citations = [];
  for (const message of messages) {
    for (const content of Array.isArray(message?.content) ? message.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        responseTexts.push(content.text);
      }
      for (const ann of Array.isArray(content?.annotations) ? content.annotations : []) {
        if (ann?.type === "url_citation" && ann.url) {
          citations.push({
            url: ann.url,
            title: ann.title || null,
            startIndex: Number.isInteger(ann.start_index) ? ann.start_index : null,
            endIndex: Number.isInteger(ann.end_index) ? ann.end_index : null,
          });
        }
      }
    }
  }

  const searchQueries = [];
  const sources = [];
  for (const call of searchCalls) {
    const action = call?.action || {};
    for (const q of Array.isArray(action.queries) ? action.queries : []) {
      if (typeof q === "string" && q.trim()) searchQueries.push(q);
    }
    for (const source of Array.isArray(action.sources) ? action.sources : []) {
      if (source?.url) sources.push({ url: source.url, title: source.title || null, type: source.type || null });
    }
  }

  const text = responseTexts.join("\n\n").trim();
  let status = "success";
  if (searchCalls.length === 0) status = "no_search";
  else if (!text) status = "empty_response";

  return {
    schemaVersion: 1,
    runProvider: "openai",
    promptId: promptMeta.promptId,
    category: promptMeta.category,
    prompt: promptMeta.prompt,
    isBranded: promptMeta.isBranded,
    location: { country: "US", city, state },
    targetDealer: dealer,
    targetDomain: domain,
    modelRequested,
    modelReturned: provider?.model || null,
    responseId: provider?.id || null,
    testedAt,
    status,
    responseText: text,
    citations: dedupeByUrl(citations),
    sources: dedupeByUrl(sources),
    searchQueries: [...new Set(searchQueries)],
    rawResponsePath: rawPath,
  };
}

function dedupeByUrl(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = String(row.url || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function csvEscape(value) {
  const s = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function observationsToCsv(observations) {
  const headers = [
    "prompt_id","prompt","category","location","target_dealer","target_domain","is_branded",
    "platform","model","tested_at","status","search_queries","cited_urls","cited_titles",
    "source_urls","response_id","response_excerpt","raw_response_path",
  ];
  const lines = [headers.join(",")];
  for (const o of observations) {
    const values = [
      o.promptId, o.prompt, o.category, `${o.location.city}, ${o.location.state}`,
      o.targetDealer, o.targetDomain, o.isBranded ? "true" : "false", "openai",
      o.modelReturned || o.modelRequested, o.testedAt, o.status,
      o.searchQueries.join(" | "),
      o.citations.map((c) => c.url).join(" | "),
      o.citations.map((c) => c.title || "").join(" | "),
      o.sources.map((s) => s.url).join(" | "),
      o.responseId || "",
      o.responseText.slice(0, 4000),
      o.rawResponsePath,
    ];
    lines.push(values.map(csvEscape).join(","));
  }
  return lines.join("\n") + "\n";
}

export async function runOpenAiCitationTest({
  apiKey,
  dealer,
  domain,
  city,
  state,
  model = DEFAULT_MODEL,
  outDir,
  fetchImpl = fetch,
  now = () => new Date(),
}) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  if (!dealer || !city || !state) throw new Error("--dealer, --city and --state are required");

  const safeDealer = dealer.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dealer";
  const stamp = now().toISOString().replace(/[:.]/g, "-");
  const root = resolve(outDir || join("tools", "ai-visibility-audit", "reports", "citation-openai", `${safeDealer}-${stamp}`));
  const rawDir = join(root, "raw", "openai");
  await mkdir(rawDir, { recursive: true });

  const prompts = buildPrompts({ dealer, city, state });
  const observations = [];

  for (const promptMeta of prompts) {
    const testedAt = now().toISOString();
    const requestBody = buildRequest({ prompt: promptMeta.prompt, city, state, model });
    const rawPath = join(rawDir, `${promptMeta.promptId}.json`);
    const rawMetaPath = join(rawDir, `${promptMeta.promptId}.request.json`);

    await writeFile(rawMetaPath, JSON.stringify({
      promptId: promptMeta.promptId,
      testedAt,
      request: requestBody,
      note: "targetDealer/targetDomain deliberately not sent to the model except where the existing prompt itself is branded",
    }, null, 2));

    let response;
    try {
      response = await fetchImpl(API_URL, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      const observation = {
        schemaVersion: 1, runProvider: "openai", promptId: promptMeta.promptId,
        category: promptMeta.category, prompt: promptMeta.prompt, isBranded: promptMeta.isBranded,
        location: { country: "US", city, state }, targetDealer: dealer, targetDomain: domain || "",
        modelRequested: model, modelReturned: null, responseId: null, testedAt,
        status: "api_error", responseText: "", citations: [], sources: [], searchQueries: [],
        rawResponsePath: rawPath, error: String(error instanceof Error ? error.message : error),
      };
      await writeFile(rawPath, JSON.stringify({ transport_error: observation.error }, null, 2));
      observations.push(observation);
      continue;
    }

    // CRITICAL MAT-39 invariant: archive the exact provider response body first.
    const rawText = await response.text();
    await writeFile(rawPath, rawText);

    let provider;
    try {
      provider = JSON.parse(rawText);
    } catch (error) {
      observations.push({
        schemaVersion: 1, runProvider: "openai", promptId: promptMeta.promptId,
        category: promptMeta.category, prompt: promptMeta.prompt, isBranded: promptMeta.isBranded,
        location: { country: "US", city, state }, targetDealer: dealer, targetDomain: domain || "",
        modelRequested: model, modelReturned: null, responseId: null, testedAt,
        status: "parse_error", responseText: "", citations: [], sources: [], searchQueries: [],
        rawResponsePath: rawPath, httpStatus: response.status,
        error: String(error instanceof Error ? error.message : error),
      });
      continue;
    }

    if (!response.ok) {
      const code = provider?.error?.code || provider?.error?.type || "";
      observations.push({
        schemaVersion: 1, runProvider: "openai", promptId: promptMeta.promptId,
        category: promptMeta.category, prompt: promptMeta.prompt, isBranded: promptMeta.isBranded,
        location: { country: "US", city, state }, targetDealer: dealer, targetDomain: domain || "",
        modelRequested: model, modelReturned: provider?.model || null, responseId: provider?.id || null,
        testedAt, status: response.status === 429 || /rate/i.test(String(code)) ? "rate_limit" : "api_error",
        responseText: "", citations: [], sources: [], searchQueries: [], rawResponsePath: rawPath,
        httpStatus: response.status, error: provider?.error || null,
      });
      continue;
    }

    observations.push(normalizeProviderResponse({
      provider, promptMeta, dealer, domain: domain || "", city, state,
      modelRequested: model, testedAt, rawPath,
    }));
  }

  const jsonlPath = join(root, "observations.openai.jsonl");
  const csvPath = join(root, "observations.openai.csv");
  await writeFile(jsonlPath, observations.map((o) => JSON.stringify(o)).join("\n") + "\n");
  await writeFile(csvPath, observationsToCsv(observations));

  const summary = {
    provider: "openai",
    model,
    dealer,
    domain: domain || "",
    location: { city, state, country: "US" },
    createdAt: now().toISOString(),
    prompts: observations.length,
    statusCounts: Object.fromEntries([...new Set(observations.map((o) => o.status))].map((s) => [s, observations.filter((o) => o.status === s).length])),
    outputDirectory: root,
    observationsJsonl: jsonlPath,
    observationsCsv: csvPath,
    rawDirectory: rawDir,
  };
  await writeFile(join(root, "run-summary.json"), JSON.stringify(summary, null, 2));
  return { summary, observations };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    out[key] = value;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runOpenAiCitationTest({
    apiKey: process.env.OPENAI_API_KEY,
    dealer: args.dealer,
    domain: args.domain || "",
    city: args.city,
    state: args.state,
    model: args.model || DEFAULT_MODEL,
    outDir: args.outdir,
  });
  process.stdout.write(JSON.stringify(result.summary, null, 2) + "\n");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  });
}
