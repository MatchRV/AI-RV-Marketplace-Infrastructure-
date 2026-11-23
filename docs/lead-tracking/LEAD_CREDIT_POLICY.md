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
| Shopper clicked from MatchRV to the dealer's site, **no MatchRV inquiry**, and MatchRV ops **matched** the click to the dealer's own record of that shopper | **0.5** |
| **Basic inquiry** through MatchRV (name + email, like the Rockwood 190TG lead) | **1.0** |
| **Qualified lead**: a phone number **plus** at least one real buying signal (a timeline, a trade-in, or financing interest) | **1.5** |

- A click only counts if MatchRV's click comes **before the dealer's own record** of that
  shopper, within the 30-day window.
- **No double credit.** If the same shopper (same browser session) later sends a MatchRV inquiry
  for the same RV or dealer, the inquiry counts and the click does not.
- Clicks without a session id (for example, clicks recorded before this was built) never count.
- **An unmatched click counts 0.** MatchRV ops matches a click to the dealer's own record of that shopper
  (from the dealer's CRM export, or the dealer's analytics on `utm_source=matchrv`) by recording the
  dealer record's date and where it came from. Recording the match is "sending the match" and starts the
  dealer's 7-day dispute clock for that click. Correcting a match later never restarts the clock.
- The dashboard's total counts matched click credits only. Unmatched clicks are shown as a separate count.

Buying signals come only from what the shopper wrote or chose to share: a timeline ("this
weekend", "Saturday", "within 30 days", "ready to buy"), a trade-in (mentioned, or a trade-in
value shared from the payment calculator), or financing interest (mentioned, or down payment /
APR / term / monthly payment shared). The site's prefilled "when could I come by?" doesn't count.

### 3. Disputes

- **Dispute window: 7 calendar days** from when MatchRV delivered the lead (inquiries) or sent the
  match (clicks). After that the credit stands. A dispute raised in time can still be resolved after
  the 7 days.
- **Proof required:** the dealer's own **dated** record of that shopper from **before MatchRV's
  first touch**, such as a CRM entry, an email, a web lead with a timestamp, or a call log. An
  undated claim does not overturn a lead.
- **Earliest timestamp wins.** During the pilots, **ties and close calls on the same day go to the
  dealer** (`LEAD_CREDIT_TIES_TO_DEALER`, on by default). "Same day" is the **dealer's local
  calendar day**, from the dealer's state or province (Pacific time when unknown), not UTC. A record
  with only a date counts as midnight at the start of that day in the dealer's time zone.
- **Never billable:** test leads, spam, wrong number, and duplicates (the same shopper about the
  same RV within 30 days counts once).
- **Wrong-number check:** dealers can still mark a lead "wrong number" on their receipt page. The
  owner dashboard flags any dealer that marks **more than 3** leads "wrong number" in a rolling 30 days,
  so MatchRV can check those contact details.

### 4. The evidence MatchRV keeps

| Evidence | Where it comes from |
|---|---|
| First time the shopper viewed that RV on MatchRV | The site's session journey (server-side) |
| Every time MatchRV sent the shopper to the dealer's site | MatchRV's tagged redirect (`/api/out`): time, RV or dealer, MatchRV page, and a one-way hash of the browser session id. The dealer link carries `utm_source=matchrv&utm_medium=referral&utm_campaign=<page>`, so the visit also shows as MatchRV in the dealer's own analytics. |
| Whether a price-drop alert was saved right before leaving | The optional "before you go" step |
| Whether the inquiry had a phone number, and its buying signals | The inquiry (only yes/no flags and signal names; no contact values) |
| When MatchRV delivered the inquiry, and the dispute deadline | The inquiry record (and dealer receipt, when enabled) |
| For a click: the dealer's own record date, its source, when the match was sent, and the dispute deadline | The click match recorded by MatchRV ops |

No IP address, user agent or cookie is stored with a click. Contact details stay in the lead
record and are never sent to analytics. The full trail is shown in the dashboard's dispute view
and exported in the CSV (`credit_*` columns).

## Dealer-facing summary (pilot)

**How MatchRV lead credit works (pilot)**
You never pay for a shopper you already had. A shopper counts toward MatchRV only if MatchRV reached them about your RV before you had any record of them, and they contact you within 30 days.
- An inquiry sent through MatchRV counts as 1 lead.
- An inquiry with a phone number and a real buying sign (a timeframe, a trade-in, or financing) counts as 1.5.
- A shopper who clicked from MatchRV to your website and contacted you there counts as half a lead, but only after we match them to your own record. Our links are tagged `utm_source=matchrv`, so they show up in your analytics too.

**Already had them?** Send us your dated record (a CRM entry, email, timestamped web lead or call log) within 7 calendar days of when we delivered the lead or sent you the match, and it comes off. The earliest date wins, and during the pilot a same-day tie goes to you. Test leads, spam, wrong numbers and duplicates never count. During the pilot we only count credits, and nothing is billed unless your agreement says so.

## How MatchRV ops records a dispute

Owner dashboard (`/ops/leads-dashboard`) → **Lead credit** → **Record dealer dispute** on the
lead (or on a matched click under **Click-only credits**). The form shows whether the 7-day window
is still open.

To match a click: **Click-only credits** → **Record dealer match** on the click → the date on the
dealer's own record of that shopper and where it came from (CRM export, dealer analytics on the utm
tag, timestamped web lead, email, call log). The API equivalent is
`POST /ops/leads-dashboard/api/click-matches` (Bearer token) with `{ click_key, dealer_record_at, source, note }`,
and a dispute on a match is `POST /ops/leads-dashboard/api/click-matches/credit` with `{ click_key, status, reason, proof_type, dealer_record_at, note }`.

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
| `LEAD_CREDIT_DISPUTE_DAYS` | 7 | Calendar days from delivery (inquiries) or match sent (clicks) a dealer has to dispute (1–90) |
| `LEAD_CREDIT_TIES_TO_DEALER` | on | Ties and same-day close calls (dealer's local day) go to the dealer. Set `0`/`off` to make the earliest timestamp win outright. |
| `LEAD_CREDIT_WEIGHT_CLICK` | 0.5 | Credit for a matched click-only referral (unmatched clicks count 0) |
| `LEAD_CREDIT_WEIGHT_INQUIRY` | 1.0 | Credit for a basic inquiry |
| `LEAD_CREDIT_WEIGHT_QUALIFIED` | 1.5 | Credit for a qualified lead |

Evidence is captured whenever `LEAD_TRACKING_ENABLED` is on, whether or not `LEAD_CREDIT_ENABLED` is.
