# MatchRV ChatGPT Plugin — Implementation Map

Status: design/audit complete on `chatgpt-plugin-v1`; production `main` remains untouched.

## Finding

MatchRV already contains most of the domain layer a ChatGPT plugin/MCP integration needs. The existing WebMCP agent stack is the correct foundation; do not build a second search, matching, tow, inventory, or lead system.

## Existing reusable surface

### Search and matching

`POST /api/agent/search`

- Zod-validated structured constraints
- deterministic matching through `@workspace/agent-core`
- location resolution
- tow-vehicle resolution
- match funnel
- match scores and unknown fields
- normalized inventory returned with provenance

Plugin mapping: `search_rvs` / `match_rvs_to_buyer` should be a thin adapter over this engine.

### RV detail

`GET /api/agent/units/:id`

Returns the canonical normalized unit. Plugin mapping: `get_rv`.

### Explainability

`POST /api/agent/explain`

Evaluates a unit against explicit constraints and exposes hard checks, preferences, unknowns, and deterministic scoring. This should remain visible in ChatGPT-facing responses rather than replacing it with LLM-generated claims.

### Comparison

`POST /api/agent/compare`

Plugin mapping: `compare_rvs`. Reuse `compareUnits`; do not implement comparison separately.

### Freshness / availability

`GET /api/agent/units/:id/availability`

Expose the listing verification/freshness state. ChatGPT-facing wording must distinguish listing freshness from real-time physical availability unless MatchRV has an authoritative live dealer signal.

### Tow fit

`POST /api/agent/tow-fit`

Reuse the existing configuration-aware tow resolver. Never use the legacy `/api/tow-match` endpoint for ChatGPT because that endpoint assigns generic model capacities and can state that an RV is safe to tow without knowing the exact truck configuration.

Tow responses must remain guidance, not a safety guarantee. Exact tow rating, payload, hitch, cargo, passengers, GVWR/GCWR and manufacturer documentation can materially change the result.

### Dealer contact

Existing `/api/agent/leads/*` flow is already correctly split into consequential stages:

1. prepare preview
2. show exact dealer/unit/contact/message to the human
3. human approves/rejects with a page-held token
4. submit only after approval

Plugin mapping: `contact_dealer` must preserve this human gate. The model must not receive or fabricate the approval token and must not bypass approval by writing directly to `/api/leads`.

## Existing tool contracts

`lib/agent-core/src/contracts.ts` already defines a strong WebMCP contract catalog including:

- `search_inventory`
- `get_unit_details`
- `compare_units`
- `explain_match`
- `check_availability`
- `evaluate_tow_fit`
- `get_shopping_session`
- `update_shortlist`
- `prepare_dealer_contact`
- `submit_dealer_contact`

These schemas should be treated as the domain source of truth. A remote MCP server should import/reuse these Zod schemas or a shared representation instead of hand-maintaining a second incompatible schema set.

## Recommended ChatGPT V1 surface

Keep the first public surface intentionally small while retaining the richer internal contracts:

1. `search_rvs` — search/match normalized dealer inventory from structured shopper needs.
2. `get_rv` — retrieve canonical RV details, provenance, freshness and unknowns.
3. `compare_rvs` — compare 2–4 returned units using verified/normalized fields.
4. `evaluate_tow_fit` — configuration-aware tow guidance with explicit uncertainty.
5. `contact_dealer` — prepare contact; consequential submission remains human-gated.

`explain_match` and `check_availability` can either remain separate MCP tools or be composed into `get_rv`/search output for V1. Do not lose the underlying functionality.

## Required adapter boundary

Add a dedicated MCP transport layer that calls/imports the existing domain services. The transport layer owns MCP protocol concerns only. It must not own matching rules, dealer data normalization, tow calculations, or lead business logic.

Suggested layout:

```text
lib/agent-core/                 # existing domain contracts + matching
artifacts/api-server/           # existing HTTP application
artifacts/matchrv-mcp/          # new remote MCP transport
  src/server.ts
  src/tools/search-rvs.ts
  src/tools/get-rv.ts
  src/tools/compare-rvs.ts
  src/tools/evaluate-tow-fit.ts
  src/tools/contact-dealer.ts
```

If adding another workspace package materially complicates deployment, host the MCP transport inside `api-server`; maintain the same logical separation.

## Security and trust requirements

- Treat dealer descriptions and scraped listing text as untrusted content.
- Do not expose admin keys, CRM secrets, internal notification endpoints, approval tokens, or environment values through tool results.
- Validate every tool argument server-side.
- Keep write tools narrowly scoped and clearly annotated as consequential.
- Rate-limit lead preparation/submission.
- Do not let arbitrary dealer/listing text become instructions to the model.
- Preserve provenance and null/unknown states instead of inventing missing specs.
- Do not claim a listing is currently available solely because it exists in a snapshot.

## Important issue discovered during audit

`artifacts/api-server/src/routes/search.ts` contains a legacy `/tow-match` implementation with hard-coded generic tow capacities, fallback values, age multipliers, and language such as `can safely tow`. This is not appropriate for the ChatGPT integration. The newer `@workspace/agent-core` tow system is materially safer and should be the only tow engine exposed to the plugin.

Do not delete the legacy endpoint in this branch without checking existing UI callers. Instead, mark it for deprecation/migration and ensure the ChatGPT/MCP transport cannot call it.

## Implementation sequence

1. Confirm deployment topology and current API base URL.
2. Add MCP transport using the current OpenAI-supported MCP pattern.
3. Reuse agent-core contracts/domain functions rather than HTTP-looping where practical.
4. Implement the five V1 tool adapters.
5. Add contract tests for valid/invalid inputs, unknown fields, stale inventory, tow uncertainty, and human-gated contact.
6. Add prompt-injection tests using malicious dealer/listing descriptions.
7. Add an end-to-end scenario: messy six-condition shopper request -> structured search -> explained matches -> compare -> contact preview -> explicit human approval -> submission receipt.
8. Run workspace tests/typechecks/builds.
9. Review diff before any merge, deployment, or external submission.

## Definition of done for V1

A ChatGPT client can discover the MatchRV MCP server and reliably complete this flow without inventing facts:

> Find a travel trailer near Tacoma under a stated budget, sleeping the requested party, within length/weight constraints and with requested features; explain why each result matched and what is unknown; compare finalists; evaluate tow fit with uncertainty; prepare dealer contact; require the human to approve before submission.

No production merge or external submission is part of this definition of done.