# WEBMCP_TEST_RESULTS — recorded runs (2026-08-29)

Two automated layers run green on a fresh clone with zero services, plus a
manual environment matrix. Reproduce with `pnpm test` and `pnpm e2e`
(`pnpm dev` running).

## 1. Unit suite — engine, contracts, snapshot invariants

`pnpm test` → **39/39 passed** (vitest, 636 ms).

Covered: sale-vs-list price selection with provenance; unknown-stays-unknown
(no fabricated fields; `solar: "none"` never inferred from silence);
derived-text and floorplan-code enrichment; junk-feature filtering; rejection
reasons (removed / typeless / implausible price); deterministic boondocking
receipts; geo aliases + messy-address city scanning + haversine sanity; tow
stated-rating margins, configuration-range verdicts (`depends_on_config`),
dry-weight downgrade, `not_towable`, unknown-weight honesty; three-valued
matching with funnel math that always sums; unknowns never exclude / verified
fails always exclude; unknown-place `ConstraintError` with self-correction
hint; radius filtering on real coordinates; sort overrides; bounded +
receipt-consistent scores; soft-preference unknowns reported as unknown;
refine/replace/clear merge semantics; the 10-tool contract surface (names ≤30
chars, descriptions ≤500, param descriptions ≤160, `readOnlyHint` mapping,
`$schema`-free JSON Schema); malformed-agent-input rejection; raw natural
input acceptance; snapshot corpus invariants (unique ids, coords present,
>50% GVWR unknown on real data); flagship query <250 ms; impossible-search
guidance; compact payload budgets; stale-snapshot honesty.

## 2. End-to-end — the real tool executor in a real browser

`pnpm e2e` (Playwright/Chromium against `pnpm dev`) → **16/16 passed**.
This drives `window.__matchrv.executeTool`, i.e. the same handlers
`document.modelContext.registerTool()` registers — assertions cover both the
agent-facing payloads and the visible UI state.

| Test | Expected | Actual | Pass | ms |
| --- | --- | --- | --- | --- |
| load /shop | page renders with tool bridge | 10 tools exposed (search_inventory … submit_dealer_contact) | ✅ | 25457* |
| search_inventory (flagship query) | funnel + verified results, UI grid renders | searched 1,056 → 43 verified; agent payload 2,042 chars | ✅ | 689 |
| refine search (mode=refine) | constraints merge; results update | kept Tacoma/tow/must; applied ≤$35,000 | ✅ | 590 |
| human edits shared state | UI toggle lands in session + ledger | agent's `get_shopping_session` shows the human-added preference + recent human actions | ✅ | 1311 |
| compare_units (top 3) | dialog opens with true values | 3 units, best-in-row markers, unknowns intact | ✅ | 679 |
| explain_match (top 1) | receipts: hard/soft/unknown + score math | score 70, 7/7 hard checks, unknowns incl. solar/lithium | ✅ | 699 |
| evaluate_tow_fit | honest verdicts incl. dry-weight caveat | "marginal — 3,530 lbs dry (GVWR unknown; loaded runs 1,000–1,500+ lbs higher)" | ✅ | 37 |
| check_availability | honest snapshot freshness | stale=true, 2,598 h since verification, dataset note | ✅ | 38 |
| update_shortlist | agent adds 2; hearts appear | 2 entries, ledger logged | ✅ | 34 |
| prepare_dealer_contact | preview modal, awaiting approval | status awaiting_human_approval; message asks dealer to confirm unknowns | ✅ | 622 |
| submit before approval | structured refusal | 409 awaiting_human_approval + guidance | ✅ | 63 |
| human approves in UI | state → approved | Approve click recorded by "You" in ledger | ✅ | 833 |
| submit after approval | receipt + demo delivery note | lead recorded; "demo environment: nothing delivered to the real dealership" | ✅ | 582 |
| duplicate submit blocked | already_submitted refusal | 409, agent told not to repeat | ✅ | 70 |
| malformed args rejected | invalid_arguments with issues | field-level issues listed | ✅ | 28 |
| unknown place self-correction | error + supported-place hint | "Try one of: Tacoma, Seattle, Spokane, …" | ✅ | 81 |

\* first-load includes cold Vite dev transform; the production build serves
warm in <1 s (see DEMO_CHECKLIST: warm the page before recording).

## 3. Server-side latency metrics (`GET /api/agent/meta`, same session)

| op | calls | errors | avg ms | max ms |
| --- | --- | --- | --- | --- |
| search (1,056 units) | 4 | 1† | 15.1 | 29.9 |
| compare | 1 | 0 | 1.0 | 1.0 |
| explain | 1 | 0 | 0.3 | 0.3 |
| tow_fit | 1 | 0 | 0.2 | 0.2 |
| availability | 1 | 0 | 0.2 | 0.2 |
| lead_preview | 1 | 0 | 0.5 | 0.5 |
| lead_submit | 3 | 0 | 1.4 | 4.0 |

† the deliberate unknown-place test — counted as an error, answered with a
self-correction hint.

## 4. Environment matrix

| Environment | Status | Notes |
| --- | --- | --- |
| Chromium (Playwright) via the registered handlers | ✅ 16/16 | Automated above; exercises registration schemas + handlers + UI |
| Normal browser, no agent runtime | ✅ manual | /shop degrades gracefully: "No agent runtime detected" + working guided demo |
| Production single-process build (`node dist/index.cjs`) | ✅ | boots embedded DB, seeds 1,056 units, serves SPA + /api/agent/* |
| ChatGPT desktop in-app browser | ⏳ pending | requires the desktop app on a real machine — run before submission and append: Site-tools indicator, discovery, full script pass |
| Chrome 149+ with `chrome://flags/#enable-webmcp-testing` | ⏳ pending | same machine session; verify `document.modelContext` registration + toolchange |

The two pending rows are the human pre-submission step (DEMO_CHECKLIST §1);
the registration path they exercise is the exact code the automated suite
drives, feature-detected per OpenAI's published pattern
(`typeof document.modelContext?.registerTool === "function"`).
