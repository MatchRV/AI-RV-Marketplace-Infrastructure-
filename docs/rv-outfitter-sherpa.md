# RV Outfitter — the sherpa on the Road to the Sale (any-LLM MCP guide)

MatchRV's MCP is a sherpa, not a listings feed: it learns the buyer before
showing a trailer, the way a guide learns a climber before picking a route.
The same discovery/lifestyle/tow logic lives in `lib/agent-core`
(`src/discovery.ts`) and is shared by the MCP server (ChatGPT, Muse, Meta
Muse, any MCP host), the WebMCP tools, and the matchrv.com Outfitter.

## Flow for the host LLM

1. **Discovery first.** If you don't know who sleeps in the RV, call
   `outfitter_discovery` with whatever is known. Ask its `nextQuestion` —
   one question only — then wait. Do not call `search_rvs` yet; it returns
   `status: "needs_discovery"` with zero results until `sleepers` is known
   (or the shopper literally says "just show me" → `shopper_requested_results_now: true` with their words in `shopper_words`, which the server checks).
2. **Clarify every limit's reason.** A stated max length is never assumed
   hard or soft: ask storage (physical fit — never exceed by any amount) vs.
   comfort. For comfort only, ask permission to keep the gate open 1–2 ft
   longer; approved flexibility is exactly +2 ft (`length_flex_approved`),
   declined or storage means the stated number is exact.
3. **Reflect, then search.** Briefly play back what you heard, then call
   `search_rvs` with `sleepers`, `floorplan_intent`, location, budget and
   tow vehicle. A weight limit ("under 6,000 lbs") is a ceiling — favour
   the most liveable trailer safely under it, not the smallest one.
4. **Lifestyle ranking.** 1–2 sleepers / no kids → couples layouts first
   (bunkhouses are penalised as wasted space). Kids / 3+ → capacity and
   dedicated bunks first. Every result carries `floorplan`, `match`, and
   lifestyle reasons — explain picks in those terms, with tradeoffs.
5. **Tow honesty.** Results are *preliminary* until the buyer gives the
   yellow door-sticker payload (`truck_payload_lbs`) or an exact stated
   rating. Quote GVWR, tongue = 10–15% of GVWR (never the empty hitch
   weight), and ask the payload question in `sherpa.nextQuestion`.
   `evaluate_tow_fit` with `truck_payload_lbs` returns per-unit
   `payloadFits` verdicts; payload overload is a hard fail in search.

## Tools

| Tool | Purpose |
| --- | --- |
| `outfitter_discovery` | Sherpa intake: returns the one next question, or `readyToSearch` + compiled `searchConstraints`. Stateless — pass the accumulated profile each call. |
| `search_rvs` | Gated search. Needs-discovery requests return no inventory, by design. Accepts `sleepers`, `floorplan_intent`, `wants_bunks`, `camping_style`, `truck_payload_lbs`, `truck_tow_rating_lbs`, `passengers_lbs`, `cargo_lbs`, `party_size`, `tow_vehicle`, `length_max_ft` / `no_length_limit`, `payment_method`, `shopper_requested_results_now` + `shopper_words`. Results are a shortlist of 3 (limit ≤ 10), with no total match count. |
| `get_rv` / `compare_rvs` | Full sourced detail / side-by-side, unknowns intact. |
| `evaluate_tow_fit` | Rating-range fit plus payload math when `truck_payload_lbs` is supplied. Planning guidance, never a safety guarantee. |

## Learning (Hermes-style memory)

The Outfitter remembers. Confirmed facts are stored in a learned-facts
store (`lib/agent-core/src/learning.ts`, file-backed on the server via
`LEARNED_FACTS_PATH`) and consulted before answering again:

- **Vehicle memory** — an exact tow rating / door-sticker payload confirmed
  for a vehicle descriptor is recalled for future shoppers, labelled
  *learned* with its confirmation count. It narrows the tow cap but is
  never presented as a manufacturer rating, and the shopper is asked to
  confirm it matches their exact truck. Conflicting confirmations are
  counted, not silently overwritten.
- **Unit memory** — a confirmed spec (sleeps, GVWR, bunkhouse…) overlays
  the dealer record with `learned` provenance and flows into search.
- **Pattern counters** — anonymous discovery answers (party sizes,
  intents) show what buyers actually ask for.

Teach only confirmed facts via `teach_outfitter`; inspect memory with
`outfitter_memory`. On hosts with ephemeral disks, memory lasts for the
process lifetime — point `LEARNED_FACTS_PATH` at durable storage to make
it survive redeploys.

## Regression contract

`lib/agent-core/test/discovery.test.ts` and the sherpa-gate test in
`artifacts/api-server/test/mcp-release.test.ts` pin the behaviour that
failed in the field: no inventory before sleeping-party discovery, couples
never get a bunkhouse ranked first, and payload overload hard-fails.
