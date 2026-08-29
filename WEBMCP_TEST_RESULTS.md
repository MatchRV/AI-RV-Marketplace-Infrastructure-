# WEBMCP_TEST_RESULTS — recorded runs (updated 2026-08-29, remediation round)

Four verification layers. Every result below was actually executed in this
repository's environment; the one thing that remains untested is called out
honestly at the end. Toolchain: Node v22.22.2, pnpm 10.33.0.

Reproduce:

```bash
pnpm install          # no warnings, no interactive prompts
pnpm test             # 53 unit tests across three packages
pnpm dev              # embedded DB, zero services
pnpm e2e              # 23-step browser E2E (internal executor)
pnpm --filter @workspace/scripts run native-webmcp   # NATIVE runtime (needs Chrome ≥149, see §3)
```

## 1. Unit suites — 53/53 passed

| Package | Tests | Focus |
| --- | --- | --- |
| `@workspace/agent-core` | 39 | Normalization honesty (unknown stays unknown, provenance, floorplan decoding, junk filtering), three-valued matching + funnel math, tow verdicts incl. `depends_on_config` + dry-weight downgrade, geo, merge semantics, tool-contract shape/limits, malformed-input rejection, snapshot invariants, compact payload budgets, stale-snapshot honesty |
| `@workspace/api-server` | 8 | The approval boundary where it's enforced: token never inside preview payloads; forged/missing/replayed/cross-preview tokens refused with status unchanged; submit blocked before approval and after rejection; expiry (410); **submitted payload byte-identical to the reviewed preview**; duplicate (unit+email) prevention; clean throwaway-PGlite bootstrap writing a real lead row |
| `@workspace/rv-marketplace` | 6 | Registration against a **mocked current-shape `document.modelContext`**: all ten tools registered exactly once, idempotent on remount, valid `$schema`-free JSON Schemas + annotations handed to the runtime, **no approval capability or token reachable from the tool surface**, malformed args rejected before any network call |

## 2. Browser E2E (internal executor) — 23/23 passed

Playwright/Chromium driving the same handlers `registerTool` wires up, via the
page's test bridge — asserting both agent-facing payloads and visible UI
state. Run twice: against `pnpm dev` and against the **production bundle**
(`node artifacts/api-server/dist/index.cjs` from a clean checkout state) —
23/23 both times.

| Step | Result |
| --- | --- |
| load /shop (10 tools bridged) | ✅ |
| flagship search — 1,056 searched → 43 verified, funnel reasons, agent payload 2,042 chars | ✅ |
| refine merges constraints (mode=refine) | ✅ |
| human UI toggle visible to `get_shopping_session` | ✅ |
| compare (true values, best markers) / explain (receipts, score math) | ✅ |
| tow fit with dry-weight caveat / availability stale-flag honesty | ✅ |
| shortlist sync | ✅ |
| prepare → awaiting_human_approval | ✅ |
| submit before approval → 409 refusal | ✅ |
| **approval without token → 403, status unchanged** | ✅ |
| **approval with forged token → 403, status unchanged** | ✅ |
| human Approve in UI → submit → receipt (demo delivery note) | ✅ |
| duplicate submit → 409 | ✅ |
| **submitted message byte-identical to the reviewed preview** | ✅ |
| **decision replay after submission → 409 already_decided** | ✅ |
| genuine zero-result search → recovery guidance + visible empty state | ✅ |
| **reload → clean fresh session** (state is per-page-load by design, see §5) | ✅ |
| malformed args → field-level issues; unknown place → supported-place hint | ✅ |

## 3. NATIVE WebMCP runtime — 6/6 passed (real Chrome, real `document.modelContext`)

**Browser:** Chrome for Testing **152.0.7977.64** (linux64) with
`--enable-features=WebMCPTesting` (the flag behind
`chrome://flags/#enable-webmcp-testing`). This is the browser's own WebMCP
implementation — not the page's internal executor: discovery via
`document.modelContext.getTools()`, invocation via
`document.modelContext.executeTool()`. Verified against `pnpm dev` and
against the production bundle. Evidence: `docs/screenshots/native-0*.png`,
run log 2026-08-29T02:12Z; rerun with
`pnpm --filter @workspace/scripts run native-webmcp` (set `NATIVE_CHROME` to
any Chrome ≥149 binary).

| Step | Result |
| --- | --- |
| `document.modelContext` present with registerTool/getTools/executeTool; `navigator.modelContext` absent — matches the current documented API surface | ✅ |
| **Native discovery: getTools() returns all 10 MatchRV tools**, each with inputSchema + annotations (browser returns them alphabetically, per spec) | ✅ |
| **Native `executeTool('search_inventory')`** → 1,056 searched / 43 verified; page grid renders (agent→UI sync) | ✅ |
| Human UI toggle → native `get_shopping_session` call reflects it (human→agent sync) | ✅ |
| Native compare (3 units) + explain (score 72, verdict pass) | ✅ |
| Native two-phase contact: prepare → early submit refused → **no approval token in any native tool result** → human Approve click → submit → lead receipt | ✅ |

Flag-matrix probe (same browser): `document.modelContext` is absent with no
flags (origin-trial gated) and present under `--enable-features=WebMCPTesting`,
`--enable-features=WebMCP`, `--enable-blink-features=WebMCP`, and
`--enable-experimental-web-platform-features`.

## 4. Production deployment behavior (single process, clean state)

- `pnpm build:web` and `pnpm build:api` run with **zero env vars**.
- `node artifacts/api-server/dist/index.cjs` from empty state: embedded DB
  bootstraps + seeds 1,056 listings in ~5 s, then serves API + SPA.
- Deep links: `/shop` → 200 in 12 ms (cold), refresh and `/listing/123` → 200
  (SPA fallback). `/api/healthz` → ok.
- Warm loads: `/shop` HTML 2.6 ms; main JS bundle 1.7 MB.
- Server-side tool latencies over the combined suites: search avg **14.9 ms**
  / max 31.9 ms across 1,056 units; every other op ≤ 4 ms. (The one recorded
  "error" is the deliberate unknown-place test, answered with a hint.)
- `git status` stays clean after install → build → run → test (runtime DB
  state lives in gitignored `lib/db/.data/`).
- Secret scan of built artifacts + tracked tree: no key material (bundle
  "AKIA…" hits are case-insensitive false positives inside the model-viewer
  library; verified not AWS-shaped).

## 5. Session/state model (verified, documented — not overclaimed)

The shared shopping session is **in-memory, per page load**. It survives SPA
navigation between routes; a browser reload intentionally starts a fresh
session (verified in §2) and tools re-register cleanly. Nothing is persisted
server-side except staged lead previews (30-min TTL) and submitted lead rows.
`localStorage`/session persistence is deliberately not claimed.

## 6. What remains genuinely untested (submission-blocking until done)

1. **A real agent choosing and phrasing the tool calls itself** — i.e. the
   ChatGPT desktop app's in-app browser (or another WebMCP-capable agent
   surface) driving these tools from natural language. This container has no
   ChatGPT desktop app. The native browser layer (§3) proves
   registration/discovery/execution through the real `document.modelContext`;
   agent behavior on top of it is not fabricated here.
2. **The public HTTPS deployment** — no hosting credentials in this
   environment. Everything §4 verifies is the exact artifact `render.yaml`
   deploys.

### Manual verification procedure (Jonathan, ~15 minutes, after deploy)

1. Deploy via `render.yaml` (or any Node host: `pnpm install && pnpm build:web
   && pnpm build:api && node artifacts/api-server/dist/index.cjs`). Confirm
   `https://<url>/api/healthz` and that `https://<url>/shop` refreshes cleanly.
2. ChatGPT **desktop app** → open `https://<url>/shop` in the in-app browser.
   Confirm the **Site tools** indicator lists 10 MatchRV tools →
   *screenshot 1*.
3. Paste the main demo prompt (DEMO_CHECKLIST §Prompts). Confirm the page
   fills with results while the agent answers → *screenshot 2*.
4. Click the **2 entry doors** chip, then ask: *"what are my current
   requirements?"* — the agent should mention two entry doors → *screenshot 3*.
5. Ask it to contact the dealer about the top unit (use a demo name/email).
   Confirm the approval card appears, the agent reports it is waiting for
   approval, and only after you click **Approve & allow send** does it get a
   receipt → *screenshots 4–5*.
6. Send me the four–five screenshots + the URL + ChatGPT app version; I'll
   fold them into this file and unblock the submission status.

**Status: implementation is complete and native-runtime verified, but
submission readiness remains blocked pending the live HTTPS deploy and the
ChatGPT-agent pass above.**
