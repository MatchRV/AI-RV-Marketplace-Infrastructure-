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

const filePath = resolve(process.env.LEARNED_FACTS_PATH ?? "data/learned-facts.json");

let store: LearnedStore | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function getLearnedStore(): LearnedStore {
  if (store) return store;
  store = new LearnedStore();
  try {
    if (existsSync(filePath)) {
      store.restore(JSON.parse(readFileSync(filePath, "utf8")));
      const s = store.stats();
      console.log(`[learning] restored memory from ${filePath}: ${s.vehicles} vehicles, ${s.unitFacts} unit facts`);
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
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(getLearnedStore().serialize(), null, 2));
    } catch (err) {
      console.warn("[learning] could not persist memory:", err instanceof Error ? err.message : err);
    }
  }, 400);
}
