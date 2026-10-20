# MatchRV ChatGPT Plugin V1

Status: superseded by v2.1.0. The authoritative tool list, annotations, endpoint and data handling are in `OPENAI_PLUGIN_SUBMISSION.md`. Production endpoint: `https://matchrv-mcp.onrender.com/mcp` (and `https://matchrv.com/mcp` after the domain move; same service).

## Product goal

Expose MatchRV's canonical RV inventory and matching intelligence to ChatGPT through a small, trustworthy MCP surface. MatchRV should help a shopper turn natural-language needs into explainable matches from authorized dealer inventory and, only after explicit user approval, initiate dealer contact.

## V1 workflow

User intent -> structured constraints -> authorized inventory -> ranked/explainable matches -> RV details/comparison -> explicit user approval -> dealer contact.

## Tool surface (v2.1.0)

As implemented in `artifacts/api-server/src/mcp.ts` (host-neutral):

- Read-only: `rv_outfitter`, `outfitter_discovery`, `outfitter_guide`, `outfitter_memory`, `search_rvs`, `get_rv`, `compare_rvs`, `evaluate_tow_fit`, `prepare_dealer_inquiry` (preview only, sends and stores nothing), `get_dealer_inquiry_status`.
- Write: `teach_outfitter` (shopper-scoped memory only).
- Consequential (destructive, open-world): `send_dealer_inquiry`, which requires the preview's confirmation token and `confirmed=true`, and returns an honest delivery status (`delivered` / `queued_for_matchrv` / `failed` / `dry_run`).

Memory is scoped per shopper (`openai/subject` → `openai/session` → MCP session → issued `session_key`). Shared memory is curated and read-only. Not in the MCP surface: VIN tow-vehicle lookup (website-only via `/api/agent/*`).

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
5. Implement the dealer inquiry tools (`prepare_dealer_inquiry` / `send_dealer_inquiry` / `get_dealer_inquiry_status`) with explicit confirmation and abuse controls.
6. Add tool-level tests for unknown/stale/sold data, authorization, injection payloads, and lead side effects.
7. Add optional UI only where it improves inspection/comparison/confirmation.
8. Validate against current official OpenAI plugin/MCP requirements before submission.

## Submission gates

- [x] All twelve v2.1 tools have stable schemas and tests.
- [ ] Read-only vs side-effect annotations are correct for the current OpenAI specification.
- [ ] Inventory freshness and provenance are visible in tool results.
- [ ] Dealer/channel authorization is enforced.
- [x] `send_dealer_inquiry` requires explicit confirmation, single-use tokens and duplicate protection.
- [ ] Prompt-injection tests pass.
- [ ] No service-role/API secrets are exposed to clients.
- [ ] Privacy policy and terms accurately describe the production data flow.
- [ ] Production MCP endpoint is HTTPS and passes protocol validation.
- [ ] Plugin metadata, starter prompts, reviewer instructions, and test account/data are prepared.
- [ ] Founder reviews the complete diff and submission package before anything is submitted.

## Architecture principle

Keep one canonical MatchRV inventory layer. The same normalized, authorized inventory should be reusable by MatchRV.com, LotAI, the ChatGPT plugin/MCP surface, eligible product/commerce feeds, advertising feeds, and future AI distribution channels. The plugin is an adapter and user experience layer, not a second marketplace backend.
