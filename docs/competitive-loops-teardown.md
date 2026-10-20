# Competitive teardown: Loops (AI commerce OS) vs. MatchRV

*Prepared 2026-10-12 from Loops' funding announcement and third-party
coverage. Company-reported figures are labelled as such and are not
independently verified. MatchRV column reflects shipped code in this repo.*

## What Loops is

Loops (loopsai.com) raised a **$3.5M seed** led by a16z speedrun, with NTT
Docomo, Connecticut Innovations, Alumni Ventures, and Monday Capital. It
sells brands/retailers one "AI operating system for commerce" instead of
point tools, built on a flywheel:

> Better catalog data (enrichment) → better AI search → assistant answers
> with real context → conversations expose missing product data → back
> into enrichment.

Components: AI Search (full-sentence queries, ranked partly on retailer
revenue/margin goals), Shopping Assistant (website, mobile app, WhatsApp,
marketplace assistant incl. Trendyol), Product Enrichment (rewrites
descriptions, fills missing attributes), Customer Operations, and Virtual
Try-On (fashion). Named users: A101 (Turkish supermarket chain), Mavi
(fashion).

**Claims to treat carefully (all company-reported):** 70+ customers/pilots,
"millions of shopper experiences," 64% pilot→paid conversion, and ~83%
higher purchase conversion in assistant sessions — which Loops itself
describes as observational, not randomised. Assistant users self-select
with higher intent, so the conversion number is a signal, not proof.

## Feature-by-feature

| Capability | Loops | MatchRV | Edge |
| --- | --- | --- | --- |
| Product enrichment | Fills gaps, rewrites copy | Parses dealer text w/ provenance; unknown stays unknown | Different philosophy — see below |
| Conversational shopping | Assistant on web/app/WhatsApp | RV Outfitter sherpa (MCP + web) | Loops on channels; MatchRV on depth |
| AI search | NL queries, margin-ranked | Typed constraints, deterministic funnel | MatchRV on explainability |
| Buyer discovery | Interprets intent in chat | Gated: no inventory before sleeping party known | MatchRV |
| Safety-critical fit | None (fashion fit = try-on) | Tow/payload intelligence, GVWR + tongue math | MatchRV, decisively |
| Inventory | Retailer's own catalog feed | 56k units / 313 dealers, normalized, freshness-labelled | MatchRV |
| Leads / conversion | Assistant sessions → purchase | Qualified leads: human-approved, immutable preview | MatchRV on lead quality |
| Dealer/merchant tools | One merchant OS | AEO toolkit (JSON-LD, FAQs, content check), visibility dashboard | Loops on packaging |
| Customer operations | Support workflows included | None (intentionally out of scope) | Loops |
| Distribution | Deployed per retailer | Any-LLM MCP (ChatGPT/Claude/Meta) + WebMCP + web | MatchRV |
| Pricing | Not public (sales-led) | Not public | Even |

## The one philosophical difference to keep

Loops **fills in** missing catalog data so the assistant always has an
answer. MatchRV **refuses to guess**: a missing GVWR stays `null`, gets
labelled with provenance, and becomes a question for the dealer. In
fashion, a filled gap costs a return. In RVs, a filled gap can put a
family over payload at highway speed. Our honesty is not a limitation to
apologise for — it is the product, and it is also what makes the lead
valuable ("here is exactly what to confirm with the dealer").

## What to steal

1. **The enrichment write-back loop, our way.** Loops turns conversation
   gaps into catalog fixes. Our equivalent already exists in embryo:
   unknowns surfaced in search become dealer questions in the lead flow.
   Formalise it as a dealer-facing "data health" report — top unknown
   fields per rooftop (GVWR, sleeps, fresh water) ranked by how many
   qualified shoppers asked. That is a sellable dealer product built from
   data we already compute.
2. **Merchant packaging.** Loops sells one OS, not six tools. Our dealer
   surface (AEO toolkit + visibility dashboard + qualified leads) should
   be pitched the same way: one MatchRV dealer OS, modules inside it.
3. **Margin-aware ranking — later, carefully.** Loops ranks on retailer
   margin goals. A dealer-paid *placement* inside MatchRV results would
   corrode the trust that differentiates us; if it ever ships, it must be
   labelled and must never outrank a failed hard constraint. Park it.

## What not to chase

- Virtual try-on / visual simulation — no RV analogue worth the spend.
- Generic customer-operations/support automation — dilutes the wedge;
  dealers already have CRMs for that.
- Horizontal expansion rhetoric ("next: financial services, energy") —
  our moat is vertical depth; act like it.

## Positioning in one line

Loops helps retailers sell what they stock; MatchRV helps a family
choose a five-figure vehicle their truck can safely tow, from inventory
no single dealer controls — and proves why with receipts.

## Sources

- GlobeNewswire, "Loops Raises $3.5M to Build the AI Operating System
  for Commerce" (2026-10-12) — funding, investors, named customers.
- Unite.AI, "Loops Raises $3.5M Seed to Connect AI Search, Shopping
  Assistance, and Retail Data" — product architecture, claim caveats.
- HackerNoon / MarTechCube coverage — enrichment-first architecture,
  "AI readable product pages" data point.
