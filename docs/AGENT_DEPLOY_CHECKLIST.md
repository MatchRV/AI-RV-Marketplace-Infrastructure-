# Deployment checklist: agent attribution (PR 1) and `/mcp/v1` (PR 2)

Merging `main` deploys to Render. Work through this in order. Nothing here changes the `/mcp` contract, so no
OpenAI review is involved.

## 0. Before anything is enabled

- [ ] MarketCheck terms are settled: whether listings read through MarketCheck may be served to third-party
      agents, whether a stored copy is allowed, and what attribution wording is required. About 18,100 of the
      122,800 served units were read that way. `/mcp/v1` stays off until then.

## 1. Merge order

- [ ] Merge PR 1 (`feat/agent-attribution`).
- [ ] PR 2 was branched from PR 1. After PR 1 is squash-merged, PR 2 conflicts in two files unless it is
      rebased first:

      git fetch origin main
      git rebase --onto origin/main feat/agent-attribution feat/mcp-v1
      git push --force-with-lease origin feat/mcp-v1

      The rebased branch has the same content as before. Then merge PR 2.
- [ ] Alternative: merge PR 2 only. It contains PR 1.

## 2. Render environment

Nothing new is required. Check these before the PR 1 deploy:

| Variable | Needed | Notes |
|---|---|---|
| `LEARNED_FACTS_PATH` | Yes (already set: `/var/data/learned-facts.json`) | Its directory is where the new files go |
| `INQUIRY_OPS_KEY` | Yes for the new ops routes | Same key the lead inbox uses |
| `ADMIN_KEY` | Yes for the write freeze | Used by `/api/admin/data-dir` |
| `INQUIRY_SIGNING_SECRET` | Optional | If set, leave it. If unset, the server creates a stable one on the disk |
| `NTFY_TOPIC` or SMTP settings | Recommended | Storage alerts use the same channel as lead alerts |
| `AGENT_V1_ENABLED` | Leave unset | `/mcp/v1` answers 404 until this is `1` |

Optional tuning, all with safe defaults: `ATTRIBUTION_RETENTION_DAYS` (90), `ATTRIBUTION_WARN_BYTES` (20 MB),
`DATA_DISK_WARN_FREE_PCT` (15), `AGENT_CLIENTS_PATH`, `ATTRIBUTION_PATH`.

## 3. Persistent storage

- [ ] The Render disk is mounted at `/var/data` and the service is a single instance. A second instance would
      keep its own counters and keys in memory and overwrite the other's files.
- [ ] Take a copy of `/var/data` before the PR 1 deploy:

      curl -X POST https://matchrv.com/api/admin/data-dir -H "x-admin-key: $ADMIN_KEY" -H "content-type: application/json" -d '{"action":"freeze"}'
      # copy /var/data off the box (Render shell or the existing backup procedure)
      curl -X POST https://matchrv.com/api/admin/data-dir -H "x-admin-key: $ADMIN_KEY" -H "content-type: application/json" -d '{"action":"unfreeze"}'

      While frozen, inquiry sends are refused with a retry message. Keep the window short.
- [ ] After PR 1, three new files appear there: `agent-clients.json`, `agent-attribution.json`,
      `inquiry-signing-secret` (only if the env secret is unset). Add them to the backup and to the Google VM
      migration copy set.

## 4. Deploy PR 1, then check production

Read-only unless marked.

- [ ] `/api/healthz` returns 200.
- [ ] The `/mcp` contract is unchanged: `initialize`, `tools/list` (11 tools, version 2.2.7) and
      `resources/list` match what they returned before the deploy. Save the three responses before merging and
      diff after.
- [ ] `GET /api/attribution/ops/storage` (ops key): `signingSecret.source` is `env` or `data_dir`, `warnings`
      is empty, both files report mode `600` once they exist.
- [ ] The ChatGPT app answers a search and a `get_rv` as before.
- [ ] (writes) Create a test key: `POST /api/attribution/ops/clients` with `{"name":"MatchRV smoke test","scopes":["read","inquiry"]}`.
- [ ] With that key, call `get_rv` on `/mcp`. A minute later `GET /api/attribution/ops/report` shows one
      `detail_view` under `verifiedPartners` for the test client.
- [ ] (writes, sends nothing) With that key, `prepare_dealer_inquiry` then `send_dealer_inquiry` with
      `dry_run: true`. Then repeat the send: same `inquiry_id`. Then send the same token with no key:
      `client_mismatch`.
- [ ] `/ops/leads` shows "Came through" on new leads.
- [ ] Revoke the test key. A call with it now returns the header `X-MatchRV-Key-Status: rejected`.
- [ ] Render logs show no line containing `mrv_`, `dic_` or a shopper email.

## 5. Deploy PR 2, then check production

- [ ] `POST /mcp/v1` returns 404 (flag unset).
- [ ] Repeat the `/mcp` contract diff.
- [ ] `/shop` search still returns results. The searchable count drops by about 1,750 (held-back listings).
- [ ] `GET /api/agent/meta` returns 200.

## 6. Turning `/mcp/v1` on (separate decision)

- [ ] Create one key per partner with limits that fit them.
- [ ] Set `AGENT_V1_ENABLED=1` (restarts the service).
- [ ] No key: 401. Test key: `tools/list` shows seven tools; `search_inventory` returns rows; `get_unit`
      returns a record with `listing.last_seen_at`; a dry-run inquiry works end to end.
- [ ] `/mcp` contract diff once more.

## 7. Rollback

- **`/mcp/v1` only:** unset `AGENT_V1_ENABLED`. The endpoint returns 404 again; nothing else changes.
- **A bad deploy:** in Render, roll back to the previous deploy, or revert the merge commit on `main`.
  - The older code ignores the three new files. Leave them in place; do not delete them.
  - Leads stored with the new `attribution` field load normally in the older code.
  - Previews prepared in the 30 minutes before a rollback may need to be prepared again.
  - Keys stop being recognised (the older code has no key check), so all traffic is unattributed until the
    fix is redeployed. `/mcp` keeps working for everyone throughout.
- **A damaged data file:** the service loads the `.bak` copy by itself and raises a storage warning. To
  restore from the off-box copy, stop the service, put the files back with mode 600, start it.
- **A leaked partner key:** `POST /api/attribution/ops/clients/<id>/revoke`. It stops working immediately.
