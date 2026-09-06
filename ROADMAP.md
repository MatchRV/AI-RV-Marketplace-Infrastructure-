# ROADMAP — priorities against the challenge deadline (Sep 3, 1:00 PM PT)

## P0 — required to demonstrate the thesis · ✅ all done
- [x] Canonical schema + provenance + honest unknowns (`lib/agent-core`)
- [x] Deterministic three-valued matching engine + funnel + score receipts
- [x] Real-data snapshot (1,056 units / 28 dealers) with quality report
- [x] 10 WebMCP tools registered on `document.modelContext`, Zod→JSON-Schema
      single source of truth, server-enforced
- [x] Shared shopping session UI (/shop): chips, ledger, funnel, shortlist,
      compare, provenance, approval modal
- [x] Two-phase human-gated lead flow with dedupe + structured refusals
- [x] Zero-infrastructure boot (embedded PGlite) + single-process prod build
- [x] Test suite: 39 unit tests + 16-step Playwright E2E (all green)
- [x] Submission docs (README, DEVPOST, JUDGING_MATRIX, DEMO_*, SECURITY,
      CHALLENGE_NOTES, WEBMCP_TEST_RESULTS)

## P0 — remediation round (independent review), all verified · ✅ done
- [x] Purge 41 MB / 1,096 committed database runtime files; fix data-dir
      root cause; `.data/` ignored everywhere; clean `git status` after runs
- [x] Fresh-clone reproducibility: no-env builds, engines + pinned pnpm,
      documented install-script allowlist, `.env.example`
- [x] Approval boundary: single-use page-held token, server-enforced;
      immutability, replay, expiry, forged/missing-token refusals — tested
- [x] NATIVE WebMCP runtime verification (real Chrome 152
      `document.modelContext`): discovery + execution, 6/6
- [x] Test expansion: 53 unit + 23-step E2E (green on dev AND the production
      bundle) + native suite
- [x] Secrets/personal values stripped from the tree (the exposed Google
      Places key was deleted 2026-09-03; the value in history is inert)

## P0 — remaining, needs a human (Jonathan)
- [x] **Google Places API key deleted** in Google Cloud Console (2026-09-03)
      — the value in git history is inert. It was optional anyway (legacy
      /browse autocomplete only, which degrades gracefully; the WebMCP demo
      uses no Google services)
- [x] Deploy the live URL — https://matchrv-webmcp.onrender.com (render.yaml)
- [x] Real-agent pass from natural language against the live URL — done
      2026-09-03 in OpenAI Codex, recorded in WEBMCP_TEST_RESULTS.md §8
      (screenshots not on file)
- [ ] Record the <3 min video (DEMO_SCRIPT.md) and publish on YouTube
- [ ] Make the repo public; re-add Replit secrets (values were stripped from
      .replit); submit on Devpost before the deadline

## P1 — meaningfully raises judge score (only after P0)
- [ ] Score headline vs. evidence (found by the real-agent pass, WTR §8):
      show "N of M preferences confirmed" beside the match score and label
      the headline when coverage is zero — a 70 built only from price,
      distance and model year currently reads stronger than it is
- [ ] Warm-start/optimize first paint on the deploy (preload fonts,
      code-split legacy routes out of the 1.7 MB main chunk)
- [ ] Slim the deploy: `public/rv-images` (187 MB) is referenced only by a
      seeding script, not the app — but relocating it now would be a
      1,300-file rename storm in the challenge PR, and production-Postgres
      rows seeded by that script may reference `/rv-images/*` URLs. Post-
      challenge: move it out of `public/` and serve via `express.static`
- [ ] Origin-trial token for WebMCP so unflagged Chrome works on the live
      origin
- [ ] Mobile pass on /shop overlays (usable today; polish the compare table)
- [ ] Metrics panel surfacing `/api/agent/meta` latency counters in the UI

## P2 — nice to have
- [ ] Seed legacy browse/home pages' remaining gaps in embedded mode (deal
      badges hidden rather than faked)
- [ ] Dealer-facing view of agent-originated leads in the admin panel
- [ ] `save_shortlist` persistence via Clerk accounts
- [ ] Consolidate the three legacy tow tables onto `agent-core/tow`

## CUT for the challenge (deliberately)
- Live scraper runs during judging (stability > freshness; snapshot is
  labeled)
- Financing/trade-in/appointment tools (a second write tool dilutes the
  approval story)
- Multi-region inventory, manufacturer spec enrichment (must be sourced, not
  guessed — post-challenge with licensed data)
- Broadening beyond RVs (the narrative generalizes; the product stays sharp)

## Post-challenge engineering debt (tracked honestly)
- Legacy TypeScript errors (~40) in pre-existing pages/packages: api-zod
  duplicate re-exports, `lib/integrations/anthropic_ai_integrations` empty
  workspace member, `location-search`/`ar-driveway`/`account` typing, missing
  root-level `tsc -b` orchestration for composite refs
- Parameterize legacy `sql.raw` call sites; validate legacy `/api/leads`
- ~~Rotate the committed Google Places key~~ (deleted 2026-09-03); move `.replit` userenv to secrets
- Fix analytics event-type mismatches (5 client events rejected server-side)
- `replit.md` contains stale claims (auto-import counts, tow-table size,
  seed behavior) — rewrite against current reality
