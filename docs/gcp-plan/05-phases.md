# Phases

Each phase is a later change. This pull request is phase 0 only. Nothing here is permission to run the later phases.

Resource choices that apply from phase 3 on are justified in [06-cost.md](06-cost.md) and summarized here:

| Resource | Use it? | Why |
| --- | --- | --- |
| Existing VM + Caddy | Keep | Durable `/var/data`, MCP, and the site already run here. Moving the process to Cloud Run was rejected in the migration runbook because the disk is ephemeral there. |
| Cloud SQL Postgres, zonal, `us-central1` | Add in phase 3 | Same region as the VM. Replaces the in-memory scan and the double-snapshot reload. Shopper saves need a database production does not have (`DISABLE_DB=1`). Supabase stays paused. |
| Cloud Storage | Reuse the harvest bucket; add a `media/` prefix or a small `us-central1` bucket in phase 5 | Exports already land in GCS. AI bytes do not belong on the VM disk. |
| Cloud Tasks | Phase 5 only | Staff generation bursts, retries, and a free tier that covers this volume. Inventory pulls are five a day. A timer on the VM is enough for those. |
| Cloud Run | Keep harvest and LotAI. Add one scale-to-zero media worker in phase 5 | Generation timeouts must not block the marketplace process. |
| Load balancer, second VM, Memorystore, Supabase | No | They do not fix a problem this plan has. |

## Phase 0 — This plan

| | |
| --- | --- |
| Exists | The audit in this folder. |
| Missing | Nothing to build. |
| Files | `docs/gcp-plan/*` only. |
| Depends on | None. |
| Risk | A reader treats the plan as a change request and provisions from it. The status line on [README.md](README.md) is the guard. |
| Rollback | Close the pull request. |
| Approval | Jonathan reads it. Approval of the plan is not approval of spend. |

## Phase 1 — Reload without the 502

| | |
| --- | --- |
| Exists | In-process reload, loopback routes, 10% count guard, memory check, documented fallback to `systemctl restart`. |
| Missing | The pull script is not in git. The server has no 60-second deadline; the brief's timeout is the client. `MemoryHigh` is not what the check reads. |
| Files | The pull script on the VM (bring a copy into the repo without secrets), `artifacts/api-server/src/services/snapshot-reload.ts` only if the poll needs a field it does not already return. systemd unit on the VM (`MemoryMax`, heap), not `render.yaml`. |
| Depends on | Operator access Jonathan already has. No new API and no DNS. |
| Risk | A longer poll hides a stuck reload. Cap the poll at 3 minutes, then restart once. A heap increase on a 4 GB machine can still OOM if two snapshots are forced in. If the check rejects, restart as today and do not loop. |
| Rollback | Point the pull script back at `systemctl restart`. The reload routes can stay. |
| Approval | Jonathan approves editing the unit file and the pull script on the VM. No cloud product purchase. |

## Phase 2 — Domain split go-live

| | |
| --- | --- |
| Exists | PR #115: host shells, 301 matrix, sitemaps, `site_surface`, rollback doc, DNS notes. |
| Missing | Squarespace record for `dealer`, Caddy site block, Search Console property. Clerk satellite domain is explicitly not in that PR. |
| Files | No new design. Merge PR #115 when Jonathan wants the code on the VM, then the DNS and Caddy steps in `docs/domain-split/DNS-AND-HOSTING.md`. |
| Depends on | Phase 0 for context. Not on SQL. Can ship before or after phase 1. |
| Risk | A DNS-level redirect would move `/mcp`. The app 301s are path-specific and the infra paths are excluded. Do not add a Squarespace redirect. |
| Rollback | `docs/domain-split/ROLLBACK.md`. Revert the app. Leave the DNS record if it exists. Remove only a dealer Caddy block if one was added. |
| Approval | Jonathan: when to add the DNS record and the Caddy block; whether Clerk cookies should span both hosts; Search Console property; whether marketing pages show the $99 audit price (already an open question on PR #115). |

## Phase 3 — Inventory in Cloud SQL

| | |
| --- | --- |
| Exists | Snapshot serving, paged listings API, swipe deck, PR #66's schema and parity approach (unmerged, Supabase-shaped, dirty against `main`). |
| Missing | A Google database. A loader that reads the GCS export and activates one snapshot. SQL prefilter in front of `runSearch` and `querySnapshotListings`. |
| Files | New migration under a path that is not `supabase/` (PR #66's file is the starting point). Loader next to `artifacts/api-server`. `snapshot-listings.ts`, `swipe-deck.ts`, and the inventory source switch. Flag name can stay `INVENTORY_SOURCE` with a new value `cloudsql` and the old default `snapshot`. Do not point it at Supabase. |
| Depends on | Phase 1 so a bad load does not restart the site on a timer. Jonathan confirms the credit covers Cloud SQL. Private IP on the VM's VPC. No public IP on the instance. |
| Risk | A prefilter that drops unknown specs will change MCP results. Use PR #66's rule: drop only certain failures. Run the parity check from that PR against a copy of the live snapshot before the flag flips. Broad searches still move tens of thousands of candidate rows. The API must stream them, not `SELECT *` the JSON. |
| Rollback | `INVENTORY_SOURCE=snapshot` and restart. The SQL instance can stay up. Do not delete it in the rollback. |
| Approval | Jonathan approves the instance tier (expected: `db-custom-1-3840`, 20 GiB SSD, zonal, `us-central1`, Postgres 16 or whatever the project standard is that week) and the monthly cost in [06-cost.md](06-cost.md). He approves creating the instance. This plan does not. |

## Phase 4 — Favorites, compare, financing

| | |
| --- | --- |
| Exists | Device likes, `CompareLikes`, payment calculator with blank APR, Clerk, unused saved-listing tables. |
| Missing | String unit ids in a database the site can reach. Saved compare sets. A 20% illustration with the disclosure sentence. |
| Files | `routes/user.ts`, `saved.tsx`, `swipe-session.ts`, `compare-likes.tsx`, `payment-calc.ts`, `payment-calculator.tsx`, listing and swipe detail. New SQL tables in the phase 3 database. |
| Depends on | Phase 3. Phase 2 should be merged first so favorites ship on the consumer host, not on a homepage that is about to move. |
| Risk | Showing a monthly payment that looks like an offer. The disclosure sentence is mandatory and the credit range still does not choose an APR. Merging guest likes into an account must not email anyone and must not write inquiries. |
| Rollback | Feature flags `SAVED_LISTINGS_SQL` and `FINANCE_ILLUSTRATION` default off. Turning them off returns the device-only behavior. Rows can remain. |
| Approval | Jonathan sets down payment percent, APR, and term (proposed 20%, 7.99%, 180 months) and accepts the disclosure sentence in [03-shopping.md](03-shopping.md). He confirms favorites require Clerk and that guest likes stay on the device until sign-in. |

## Phase 5 — AI media, off

| | |
| --- | --- |
| Exists | Nothing. No Veo, Imagen, or Higgsfield client in the repo. |
| Missing | The interface and job flow in [04-ai-media.md](04-ai-media.md), Cloud Tasks queue, Cloud Run worker, private objects, the checks in [07-safeguards.md](07-safeguards.md). |
| Files | New module `artifacts/api-server/src/services/media/` (provider interface, Imagen adapter, Veo adapter, Higgsfield stub). Routes `POST/GET /api/media/jobs`. Worker service separate from the marketplace unit. No edits to `mcp.ts` or `mcp-v1.ts`. |
| Depends on | Phase 3 for the job table. Safeguards reviewed. Vertex SKU eligibility confirmed. Veo "per count" confirmed as per second or the video cap is rewritten. |
| Risk | A default-on flag, a retry that double-bills, or an AI image replacing a dealer photo. The flag defaults off. Idempotency is required. `unit.images` is not a write target. |
| Rollback | Unset `AI_MEDIA_ENABLED`. Worker refuses new provider calls. Leave objects in place. |
| Approval | Jonathan turns the flag on, picks the monthly hard stop (proposed $100), and says whether Higgsfield is ever in scope. Until that yes, the stub stays. He also grants `photo_rights` per dealer. Default is deny. |
