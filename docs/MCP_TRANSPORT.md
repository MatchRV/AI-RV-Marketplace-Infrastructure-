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

## Browser approval from ChatGPT

`contact_dealer(action="prepare")` returns the immutable `preview`, a clickable
`reviewUrl`, `expiresAt`, and an explicit demo-delivery notice. The assistant must
show the link to the shopper, not open or approve it on their behalf. Saying
"good to go" in chat does not itself record the browser approval.

The shopper opens `/api/agent/leads/:id/review`, sees the exact RV, dealer, contact
details and message, then clicks **Approve request** or **Reject request**. GET
requests only display the page; link previews and page refreshes cannot approve
or submit anything. Approval returns a confirmation telling the shopper to go
back to ChatGPT. `contact_dealer(action="submit", preview_id=...)` then records
that same payload. An early submit repeats the review URL instead of leaving
the shopper at an unexplained dead end.

The server issues the existing single-use decision token to the browser in an
HttpOnly, SameSite=Strict cookie scoped to this preview's review path (Secure on
HTTPS). It is absent from the URL, HTML, and MCP results. Decisions require the
cookie and a same-origin form POST; cross-origin reads, framing, and caching are
disabled for the review page. The link is a private bearer link to an anonymous
demo preview, not authenticated proof of the shopper's identity; anyone with
that link can review it. Do not share it publicly.

Set `MATCHRV_PUBLIC_URL` to the HTTPS origin of the API/MCP service, for example
`https://matchrv-mcp.onrender.com`. `RENDER_EXTERNAL_URL` is the fallback when
provided by the host. No request Host header is trusted to construct this URL.
Without a valid origin in production, prepare fails with
`approval_review_unavailable`. Local development permits a loopback HTTP origin;
CI sets it explicitly. No frontend build or separate approval application is
required: Express serves the review page.

Previews retain the existing 30-minute approval window and in-memory storage.
They are lost on restart and require a single process (or sticky routing).
Expired or missing previews show a recovery message asking the shopper to
prepare a new one. Durable, multi-instance storage is a separate production
requirement.

**Delivery remains demo-only.** Approval and submission record a lead; they do
not email/text the dealership, buy or reserve an RV. The page, tool description,
and receipt must not claim otherwise. Real dealer delivery is outside this fix.

`artifacts/api-server/test/mcp-approval.test.ts` exercises six-condition search,
comparison, MCP preparation, browser review/decision, and MCP submission through
HTTP with fixed fixtures and a throwaway database. It also checks missing and
cross-preview cookies, foreign origins, replay, rejection, expiration, lost
previews, HTML escaping, production URL configuration, and unchanged payloads.
