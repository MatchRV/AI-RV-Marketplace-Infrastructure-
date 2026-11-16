# Agent attribution

Records which AI integration showed a dealer's inventory and which one produced each lead. The public `/mcp`
endpoint is unchanged: same tools, schemas, instructions and no authentication.

## Three tiers, never merged

| Tier | How it is decided | Billing-grade |
|------|-------------------|---------------|
| `verified_partner` | The request carried a valid MatchRV API key | Yes |
| `unverified_host` | ChatGPT metadata (`openai/subject`, `openai/session`) or an `openai-mcp` user agent | No |
| `anonymous` | Neither | No |

Host metadata and user agents can be sent by anyone. They are kept as a label for product analytics and are
never reported as a named, billable integration. The report endpoint returns `verifiedPartners` and
`unverified` as separate sections, and a lead only lands in `verifiedPartners` when its stored tier, client id
and billing flag all agree.

## API keys

All ops routes need `Authorization: Bearer <INQUIRY_OPS_KEY>`.

```
POST /api/attribution/ops/clients             {"name":"Acme Trip Planner","scopes":["read","inquiry"],"limits":{"requestsPerMinute":120,"inquiriesPerHour":30,"unitsPerDay":5000}}
GET  /api/attribution/ops/clients
POST /api/attribution/ops/clients/<id>/revoke
```

- The key (`mrv_<id>_<secret>`) is returned once. Only its SHA-256 is stored.
- Partners send it as `Authorization: Bearer <key>` (or `X-MatchRV-Key`). An optional `X-MatchRV-Session`
  header ties one conversation's calls together.
- Scopes: `read` (default) and `inquiry` (may send dealer inquiries).
- The same key works on the partner endpoint `/mcp/v1`, where it is required. See `docs/MCP_V1.md`.
- Revoking is immediate and permanent. To rotate, create a new key, move the partner over, revoke the old one.
- On `/mcp` a missing or rejected key never blocks a request. A rejected key gets the response header
  `X-MatchRV-Key-Status: rejected` and is counted as unverified or anonymous.
- A key over its per-minute budget gets HTTP 429 with `Retry-After: 60`. Unkeyed traffic is not limited here.

## Inquiries

- A preview is bound to the identity that prepared it. A partner's preview can only be sent with that
  partner's key; a preview prepared without a key cannot be sent with one. Anything else returns
  `client_mismatch` and sends nothing.
- Sending is idempotent. A repeated or concurrent send of the same preview returns the same inquiry id and
  status token and delivers nothing further.
- A partner's sends count against its own hourly budget, not the shared one.
- Each stored inquiry carries `attribution` (tier, client, session hash, first touch). It is visible in the
  lead inbox and reports only; it is not in tool results, the dealer email or ntfy alerts.

## Report

```
GET /api/attribution/ops/report?from=2026-11-01&to=2026-11-30&dealer=<dealer id>&client=<client id>
```

Activity (searches, impressions, detail views, compares, tow checks, inquiry previews) comes from daily
counters. Leads come from the stored inquiries (tests and dry runs excluded), counted once each with their
current status. Days are UTC. Default range is the last 30 days.

## What is stored

| File (data directory) | Contents | Retention |
|---|---|---|
| `agent-clients.json` | Client name, scopes, limits, key hash | Until deleted by hand |
| `agent-attribution.json` | Daily counts per tier, client, dealer, event | `ATTRIBUTION_RETENTION_DAYS` (default 90) |
| `inquiry-signing-secret` | Secret that signs previews (only when `INQUIRY_SIGNING_SECRET` is unset) | Permanent |

No shopper name, contact detail, message, search text, IP address, user agent, API key or confirmation token
is written to the attribution file, PostHog or the logs. Sessions are stored as a salted hash, in memory only,
for 24 hours; a restart clears them, so a lead sent after a restart has no first-touch time.

All three files are written atomically (temp file, fsync, rename) with mode 0600.

## Signing secret

`INQUIRY_SIGNING_SECRET`, when set, is used as is. When it is not set, the server creates a secret in the data
directory on first start and reuses it, so previews survive restarts with no configuration change. Check which
one is in use:

```
GET /api/attribution/ops/storage   ->   signingSecret.source: "env" | "data_dir" | "ephemeral"
```

`ephemeral` means neither was available and previews die at each restart. Changing or adding the env var
invalidates previews prepared in the previous 30 minutes (the same effect a restart has today if no stable
secret exists). Sent inquiries and their status tokens keep working.

## Backups and restore

- Every write to `agent-clients.json` keeps the previous version as `agent-clients.json.bak`.
- The first write of each UTC day to `agent-attribution.json` keeps the previous file as `.bak`.
- If a file is unreadable at startup the `.bak` is loaded and a warning is raised.
- Off-box copy: freeze writes with the existing data-dir freeze route (`/api/admin/data-dir`), copy
  `agent-clients.json`, `agent-attribution.json` and `inquiry-signing-secret` together with the inquiry
  store, then unfreeze. Treat the copy as secret: the signing secret is in it.
- Restore: stop the service, put the files back in the data directory with mode 0600, start it.
- Moving hosts (the planned Google VM): add these three files to the copy set. On a blank data disk the
  service creates a new `inquiry-signing-secret` at first start, so copy the live one over it at cutover.
- Losing `agent-clients.json` means every partner needs a new key. Losing the signing secret invalidates
  previews that have not been sent yet; sent inquiries are unaffected.

## Monitoring

`GET /api/attribution/ops/storage` reports file sizes, modes, backup presence, free disk space and warnings.
The same check runs one minute after start and every six hours. Critical findings (disk below
`DATA_DISK_WARN_FREE_PCT`, default 15; a failed save; a file restored from backup) are sent to MatchRV ops
through the existing ntfy/email alert, at most once a day per set of findings.
