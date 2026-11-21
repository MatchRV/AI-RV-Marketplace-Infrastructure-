# Conversion tracking (GA4 G-Y2C0PN44L2)

All website lead events go through `trackLead()` in
`artifacts/rv-marketplace/src/lib/analytics.ts`. Each one is sent **once per
browser session** per (event, dedupe key), so a double click or a resubmission
does not add a second conversion. Parameters are stripped of email, name, phone
and message before they are sent — those must never go to GA.

Off-site leads (ChatGPT / MCP, LotAI, other keyed agents, the native app) do
not run the website gtag snippet. Those can be reported with the **Measurement
Protocol** (`artifacts/api-server/src/services/ga4-measurement-protocol.ts`),
hooked from `dealer-inquiries` after a successful send. That path is **off
until `GA4_MP_ENABLED` is set**, and it needs `GA4_API_SECRET` (and optionally
`GA4_MEASUREMENT_ID`, which defaults to `G-Y2C0PN44L2`). It is fire-and-forget
and never blocks inquiry delivery. It is independent of `LEAD_TRACKING_ENABLED`
(the first-party lead store from PR #110): you can turn on either, both, or
neither. When both are on, website inquiries are still counted only once in
GA4 (client gtag); off-site inquiries get one Measurement Protocol
`generate_lead` plus a row in the lead store.

## The single key event

**Mark only `generate_lead` as a key event / conversion** in GA4 Admin → Events.

Do not also mark `dealer_contact_form`, `buyer_dealer_inquiry`,
`buyer_email_capture`, `price_alert`, `buyers_agent_inquiry`,
`seller_listing_submit` or `snapshot_*` as key events. The code already fires
the typed event *and* `generate_lead` for every verified lead; marking both
would double conversion counts. Use the typed event plus the `lead_type`
dimension for breakdowns.

Leave `book_demo_click` as a regular event (it is not a booking). Confirmed
bookings happen on Google Calendar; count them there, not in GA4. Clerk
`sign_up` is a recommended event for account creation, not a sales lead — it
does not fire `generate_lead`.

| GA4 event | Fires when | Verified by server? | Also sends `generate_lead` |
|---|---|---|---|
| `dealer_contact_form` | `/contact` form accepted (`/api/contact` 2xx) | yes | yes |
| `snapshot_request` | free Visibility Snapshot generated | yes | yes |
| `snapshot_pdf_email` | snapshot PDF emailed | yes | yes |
| `buyer_dealer_inquiry` | shopper inquiry on a listing, swipe, or Match Report saved | yes | yes |
| `buyer_email_capture` | shopper saved a Match Report by email | yes | yes |
| `price_alert` | listing “Notify Me of Similar RVs” drawer or “Set price alert” accepted | yes | yes |
| `buyers_agent_inquiry` | `/match` Buyers Agent form accepted | yes | yes |
| `seller_listing_submit` | `/sell` form accepted | yes | yes |
| `book_demo_click` | booking calendar opened (`placement` param) | no — intent only | no |
| `generate_lead` (Measurement Protocol) | off-site inquiry (ChatGPT/MCP, LotAI, native app) when `GA4_MP_ENABLED` is on | yes (inquiry already accepted) | (this is the event) |
| `sign_up` | Clerk account created in the last 10 minutes (deduped per user) | n/a | no |

Forms also send an explicit `form_submit` (with `form_id`) because GA4
enhanced measurement cannot see SPA forms that call `preventDefault()`. That
is why reports used to show `form_start` but no `form_submit`.

The footer newsletter Join button is **not** wired: there is no subscribe
endpoint in the repo, and `/api/price-alerts` is the wrong product (it
requires a listing). Do not treat a newsletter click as a lead until a real
subscribe API exists.

`/pricing` is a redirect to `/campgrounds`; the old Personal Shopper form is
not reachable.

## Event parameters (no PII)

Every lead event and `generate_lead` carries:

| Parameter | Meaning |
|---|---|
| `lead_type` | The typed outcome (see table above) |
| `lead_audience` | `dealer`, `shopper`, or `seller` |
| `lead_verified` | `true` when the server accepted the submission |
| `source` | Entry surface group (`listing_detail`, `swipe_deck`, `match_report`, `website`, `chatgpt_app`, …) |
| `placement` | More specific UI (`similar_rv_drawer`, `contact_page`, …) |
| `form_id` | Form identifier (also on `form_submit`) |
| `dealer_id` | Dealer id when known |
| `item_id` | Listing / unit id when known |
| `surface` | Shopper surface (`unit_detail`, `swipe`, `price_drop`, …) |
| `value` | RV listed price, when a unit is involved |
| `currency` | `USD` when `value` is present |

## GA4 admin steps (manual — not part of this PR)

1. Admin → Events: mark **`generate_lead` only** as a key event. Unmark any old
   key event that counted clicks, or that also marked the typed lead events.
2. Admin → Custom definitions: register these as event-scoped dimensions:
   `lead_type`, `lead_audience`, `lead_verified`, `source`, `placement`,
   `form_id`, `dealer_id`, `item_id`, `surface`.
3. Data retention: 14 months.
4. Filter internal traffic (office / home IPs).
5. Enhanced measurement: keep scroll, outbound clicks, and file downloads.
   **Turn off “page changes based on browser history events”** — the app
   already sends a manual `page_view` on every Wouter route change.
6. Property timezone: America/Los_Angeles.
7. Confirmed bookings happen on Google Calendar; count them there, not in GA4.

Quiz events are not reported to GA4 as `begin_checkout` / `purchase`.
`return_visit` is sent as `return_visit`, not the reserved `session_start`
event.

## Env vars (Measurement Protocol, later — do not set in this PR)

| Variable | Default | Purpose |
|---|---|---|
| `GA4_MP_ENABLED` | off | Send server-side `generate_lead` for off-site inquiries |
| `GA4_MEASUREMENT_ID` | `G-Y2C0PN44L2` | GA4 property id |
| `GA4_API_SECRET` | unset (required if the flag is on) | Measurement Protocol API secret from GA4 Admin → Data streams → Measurement Protocol. Never commit or paste it in chat. |

