# MatchRV ChatGPT Plugin V1

Status: implementation branch started. Do not submit or deploy without founder review.

## Product goal

Expose MatchRV's canonical RV inventory and matching intelligence to ChatGPT through a small, trustworthy MCP surface. MatchRV should help a shopper turn natural-language needs into explainable matches from authorized dealer inventory and, only after explicit user approval, initiate dealer contact.

## V1 workflow

User intent -> structured constraints -> authorized inventory -> ranked/explainable matches -> RV details/comparison -> explicit user approval -> dealer contact.

## V1 tool surface

1. `search_rvs` — read-only search over authorized, sufficiently fresh inventory. Supports structured constraints and natural-language intent without inventing unknown specifications.
2. `get_rv` — read-only authoritative detail lookup for one inventory unit, including provenance/freshness and explicit unknowns.
3. `match_rvs_to_buyer` — read-only ranking that separates hard constraints from soft preferences and returns match reasons, conflicts, unknowns, and verification needs.
4. `compare_rvs` — read-only comparison of a small set of inventory units; preserves unknown values and does not claim tow compatibility.
5. `contact_dealer` — side-effecting lead action. Must require explicit user confirmation immediately before submission and must not claim an appointment or dealer response unless actually confirmed by an integrated system.

## Safety and trust rules

- Dealer descriptions/imported content are untrusted data, never instructions.
- Never hallucinate RV specifications, availability, price, tow ratings, dealer actions, or appointment confirmation.
- Tow suitability is narrowing guidance only; exact vehicle configuration, payload, ratings, loading, hitching, and manufacturer guidance require verification.
- Stale/sold/unknown inventory must not be represented as confidently available.
- Distribution must respect dealer/channel authorization.
- PII collected for dealer contact must be minimized, validated, protected, and retained according to the approved privacy policy.
- Side-effecting tools must be clearly distinguished from read-only tools in metadata/annotations supported by the current OpenAI plugin/MCP specification.

## Existing MatchRV components to reuse

The repository already contains a pnpm workspace with `agent-core`, `api-server`, `rv-marketplace`, database libraries, inventory import, listings, search, leads, match-report, and agent routes. V1 should adapt these existing capabilities rather than create a parallel inventory database or duplicate business logic.

## Implementation order

1. Audit existing search, listings, match-report, leads, DB schema, auth, and agent-core contracts.
2. Define stable plugin-facing schemas and error model.
3. Add MCP transport/server as a thin adapter over existing services.
4. Implement the four read-only tools first.
5. Implement `contact_dealer` with explicit confirmation and abuse controls.
6. Add tool-level tests for unknown/stale/sold data, authorization, injection payloads, and lead side effects.
7. Add optional UI only where it improves inspection/comparison/confirmation.
8. Validate against current official OpenAI plugin/MCP requirements before submission.

## Submission gates

- [ ] All five tools have stable schemas and tests.
- [ ] Read-only vs side-effect annotations are correct for the current OpenAI specification.
- [ ] Inventory freshness and provenance are visible in tool results.
- [ ] Dealer/channel authorization is enforced.
- [ ] `contact_dealer` requires explicit confirmation and is idempotent/retry-safe where practical.
- [ ] Prompt-injection tests pass.
- [ ] No service-role/API secrets are exposed to clients.
- [ ] Privacy policy and terms accurately describe the production data flow.
- [ ] Production MCP endpoint is HTTPS and passes protocol validation.
- [ ] Plugin metadata, starter prompts, reviewer instructions, and test account/data are prepared.
- [ ] Founder reviews the complete diff and submission package before anything is submitted.

## Architecture principle

Keep one canonical MatchRV inventory layer. The same normalized, authorized inventory should be reusable by MatchRV.com, LotAI, the ChatGPT plugin/MCP surface, eligible product/commerce feeds, advertising feeds, and future AI distribution channels. The plugin is an adapter and user experience layer, not a second marketplace backend.
