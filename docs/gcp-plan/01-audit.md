# Current state

Evidence is the tree on `main` unless a path is called out from PR #115. Production claims in the brief are marked **brief** when this checkout does not show them.

## Hosting

| Piece | What the repo shows |
| --- | --- |
| Public app | One Node process. `render.yaml` names a legacy Render service `matchrv-webmcp` (`DISABLE_DB=1`, 1 GB disk at `/var/data`). PR #115 `docs/domain-split/DNS-AND-HOSTING.md` says the public site is the GCE VM behind Caddy, and that Render is the leftover demo blueprint. |
| VM | `docs/superpowers/plans/2026-11-08-google-migration.md` records `matchrv-core-20261108`, Debian 12, project `main-business-514122`, zone `us-central1-a`, created as **e2-small (2 GiB)**. The same doc prices e2-medium and says it was a comparison, not a second machine. |
| Releases | The migration runbook installs under `/opt/matchrv`. It does not describe a `releases/` directory. The brief's `/opt/matchrv/releases` layout is not in git. |
| TLS and DNS | The runbook planned certbot DNS-01. PR #115 documents Caddy on the VM and Squarespace nameservers, and says neither was changed by that PR. No `Caddyfile` is in the repo. |
| Listen | `app.listen(port)` binds every interface. The guest firewall is what should expose 443 only. |

**Disagreement.** The brief says production is an e2-medium (4 GB) with systemd `MemoryHigh=3000M`. The committed runbook still describes an e2-small and a staging unit with `MemoryMax=1500M`. Treat the brief as the later operator fact. This audit did not SSH or call `gcloud`, so the live machine type was not re-read.

## Inventory

| Piece | Evidence |
| --- | --- |
| Serving path | `DISABLE_DB=1` selects database mode `none`. `GET /api/listings` then uses `querySnapshotListings()` in `artifacts/api-server/src/services/snapshot-listings.ts`. Rows are filtered in process and paged with `limit` (default 24, max 100) and `offset`. |
| Snapshot file | Committed `lib/agent-core/data/inventory.snapshot.json.gz` is 43,421,149 bytes. Gzip isize is 529,024,855 bytes (about 505 MiB). |
| Live public total | `GET https://matchrv.com/api/listings?limit=1` on 2026-11-27 returned `total` 156,573, `limit` 1, `offset` 0. `GET /api/search/filters` returned 8 types, 853 makes, and 49 states. |
| Reload | `artifacts/api-server/src/services/snapshot-reload.ts` and `docs/snapshot-reload.md`. SIGHUP or loopback `POST /internal/reload-snapshot`. Memory check is 1.5× decompressed size (`SNAPSHOT_RELOAD_MEMORY_FACTOR`). The comment records a 137,405-unit file, 574 MB decompressed, RSS 1,596 MB to 2,229 MB at peak. A failed check leaves the old snapshot serving. |
| Pull script | `docs/snapshot-reload.md` names `matchrv-inventory-pull.mjs`. That file is not in the repo. The doc says a rejected reload should fall back to `systemctl restart matchrv`. |
| 60-second timeout | Not in `snapshot-reload.ts`. The HTTP handler waits for the whole reload and has no server deadline. A 60-second client timeout matches the brief and is outside this checkout. |
| `MemoryHigh` vs the check | The check uses `process.constrainedMemory()`, which reads the cgroup hard limit (`MemoryMax` / `memory.max`), plus host free memory and the V8 heap limit. `MemoryHigh` is a throttle, not that hard limit. A unit that sets only `MemoryHigh=3000M` does not by itself satisfy the check. |
| Supabase | Open PR #66 (`feat/supabase-inventory`) adds `INVENTORY_SOURCE` defaulting to `snapshot`, a private `inventory` schema, and a loader. It is unmerged and dirty against current `main`. The migration runbook says Supabase is paused and is not required for `DISABLE_DB=1`. |

**Disagreement.** The brief's ~49 MB gzip and ~615 MB decompressed snapshot is larger than the committed file (43.4 MB / 529 MB isize) and larger than the 574 MB figure in the reload comment. The live listing total, 156,573, is the number to use. The brief's ~156,500 matches that read. Dealer count of about 1,605 was not re-counted here. Older docs still say 131,718 units. Do not publish a frozen marketing count.

`GET /api/listings` already pages. It still **builds the filtered list by scanning every photo-bearing row in memory** (`filteredSorted` in `snapshot-listings.ts`). A nationwide grid does not transfer 156k rows to the browser. It does keep them in the Node heap, and a reload tries to keep a second copy.

Swipe is a different query. `POST /api/swipe/deck` (`artifacts/api-server/src/services/swipe-deck.ts`) runs `runSearch` over the screened in-memory corpus, then returns at most 60 cards (`DECK_POOL_SIZE`) with at most 6 per dealer. Location is required. Radius is 5 to 3,000 miles.

## Harvest, LotAI, and other Google use

| Piece | Evidence |
| --- | --- |
| Dealer-site batch | `lib/agent-core/scripts/google-scrape-2026-11-09/`. Cloud Run job, project `main-business-514122`, model `gemini-3.1-flash-lite`, bucket from `BUCKET`. README: 24,796 units from 632 dealers on 2026-11-09/10, merged onto an older base. |
| Bucket name | The brief names `matchrv-scrape-pilot-514122`. The script does not hard-code that name. Region of the bucket is not in the script. The brief places harvest jobs in `us-west1`. The VM record is `us-central1-a`. |
| Outfitter model default | `GEMINI_OUTFITTER_MODEL` defaults to `gemini-3.1-flash-lite` in `shop-outfitter.ts`. |
| LotAI | Marketing routes and lead source `lotai` exist. A Cloud Run service named `lotai` is not defined in this repo. The brief says it runs in `us-west1`. Leave it there. |
| Freshness design | `docs/freshness-reloadable-index.md` sketches a GCS object or one database row behind `InventoryIndexSource`. Flags stay off. It still says "the live process is on Render," which PR #115 supersedes. |

## Shopper features that already exist

| Feature | Where it lives today | Durable in production? |
| --- | --- | --- |
| Swipe deck, likes, compare | `/swipe`. Likes in `localStorage` key `matchrv_swipe_likes` (`swipe-session.ts`). `CompareLikes` renders price, type, length, sleeps, location, condition. | This browser only. |
| Payment math | `artifacts/rv-marketplace/src/lib/payment-calc.ts` and `payment-calculator.tsx`. Shopper-typed APR and term. Credit range is stored and **never mapped to an APR**. Copy already says it is not an offer or a rate quote. Prefs key `matchrv_payment_prefs_v1`. | This browser only. APR starts blank. There is no 20% default. |
| Account favorites | `GET/POST /api/user/saved` and `/listings/:id/save` in `routes/user.ts`. Clerk session. `savedListingsTable` is an integer `listingId`. | No. `DISABLE_DB=1` means these queries have no Postgres. The integer id also does not match snapshot unit ids, which are strings. |
| Grid filters | `GET /api/search/filters` returns types, makes, states, price range, year range from the snapshot when the database is off. | Yes, in memory. |
| Inquiries | `prepare` / `send` on `/mcp`, `/mcp/v1`, and `POST /api/inquiries`. Files under `/var/data` when the env paths are set. | Yes, on the VM disk, independent of Postgres. |
| CRM | `LOTLINK_CRM_WEBHOOK_URL` in `notify-lead.ts`. JSON body: name, email, phone, make, model, budget, message, notes. Optional bearer `LOTLINK_CRM_API_KEY`. | Only if that URL is set on the VM. |
| HubSpot | One marketing sentence in `dealers.tsx` listing HubSpot as a possible lead destination next to CDK and others. **No HubSpot client, portal id, or payload in the repo.** | The preserved contract is the LotLink webhook, not a HubSpot API. |
| Analytics | PostHog server capture in `product-analytics.ts` (off until `POSTHOG_PROJECT_API_KEY`). GA4 tag `G-Y2C0PN44L2` is named in `.env.example` and PR #115. Lead flags default **off** in `docs/lead-tracking/README.md`. | The brief says `LEAD_TRACKING` and `LEAD_CREDIT` are on in production. The code default is off. Do not flip either flag from this plan. |

## MCP

Consumer server name `matchrv` at `/mcp`. Tools registered in `artifacts/api-server/src/mcp.ts`:

`teach_outfitter`, `outfitter_memory`, `outfitter_discovery`, `outfitter_guide`, `search_rvs`, `get_rv`, `compare_rvs`, `evaluate_tow_fit`, `prepare_dealer_inquiry`, `send_dealer_inquiry`, `get_dealer_inquiry_status`.

Keyed server `matchrv-inventory` at `/mcp/v1` (`mcp-v1.ts`), off until `AGENT_V1_ENABLED=1`:

`search_inventory`, `get_unit`, `compare_units`, `evaluate_tow_fit`, `prepare_inquiry`, `send_inquiry`, `get_inquiry_status`.

`/mcp/v1` search already pages (`offset` + `limit` ≤ 200, page size ≤ 25). The consumer `search_rvs` tool returns a shortlist and must not start returning a total match count. That rule is in the tool description.
