---
name: Outfitter AI rerank quirks
description: Non-obvious failure modes when reranking RV listings with Claude in the outfitter chat route
---

# Outfitter AI rerank quirks

The RV Outfitter matching step asks Claude to pick the top listings and return JSON.
Three non-obvious traps that caused "AI not working" symptoms:

- **Haiku wraps JSON in ```` ```json ```` fences.** `claude-haiku` reliably returns the
  object inside a fenced code block. A bare `JSON.parse(text)` then throws and the code
  silently falls back to deterministic scoring (looks like the AI "isn't working" — recs
  appear but with templated text and uniform scores).
  **How to apply:** always strip fences (extract the first `{`…last `}`) before parsing any
  model JSON, not just haiku.

- **AI can return fewer than 3 valid picks.** It may emit a `listingId` not in the candidate
  set, or post-rerank type/length filtering may drop a pick. Falling back only when
  `ranked.length === 0` breaks the "top 3" contract.
  **How to apply:** backfill missing slots from the deterministic ranking (skip already-selected
  ids) so the response always returns up to 3 unique recommendations.

- **Keep a deterministic scorer as the guaranteed fallback.** A pure-JS scorer that returns
  the full sorted list with non-null whyMatch/matchScore lets you (a) feed the AI a small
  top-N payload and (b) always return valid output fast when the AI is slow/unparsable.

## Debugging request-time behavior on api-server
Per-request `console.log`/`console.error` do **not** appear in the captured workflow log
snapshot (`/tmp/logs/artifactsapi-server_*.log` only shows startup lines).
**Why:** the snapshot is a wrapper status capture, not live stdout streaming.
**How to apply:** to inspect request-time values, temporarily `fs.appendFileSync` to a
`/tmp/*.log` file inside the handler (then revert), or reproduce with a standalone `tsx` script.
