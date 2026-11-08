# Google migration preparation runbook

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a later single-writer move of the live `DISABLE_DB=1` Node process onto one Google Compute Engine VM with a durable disk at `/var/data`. This pull request does not perform that move.

**Architecture:** One VM, no load balancer. Node listens on the port Render uses today. A reverse proxy on the same VM terminates TLS for `matchrv.com` with a certificate issued by DNS-01 before any A or AAAA change. Cloud Run is the wrong shape: its writable layer and ephemeral disk disappear when the instance stops, and it has no persistent disk.

**Tech Stack:** The existing Node 22 build. Inventory stays the committed gzip snapshot. No new Postgres.

**This plan is not ready to execute.** The hard blockers are listed below. A checked box in a later task is a future gate, not permission to run it from this pull request.

## Global Constraints

- Documentation only. No provisioning, billing edits, purchases, deploys, DNS changes, certificate issuance, SSH key generation, or key registration.
- Do not modify runtime code, `render.yaml`, or workflows in this pull request. The write-freeze the final copy needs is a separate, still-unapproved code change.
- Base commit for the behavior described here: `15b9c9604d27c33d031ba65183ead958039043a3`.
- Do not print secrets, contact fields, archive bodies, or key material. Private env export stays outside git.
- Placeholder tokens such as `REPO_URL` and `APPROVED_SHA` must be replaced with real values before any command is run. Do not execute a command that still contains placeholders or angle brackets.

## Plain English

The live site keeps shopper notes on a Render disk. Nothing from that disk has been copied off. Copying it while the site is still accepting writes can miss a file or catch a file halfway through a save. Render's shell exists only while the instance is running, so suspending the service first makes the copy impossible. The app has no switch that stops writes and then flushes them. Until that switch exists, there is no consistent final copy and no safe rollback.

The machine in this plan is one virtual machine with its own HTTPS certificate, checked against the name `matchrv.com` before the public address changes. A Google load balancer is not part of this plan. The hourly prices below are public list prices gathered for this document. They are not an account quote, and they are not approved.

## Hard blockers (unresolved)

These stay open. Do not describe the plan as ready while any of them is open.

- [ ] **H1 Write freeze.** Final copy and rollback are blocked. `dealer-inquiries.ts`, `learned-store.ts`, and `shopper-fit.ts` save on a 300ms or 400ms timer via `writeFileSync`. `outbound-clicks.ts` appends immediately. Nothing handles `SIGTERM` or otherwise flushes those timers. Stopping the process drops accepted writes that have not been written yet. Render SSH and the dashboard shell attach only to a running instance and close on restart ([Render SSH](https://render.com/docs/ssh)). A suspended or stopped instance cannot be copied. There is no documented Render control that freezes HTTP writes and leaves the shell up. Repeating a tar until the inquiry count is stable does not freeze session memory, shopper fit, or clicks, and it does not close the gap between the end of the copy and suspend. The missing piece is an in-app freeze, under its own approval: reject new mutations, flush the timers, keep the process running so SSH still works, and report freeze state without printing records. Until that code exists, every copy is crash-consistent only.
- [ ] **H2 TLS before cutover.** ChatGPT uses `https://matchrv.com`. Cutover is blocked until that name verifies against the VM address with a publicly trusted certificate. The route is DNS-01 plus a reverse proxy on the VM, not a load balancer. Issuing the certificate needs a DNS TXT record, which is a separate approval (G-DNS). No certificate and no DNS record are created here.
- [ ] **H3 Backup.** No archive has been taken. A denied login from one desktop means the key that desktop offered was not accepted. It does not prove the Render account has no other keys. This pull request registers none.
- [ ] **H4 Billing.** The billing account is closed. Reopening charges every linked project. Reported credits are not verified. The Iowa totals are an unapproved planning estimate.
- [ ] **H5 Build capacity.** e2-small is a runtime candidate only. A full `pnpm install` and build on a 2 GB machine is not proven. Build elsewhere and copy the artifacts, or get a separate approval to measure a 4 GB machine.

## What the code actually writes

`LEARNED_FACTS_PATH` defaults the directory. These env names override the files. A backup of `/var/data` alone is incomplete when any resolved path sits outside that mount. Paths outside the mount are ephemeral on Render ([persistent disks](https://render.com/docs/disks)).

| Env name | File when unset, beside `LEARNED_FACTS_PATH` | Durable write |
| --- | --- | --- |
| `SESSION_MEMORY_PATH` | `session-memory.json` | `teach_outfitter` schedules a full-file write in 400ms |
| `INQUIRIES_PATH` | `dealer-inquiries.json` | non-dry-run `sendInquiry` schedules a full-file write in 300ms |
| `SHOPPER_FIT_PATH` | `shopper-fit.json` | `search_rvs` calls `rememberFit` when the caller has a scope id, 400ms |
| `OUTBOUND_CLICKS_PATH` | `outbound-clicks.jsonl` | `GET /api/out` appends a line immediately |
| `CURATED_FACTS_PATH` | `data/curated-facts.json` in the repo | read-only |

`sendInquiry` persists with `.filter((i) => !i.dryRun)`. A dry run is memory-only. It does not prove the disk. `INQUIRY_DRY_RUN` forces that path. `prepareInquiry` does not write the store.

`search_rvs` does not write when `resolveScope` returns `id: null` (no OpenAI subject, no OpenAI session, no `mcp-session-id`, no `session_key`). A preflight search must omit those or it will write `shopper-fit.json`.

`activeConfig()` returns null when `POSTHOG_PROJECT_API_KEY` is unset. An empty `POSTHOG_HOST` does not disable capture: `normalizeHost` defaults it to `https://us.i.posthog.com` whenever the key is set. A host that is set to something other than that URL or `https://eu.i.posthog.com` does disable capture, but the preflight still leaves the key unset. Setting the key is a separate authorization.

`app.listen(port)` does not pass a host, so Node listens on every interface. The guest firewall and the VPC firewall must expose 443 only. Do not publish the Node port.

`render.yaml` sets `DISABLE_DB=1` and `LEARNED_FACTS_PATH=/var/data/learned-facts.json`. `DATABASE_URL` wins over `DISABLE_DB` in `lib/db/src/index.ts`. Leave `DATABASE_URL` unset. Observed process RSS on Render was about 643–716 MiB, and the snapshot gzip trailer is 521,508,319 bytes. That is why 1 GB is too small at runtime. It is not a measurement of a compile.

## Who owns what

Jonathan owns billing, the decision to reopen, DNS including any TXT record, OS updates, backups, restores, and the bill. A later helper runs commands only after the gate for that command is open. This pull request does none of those.

## Financial preflight (planning estimate only)

Public list prices gathered for this runbook from Google's pricing pages. Jonathan did not research these rates, and he has not approved a purchase. This is not an invoice and not a ceiling Google will enforce.

Do not treat credits as active. Do not create another billing account to receive them. Program terms issue credits only after written acceptance, and only into the billing account ID on the application ([program](https://cloud.google.com/startup), [terms](https://cloud.google.com/terms/startup-program-tos), [FAQ](https://cloud.google.com/startup/faq)). The reported name `2024GFSCloudProgram-Start`, the reported 2000 USD remainder, and the reported Mar 19, 2026–Mar 19, 2028 window are not on those public pages. The account Credits page is what shows name, status, remainder, scope, and dates ([savings and credits](https://docs.cloud.google.com/billing/docs/how-to/reports/savings-and-credits)). A closed account is not documented as deleting that balance, and it is not documented as spendable while the account stays closed.

Reopening, per [Close or reopen your Cloud Billing account](https://docs.cloud.google.com/billing/docs/how-to/close-or-reopen-billing-account): every project linked to that account can incur charges again, not only MatchRV. Clear payment problems first. An invoiced account is reopened by Cloud Billing Support.

Iowa (`us-central1`) list prices used for the arithmetic:

| Piece | Published rate used | 730-hour month |
| --- | --- | --- |
| e2-small, shared-core, not a dedicated 2-CPU machine | 0.016752855 USD/hour | 12.23 USD |
| e2-medium, shared-core, not a dedicated 2-CPU machine | 0.03350571 USD/hour | 24.46 USD |
| 30 GiB standard boot + 10 GiB standard data | 0.04 USD/GiB-month | 1.60 USD |
| One in-use external IPv4 | about 3.65 USD/month | 3.65 USD |
| Illustrative 10 GiB regional snapshots | | 0.50 USD |

About 17.98 USD/month on e2-small and 30.21 USD/month on e2-medium, before egress, logs, operations, tax, and other linked projects. The VM price sheet does not include disk or networking ([VM pricing](https://cloud.google.com/compute/vm-instance-pricing), [disk pricing](https://cloud.google.com/compute/disks-image-pricing), [network pricing](https://cloud.google.com/vpc/network-pricing)). Premium Tier egress is the default. This plan adds no load balancer. Adding one is a different design and needs its own cost approval.

e2-small (2 GB) is the runtime candidate because of the observed RSS. It is not approved, and it is not a build machine. e2-medium is the larger shared-core list-price row if a 4 GB runtime or a measured build is later approved. Read the memory column on the pricing page at approval time.

An alerts-only budget does not cap spending ([budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets)). A spend cap pauses one eligible service on one project ([spend caps](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)). Do not treat either, including a 2026 preview, as an off switch for this VM.

## Other gates

Migration of the current core does not wait on Supabase. A paused Supabase export is separate preservation work. It is not required for `DISABLE_DB=1`, and it is not done.

- [ ] **G1 Billing.** Linked projects, payments, and the Credits page are inspected before any reopen. SKU coverage for Compute Engine, disk, and in-use IPv4 is copied into private notes. One of the two Iowa estimates is approved in writing, with the exclusions above.
- [ ] **G2 Crash-consistent copy.** After H3's identity is sorted and Jonathan authorizes SSH, stream the running disk to a private machine he controls. Label it crash-consistent. It is not the cutover copy. H1 still blocks the final copy.
- [ ] **G3 Private env.** Copy names and values from the Render dashboard into a private store. Do not commit them. Do not print them.
- [ ] **G-DNS.** Jonathan approves a DNS-01 TXT record for `matchrv.com` at the DNS provider. This is not approval to change A or AAAA records.
- [ ] **G5 Shell identity.** A future backup uses a key Jonathan registers himself, on a running instance, per [Render SSH](https://render.com/docs/ssh). Not in this pull request.

## Env names (no values)

Required for the same mode as today: `DISABLE_DB=1`, `PORT`, `NODE_ENV=production`, `LEARNED_FACTS_PATH=/var/data/learned-facts.json`. Node `>=22.12`. Leave `DATABASE_URL` and `PGLITE_DATA_DIR` unset. Leave `POSTHOG_PROJECT_API_KEY` and `POSTHOG_HOST` unset unless a separate decision authorizes capture.

Copy only if set on the live service. Never commit the values. Preflight must leave SMTP, Gmail, ntfy, Twilio, and `LOTLINK_CRM_WEBHOOK_URL` unset so nothing is delivered.

`INQUIRIES_PATH`, `SESSION_MEMORY_PATH`, `SHOPPER_FIT_PATH`, `OUTBOUND_CLICKS_PATH`, `CURATED_FACTS_PATH`, `SESSION_MEMORY_TTL_DAYS`, `SHOPPER_FIT_TTL_DAYS`, `INQUIRY_RETENTION_DAYS`, `INQUIRY_OPS_KEY`, `INQUIRY_SIGNING_SECRET`, `INQUIRY_OPS_EMAIL`, `INQUIRY_DRY_RUN`, `DEALER_INQUIRY_ROUTES`, `DEALER_INQUIRY_ROUTES_PATH`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NTFY_TOPIC`, `NTFY_URL`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PROXY_URL`, `ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `OUTFITTER_MODEL`, `OPENAI_APPS_CHALLENGE`, `ADMIN_KEY`, `IMPORT_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `SMS_ALERT_TO`, `STALE_LISTING_MAX_AGE_DAYS`, `GEMINI_API_KEY` and other `GEMINI_*`, `RIDB_API_KEY`, `NPS_API_KEY`.

## Future tasks (not run by this pull request)

### Task 1: Crash-consistent copy from the running instance

**Blocked as a final copy by H1.** Allowed later only as a crash-consistent private copy after G5.

Render's shell is the service user on a running instance. The SSH docs do not provide sudo or root for this service. Do not use `sudo`. If the service user cannot read a path, stop and record the path. Do not write an archive on the instance. `/tmp` is ephemeral and would be a remote file full of shopper data.

Official copy tool after SSH is set up: `scp -s` ([disks](https://render.com/docs/disks)). On Windows, run the stream from `cmd.exe`. PowerShell `>` and `Out-File` can rewrite bytes. Do not generate or register a key in this pull request.

```bat
scp -s -r SSH_USER@ssh.REGION.render.com:/var/data LOCAL_PRIVATE_DIR
```

`SSH_USER` and `REGION` come from the service SSH command in the dashboard. Replace them before running. A stream that avoids a remote archive, also from `cmd.exe`:

```bat
ssh SSH_USER@ssh.REGION.render.com "tar -C /var/data -cf - ." > LOCAL_PRIVATE.tar
```

Before the copy, print only these names, not the rest of the environment: `DISABLE_DB`, `LEARNED_FACTS_PATH`, `SESSION_MEMORY_PATH`, `INQUIRIES_PATH`, `SHOPPER_FIT_PATH`, `OUTBOUND_CLICKS_PATH`, `CURATED_FACTS_PATH`. Expect `DISABLE_DB=1`. For each path that is set, record whether it is inside the mount. Copy every existing override path in the same private transfer. A path outside the mount is ephemeral and must be called out. A missing expected file means the copy is incomplete.

On the private machine, check the received bytes:

- SHA-256 of the archive or of the `scp` tree as received. That checks transit of those bytes only.
- Reject archive members that are absolute or contain `..`.
- Per-file SHA-256 of regular files.
- For each `.json` file, parse it and print the type plus the object-key count or array length. Print no values.
- For each `.jsonl` file, count lines that parse as JSON and lines that do not. A line count is not a count of valid business records, and a key count is not proof the records are the ones the app would accept.
- Do not `type`, `Get-Content`, or `cat` the files. Do not equate this manifest with a frozen copy.

### Task 2: Artifact and VM boot

**Blocked by G1, H5, and G-DNS before any public name is served.**

Build `pnpm install --frozen-lockfile`, `pnpm build:web`, and `pnpm build:api` on a machine where the memory budget is already known, or on an e2-medium only after that 4 GB spend is approved and the build is measured. Copy `artifacts/api-server/dist` and the built web assets to the VM. Do not treat e2-small as able to compile this repo.

`git clone --branch` accepts a branch or tag name. It does not accept an arbitrary commit. After the placeholders are replaced:

```bash
git clone REPO_URL matchrv
cd matchrv
git checkout --detach APPROVED_SHA
```

Default `APPROVED_SHA` is `15b9c9604d27c33d031ba65183ead958039043a3` until Jonathan names a newer `main`.

Boot design, without a sample unit file:

- Data disk mounted at `/var/data` by filesystem UUID. `fstab` must not use `nofail`. A missing disk must fail boot of the app, not fall through to an empty directory on the boot disk.
- The Node service `Requires=` and `After=` that mount. A readiness command exits non-zero unless `findmnt` shows `/var/data` is that UUID. The service does not start otherwise, and it must not create `/var/data` on the root filesystem.
- The runtime user owns the mounted tree. The process does not run as root.
- The reverse proxy is its own service, starts on boot, listens on 443, and proxies to the Node port on the loopback or the firewalled port. Node also starts on boot, after the mount check.
- Unpack the crash-consistent tree only after the mount check passes. Ownership is the runtime user.

### Task 3: Prove a real write, then reboot

Do this on the mounted disk before the production tree is unpacked, or with every write path pointed at `/var/data/fixture-run` and nowhere else. Do not point the fixture process at the restored production files.

`teach_outfitter` is a durable write. Dry-run inquiry is not. Start a fixture process with SMTP, ntfy, Twilio, CRM, and PostHog unset, `DISABLE_DB=1`, and the four write paths under `/var/data/fixture-run`.

Tool names registered in `artifacts/api-server/src/mcp.ts`: `teach_outfitter`, `outfitter_memory`, `outfitter_discovery`, `outfitter_guide`, `search_rvs`, `get_rv`, `compare_rvs`, `evaluate_tow_fit`, `prepare_dealer_inquiry`, `send_dealer_inquiry`, `get_dealer_inquiry_status`.

Persist proof, from the shape in `mcp-release.test.ts`:

```bash
curl -fsS http://127.0.0.1:FIXTURE_PORT/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"teach_outfitter","arguments":{"vehicle":"2099 Test Hauler XLT","tow_rating_lbs":9100,"payload_lbs":1420}}}'
```

Wait at least one second. The timer is 400ms, and a kill does not flush it. `session-memory.json` under the fixture directory must parse as an object. Print the key count only. Reboot. The service must come back because of the boot design in Task 2, and the fixture file's per-file SHA-256 must match. If the process is absent after reboot, the boot design failed. Stop.

Then delete `/var/data/fixture-run` before unpacking production data. The pre-reboot manifest for production files excludes this fixture directory. Do not compare a re-packed tar to the original archive hash. gzip timestamps and member order change that hash. Compare per-file SHA-256.

Non-delivery check on the fixture process only. Take `unit_id` from a `search_rvs` result. Do not invent one. `prepare_dealer_inquiry` with a fake name and `fixture@example.com` returns `preview_only_nothing_sent` and must not create `dealer-inquiries.json`. `send_dealer_inquiry` with `confirmed` true and `dry_run` true returns status `dry_run`. The inquiry file must still be absent or unchanged, because dry runs are filtered out of the save. Do not call `send_dealer_inquiry` with `dry_run` false. Do not call `GET /api/out`.

### Task 4: TLS on the VM, before any A or AAAA change

No load balancer. Google-managed certificates stay `PROVISIONING` until public DNS points at a load balancer, so they are the wrong tool for a pre-cutover check on this one VM.

Future issuance, after G-DNS, is Certbot DNS-01 ([Certbot DNS plugins](https://eff-certbot.readthedocs.io/en/stable/using.html#dns-plugins)):

```bash
certbot certonly --manual --preferred-challenges dns -d matchrv.com
```

That command is not run here. It asks for a TXT record at `_acme-challenge.matchrv.com`. Jonathan creates that record only after G-DNS. HTTP-01 and TLS-ALPN-01 cannot succeed before the A record points at this VM, so they are not the pre-cutover method. Renewal needs the same DNS access again, or a DNS plugin with credentials stored outside git. The reverse proxy serves the issued full chain and key as files. It does not use Caddy's automatic HTTP issuer.

`curl --resolve` is a curl option ([curl man page](https://curl.se/docs/manpage.html)). It connects to the given address and still checks the certificate for the hostname. It does not change public DNS.

```bash
curl --resolve matchrv.com:443:VM_IP https://matchrv.com/api/healthz
```

OpenSSL must send SNI, check the hostname, and use a trusted CA bundle. A chain-only success is not enough:

```bash
echo | openssl s_client -connect VM_IP:443 -servername matchrv.com \
  -verify_hostname matchrv.com -verify_return_error -CApath /etc/ssl/certs
```

Use the guest's trusted CA directory or bundle (`-CApath` or `-CAfile`). Do not pass the server's own leaf as the trust anchor. Cutover stays blocked until both commands succeed for `matchrv.com`. ChatGPT will keep using the public name. A certificate that only works by raw IP is a failure.

### Task 5: Read checks and cutover

Read checks hit the production process only when they cannot write. Omit `mcp-session-id` and `session_key`. Leave PostHog unset.

```bash
curl --resolve matchrv.com:443:VM_IP https://matchrv.com/api/healthz
curl --resolve matchrv.com:443:VM_IP 'https://matchrv.com/api/listings?limit=1'
curl --resolve matchrv.com:443:VM_IP https://matchrv.com/api/search/filters
curl --resolve matchrv.com:443:VM_IP https://matchrv.com/api/swipe/deck \
  -H 'content-type: application/json' -d '{"rvType":"travel_trailer"}'
curl --resolve matchrv.com:443:VM_IP https://matchrv.com/api/agent/search \
  -H 'content-type: application/json' \
  -d '{"constraints":{"rvTypes":["travel_trailer"],"location":{"place":"Tacoma, WA","radiusMiles":50}},"limit":3}'
curl --resolve matchrv.com:443:VM_IP https://matchrv.com/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"preflight","version":"0"}}}'
curl --resolve matchrv.com:443:VM_IP https://matchrv.com/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_rvs","arguments":{"location":"Tacoma, WA","radius_miles":50,"condition":"new","shopper_requested_results_now":true,"shopper_words":"just show me","limit":3}}}'
curl --resolve matchrv.com:443:VM_IP https://matchrv.com/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"outfitter_guide","arguments":{"query":"how does payload and tongue weight work?"}}}'
```

`GET /api/listings` and `GET /api/search/filters` use the snapshot when `DB_MODE` is `none`. `POST /api/agent/search` validates `constraints` from `constraintsSchema` in `lib/agent-core/src/contracts.ts`. Do not call `POST /api/outfitter/chat` for this check. That route calls Anthropic when a key is set, and returns 503 `ai_not_configured` when it is not. `outfitter_guide` is the local read. Startup must log database mode `none` and must not start the enrichment or scraper cron.

After these reads, the per-file SHA-256 of the production tree must match the manifest from before the reads. If `shopper-fit.json` or `outbound-clicks.jsonl` changed, a write leaked into the production process. Stop.

**Cutover is blocked by H1 and H2.** When both are closed, the order is: freeze on Render while the process stays up, flush, stream every affected file, verify per-file SHA-256 on the private copy and again on the VM, confirm the VM is the only writer, then change A and AAAA. Suspend is not the freeze. Suspend removes SSH, so it cannot come before the frozen copy. Do not delete Render. Overlap cost continues until Jonathan later approves stopping it.

### Task 6: Rollback

Rollback is blocked by the same freeze. On the VM, `systemctl stop` without a flush drops the 300ms and 400ms timers. The freeze has to reject writes and flush first. Then copy every affected file to the private machine and verify per-file SHA-256.

Render must be running to receive files, and it must already be frozen so resume does not accept new shopper writes during the copy. Copy the frozen tree into the resolved paths, including overrides. Verify the on-disk per-file SHA-256 matches the frozen manifest. Only then point DNS back and lift the freeze on Render. Leave the VM stopped as a writer. "Decide whether to copy" is not a restore. A partial copy with both sides writable loses records.

## Acceptance for a later execution

All of these, or the run is not accepted:

- H1, H2, H4, H5, G1, and G-DNS closed before cutover. H3 closed before any claim of a backup.
- Crash-consistent copy labeled as such. Final copy taken only under freeze, with per-file SHA-256, safe path checks, JSON parse counts, and JSONL valid-versus-invalid line counts. No archive bodies printed.
- `matchrv.com` passes `curl --resolve` and `openssl s_client -verify_hostname` against the VM address before A/AAAA changes.
- Read checks above return, including a `search_rvs` shortlist and `outfitter_guide`, with PostHog unset and no `GET /api/out`.
- Fixture `teach_outfitter` file survives reboot via the boot services. Dry-run inquiry does not change `dealer-inquiries.json`. Fixture directory removed before production unpack. Production manifest unchanged by the reads.
- Mount missing: Node does not start and does not create `/var/data` on the boot disk.
- Render service and disk still exist.

## Out of scope

Supabase export (separate preservation, not a blocker for this core), new Postgres, Clerk restore, Cloud Run, a load balancer, changing MCP tool schemas, implementing the write freeze in this pull request, registering SSH keys, and running any command above.
