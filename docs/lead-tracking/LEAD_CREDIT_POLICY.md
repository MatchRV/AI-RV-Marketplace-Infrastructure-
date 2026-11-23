# Lead credit policy

> **Status: terms approved by Jonathan on Nov 22, 2026 (11:33 PM PT) for the dealer pilots.**
> The dealer-facing wording below is still a **pilot draft**: review it with the CSO before it
> goes into a dealer agreement. Nothing in the code bills anyone (MatchRV has no billing
> system). The code records evidence and shows verdicts, credit weights and totals on the owner
> dashboard only when `LEAD_CREDIT_ENABLED` is on (off by default).

## Why this exists

Pilot dealers asked a fair question: *"What if we both have the same lead? I don't want to pay
for my own lead."* (Fife RV.) A shopper can find an RV on MatchRV, click over to the dealer's
website, and fill out the dealer's own form. Without a record, the dealer can say the lead came
in on its own website. And a dealer should never pay for a shopper it already had.

## Approved terms

### 1. Credit window: 30 days
MatchRV's credit for a shopper lasts **30 days** from MatchRV's first touch (first view of the
RV on MatchRV, first click to the dealer's site, or the inquiry, whichever came first).

### 2. Credit weights

| What happened | Credit |
|---|---|
| Shopper clicked from MatchRV to the dealer's site, **no MatchRV inquiry** | **0.5** |
| **Basic inquiry** through MatchRV (name + email, like the Rockwood 190TG lead) | **1.0** |
| **Qualified lead**: a phone number **plus** at least one real buying signal (a timeline, a trade-in, or financing interest) | **1.5** |

- A click only counts if MatchRV's click comes **before the dealer's own record** of that
  shopper, within the 30-day window.
- **No double credit.** If the same shopper (same browser session) later sends a MatchRV inquiry
  for the same RV or dealer, the inquiry counts and the click does not.
- Clicks without a session id (for example, clicks recorded before this was built) never count.
- Click-only credits show as **provisional** until they're matched to a dealer record.

Buying signals come only from what the shopper wrote or chose to share: a timeline ("this
weekend", "Saturday", "within 30 days", "ready to buy"), a trade-in (mentioned, or a trade-in
value shared from the payment calculator), or financing interest (mentioned, or down payment /
APR / term / monthly payment shared). The site's prefilled "when could I come by?" doesn't count.

### 3. Disputes

- **Dispute window: 7 days from delivery.** After 7 days the lead stands. A dispute raised in
  time can still be resolved after the 7 days.
- **Proof required:** the dealer's own **dated** record of that shopper from **before MatchRV's
  first touch**, such as a CRM entry, an email, a web lead with a timestamp, or a call log. An
  undated claim does not overturn a lead.
- **Earliest timestamp wins.** During the pilots, **ties and close calls on the same day go to the
  dealer** (`LEAD_CREDIT_TIES_TO_DEALER`, on by default). A record with only a date counts as the
  start of that day (UTC).
- **Never billable:** test leads, spam, wrong number, and duplicates (the same shopper about the
  same RV within 30 days counts once).

### 4. The evidence MatchRV keeps

| Evidence | Where it comes from |
|---|---|
| First time the shopper viewed that RV on MatchRV | The site's session journey (server-side) |
| Every time MatchRV sent the shopper to the dealer's site | MatchRV's tagged redirect (`/api/out`): time, RV or dealer, MatchRV page, and a one-way hash of the browser session id. The dealer link carries `utm_source=matchrv&utm_medium=referral&utm_campaign=<page>`, so the visit also shows as MatchRV in the dealer's own analytics. |
| Whether a price-drop alert was saved right before leaving | The optional "before you go" step |
| Whether the inquiry had a phone number, and its buying signals | The inquiry (only yes/no flags and signal names; no contact values) |
| When MatchRV delivered the inquiry, and the dispute deadline | The inquiry record (and dealer receipt, when enabled) |

No IP address, user agent or cookie is stored with a click. Contact details stay in the lead
record and are never sent to analytics. The full trail is shown in the dashboard's dispute view
and exported in the CSV (`credit_*` columns).

## Dealer-facing summary (pilot draft, for CSO review)

> MatchRV credits a shopper to MatchRV when MatchRV's first contact with that shopper about your
> RV comes before your own first record of them, within 30 days. A click from MatchRV to your
> website counts as half a lead, an inquiry as one lead, and a qualified inquiry (phone number
> plus a timeline, trade-in or financing interest) as one and a half. You'll never be charged
> for a shopper you already had: send us your dated record (CRM entry, email or timestamped web
> lead) within 7 days of delivery. The earliest timestamp wins, and during the pilot, same-day
> ties go to you. Test leads, spam, wrong numbers and duplicates are never charged.

## How MatchRV ops records a dispute

Owner dashboard (`/ops/leads-dashboard`) → **Lead credit** → **Record dealer dispute** on the
lead. The form shows whether the 7-day window is still open.

- **Dealer disputes (checking):** not billed while MatchRV reviews it. Must be filed within 7 days.
- **Dealer's dated record is earlier: do not bill:** needs the proof type and the record's date.
- **Reviewed: MatchRV was first:** billed if the dates support it.
- **Clear review:** back to the automatic verdict.

Mark spam or a wrong number by closing the lead as **lost** with reason `spam` or `wrong_number`.
The same review is available as `POST /ops/leads-dashboard/api/leads/:id/credit` (Bearer token)
with `{ status, reason, proof_type, dealer_record_at, note }`. A late dispute returns `409
dispute_window_closed`, and an undated "already had" returns `400 dated_record_required`.

## Settings

| Var | Default | Effect |
|---|---|---|
| `LEAD_CREDIT_ENABLED` | off | Verdicts, credit weights, totals, the Lead credit section, dispute review, and the CSV verdict/weight columns. Needs `LEAD_TRACKING_ENABLED`. |
| `LEAD_CREDIT_WINDOW_DAYS` | 30 | Credit window (1–365) |
| `LEAD_CREDIT_DISPUTE_DAYS` | 7 | Days from delivery a dealer has to dispute (1–90) |
| `LEAD_CREDIT_TIES_TO_DEALER` | on | Ties and same-day close calls go to the dealer. Set `0`/`off` to make the earliest timestamp win outright. |
| `LEAD_CREDIT_WEIGHT_CLICK` | 0.5 | Credit for a click-only referral |
| `LEAD_CREDIT_WEIGHT_INQUIRY` | 1.0 | Credit for a basic inquiry |
| `LEAD_CREDIT_WEIGHT_QUALIFIED` | 1.5 | Credit for a qualified lead |

Evidence is captured whenever `LEAD_TRACKING_ENABLED` is on, whether or not `LEAD_CREDIT_ENABLED` is.
