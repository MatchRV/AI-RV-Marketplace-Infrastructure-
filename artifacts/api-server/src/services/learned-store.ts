/**
 * Persistent Outfitter memory for the API server.
 *
 * Wraps the pure LearnedStore (agent-core) with JSON-file persistence.
 * Path: LEARNED_FACTS_PATH env, else ./data/learned-facts.json. On hosts
 * with an ephemeral filesystem (e.g. Render without a persistent disk)
 * memory survives for the life of the process and across requests, but
 * NOT across redeploys — mount a persistent disk (or set
 * LEARNED_FACTS_PATH onto one) to make learning survive deploys.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { LearnedStore } from "@workspace/agent-core";

const primaryPath = resolve(process.env.LEARNED_FACTS_PATH ?? "data/learned-facts.json");
const fallbackPath = resolve("data/learned-facts.json");
let filePath = primaryPath;

let store: LearnedStore | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function getLearnedStore(): LearnedStore {
  if (store) return store;
  store = new LearnedStore();
  try {
    const loadFrom = existsSync(primaryPath) ? primaryPath : existsSync(fallbackPath) ? fallbackPath : null;
    if (loadFrom) {
      filePath = loadFrom;
      store.restore(JSON.parse(readFileSync(loadFrom, "utf8")));
      const s = store.stats();
      console.log(`[learning] restored memory from ${loadFrom}: ${s.vehicles} vehicles, ${s.unitFacts} unit facts`);
    }
  } catch (err) {
    console.warn("[learning] could not restore memory file; starting fresh:", err instanceof Error ? err.message : err);
  }
  return store;
}

export function persistLearnedSoon(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const payload = JSON.stringify(getLearnedStore().serialize(), null, 2);
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, payload);
    } catch (err) {
      // Durable mount unavailable (e.g. disk not provisioned yet): fall back
      // to the working directory so learning at least survives the process.
      try {
        mkdirSync(dirname(fallbackPath), { recursive: true });
        writeFileSync(fallbackPath, payload);
        filePath = fallbackPath;
        console.warn("[learning] primary path unavailable; persisted to fallback:", fallbackPath);
      } catch (err2) {
        console.warn("[learning] could not persist memory:", err2 instanceof Error ? err2.message : err2);
      }
    }
  }, 400);
}
