# JUDGING_MATRIX — scored brutally, updated 2026-08-29

Official Devpost criteria (equally weighted): **WebMCP Leverage · Execution ·
Potential Impact · Creativity & Ambition.** Our internal five-lens spec
(usefulness, originality, execution, thoughtful WebMCP, human-agent
experience) maps onto them; both are scored. Anything below 9 gets an action.

## 1. WebMCP Leverage (internal: thoughtful WebMCP + human-agent experience)

**What judges should notice**
- 10 single-responsibility imperative tools on `document.modelContext`
  (ChatGPT-compatible), Zod contracts compiled to the *same* JSON Schema that
  validates server-side.
- Best-practices fluency: `readOnlyHint`/`untrustedContentHint`, action-verb
  names, raw-input schemas ("F-150 rated 8,000 lbs" passed as-is), compact
  outputs (~1.5–2 KB), descriptive errors agents can self-correct from
  (unknown city → list of supported places), UI state updated after every
  call.
- The session tool (`get_shopping_session`) makes human UI edits
  agent-readable — shared state in both directions.
- Two-phase consequential action enforced server-side, not by model trust.

**Feature proving it:** `lib/agent-core/src/contracts.ts` +
`src/agent/webmcp.ts` + the lead state machine.
**Demo moment:** human clicks a chip → agent's next `refine` already knows;
submit refused until Approve.
**Risk:** judges' agents may phrase tool use differently than rehearsed;
mitigations are the self-correcting errors and the session tool.
**Still needed:** test on the actual ChatGPT desktop build before submission
(container can't run it); record results in WEBMCP_TEST_RESULTS.md.
**Score: 9/10** (10 after a verified ChatGPT desktop pass).

## 2. Execution (internal: execution)

**What judges should notice**
- A complete, coherent product — brand-consistent consumer UI, empty/loading/
  error states, mobile-responsive, not a dev console.
- `pnpm install && pnpm dev` on a fresh clone = the whole setup (embedded
  Postgres bootstraps + seeds itself); one-process production deploy;
  `render.yaml` one-click blueprint.
- 39 unit tests + 16/16-step Playwright E2E through the real tool executor;
  <30 ms searches over 1,056 units; in-process metrics endpoint.

**Feature proving it:** zero-infra boot; the E2E table in
WEBMCP_TEST_RESULTS.md; screenshots.
**Demo moment:** the whole 2:45 flow with nothing faked.
**Risk:** first page load is slow cold (Vite dev) — production build is fast;
demo checklist warms the page. Legacy pages carry known TypeScript debt
(documented, not on the demo path). Dealer image CDNs could theoretically
block hotlinking from the deploy origin — cards degrade to branded
placeholders.
**Still needed:** deploy the live URL and click through it once in ChatGPT's
browser.
**Score: 9/10.**

## 3. Potential Impact (internal: usefulness)

**What judges should notice**
- A real, measured problem: on 28 real dealerships, GVWR machine-readable
  0.7%, fresh water ~1%, battery chemistry ≈0 — this is why AI shopping
  fails today for a $30–150k purchase made by real families.
- The demo runs on *real* inventory with real photos and real gaps; the lead
  flow turns missing data into dealer questions — the actual industry
  workflow.
- Clear business continuation: MatchRV already builds dealer ingestion; live
  feeds slot into the same canonical schema.

**Feature proving it:** provenance-tagged unknowns everywhere; funnel
exclusion counts; the drafted dealer message asking to confirm unknowns.
**Demo moment:** "solar: unknown — the dealer doesn't publish it. Want me to
ask?"
**Risk:** judges outside the US may not feel RV shopping viscerally — the
opening 12 seconds carries the burden with numbers.
**Still needed:** nothing structural.
**Score: 9/10.**

## 4. Creativity & Ambition (internal: originality)

**What judges should notice**
- Not "a site with MCP tools" — a *semantic layer for a fragmented vertical*:
  canonical schema, per-fact provenance, three-valued matching where
  **unverified** is a first-class outcome, floorplan-code decoding, tow
  physics with configuration ranges.
- The honesty system as product: unknown → flagged → becomes the dealer
  question in the human-approved handoff. No other pattern we've seen closes
  that loop.
- Deliberately LLM-free inside the site: the division of labor (agent
  reasons, site computes) is itself the architectural thesis.
- Showcase check (2026-08-29): OpenAI's showcase lists games, creative tools,
  and light shared-cart commerce; no automotive/RV/high-consideration
  marketplace exists there. Expected common entries: to-do apps, form
  fillers, cart demos. This is a different altitude and we say so without
  attacking anyone.

**Feature proving it:** the funnel + receipts + provenance trio.
**Demo moment:** explain panel's ✓/✗/? with score arithmetic on screen.
**Risk:** "RV niche" misread — countered by the closing generalization line.
**Score: 9/10.**

## Why would a judge NOT pick this? (attacked)

1. *"Snapshot, not live data."* → Labeled honestly everywhere, including in
   `check_availability`; the architecture point (feeds → same schema) is one
   sentence in the demo; freshness metadata is real.
2. *"Poulsbo RV dominates results."* → True of the real market snapshot
   (multi-branch dealer); "2 in stock" collapsing + branch cities keep it
   legible; honest beats curated.
3. *"The agent could do this with browsing."* → The 0.7% GVWR stat, the
   shared session, and the server-enforced approval gate are all things
   browsing cannot provide; the demo says it without attacking browser
   agents.
4. *"Is the WebMCP usage deep or decorative?"* → One schema source of truth,
   session bidirectionality, annotations, output budgets, self-correction
   design — the code reads like the best-practices page implemented.
5. *"Will it run for me?"* → Three paths (ChatGPT browser, flagged Chrome,
   guided demo) + zero-infra clone + tests. The live URL is the remaining
   must-do.

## Bottom line

| Criterion | Score | Blocking action before submission |
| --- | --- | --- |
| WebMCP Leverage | 9 | Verify on real ChatGPT desktop; log results |
| Execution | 9 | Deploy live URL; warm + click through |
| Potential Impact | 9 | — |
| Creativity & Ambition | 9 | — |

Remaining human steps: deploy (≈10 min via render.yaml), record the video
(script + checklist ready), make the repo public, submit before Sep 3,
1:00 PM PT.
