# Competitive teardown: Lehvel ("Business Truth") vs. MatchRV

*Prepared 2026-10-12 from lehvel.com (homepage, /business-truth,
/observatory, /research, /labs, /company). Lehvel is a services-led AI
strategy/engineering firm, not a self-serve product competitor. Read it as
a packaging and trust-architecture lesson for MatchRV's dealer side.*

## What Lehvel is

A small, research-led consultancy (founder Jason Murphy, 20+ years in
digital/search) that sells one idea: **Business Truth** — a company's
verified understanding of itself, where *every fact carries a source, an
authority, and a date*. Around it: websites built for search + AI, local
presence alignment, an **AI Observatory** that records what ChatGPT,
Claude, Gemini, and Perplexity say about a business and grades each claim
against the record, and business agents for follow-ups, reviews, and
routine questions. Engagements run Research → Architect → Implement →
Integrate → Enable, deliberately building client capability rather than
dependence.

Their fact governance will look familiar — it is our data model, stated
as a business process:

| Lehvel Business Truth | MatchRV equivalent (shipped) |
| --- | --- |
| Fact states: confirmed / needs review / unknown / stopped (never publish) | `Fact<T>`: value + source + confidence; `null` = unknown, never guessed |
| Authority ranking: owner > listing > guess | Provenance ranking: dealer_listing > derived_text > derived_model_code > computed |
| Facts age; re-checked after 90–180 days | `check_availability` freshness + staleness flag (>48h = confirm with dealer) |
| "Unknown is never counted as wrong" (Observatory) | Unknown is a first-class value; unverified ≠ excluded, never silently included |
| Agent quote request: bounded action, "a person still makes every commitment" | `prepare_dealer_contact` preview → human approval token → immutable submit |

## Their evidence (small, honestly labelled — copy this discipline)

September 2026 Observatory pilot: 4 businesses, 25 answers, 135 claims —
69 supported, 2 conflicting, **64 unknown** (no fact existed to check
against). Assistants named the business in 13/13 by-name asks but only
6/12 "best provider" asks. Lehvel publishes method, limits, and sample
size next to every number ("a pilot, not a market measurement"). That
restraint is the brand.

## What it means for MatchRV

1. **Dealers have the same disease, worse.** A dealer's public truth is
   its inventory, and AI assistants already answer buyer questions about
   it from stale listings. Our AEO/GEO toolkit + visibility dashboard is
   the RV Observatory — but grounded in live normalized inventory rather
   than a brochure site. Lehvel proves businesses pay for this loop;
   nobody else can run it against 56k sourced units.
2. **"Business Truth" is the dealer pitch, translated.** Pitch each
   rooftop: *one verified record of what you stock and what it's worth,
   published to every AI that answers buyers, checked against what those
   AIs actually say, with the gaps turned into fixes.* Our shipped pieces
   (JSON-LD generator, FAQ generator, content check, visibility metrics)
   are that sentence, unbundled. Bundle and name them.
3. **The fix-verification standard.** Lehvel counts a fix only when a
   later AI answer confirms it. Our visibility dashboard should adopt
   the same rule: a checklist item moves to "fixed" only after re-asking
   the model, never when the dealer edits a page.
4. **Research as marketing.** Their quarterly, method-labelled reports
   are cheap credibility. MatchRV already owns a better dataset for this:
   the AI Visibility Audit (e.g., "GVWR is machine-readable on 0.7% of
   listings") is a Lehvel-style report waiting to be published on a
   cadence.

## What not to copy

- The services model itself. Lehvel sells engagements and enablement;
  MatchRV sells a platform and qualified leads. Borrow the language and
  the evidence discipline, not the business model.
- Generic business agents (inbox, reviews, social). Our agent surface
  stays on the buyer journey and the dealer lead — the vertical wedge.

## In one line

Lehvel sells verified truth about a business to the machines that
describe it; MatchRV already *is* verified truth about RV inventory —
the opportunity is to sell dealers the same observability Lehvel sells
everyone else, with receipts no generalist can produce.
