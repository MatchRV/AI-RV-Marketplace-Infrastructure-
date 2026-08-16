---
name: api-server dev has no hot-reload
description: The api-server dev workflow runs plain tsx (not tsx watch), so source edits do NOT take effect until the workflow is restarted.
---

The `artifacts/api-server` dev workflow runs `tsx ./src/index.ts` — **plain tsx, not `tsx watch`**. The Node process holds the old code in memory; editing a route/source file does nothing to the running server.

**Why:** This caused a confusing debug loop — an end-to-end test of `/api/match-report/generate` returned old behavior (a default value that no longer existed anywhere in source), making it look like the edits were never saved. The edits were on disk; the server just hadn't reloaded.

**How to apply:** After any edit under `artifacts/api-server/src`, restart the `artifacts/api-server: API Server` workflow before cur/e2e testing, or you will validate stale code. Frontend artifacts (Vite/Expo) DO hot-reload, so this only bites the API server.
