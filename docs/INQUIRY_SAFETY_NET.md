# Inquiry safety net

Queued dealer inquiries can sit unnoticed, and a failed delivery used to stay failed until someone noticed. This safety net is an in-process sweep on the API server. It is off until `INQUIRY_SAFETY_SWEEP=1`. Nothing in this change provisions a Render service, changes production env, or sends a live inquiry.

## What it does

| Lead state | Sweep action |
| --- | --- |
| `queued_for_matchrv` for under 2 hours | Nothing |
| `queued_for_matchrv` for at least 2 hours | One ops alert. Not repeated |
| `queued_for_matchrv` for at least 24 hours | A second ops alert. The 2-hour alert is not sent again |
| First seen after 24 hours (process was down) | Both alerts in that sweep, each once |
| `failed`, transient | Retry the original authorized delivery, then stop |
| `failed`, permanent or retries used up | One ops alert. No further automatic sends |
| `forwarded`, `delivered`, `dry_run`, or a test lead | No alert and no retry |

`queued_for_matchrv` means MatchRV ops was notified. It does not mean the dealership received the inquiry. `delivered` means a dealer mail server accepted a direct email. `forwarded` means an ops user pressed **I sent this to the dealer** in `/ops/leads` after they actually sent it. Copying the forward text does not change status. A failed confirm leaves the lead unchanged.

## Clock and cadence

The sweep runs every **10 minutes** when enabled, plus once when the process starts. Thresholds are age, not a wall-clock hour:

- A lead queued at 12:00 is eligible at 14:00. The next tick alerts between 14:00 and about 14:10.
- The same rule applies at 24 hours.
- Age is measured from `queuedAt` (when the lead entered `queued_for_matchrv`), not from an earlier failed attempt.
- Markers live on the inquiry record (`safety.alert2hAt`, `safety.alert24hAt`, `safety.exhaustedAlertAt`) in `dealer-inquiries.json` beside `LEARNED_FACTS_PATH` (on the current Render disk, `/var/data/dealer-inquiries.json`). A restart or a second overlapping sweep sees the marker and does not send again.
- A marker is stored as `pending:<epoch ms>` for up to 60 seconds while a send is in flight. If that claim expires without a success timestamp, the next sweep tries once.

## Retry policy

Retries apply only to leads whose confirmed send ended `failed`, and only to the recipient recorded at that moment (`delivery.authorized`).

- Ops-queue leads (no direct dealer route, or dealer email was not attempted) are retried to the MatchRV ops push and/or the ops mailbox. A route added later is not used. The sweep will not email a dealer who was not on the original send.
- Dealer-email leads are retried to the stored address, not whatever is in the route table now. The shopper's name, contact, message, fit, and payment numbers are the stored ones.
- The shopper's confirmation is not asked for again and is not weakened. The preview token stays single-use.
- Schedule after the initial failure, then after each retry: **15 minutes, 1 hour, 4 hours, 12 hours**. That is four automatic retries. The next failure stops.
- A permanent error (SMTP 550/553/554, invalid recipient, ntfy 4xx other than 429) stops immediately.
- Timeouts, connection errors, 5xx, 429, and "not configured" are transient.
- When retries stop, one alert is sent. It is not repeated.
- A forward confirmation during an in-flight retry keeps `forwarded`. The sweep will not start another send. A send that already left the process cannot be recalled; the status does not flip away from `forwarded`.
- Leads stored before this change have no `delivery.authorized` and are not auto-retried. They stay visible in the inbox for a manual forward.

Success of an ops retry sets `queued_for_matchrv` and starts the 2-hour clock then. Success of a dealer retry sets `delivered`. Neither result is reported as `forwarded`.

## Alerts

Alerts reuse the inquiry transport already used for new leads:

- Push: `NTFY_TOPIC`, or a full `NTFY_URL` (optional base; default host `https://ntfy.sh` only when `NTFY_TOPIC` is set).
- Email: `GMAIL_USER` + `GMAIL_APP_PASSWORD`, or `SMTP_HOST` + `SMTP_FROM` (and `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_SECURE` as today). The mailbox is `INQUIRY_OPS_EMAIL`, default `sales@matchrv.com`.

If both are configured, both get the alert and one success marks it sent. If neither is configured, the marker is not stored and the sweep result reports `ops_channel_unconfigured`. A log line is not the alert. No new recipient is introduced.

Alert text includes the inquiry id, dealer name and city, unit title, and stock number, plus a pointer to `/ops/leads`. It does not include the shopper's name, email, phone, message, fit, or payment numbers. Server logs for the sweep follow the same rule.

The initial "please forward this" notification is unchanged and can still contain the shopper's first name. That is the original delivery, not a safety-net alert.

## Forward confirmation

In `/ops/leads`, a real queued or failed lead shows the forward text and **I sent this to the dealer**. The button POSTs `{ "action": "confirm_forward" }` to `/api/inquiries/ops/:id` with the ops key. On HTTP 200 the card reloads as `forwarded` with `forwarded.at`. On any other response the card stays as it was and shows "Not marked forwarded".

Test leads and dry runs cannot be confirmed. A second confirm keeps the original timestamp.

The shopper status endpoint `GET /api/inquiries/:id` (header `X-Inquiry-Token`) and `get_dealer_inquiry_status` return `status: "forwarded"` and a status detail that says the dealership has not necessarily replied. The public payload does not grow new fields. The listing page and the swipe "see it in person" sheet poll that endpoint about once a minute while the status is still `queued_for_matchrv`, and only while the page is open. The status token stays in memory for that view.

Product analytics still records the outcome of the original send. A later forward or retry is not a second submission, so it does not increment the queued or delivered counts.

## Turning it on

Preferred, no new Render service: on the existing web service set

```
INQUIRY_SAFETY_SWEEP=1
```

Redeploy or restart that service. The process logs `sweep on, every 10 minutes` and runs a sweep immediately, then every 10 minutes. This uses the instance you already pay for. It does not add a cron service.

Also required, same as today, or alerts cannot be delivered:

- `INQUIRY_OPS_KEY` for `/ops/leads` and `POST /api/inquiries/ops/sweep`
- `NTFY_TOPIC` and/or SMTP / Gmail, as above
- The persistent disk already mounted at `/var/data` so `dealer-inquiries.json` survives restarts. Without that disk, markers and forward state die with the filesystem.

Optional manual run (does not enable the timer):

```
curl -fsS -X POST "$MATCHRV_APP_URL/api/inquiries/ops/sweep" \
  -H "Authorization: Bearer $INQUIRY_OPS_KEY"
```

The response is counts and inquiry ids. It has no shopper contact details. The route returns 401 without the key and 503 when `INQUIRY_OPS_KEY` is unset.

### Render cron (not applied)

A separate Render cron that only calls the endpoint would also work. Cron jobs are billed per second of run time with a **$1 per month minimum per cron service** ([Render pricing](https://render.com/pricing), [cron jobs](https://render.com/docs/cronjobs)). A 10-minute schedule that runs for a few seconds stays near that minimum, but it is still a new paid service. This repo does not add it to `render.yaml` and does not start one. An example is in `deploy/inquiry-safety-cron.example.yaml`. Do not merge that into the live blueprint without an explicit decision. If both the env flag and a cron are on, markers still prevent duplicate alerts; pick one.

## Rollback

1. Unset `INQUIRY_SAFETY_SWEEP` and redeploy, or remove the cron service if one was created later.
2. In-flight claims expire after 60 seconds. No migration is required.
3. Leads already marked `forwarded` stay forwarded, which is the truthful state. To stop the shopper seeing that, an ops status edit cannot clear `forwarded`; leave the record as-is or restore a backup of `dealer-inquiries.json` taken before the confirm.

Turning the sweep off does not delete leads and does not send anything.
