# Decisions for Jonathan

Nothing in `docs/gcp-plan/` spends money or changes production. These are the choices a later phase needs. A "proposed" line is the recommendation. Rejecting it keeps today's behavior.

1. **Accept this plan as the sequence.** Proposed order: reload fix, then domain-split DNS when you want it (independent), then Cloud SQL, then favorites and the financing illustration, then AI media left off. PR #115 is the domain design. PR #66's SQL shape is reused on Cloud SQL and is not merged as a Supabase cutover.

2. **Reload on the current VM.** Approve a change to the pull script so it polls `/internal/snapshot-status` instead of killing the process at 60 seconds, and approve `MemoryMax` plus the Node heap so the check looks at the real ceiling. Do not buy a larger machine in that step.

3. **Cloud SQL.** Approve a zonal `db-custom-1-3840` (1 vCPU, 3.75 GiB) in `us-central1`, 20 GiB SSD, backups on, private IP only, about **$58 a month** at the 2026-11-27 list prices in [06-cost.md](06-cost.md). Alternative: `db-g1-small` at about $30 with no SLA. Decline means inventory stays in the Node heap.

4. **Credit scope.** On the billing Credits page, confirm Cloud SQL, Cloud Storage, Cloud Run, Cloud Tasks, and Vertex AI are covered by the remaining balance, and note the expiry 2028-03-19. The 2026-11-08 runbook left SKU scope open.

5. **Domain split timing.** When to add the Squarespace `dealer` record and the Caddy site block from PR #115. Also the open items already on that PR: Clerk across both hosts, Search Console for `https://dealer.matchrv.com/`, and whether public dealer pages show the $99 audit price.

6. **Financing defaults.** Proposed illustration: **20% down, 7.99% APR, 180 months**, taxes and fees left out, with the disclosure sentence in [03-shopping.md](03-shopping.md). Until you accept the numbers and the sentence, the calculator stays as it is: APR blank, and a credit range never selects a rate.

7. **Favorites.** Signed-in saves go to Cloud SQL under the Clerk user. Guests keep device likes. Confirm that is enough, and that no email is sent on save.

8. **AI media flag.** Leave `AI_MEDIA_ENABLED` unset. A later yes must include the $100 app hard stop, the per-user caps in [07-safeguards.md](07-safeguards.md), and a check that Veo's "per count" price is per second. Higgsfield stays unwired unless you ask for that adapter and accept that credits will not pay it.

9. **Photo rights.** Default deny. Name who can set `photo_rights=granted` for a dealer, and confirm AI images never replace dealer photos on consumer cards. Branding on any generated frame is MatchRV only.

10. **HubSpot.** The repo posts leads to `LOTLINK_CRM_WEBHOOK_URL` and does not call HubSpot. Confirm the webhook is the integration to preserve, and that no new CRM client is wanted in these phases.

11. **Public counts.** Keep using the live `/api/listings` total (156,573 on 2026-11-27). Do not freeze a number in the UI.
