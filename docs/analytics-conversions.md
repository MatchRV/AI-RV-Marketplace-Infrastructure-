# Conversion tracking (GA4 G-Y2C0PN44L2)

All lead events go through `trackLead()` in `artifacts/rv-marketplace/src/lib/analytics.ts`.
Each one is sent **once per browser session** per (event, dedupe key), so a double click or
a resubmission does not add a second conversion.

| GA4 event | Fires when | Verified by server? | Also sends `generate_lead` |
|---|---|---|---|
| `dealer_contact_form` | /contact form accepted (`/api/contact` 2xx) | yes | yes |
| `snapshot_request` | free Visibility Snapshot generated | yes | yes |
| `snapshot_pdf_email` | snapshot PDF emailed | yes | yes |
| `buyer_dealer_inquiry` | shopper inquiry on a listing / Match Report saved | yes | yes |
| `buyer_email_capture` | shopper saved a Match Report by email | yes | yes |
| `book_demo_click` | booking calendar opened (`placement` param) | no — intent only | no |

Forms also send an explicit `form_submit` (with `form_id`) because GA4 enhanced measurement
cannot see SPA forms that call `preventDefault()`. That is why reports showed `form_start`
but no `form_submit`.

Every event carries `lead_type`, `lead_audience` (`dealer` / `shopper`) and `lead_verified`.

## GA4 admin steps (manual)

1. Admin → Events: mark `snapshot_request`, `dealer_contact_form` and `buyer_dealer_inquiry`
   as key events. Leave `book_demo_click` as a regular event (it is not a booking).
2. Unmark any old key event that counted clicks (e.g. a `contact` or click-based event) so
   totals are not inflated.
3. Admin → Custom definitions: register `lead_type`, `lead_audience` and `placement` as
   event-scoped dimensions.
4. Confirmed bookings happen on Google Calendar; count them there, not in GA4.

Quiz events are no longer reported to GA4 as `begin_checkout` / `purchase`.
