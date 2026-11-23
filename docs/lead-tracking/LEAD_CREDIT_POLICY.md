# Lead credit policy (DRAFT)

> **DRAFT. Not agreed terms.** Pending Jonathan and the CSO. Nothing in the code bills anyone:
> MatchRV has no billing system. The code only records evidence and shows a "billable / not
> billable" verdict on the owner dashboard when `LEAD_CREDIT_ENABLED` is on (off by default).

## Why this exists

Pilot dealers asked a fair question: *"What if we both have the same lead? I don't want to pay
for my own lead."* (Fife RV.) A shopper can find an RV on MatchRV, click over to the dealer's
website, and fill out the dealer's own form. Without a record, the dealer can say the lead came
in on its own website, and MatchRV can't show otherwise. And a dealer should never pay for a
shopper it already had.

## The proposed rule, in plain English

1. **First touch wins.** MatchRV gets credit for a shopper when MatchRV's first contact with that
   shopper about that dealer's RV comes **before** the dealer's own first record of the shopper.
2. **30-day window.** MatchRV's credit lasts **30 days** from its first touch. If the dealer's
   own first record comes more than 30 days later, MatchRV gets no credit. (Configurable:
   `LEAD_CREDIT_WINDOW_DAYS`, default 30.)
3. **No charge for duplicates the dealer had first.** If the dealer shows it already had the
   shopper (a CRM entry, its own web form, a call, a walk-in, or another lead provider) dated
   on or before MatchRV's first touch, the lead is **not billable**. A date with no time counts
   as the start of that day (UTC), which gives the dealer the benefit of the doubt.
4. **Disputed leads aren't billed** until MatchRV reviews them.
5. **One shopper, one lead.** The same shopper (same email or phone) asking the same dealer again
   within the window is a repeat of the first lead, never a second charge. Test leads are never
   billed.

## The evidence MatchRV keeps

For every lead (when lead tracking is on), MatchRV stores:

| Evidence | Where it comes from |
|---|---|
| First time the shopper viewed that RV on MatchRV | The site's own session journey (server-side counters) |
| Every time MatchRV sent the shopper to the dealer's website | MatchRV's tagged redirect (`/api/out`): time, RV or dealer, MatchRV page, and a one-way hash of the browser session id. The dealer link also carries `utm_source=matchrv&utm_medium=referral&utm_campaign=<page>`, so the visit shows as MatchRV in the dealer's own analytics. |
| Whether the shopper saved a price-drop alert right before leaving | The optional "before you go" step |
| When MatchRV delivered the inquiry to the dealer | The inquiry record (and the dealer receipt, when enabled) |

No IP address, user agent or cookie is stored with a click. Contact details stay in the lead
record and are never sent to analytics.

## What a dealer needs to show to dispute a lead

A dated record of the same shopper from before MatchRV's first touch, for example a CRM entry,
a timestamped web-form submission, or a call log. MatchRV records the date, a reason, and a short
note on the lead. The verdict then changes automatically.

## How MatchRV ops records a dispute

Owner dashboard (`/ops/leads-dashboard`) → **Lead credit** section → **Record dealer dispute** on
the lead:

- **Dealer disputes (checking):** not billed while MatchRV looks into it.
- **Dealer already had this shopper: do not bill:** never billed.
- **Reviewed: MatchRV was first:** billed if the dates support it.
- **Clear review:** back to the automatic verdict.

The same is available as `POST /ops/leads-dashboard/api/leads/:id/credit` (Bearer token).

## Open questions for Jonathan and the CSO

- Is **30 days** the right window? Some lead programs use 30, some 60–90 for big-ticket items.
- Does a **click to the dealer's site with no MatchRV inquiry** earn credit (a "referral") or only
  a MatchRV inquiry? The code records the click but only inquiries become billable leads today.
- Must a lead be **qualified** (name, contact, specific RV, sent to only one dealer) to be billable?
  The code shows qualification next to the verdict but doesn't require it.
- What proof does a dealer have to show, and how long does it have to dispute after delivery?
- Who decides a disputed lead, and is there an appeal?

## Turning it on

| Var | Default | Effect |
|---|---|---|
| `LEAD_CREDIT_ENABLED` | off | Shows the Lead credit section and verdict on the dashboard, allows dispute review, fills the CSV `credit_verdict` / `credit_billable` columns. Needs `LEAD_TRACKING_ENABLED`. |
| `LEAD_CREDIT_WINDOW_DAYS` | 30 | Credit window in days (1–365). |

Evidence is captured whenever `LEAD_TRACKING_ENABLED` is on, whether or not this flag is on.
