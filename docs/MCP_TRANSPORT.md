# MatchRV MCP transport

Branch: `chatgpt-plugin-v1` only. This work is not merged to `main`.

## Endpoint

The API server exposes a stateless Streamable HTTP MCP endpoint at:

`POST /mcp`

The implementation uses the MCP TypeScript SDK v2 `createMcpHandler` per-request server factory and the Node adapter `toNodeHandler`.

## Public V1 tools

- `search_rvs` — deterministic structured search/matching over canonical MatchRV inventory.
- `get_rv` — canonical unit detail, dealer data, provenance/freshness and unknowns.
- `compare_rvs` — deterministic 2-4 unit comparison against buyer constraints.
- `evaluate_tow_fit` — configuration-aware tow-fit screening. It is not a towing-safety guarantee.
- `contact_dealer` — two-phase contact tool. `prepare` stages a preview and sends nothing. `submit` succeeds only after the MatchRV UI has recorded explicit human approval for that preview.

## Reuse, not duplication

The MCP layer intentionally delegates to existing `@workspace/agent-core`, `agent-inventory`, and `agent-leads` code. The older `/api/tow-match` endpoint is not exposed because it relies on generic hard-coded capacities and can overstate towing safety.

## Security and trust boundaries

1. Tool inputs are Zod validated.
2. Inventory unknowns remain unknown; tool descriptions explicitly prohibit guessing.
3. The MCP client never receives the dealer-contact approval token. The token remains a MatchRV page/UI capability.
4. A prepare call is not consent to send. Submission is rejected until the human approves the exact staged preview.
5. MCP server instances are created per request. Durable business state remains in MatchRV services, not MCP session memory.
6. Authentication is not required for the read-only V1 shopping flow. Before exposing account-specific/private dealer tools, add OAuth/bearer verification in front of `/mcp` and pass verified auth context into the MCP handler.

## Install/build check

After pulling this branch, regenerate the workspace lockfile because the API package adds MCP SDK v2 dependencies:

```bash
pnpm install
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run build
```

Then connect an MCP inspector/client to the deployed `https://<host>/mcp` endpoint and exercise `tools/list` plus all five V1 tools.

## Required acceptance flow

Use a messy shopper request with multiple simultaneous constraints (location, price, RV type, sleep capacity, length/weight or tow vehicle, and features). Confirm:

1. `search_rvs` returns structured exact constraints and explainable results.
2. `get_rv` preserves provenance, freshness, and unknown fields.
3. `compare_rvs` does not manufacture missing specs.
4. `evaluate_tow_fit` surfaces configuration uncertainty and never guarantees safety.
5. `contact_dealer` with `action=prepare` creates a visible preview but sends nothing.
6. `contact_dealer` with `action=submit` fails before human approval.
7. After approval in MatchRV, the same preview can be submitted once and returns a receipt.
