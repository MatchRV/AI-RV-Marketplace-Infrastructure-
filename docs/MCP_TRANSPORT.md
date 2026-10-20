# MatchRV MCP transport (v2.1.0)

## Endpoint

Stateless Streamable HTTP MCP endpoint at `POST /mcp` on the `matchrv-mcp` Render service:
`https://matchrv-mcp.onrender.com/mcp` (and `https://matchrv.com/mcp` once the domain points at the same service).
It uses the MCP TypeScript SDK v2 `createMcpHandler` per-request server factory and the Node adapter `toNodeHandler`. `serverInfo.version` is `2.1.0`.

## Tools

See the annotation table in `OPENAI_PLUGIN_SUBMISSION.md`. In summary:
- Read-only: `rv_outfitter`, `outfitter_discovery`, `outfitter_guide`, `outfitter_memory`, `search_rvs`, `get_rv`, `compare_rvs`, `evaluate_tow_fit`, `prepare_dealer_inquiry`, `get_dealer_inquiry_status`.
- Write: `teach_outfitter` (shopper-scoped memory).
- Consequential: `send_dealer_inquiry` (destructive + open-world; requires the preview's `confirmation_token` and `confirmed=true`).

## Memory scoping

`services/learned-store.ts`: the shared layer holds curated facts only (`CURATED_FACTS_PATH`) and is read-only at runtime. Shopper-taught facts live in a per-scope store chosen by `resolveScope()`: `_meta["openai/subject"]` → `_meta["openai/session"]` → MCP session id → an opaque `session_key` issued by `teach_outfitter`. Read-only tools only call `peekScope`, `recallVehicle` and `applyMemory`; only `teach_outfitter` calls `writableScope`.

## Dealer inquiries

`services/dealer-inquiries.ts` plus `routes/inquiries.ts` (`POST /api/inquiries`, `GET /api/inquiries/:id`, ops-only `/api/inquiries/ops*`). The preview is stateless: an HMAC-signed token carries the exact preview, so the preview step has no side effects. Delivery goes to an opted-in dealer by email (`data/dealer-inquiry-routes.json`), else to the MatchRV ops queue with an ntfy/email alert, else the status is `failed`. Dry run: `dry_run: true` or `INQUIRY_DRY_RUN=1`.

Environment: `NTFY_TOPIC` / `NTFY_URL`, `GMAIL_USER` + `GMAIL_APP_PASSWORD` or `SMTP_HOST` + `SMTP_FROM` (+ `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_SECURE`), `INQUIRY_OPS_EMAIL` (default sales@matchrv.com), `INQUIRY_OPS_KEY`, `INQUIRY_SIGNING_SECRET`, `INQUIRY_DRY_RUN`, `INQUIRY_RETENTION_DAYS`, `INQUIRIES_PATH`, `DEALER_INQUIRY_ROUTES` / `DEALER_INQUIRY_ROUTES_PATH`, `SESSION_MEMORY_PATH`, `SESSION_MEMORY_TTL_DAYS`, `CURATED_FACTS_PATH`.

## Tests

- `test/mcp-memory-isolation.test.ts`: annotations, read-only tools leave memory unchanged, cross-shopper isolation, session_key behaviour.
- `test/dealer-inquiries.test.ts`: validation, preview sends nothing, confirmation and tamper checks, delivered / queued / failed / dry_run with a mock transport, rate limiting, MCP tools, HTTP endpoints.
- `test/mcp-release.test.ts`: search/outfitter release behaviour.

## Security and trust boundaries

1. Tool inputs are Zod validated; contact details are validated again server-side.
2. Unknown inventory facts remain unknown.
3. A preview is not consent. `send_dealer_inquiry` refuses without `confirmed=true` and a valid, unexpired, unused token whose content cannot be altered.
4. Inquiry status requires a per-inquiry token (stored hashed); unknown id and wrong token look identical.
5. ntfy alerts never contain shopper contact details or the message.
6. No authentication is required for the public shopping flow. Add OAuth in front of `/mcp` before exposing account-specific tools.
