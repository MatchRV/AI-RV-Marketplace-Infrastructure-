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

## P0 — remaining, needs a human (Jonathan)
- [ ] Deploy the live URL (render.yaml blueprint ≈10 min; any Node host works)
- [ ] Verify in the ChatGPT desktop in-app browser + Chrome 149 flag; append
      results to WEBMCP_TEST_RESULTS.md
- [ ] Record the <3 min video (DEMO_SCRIPT.md) and publish on YouTube
- [ ] Make the repo public; submit on Devpost before the deadline

## P1 — meaningfully raises judge score (only after P0)
- [ ] Warm-start/optimize first paint on the deploy (preload fonts, prune the
      187 MB legacy `public/rv-images` from the deploy image)
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
- Rotate the committed Google Places key; move `.replit` userenv to secrets
- Fix analytics event-type mismatches (5 client events rejected server-side)
- `replit.md` contains stale claims (auto-import counts, tow-table size,
  seed behavior) — rewrite against current reality
