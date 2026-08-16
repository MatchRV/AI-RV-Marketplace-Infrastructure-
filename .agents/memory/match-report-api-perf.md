---
name: Match Report API — Performance & URL quirks
description: Fixes for the match report generate endpoint — URL routing bug and Claude timeout
---

## Vite proxy URL rule
All API calls in the rv-marketplace frontend MUST use bare `/api/...` paths (NOT `${BASE_URL}/api/...`).
`BASE_URL` = `/rv-marketplace`, prepending it makes URLs like `/rv-marketplace/api/match-report/generate`
which escape the Vite proxy config (`"/api" → http://localhost:8080`).

**Why:** Vite only proxies paths starting with `/api`, not `/rv-marketplace/api`.

**How to apply:** Any new fetch in rv-marketplace that hits the API server — use `/api/endpoint`, never `${BASE_URL}/api/endpoint` or `${import.meta.env.BASE_URL}api/endpoint`.

## generateCopy() Claude timeout
`generateCopy()` in `match-report.ts` calls Claude to write personalized copy for 3 RV picks.
Without a timeout the call takes 30–45 seconds, which exceeds connection limits.

Fix: `Promise.race([aiCall, 12-second-timeout])` — falls back to static copy template on timeout.
Also reduced `max_tokens` from 2500 → 1200 to help Claude respond faster when it does.

**Why:** Claude `claude-sonnet-4-6` with long prompts + 2500 token budget routinely exceeds 30s.
The Replit reverse proxy / browser connections will drop before that.

**How to apply:** Any new Claude call inside a user-facing HTTP handler should have a
`Promise.race` timeout of ≤15 seconds and use the smallest `max_tokens` that gives acceptable output.

## DB & deal scores
All 5244 listings have `dealScore = "fair_deal"` or `"high_price"` and `dealSavings = 0`.
The `bestValue` tier filter (`great_deal`/`good_deal` OR savings > 1000) never matches →
always falls through to `scored.find(not usedId)` (second-best fit listing). This is fine.
