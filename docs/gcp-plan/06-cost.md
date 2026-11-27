# Incremental cost

Prices are public list prices in USD, read on **2026-11-27**. They are not a quote and not a tax. A month is **730 hours**, which is the figure Google's Cloud SQL examples use.

This table is **new** spend if the phases ship. It does not include the VM, harvest, LotAI, or Gemini that already run. Those were not read from billing. No `gcloud` and no billing API call was made.

## Sources

| Item | Page | What was read |
| --- | --- | --- |
| Cloud SQL compute, shared-core, Iowa | [Cloud SQL pricing](https://cloud.google.com/sql/pricing) | `db-f1-micro` $0.0105/hour, `db-g1-small` $0.035/hour. Dedicated Enterprise vCPU $0.0413/hour, memory $0.007/GiB-hour. The shared-core table is labeled Iowa (`us-central1`). Shared-core has no SLA. |
| Cloud SQL disk, Iowa | same page | The Iowa (`us-central1`) storage block showed SSD **$0.000465753 per GiB-hour** ($0.34 per GiB-month) and backups **$0.000109589 per GiB-hour** ($0.08 per GiB-month). Another table on the same page shows SSD at $0.000232877 per GiB-hour. Estimates use the Iowa-labeled $0.34 rate. Confirm the region dropdown before creating the instance. |
| Cloud Run | [Cloud Run pricing](https://cloud.google.com/run/pricing) | Request-based active CPU $0.000024 per vCPU-second, memory $0.0000025 per GiB-second, requests $0.40 per million after the free tier (180,000 vCPU-seconds, 360,000 GiB-seconds, 2 million requests). Scale-to-zero with no minimum instances is $0 when idle. |
| Cloud Tasks | [Cloud Tasks pricing](https://cloud.google.com/tasks/pricing) | First 1,000,000 operations per month $0, then $0.40 per million. |
| Cloud Storage | [Cloud Storage pricing](https://cloud.google.com/storage/pricing) | Standard storage $0.000027397 per GiB-hour ($0.020 per GiB-month) in the regional table returned for that page. Confirm the `us-central1` selector. Class A $0.005 per 1,000. Internet egress $0.12/GiB after the free tier. Intra-Google cross-region within North America $0.02/GiB on the same page. Always Free includes 5 GB-months, 5,000 Class A, 50,000 Class B, and 100 GB of North America egress for `us-west1`, `us-central1`, and `us-east1` combined. |
| Imagen and Veo | [Agent Platform pricing](https://cloud.google.com/model-garden/pricing) | Imagen 4 Fast $0.02/image, Imagen 4 $0.04, Imagen 4 Ultra $0.06, Imagen 3 $0.04. Veo 3.1 video only, 720p/1080p, $0.20 per count. Veo 3.1 with audio $0.40 per count. Veo 3.1 Lite video only, 720p, $0.03 per count. Lite with audio, 720p, $0.05 per count. Veo 3.1 Fast with audio, 720p, $0.10 per count. |
| VM floor (not incremental) | `docs/superpowers/plans/2026-11-08-google-migration.md`, prices gathered 2026-11-08 | e2-medium $0.03350571/hour = $24.46. 40 GiB standard disk $1.60. In-use IPv4 about $3.65. About **$30 a month** before egress. Not re-fetched from the Compute Engine price card on 2026-11-27. |

**Veo unit.** The card says "per 1 count." This plan prices video as **per second**, which is the conservative reading (an 8-second Lite clip is $0.24, not $0.03). If Google means per video, actual cost is lower. Do not enable video until that word is confirmed on the pricing page.

## Assumptions

- Region for new SQL and new media objects: `us-central1`, next to the VM. Harvest stays `us-west1`.
- One zonal SQL instance, no high availability, no read replica, no public IP. Private traffic in-region is not billed as internet egress.
- Inventory data size, from PR #66's measurement of about 1.27 KB per row including indexes: 156,573 × 1.27 KB is about 200 MB. Disk is provisioned at 10–50 GiB because Cloud SQL's minimum practical size is larger than the data, not because the data needs it.
- Five snapshot pulls a day, about 50 MB each, from `us-west1` to `us-central1`: about 7.5 GB/month × $0.02 = **$0.15**. Ignored in the rounded totals.
- Shopper traffic does not add Cloud Run. Search stays on the VM talking to SQL.
- AI generation is off in the low and expected cases. The high case is a capped test month, not a product launch.
- Higgsfield is $0 because it is not called. It is also not credit-eligible.
- Free tiers are not stacked into a promise. SQL has no free instance. Cloud Run and Cloud Tasks free tiers cover the idle media worker and a few thousand tasks.

## Per resource, expected case

| Resource | Spec | Math | USD / month |
| --- | --- | --- | --- |
| Cloud SQL compute | `db-custom-1-3840` (1 vCPU, 3.75 GiB), zonal | (0.0413 + 3.75 × 0.007) × 730 = 0.06755 × 730 | 49.31 |
| Cloud SQL SSD | 20 GiB | 20 × 0.34 | 6.80 |
| Cloud SQL backups | 20 GiB used | 20 × 0.08 | 1.60 |
| Cloud Storage | 5 GiB standard for snapshots and unused media prefix | inside or near Always Free; list price 5 × 0.020 = 0.10 | 0.10 |
| Cloud Run media worker | min instances 0, no traffic | 0 | 0 |
| Cloud Tasks | under 1,000,000 ops | 0 | 0 |
| Vertex Imagen / Veo | flag off | 0 | 0 |
| **Expected incremental** | | | **about 58** |

Low case swaps the instance for `db-g1-small` (1.7 GiB, **no SLA**): 0.035 × 730 = $25.55, plus 10 GiB SSD $3.40 and 10 GiB backup $0.80, storage still about $0.10. **About $30 a month.** That box is tight for the broad searches PR #66 measured (tens of thousands of candidate rows). It is the cheap experiment, not the recommendation.

High case: `db-custom-2-7680` at 0.1351 × 730 = $98.62, 50 GiB SSD $17.00, 50 GiB backup $4.00, plus a month that actually generates: 500 Imagen 4 images × $0.04 = $20, and 50 Veo 3.1 Lite 720p clips × 8 seconds × $0.05 (with audio, per-second) = $20. Cloud Run for that volume stays under a few dollars and inside the free tier if the worker is 1 vCPU and 1 GiB for a few hours. **About $160 a month.**

Per-unit AI, for a later cap, using the 2026-11-27 card and the per-second video reading:

| Output | List price | 8-second clip or one still |
| --- | --- | --- |
| Imagen 4 Fast | $0.02 / image | $0.02 |
| Imagen 4 | $0.04 / image | $0.04 |
| Veo 3.1 Lite, 720p, no audio | $0.03 / second | $0.24 |
| Veo 3.1 Lite, 720p, with audio | $0.05 / second | $0.40 |
| Veo 3.1 Fast, 720p, with audio | $0.10 / second | $0.80 |
| Veo 3.1, 720p, with audio | $0.40 / second | $3.20 |

If "count" means one video regardless of length, divide the clip column by 8. Caps in [07-safeguards.md](07-safeguards.md) assume the higher number.

## Per phase, incremental

| Phase | Low | Expected | High |
| --- | --- | --- | --- |
| 0 Plan | 0 | 0 | 0 |
| 1 Reload fix | 0 | 0 | 0 |
| 2 Domain split | 0 | 0 | 0 |
| 3 Cloud SQL | 30 | 58 | 120 (larger disk and 2 vCPU, no AI) |
| 4 Favorites and finance | 0 on top of phase 3 | 0 | 0 |
| 5 AI media, flag off | 0 | 0 | 0 |
| 5 AI media, flag on at the high sketch | | | +40 on the Vertex lines above |

Phases 1–4 expected total: **$58 / month**. Phase 5 adds $0 until the flag is on.

Optional bridge that this plan does **not** recommend: resizing e2-medium to a larger machine so two snapshots fit. That spends every month to keep the design that phase 3 removes. The 2026-11-08 card had e2-medium at $24.46. A resize price was not pulled on 2026-11-27. Do not resize as part of phase 1 unless the headroom check still forces a restart after the pull-script fix and Jonathan would rather wait on SQL.

## What $1,900 covers

Credits: about $1,900 left, expire **2028-03-19** (brief, consistent with the 2026-11-08 runbook's Mar 19, 2026–Mar 19, 2028 window and a $2,000 starting balance). From 2026-11-27 that is about **15.7 months**.

| Case | New spend / month | Months until $1,900 is gone on new spend alone | What happens before 2028-03-19 |
| --- | --- | --- | --- |
| Low, SQL only | 30 | about 63 | Credits expire first. About $1,430 of the balance would remain if nothing else were billed. |
| Expected, SQL only | 58 | about 33 | Credits expire first. New spend over 15.7 months is about $910. About $990 remains for everything already running. |
| Expected SQL + $30 VM floor | 88 | about 22 | Still past the expiry if harvest stays small. Known floor over 15.7 months is about $1,380. About $520 left for harvest, LotAI, Gemini, logs, and egress. |
| High, SQL + capped AI + $30 VM | 190 | about 10 | Balance runs out about 10 months out, before expiry, if every month looks like the high sketch. |

The middle two rows are the planning case. The last row is why phase 5 stays off and why the app hard stop is $100 of estimated Vertex, not "whatever the month does."

**Not covered by these credits, or not safe to assume:**

- Higgsfield and any other non-Google media API.
- Google Cloud Marketplace third-party software.
- Squarespace DNS, PostHog, GA4 overage if any, LotLink or HubSpot on the far side of the webhook, Clerk, Supabase if someone unpauses it.
- SKUs the Credits page excludes. The 2026-11-08 runbook left Compute Engine, disk, and IPv4 eligibility unconfirmed. Re-read that page before phase 3. If the VM is already billing successfully against the credit, that is evidence for Compute Engine, not for Vertex video.

Tax, support plans, and committed-use discounts are out of scope. Do not buy a commitment for a database this size.
