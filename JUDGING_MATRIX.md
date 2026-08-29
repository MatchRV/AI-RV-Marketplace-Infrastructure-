# JUDGING_MATRIX — rescored after the three-pillars hardening round (2026-08-29)

Official Devpost criteria (equally weighted): **WebMCP Leverage · Execution ·
Potential Impact · Creativity & Ambition.** Scores reflect *verified
execution only* — nothing is credited for documents or intentions. Evidence
pointers reference WEBMCP_TEST_RESULTS.md (WTR).

## 1. WebMCP Leverage — **9/10**

**Verified**
- All ten tools **discovered and executed through a real Chrome's own
  `document.modelContext`** (Chrome for Testing 152, WebMCP feature):
  `getTools()` returns the full surface with schemas + annotations;
  `executeTool()` drives search → bidirectional shared-state sync →
  compare/explain → the human-gated contact. 6/6 automated steps, on dev and
  on the production bundle (WTR §3, `native-0*.png`) — plus the judge's demo
  conversation verbatim, 12/12 natively (WTR §4, `pillar-*.png`).
- Registration verified against a mocked current-shape runtime too: ten
  tools exactly once, idempotent remount, `$schema`-free JSON Schemas,
  `readOnlyHint`/`untrustedContentHint`, no approval capability reachable
  (WTR §1).
- Best-practices fluency in behavior, not prose: raw-input schemas,
  ~1.5–2 KB outputs, field-level self-correction errors, UI updated after
  every call, session tool for human-edit readback.

**Why not 10:** a real agent *choosing and phrasing* these calls from
natural language (ChatGPT desktop) is still unverified — the one evidence
tier this environment cannot produce. Manual procedure ready (WTR §6).

## 2. Execution — **8/10**

**Verified**
- Fresh-clone reproducibility, actually run: `pnpm install` (no warnings, no
  prompts) → 53 unit tests → builds with **zero env vars** → clean-state
  production boot (single process: API + SPA + embedded DB, seeds 1,056
  units in ~5 s) → deep-link/refresh 200s → 23-step E2E green against the
  production bundle → `git status` clean after the full cycle (WTR §2, §4).
- The 41 MB of accidentally committed database runtime state is purged, its
  root cause fixed, and `.data/` ignored everywhere; committed secrets and
  personal values stripped from the tree.
- Search 14.9 ms avg over 1,056 units; warm page HTML 2.6 ms; complete
  product UI with loading/empty/error states, mobile layout, honest
  labeling.

**Why not higher:** no public HTTPS deployment yet (hosting access is
outside this environment) — and "a working live app" is a submission
requirement. That single gap is the distance to 10: the codebase itself now
typechecks clean across every workspace package (the legacy marketplace/mobile
type debt was paid down in this round, not just documented).

## 3. Potential Impact — **9/10**

Unchanged and still verified: the measured fragmentation numbers on 28 real
dealerships (GVWR machine-readable <1%), a real five-figure purchase
workflow, honest unknowns that convert into dealer questions inside the
human-approved handoff, and a canonical schema that live feeds slot into.
**Why not 10:** impact claims beyond the demo footprint (live feeds,
national coverage) are roadmap, not product, and are labeled as such.

## 4. Creativity & Ambition — **9/10**

Unchanged: vertical commerce as a semantic capability layer — per-fact
provenance, three-valued matching with *unverified* as a first-class
outcome, floorplan-code decoding, configuration-range tow honesty, an
LLM-free deterministic site under an agent-reasoning layer. Showcase check
(2026-08-29) still shows no comparable high-consideration marketplace entry.
**Why not 10:** the concept's novelty ultimately gets judged against a field
we can't fully see until submissions close.

## The three pillars (SEARCH · TRUST · ACTION) — self-audit after hardening

Scored against the product bar ("dramatically better than an agent scraping
websites"), each verified by the 12-step native demo-case suite (WTR §4):

| Pillar | Score | Evidence |
| --- | --- | --- |
| **SEARCH** — messy intent → inspectable, refinable constraints | **9/10** | One sentence with seven mixed requirements compiles to labeled **Hard / Preferences / Assumptions & unknowns** groups, every chip human-removable; refinement recomputes the full 1,056-unit funnel (43→0 verified honestly stated); tow ambiguity surfaces its own range and asks for the door-sticker number instead of guessing. |
| **TRUST** — every claim has receipts | **9/10** | Per-check ✓/△/? with actual values, additive score math, per-fact source tags, freshness row (status + last-verified + snapshot caveat) in the Why panel; unknowns never rendered as no; zero-verified states say so in words; unverified ranking is fewest-data-gaps-first with agent/page parity. |
| **ACTION** — write path a human can trust | **9/10** | NOT SENT banner until the human clicks Approve; agent submit refused with guidance; forged-token HTTP approve → 403; immutable reviewed payload; exact ✓ Lead sent / Dealer / Unit / Time / Reference receipt; duplicates blocked; delivery line never claims a real dealership was contacted. |

Why none is a 10: the last point in each pillar belongs to the live
agent-phrasing pass (WTR §7) — an agent's own wording driving these flows on
the deployed site.

## "Why would a judge NOT pick this?" — updated after remediation

1. *"The PR was full of database junk."* → Purged (1,096 files), root cause
   fixed, diff is now source + seed snapshot + intentional screenshots only.
2. *"Does it really work in WebMCP, or just in its own test rig?"* → Real
   Chrome's `document.modelContext` discovered and executed everything
   (WTR §3). Remaining: ChatGPT-agent phrasing, honestly tracked.
3. *"Can the agent approve its own dealer contact?"* → No: single-use
   page-held token, server-enforced; forged/missing/replay/expiry all
   tested. Payload immutability tested.
4. *"Will it run for me?"* → One command, zero env vars, verified from clean
   state; three review paths (ChatGPT browser, flagged Chrome, guided demo).
5. *"Snapshot, not live."* → Labeled everywhere it matters, including in
   `check_availability` responses.

## Bottom line

| Criterion | Score | Blocking action |
| --- | --- | --- |
| WebMCP Leverage | 9 | ChatGPT-desktop agent pass (manual procedure ready) |
| Execution | 8 | Public HTTPS deploy (render.yaml, ≈10 min) |
| Potential Impact | 9 | — |
| Creativity & Ambition | 9 | — |

**Submission status: blocked** until the live deploy exists and the
ChatGPT-agent pass is done and evidenced — then rescore Execution.
