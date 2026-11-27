# AI media service

A separate worker. The marketplace VM does not call Veo or Imagen on a shopper request. Generation is off until `AI_MEDIA_ENABLED=1`. Higgsfield is an adapter slot with no implementation in the first build.

## Interface

One module owns the provider calls. Routes, Cloud Tasks, and the UI depend on this interface only.

```ts
type MediaKind = "image" | "video";

type MediaProviderId = "imagen" | "veo" | "higgsfield";

interface MediaJobRequest {
  kind: MediaKind;
  /** Stable id for retries. Same key returns the same job. */
  idempotencyKey: string;
  /** Dealer or MatchRV staff. Shoppers do not enqueue. */
  requestedBy: { userId: string; role: "dealer" | "staff" };
  /** Unit the asset is about, when there is one. */
  unitId?: string;
  /** GCS object that is already a permitted source photo. */
  sourceObject?: string;
  prompt: string;
  /** Provider hint. The router may substitute the configured default. */
  provider?: MediaProviderId;
}

interface MediaProvider {
  id: MediaProviderId;
  submit(job: MediaJobRequest, model: string): Promise<{ providerJobId: string }>;
  poll(providerJobId: string): Promise<
    | { state: "running" }
    | { state: "succeeded"; bytes: Buffer; contentType: string }
    | { state: "failed"; error: string }
  >;
}

interface StoredAsset {
  jobId: string;
  bucket: string;
  object: string;
  contentType: string;
  provider: MediaProviderId;
  model: string;
  label: "ai-generated";
  createdAt: string;
}
```

Default models, when the flag is on and Jonathan has accepted the prices in [06-cost.md](06-cost.md):

| Kind | First provider | Model | Why |
| --- | --- | --- | --- |
| Image | `imagen` | Imagen 4 Fast | $0.02 per image on the Agent Platform price card read 2026-11-27. Step up to Imagen 4 ($0.04) only for a publishable still. |
| Video | `veo` | Veo 3.1 Lite, 720p, video only | Lowest listed Veo rate on that card ($0.03 per count). Do not default to Veo 3.1 with audio ($0.40 per count). |
| Either | `higgsfield` | none until a contract exists | Not a Google SKU. Startup credits do not pay it. The adapter throws `provider_disabled` if selected. |

"Per count" on Google's card is treated as **per second of video** because that is how Veo has been billed and how October–November 2026 writeups of the same card read it. An 8-second Lite clip is then $0.24, not $0.03. Confirm the unit on the pricing page before enabling video. Spend caps in [07-safeguards.md](07-safeguards.md) use the per-second reading so a wrong guess fails closed.

## Job flow

1. `POST /api/media/jobs` on the existing API. Auth required (Clerk, dealer or staff). Missing `AI_MEDIA_ENABLED` returns 404, the same shape as other off flags, and does not call Google.
2. Permission checks in [07-safeguards.md](07-safeguards.md). A failed check does not enqueue.
3. Insert a `media_jobs` row (`queued`) and the idempotency key. A repeat of the same key returns the existing row.
4. Cloud Tasks HTTP task to the worker. The task body is the job id, not the prompt. The worker reads the row.
5. Worker (Cloud Run, `min-instances=0`, request timeout long enough for one Veo clip, concurrency 1) calls `submit`, then `poll`, with a deadline.
6. Bytes go to Cloud Storage. The row becomes `ready` with bucket, object, provider, model, and `label: ai-generated`. Failures become `failed` with a short error code and no bytes.
7. The client polls `GET /api/media/jobs/:id`. The response includes the disclosure label. It does not include a provider payload dump.
8. Nothing in this flow writes `unit.images`. Listing cards keep dealer photos. A ready asset can be attached later as a separate gallery item that the UI titles "AI-generated illustration, not a photo of this RV."

Cache: before `submit`, look up a successful job with the same provider, model, prompt hash, and source object generation. If one is still within the retention window, return it and do not call the provider.

Retries: Cloud Tasks retries transport failures. The worker treats a known idempotency key as success and does not call the provider twice. Provider 4xx is `failed` and is not retried.

## Storage

Use the existing project `main-business-514122`. Do not create a project.

| Object | Where |
| --- | --- |
| Harvest export the site already pulls | Existing bucket (brief: `matchrv-scrape-pilot-514122`). Leave it. If it is in `us-west1` and the VM is in `us-central1`, a 50 MB pull five times a day is about 7.5 GB a month of cross-region transfer at $0.02/GiB, about $0.15. Not a reason for a new bucket. |
| Active snapshot the loader reads | Same bucket, a `snapshots/` prefix, or a second bucket in `us-central1` only if cross-region latency shows up in the load. Decide in phase 3 after one timed load. |
| AI outputs | New prefix `media/` on a bucket in `us-central1` (same region as the VM and the proposed SQL). Uniform bucket-level access. Public listing photos stay on dealer CDNs. AI objects are private. The API issues a short-lived signed URL after the permission check. |
| Lifecycle | Delete `failed` scratch after 7 days. Delete unattached `ready` objects after 90 days. Do not delete an object that a saved job row still names. |

Object metadata: `matchrv-label=ai-generated`, `matchrv-provider`, `matchrv-model`, `matchrv-unit` (optional). No shopper name, email, or phone in object metadata or prompts stored in the bucket. Prompts live in Cloud SQL with the job row, access limited to staff.

## What stays on the VM

Enqueue, auth, and the permission decision stay in the API process so they share Clerk and the kill switch. Generation and polling stay on Cloud Run so a Veo minute cannot stall swipe or MCP. Cloud Tasks is the queue because the volume is bursts of staff actions, not a stream, and the first million operations a month are $0.

Do not put this worker on the marketplace VM. Do not move the marketplace onto Cloud Run to "be closer" to the worker.
