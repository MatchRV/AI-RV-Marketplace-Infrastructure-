# MatchRV MCP transport (v2.2.7)

## Endpoint

Stateless Streamable HTTP MCP endpoint at `POST /mcp`:
`https://matchrv.com/mcp`.
It uses the MCP TypeScript SDK v2 `createMcpHandler` per-request server factory and the Node adapter `toNodeHandler`. `serverInfo.version` is `2.2.7`.

## Tools

See the annotation table in `OPENAI_PLUGIN_SUBMISSION.md`. In summary:
- Read-only: `outfitter_discovery`, `outfitter_guide`, `outfitter_memory`, `search_rvs`, `get_rv`, `compare_rvs`, `evaluate_tow_fit`, `prepare_dealer_inquiry`, `get_dealer_inquiry_status`.
- Write: `teach_outfitter` (shopper-scoped memory).
- Consequential: `send_dealer_inquiry` (destructive + open-world; requires the preview's `confirmation_token` and `confirmed=true`).

## Memory scoping

`services/learned-store.ts`: the shared layer holds curated facts only (`CURATED_FACTS_PATH`) and is read-only at runtime. Shopper-taught facts live in a per-scope store chosen by `resolveScope()`: `_meta["openai/subject"]` → `_meta["openai/session"]` → MCP session id → an opaque `session_key` issued by `teach_outfitter`. Read-only tools only call `peekScope`, `recallVehicle` and `applyMemory`; only `teach_outfitter` calls `writableScope`.

## Dealer inquiries

`services/dealer-inquiries.ts` plus `routes/inquiries.ts` (`POST /api/inquiries`, `GET /api/inquiries/:id`, ops-only `/api/inquiries/ops*`). The preview is stateless: an HMAC-signed token carries the exact preview, so the preview step has no side effects. Delivery goes to an opted-in dealer by email (`data/dealer-inquiry-routes.json`), else to the MatchRV ops queue with an ntfy/email alert, else the status is `failed`. Dry run: `dry_run: true` or `INQUIRY_DRY_RUN=1`.

While the data directory is frozen (`POST /api/admin/data-dir` with `{"action":"freeze"}` and `x-admin-key`), a confirmed `send_dealer_inquiry` or `POST /api/inquiries` is refused before anything is sent or stored. The tool error is `writes_frozen` with `retryable: true` and `sent: false`. The HTTP response is 503 with `Retry-After: 120`. The confirmation token stays unused. Preview still works. `teach_outfitter` returns the same error. Search and the other read tools keep working; `search_rvs` does not update shopper-fit during the freeze, and `GET /api/out` still redirects without appending a click. See the migration runbook section "Write freeze".

Environment: `NTFY_TOPIC` / `NTFY_URL`, `GMAIL_USER` + `GMAIL_APP_PASSWORD` or `SMTP_HOST` + `SMTP_FROM` (+ `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_SECURE`), `INQUIRY_OPS_EMAIL` (default sales@matchrv.com), `INQUIRY_OPS_KEY`, `INQUIRY_SIGNING_SECRET`, `INQUIRY_DRY_RUN`, `INQUIRY_RETENTION_DAYS`, `INQUIRIES_PATH`, `DEALER_INQUIRY_ROUTES` / `DEALER_INQUIRY_ROUTES_PATH`, `INQUIRY_SAFETY_SWEEP` (set to `1` to run the in-process queued-lead sweep every 10 minutes; off by default), `SESSION_MEMORY_PATH`, `SESSION_MEMORY_TTL_DAYS`, `CURATED_FACTS_PATH`.

The safety sweep, forward confirmation, and alert setup are documented in `docs/INQUIRY_SAFETY_NET.md`. `queued_for_matchrv` is not `forwarded`. `forwarded` is set only when an ops user confirms in `/ops/leads`.

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
