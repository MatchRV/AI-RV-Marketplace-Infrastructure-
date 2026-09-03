# WEBMCP_TEST_RESULTS — recorded runs (updated 2026-09-03, real-agent pass)

Six verification layers. Every result in §1–§7 was executed in this
repository's environment. §8 is the one layer this container cannot produce
— a real agent driving the live site from natural language — run by a human
on 2026-09-03 and re-checked here, figure by figure, against the live API. Toolchain: Node v22.22.2, pnpm 10.33.0.

Reproduce:

```bash
pnpm install          # no warnings, no interactive prompts
pnpm test             # 53 unit tests across three packages
pnpm dev              # embedded DB, zero services
pnpm e2e              # 23-step browser E2E (internal executor)
pnpm --filter @workspace/scripts run native-webmcp   # NATIVE runtime (needs Chrome ≥149, see §3)
pnpm --filter @workspace/scripts run demo-case       # the judge's demo conversation, natively (§4)
```

`pnpm -r --if-present run typecheck` is clean across **every** workspace
package (agent slice and legacy marketplace/mobile packages alike).

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
| **reload → clean fresh session** (state is per-page-load by design, see §6) | ✅ |
| malformed args → field-level issues; unknown place → supported-place hint | ✅ |

## 3. NATIVE WebMCP runtime — 6/6 passed (real Chrome, real `document.modelContext`)

**Browser:** Chrome for Testing **152.0.7977.64** (linux64) with
`--enable-features=WebMCPTesting` (the flag behind
`chrome://flags/#enable-webmcp-testing`). This is the browser's own WebMCP
implementation — not the page's internal executor: discovery via
`document.modelContext.getTools()`, invocation via
`document.modelContext.executeTool()`. Verified against `pnpm dev` and
against the production bundle. Evidence: `docs/screenshots/native-0*.png`,
~70 s of raw footage of the same flow at `docs/demo/native-webmcp-run.webm`,
run log 2026-08-29T02:12Z. Reproduce in two commands on any machine:
`pnpm --filter @workspace/scripts run fetch-chrome` (downloads an official
Chrome for Testing build into gitignored `.chrome/`) then
`pnpm --filter @workspace/scripts run native-webmcp` (or set `NATIVE_CHROME`
to any Chrome ≥149 binary).

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

## 4. The exact demo conversation — 12/12 passed (native runtime)

`scripts/src/demo-case.ts` walks the demo script's conversation *verbatim*
through the browser's own `document.modelContext` (same Chrome 152 + flag as
§3) and asserts the three pillars at every turn. Run log
2026-08-29T14:34Z; screenshots `docs/screenshots/pillar-*.png`.

| # | Turn | Verified |
| --- | --- | --- |
| 1 | runtime | 10 tools discovered natively |
| 2 | *"…bunkhouse travel trailer under $45k, under 30 ft, within 150 mi of Tacoma, F-150, we boondock, solar+lithium, two entry doors"* | funnel 1,056 → 43 verified · 129 unverified · 884 excluded (sums exactly); verified listed first |
| 3 | (same turn, UI) | rail separates **Hard requirements — must pass** / **Preferences — affect ranking only**; every chip removable by hand |
| 4 | (same turn, honesty) | **Assumptions & unknowns**: F-150 config unknown → ratings span 5,000–13,500 lbs, filter only above the top rating, per-unit verdicts say "depends on config"; the tool result carries `askShopper` follow-ups (which engine, Max Trailer Tow package, door-sticker rating) so the agent narrows the range instead of guessing |
| 5 | *"Actually, I'll go to $50k if I can get lithium and two doors."* | refine recomputes over all 1,056 (price → $50k; lithium + 2 doors promoted to hard) |
| 6 | (zero-verified honesty) | **0 verified** stated plainly — "No unit satisfies every hard requirement." banner + data-gap candidates offered; nothing fabricated |
| 7 | (ranking) | among unverified, fewest unknown hard checks rank first; agent list = page list (identical top 3) |
| 8 | *"Compare the best three."* | side-by-side of true values; unpublished cells say **Unknown**; "never fills gaps with guesses" pledge on-screen |
| 9 | *"Why is #1 better for me than #2?"* | #1 68 vs #2 67 with ✓/△/? receipts, additive score math, and a **Freshness** row (status + last-verified date + snapshot caveat) in the Why panel |
| 10 | *"Contact the dealer about #1."* | preview card with **NOT SENT — review before submitting** banner, full payload + consent line; approval token absent from every tool result |
| 11 | (adversarial) | agent submit → refused with guidance; **forged-token HTTP approve → 403**; second submit still refused |
| 12 | *"Send it."* (after human Approve) | receipt: ✓ Lead sent / Dealer / Unit / Time / Reference #; duplicate submit blocked; delivery line says nothing reaches a real dealership |

## 5. Production deployment behavior (single process, clean state)

- `pnpm build:web` and `pnpm build:api` run with **zero env vars**.
- `node artifacts/api-server/dist/index.cjs` from empty state: embedded DB
  bootstraps + seeds 1,056 listings in ~5 s, then serves API + SPA.
- **Memory (measured, after a real deploy OOM):** importing the snapshot into
  PGlite — a WASM Postgres — peaks at **715 MB**, while merely *opening* an
  already-seeded database peaks at **359 MB**. Smaller insert batches make it
  worse (776 MB at 50 rows, 728 MB at 10), because the WASM arena grows with
  total work and never returns it; a Node heap cap does nothing, since the
  memory is outside the JS heap. `render.yaml` therefore seeds during the
  **build** (larger machine) and ships the populated data directory, so the
  instance never runs the import. Verified end to end from a clean clone:
  build seeds, boot skips seeding (0 seed lines), and `/api/healthz`,
  `/shop`, `/api/agent/meta` and `/api/agent/search` all answer.
- **A 512 MB instance still could not open PGlite, and local RSS did not
  predict that.** With the import moved to build time, a Starter (512 MB)
  instance was *still* OOM-killed during PGlite initialization, ~20 s in,
  before binding a port — even though the same code peaks at 359 MB RSS
  locally. Render enforces a cgroup limit that also counts page cache and
  mapped WASM arenas, which process RSS does not report. Treat
  locally-measured RSS as a floor, not a budget.
- **The deployed demo therefore runs with no database at all** (`DISABLE_DB=1`,
  set in `render.yaml`). Every WebMCP tool reads the in-memory inventory
  snapshot, so nothing the agent layer does needs one; lead submission falls
  back to its in-memory receipt path, which was already implemented. PGlite is
  now imported dynamically, so its WASM never loads in this mode. **Peak
  112 MB** (from 359 MB), and the 12-step demo conversation passes **12/12**
  against a no-database server, lead flow included. The classic marketplace
  endpoints answer an explicit `503 database_disabled` rather than a generic
  500. Local `pnpm dev` is unchanged — it still runs the embedded database and
  serves those pages normally.
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

## 6. Session/state model (verified, documented — not overclaimed)

The shared shopping session is **in-memory, per page load**. It survives SPA
navigation between routes; a browser reload intentionally starts a fresh
session (verified in §2) and tools re-register cleanly. Nothing is persisted
server-side except staged lead previews (30-min TTL) and submitted lead rows.
`localStorage`/session persistence is deliberately not claimed.

## 7. The live deployment — 12/12 against the public URL

**https://matchrv-webmcp.onrender.com** (Render, `starter` 512 MB, no
database). Verified 2026-09-01:

| Check | Result |
| --- | --- |
| The full 12-step demo conversation (§4) re-run against the **deployed** site through Chrome 152's own `document.modelContext` | **12/12** |
| `/api/healthz` · `/api/agent/meta` | 200; 1,056 units / 28 dealers |
| `/shop`, refresh, `/listing/123`, `/` (SPA deep links) | 200 in 0.20–0.59 s |
| `search_inventory` round-trip over the public internet | 0.25–0.42 s |
| Served JS scanned for key material | none |
| Classic marketplace endpoints (no database in this deployment) | explicit `503 database_disabled` |

Note on method: this container's egress runs through a TLS-intercepting proxy
whose CA the test browser does not trust, so Chromium could not reach the
public URL directly. The run above went through a local plain-HTTP front door
that forwards to the real origin with upstream TLS **fully verified** against
the proxy CA bundle — the bytes exercised are the deployed ones; no
certificate checking was disabled.

## 8. A real agent, from natural language, against the live site — 2026-09-03

This was the one layer this container cannot produce: an LLM agent
*choosing and phrasing* the tool calls itself — not the scripted demo-case
of §4 — against https://matchrv-webmcp.onrender.com/shop. Jonathan ran it on
2026-09-03 and relayed the agent's own end-of-run summary; every figure
below was then re-checked from this repository against the live
`/api/agent` endpoints the tools call. (Agent app and version, and the
screenshots, are not yet on file — pending from Jonathan.)

| What the agent did | Agent's report | Re-checked against live |
| --- | --- | --- |
| Search, in its own phrasing | 1,056 searched → **68 verified · 130 unverified** | Reproduced exactly: Tacoma/150 mi, ≤ $45k, travel trailer, ≤ 30 ft, bunkhouse hard, solar/lithium/two doors preferred, boondocking — with **no tow vehicle in the search call**, consistent with the agent evaluating the F-150 in a separate `evaluate_tow_fit` call (which the surface allows). 68 + 130 + 858 excluded = 1,056. |
| Top result | 2026 Dutchmen Kodiak 130BHS — $15,994, 15.11 ft, 2,300 lbs dry, sleeps 4, 10 mi from Tacoma | All five values match the snapshot (Poulsbo RV, Sumner WA; dealer sale price vs. $22,079 list). |
| Trust | hard constraints pass; solar, lithium, GVWR, tanks and boondocking readiness stay **unknown** | `hardStatus: pass`; `unknownFields` = solar, lithium, two_entry_doors, boondocking inputs; GVWR null. Nothing guessed. |
| Explain | the 70% score "exposed its arithmetic and sources" | base 50 + $29,006 under budget 6 + 10 mi away 9 + 2026 model year 5 = **70**; zero preference points. |
| Freshness | listing says "available" yet is flagged **stale** — last verified May 12, 2026; page says demo snapshot, not live inventory | `check_availability`: status available, `lastVerified` 2026-05-12 (2,736 h), `stale: true`, dataset note present. |
| Tow, bare "Ford F-150" | configuration follow-up questions and a **marginal** verdict instead of a compatibility claim | range 5,000–13,500 lbs; `askShopper` = engine · Max Trailer Tow package · door-sticker rating; Kodiak verdict `marginal` (2,300 lbs dry, GVWR unknown → downgraded). |
| Compare | three units side by side, unknown cells preserved | as reported (the compare rendering is asserted in §2 and §4). |
| Contact | preview staged for qa@example.com, `awaiting_human_approval`, **nothing sent**; the agent stopped at the dialog because approving "would authorize dealer contact" | as reported — exactly the intended boundary. It could not have approved anyway: the token never enters a tool result (§1–§3). |

**Finding raised by the agent (recorded, not yet fixed):** a unit can
headline at 70 from price, distance and model year alone while *every*
off-grid preference is unknown. The receipts and the unknown list disclose
this honestly, but a shopper may read the headline number as stronger
evidence than it is. Proposed fix (ROADMAP P1): show preference coverage
beside the score — "0 of 4 preferences confirmed" — and label the headline
when coverage is zero. Not shipped before the deadline: no unreviewed
scoring change goes to the judged URL.

### Reproduce it yourself (~15 minutes)

1. Open https://matchrv-webmcp.onrender.com/shop in a WebMCP-capable agent
   surface — e.g. the ChatGPT desktop app's in-app browser, where the
   **Site tools** indicator should list 10 MatchRV tools — or in Chrome 149+
   with `chrome://flags/#enable-webmcp-testing`.
2. Paste the main demo prompt (DEMO_CHECKLIST §Prompts). The page fills with
   results while the agent answers.
3. Click the **2 entry doors** chip, then ask *"what are my current
   requirements?"* — the agent should mention two entry doors.
4. Ask it to contact the dealer about the top unit (demo name/email). The
   approval card appears, the agent reports it is waiting, and only after
   **Approve & allow send** does it get a receipt.

**Status: implementation complete; native-runtime verified (§3, §4); live
deployment verified (§7); real-agent pass recorded (§8).**

## Addendum — 2026-09-01 21:40 UTC, final pre-submission pass

- Live deployment re-verified natively: the 12-step demo conversation ran
  through Chrome for Testing 152's own `document.modelContext` against
  https://matchrv-webmcp.onrender.com and passed **12/12** (tunnel method as
  in §7; TLS verified end to end).
- Demo-mode landing shipped: on the database-free host `/` now redirects to
  `/shop`, the header carries only Agent Shop, and footer links to disabled
  pages are hidden. A judge opening the root URL lands on the WebMCP
  experience rather than a marketplace homepage whose data calls 503.
- Dealer photo rot measured on a 40-unit sample: ~45% of listing image URLs
  still resolve; the rest return 404/410/415 from the dealers' CDNs. The
  unit drawer previously rendered a broken image in that case; both card and
  drawer now walk the image list and fall back to a labeled tile.
- Submission video recorded from the real product through the native runtime
  (`scripts/src/record-demo.ts`): `docs/demo/matchrv-demo.mp4`, 2:08,
  1080p, captions burned in; narration script in `docs/demo/NARRATION.md`.

