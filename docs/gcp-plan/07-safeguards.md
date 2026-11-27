# Safeguards and media permissions

Generation is off by default. The absence of `AI_MEDIA_ENABLED` is the kill switch. Unset it and redeploy (or restart the unit) and step 1 of the job flow returns 404. In-flight Cloud Tasks still need the worker to re-read the flag and exit without calling a provider. Both sides check.

## Caps (proposed, off until phase 5 is approved)

Counts are successful provider calls, not cache hits. Cache hits are free and do not count.

| Cap | Proposed limit | Enforced where |
| --- | --- | --- |
| Per user, images | 10 per UTC day | `media_jobs` count before enqueue |
| Per user, video seconds | 16 per UTC day (two 8-second clips) | same |
| Global, images | 100 per UTC day | same |
| Global, video seconds | 80 per UTC day | same |
| Monthly Vertex estimate | $50 soft alert, $100 hard stop in the app | app counter using the list prices in [06-cost.md](06-cost.md), per-second for Veo |

A request over a cap returns 429 and does not enqueue. Raising a cap is a config change Jonathan approves. The app hard stop does not wait on a billing invoice.

## Billing controls

These are in addition to the app caps. They are not a substitute.

- One Cloud Billing budget on project `main-business-514122`, alerts at 50%, 90%, and 100% of a monthly amount Jonathan sets. Alerts do not stop spend. Google's own budget docs say that.
- A separate budget scoped to Vertex / Agent Platform AI so a media test cannot hide inside the VM's bill.
- Spend caps, if used, are a preview feature and pause one eligible service. Do not treat a spend cap as the off switch for the VM. The VM should not be in that cap.
- Higgsfield, Squarespace, PostHog, HubSpot or LotLink, and Supabase are not this billing account. Credits do not pay them. The adapter stays disabled so a bug cannot bill a card outside Google.

Startup-credit SKU scope was still unconfirmed in the 2026-11-08 runbook. Cloud SQL, Cloud Storage, Cloud Run, Cloud Tasks, and Vertex are first-party and are the services this plan expects the credit to cover. Confirm that list on the Credits page before phase 3. If Vertex video is excluded, phase 5 stays off even after the flag would otherwise be allowed.

## Media permission checks

All of these run before enqueue. Any failure is a 403 with a stable error code and no provider call.

| Check | Rule |
| --- | --- |
| Who | Clerk user with role dealer or staff. Anonymous and ordinary shopper sessions cannot enqueue. |
| Flag | `AI_MEDIA_ENABLED` is `1`. |
| Dealer photo rights | Source object must be a photo already stored for that dealer's unit, and the dealer row must have `photo_rights=granted`. Default for every dealer is **not granted**. MatchRV-owned studio assets are a separate allowlist, staff only. |
| People and likeness | Reject prompts that ask for a person, a face, a family, a celebrity, or a real customer. Reject a source image the staff tool has not marked `no_person`. There is no automatic face detector in phase 5. Unmarked photos do not generate. |
| Brand | Prompt and any text overlay may say MatchRV. Reject Discount RV and other dealer brands as a watermark. The output is an illustration for MatchRV, not a fake dealer ad. |
| Label | Every stored object and every UI surface says it is AI-generated and is not a photograph of the RV for sale. The listing's dealer photos are unchanged. |
| Inventory truth | The job cannot change price, stock, or specs. It cannot write the inquiry files or call `/api/out`. |

Staff review: a `ready` asset is not shown on `matchrv.com` until a staff user marks it `published`. Dealer preview on `dealer.matchrv.com` can show their own jobs with the label, still not on the consumer card.

## Caching

- Idempotency key and the prompt/source hash share one successful object.
- Signed URLs expire in minutes. The bucket stays private.
- Do not put AI bytes on the VM disk. The VM disk is for `/var/data` shopper writes.

## Logging

Log job id, provider, model, unit id, requester id, and the error code. Do not log the prompt in Cloud Logging (it can contain a dealer's free text). The prompt stays in the SQL row.
