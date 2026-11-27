# Analytics segmentation

PostHog and GA4 already run. This change does not create a second project, does not change API keys, and does not change lead attribution.

## PostHog

On init, the browser registers a super property:

- `site_surface`: `consumer` on `matchrv.com`, `www.matchrv.com`, and local preview
- `site_surface`: `dealer` on `dealer.matchrv.com`

Every later PostHog event in that page load includes it, including events that already existed. Inquiry events keep the same names and the same properties they had. The new property is additive.

To separate funnels in the existing PostHog project, filter or break down by `site_surface`. Do not create a second PostHog project for the subdomain unless Jonathan wants the data physically split. One project with this property keeps a shopper who starts on the apex and a dealer who starts on the subdomain in the same account.

## GA4

`page_view` now sends `site_surface` with the same two values, through the existing `G-Y2C0PN44L2` tag. Register `site_surface` as a custom dimension (event scope) in the GA4 admin if it should appear in reports. That is a GA4 admin click, not a code change, and it was not done here.

`trackLead` payloads are unchanged. `buyer_dealer_inquiry`, `dealer_contact_form`, and the other lead types still fire the same way, with the same form ids. The contact form on both hosts still records `dealer_contact_form`.

## What was not segmented

The first-party `POST /api/analytics/product` allowlist was not extended. Those events stay on their existing contract. Host segmentation for product research is the PostHog property and the GA4 page-view parameter.
