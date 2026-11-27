# MatchRV Google Cloud plan

Status: planning only. This folder does not provision resources, change DNS, deploy, or turn on billable generation. Jonathan Kitchel reviews it. It is not approval to spend.

Checked against the repo on `main` and against open [PR #115](https://github.com/MatchRV/AI-RV-Marketplace-Infrastructure-/pull/115) (`cursor/b2c-b2b-domain-split-b416`). A public read of `GET /api/listings?limit=1` on 2026-11-27 returned `total` **156,573**. That is the only inventory count this plan uses in public-facing language. `GET /api/out` was not called. No cloud CLI was run.

## One-screen summary

**Reuse.** Keep the one Node service on the existing VM, Caddy, the snapshot file as the fallback, the swipe and listing APIs, Clerk, PostHog, GA4, the LotLink CRM webhook, the ChatGPT MCP at `https://matchrv.com/mcp`, and `/mcp/v1`. Keep harvest and LotAI on the Cloud Run footprint they already have. Port the inventory SQL shape from open [PR #66](https://github.com/MatchRV/AI-RV-Marketplace-Infrastructure-/pull/66) onto Cloud SQL. Do not revive the paused Supabase project. Do not rebuild search, inquiries, or MCP.

**Phase order.**

| Phase | What | New monthly cost |
| --- | --- | --- |
| 0 | This plan | $0 |
| 1 | Stop the reload 502s. Pull client polls instead of a 60-second wait. No new Google product required. | $0 |
| 2 | Turn on the PR #115 host split when DNS and Caddy are approved. Same VM. | $0 |
| 3 | Cloud SQL in `us-central1` for inventory filter and page queries. API stops holding two full snapshots. | about $58 expected |
| 4 | Signed-in favorites, saved compare sets, disclosed 20% down illustration. Same database. | about $0 on top of phase 3 |
| 5 | Provider-independent AI media. Google Imagen and Veo first. Higgsfield stays unwired. **Off until a flag is set.** | $0 while off |

Phases 1 and 2 do not depend on each other. Phase 4 waits on phase 3. Phase 5 waits on the safeguards in [07-safeguards.md](07-safeguards.md) and stays off in the expected case.

**Expected incremental cost, AI off: about $58 per month**, almost all of it one zonal Cloud SQL Postgres instance (`db-custom-1-3840`, 20 GiB SSD, backups). Low case about $30 per month (`db-g1-small`, no SLA). High case about $160 per month (larger SQL plus a capped amount of Imagen and Veo). Detail and sources: [06-cost.md](06-cost.md).

**Runway on $1,900.** Credits expire 2028-03-19, about 15.7 months from 2026-11-27. At $58 a month the new spend uses about $910 before expiry and does not by itself exhaust the balance. That figure is **incremental only**. The VM, harvest jobs, LotAI, and Gemini are already on the bill and were not measured here. Adding the documented e2-medium floor of about $30 a month (VM, disk, address, from the 2026-11-08 runbook) brings the known floor to about $88 a month, about $1,380 over the remaining credit window, leaving on the order of $500 for harvest, LotAI, Gemini, and egress. A high AI month near $160 of new spend plus the VM floor is about $190 a month and would use the balance in about 10 months.

**Decisions.** The list Jonathan has to make is [DECISIONS.md](DECISIONS.md).

## Read next

| Doc | Contents |
| --- | --- |
| [01-audit.md](01-audit.md) | What the repo shows, and where it disagrees with the production brief |
| [02-reuse-and-contracts.md](02-reuse-and-contracts.md) | What to keep, and the contracts that must not change |
| [03-shopping.md](03-shopping.md) | Consumer vs dealer, swipe and grid at 156k, favorites, compare, financing |
| [04-ai-media.md](04-ai-media.md) | Provider interface, job flow, storage |
| [05-phases.md](05-phases.md) | Each phase: exists, missing, files, dependencies, risks, rollback, approval |
| [06-cost.md](06-cost.md) | Incremental cost, assumptions, credit exclusions, runway |
| [07-safeguards.md](07-safeguards.md) | Caps, kill switch, budgets, media permission checks |
| [DECISIONS.md](DECISIONS.md) | Approvals |
