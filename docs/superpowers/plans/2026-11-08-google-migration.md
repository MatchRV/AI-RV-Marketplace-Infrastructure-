# Google migration preparation runbook

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a later single-writer move of the live `DISABLE_DB=1` Node process onto one Google Compute Engine VM with a durable disk at `/var/data`. This pull request does not perform that move.

**Architecture:** One VM, no load balancer. Node listens on the port Render uses today. A reverse proxy on the same VM terminates TLS for `matchrv.com` with a certificate issued by DNS-01 before any A or AAAA change. Cloud Run is the wrong shape: its writable layer and ephemeral disk disappear when the instance stops, and it has no persistent disk.

**Tech Stack:** The existing Node 22 build. Inventory stays the committed gzip snapshot. No new Postgres.

**Cutover is not ready.** H1 (write freeze) and H2 (public TLS) stay closed. A staging install on the already-created VM is the next procedure. This pull request still does not SSH, deploy, or change DNS.

## Global Constraints

- No provisioning, billing edits, purchases, deploys, DNS changes, certificate issuance, SSH key generation, or key registration from this runbook.
- The write freeze lives in the API process. Operate it with "Write freeze" below. Do not change `render.yaml` from that procedure.
- Base commit for the behavior described here: `15b9c9604d27c33d031ba65183ead958039043a3`.
- Do not print secrets, contact fields, archive bodies, or key material. Private env export stays outside git.
- Placeholder tokens such as `REPO_URL` and `APPROVED_SHA` must be replaced with real values before any command is run. Do not execute a command that still contains placeholders or angle brackets.

## Plain English

The live site keeps shopper notes on a Render disk. Copying that disk while saves are still landing can miss a file or catch a file halfway through a save. The process can freeze those saves without exiting: an admin call flushes the debounced writes, then refuses new durable writes, and a status call reports when nothing is still pending. Shopper reads, search, and MCP tools keep working. A confirmed dealer inquiry during the freeze is refused before it is sent or stored, with a retryable error, so the shopper can send the same preview again after the freeze lifts. SIGTERM and SIGINT flush pending saves and then exit. SIGKILL does not. Render's shell exists only while the instance is running, so the freeze has to leave the process up. H1 stays open until that procedure has been used for the final copy.

The machine in this plan is one virtual machine with its own HTTPS certificate, checked against the name `matchrv.com` before the public address changes. A Google load balancer is not part of this plan. The hourly prices below are public list prices gathered for this document. They are not an account quote. The e2-small target was later approved; the credit's SKU scope is still not.

## Hard blockers (unresolved)

These stay open. Do not describe the plan as ready while any of them is open.

- [ ] **H1 Write freeze.** Final copy and rollback stay blocked until the live process is frozen with the procedure in "Write freeze" and the copy is verified. `dealer-inquiries.ts`, `learned-store.ts`, and `shopper-fit.ts` still save on a 300ms or 400ms timer. `outbound-clicks.ts` still appends immediately. SIGTERM and SIGINT flush those timers before exit. SIGKILL does not. Render SSH and the dashboard shell attach only to a running instance and close on restart ([Render SSH](https://render.com/docs/ssh)). A suspended or stopped instance cannot be copied. Repeating a tar until the inquiry count is stable does not cover session memory, shopper fit, or clicks. The freeze keeps the process running, flushes the timers, refuses new durable writes, and reports state without printing records.
- [ ] **H2 TLS before cutover.** ChatGPT uses `https://matchrv.com`. Cutover is blocked until that name verifies against the VM address with a publicly trusted certificate. The route is DNS-01 plus a reverse proxy on the VM, not a load balancer. Issuing the certificate needs a DNS TXT record, which is a separate approval (G-DNS). No certificate and no DNS record are created here.
- [ ] **H3 Backup.** A desktop copy of the live Render `/var/data` was verified at 2:48 PM PST on Nov 8, 2026: four files, `dealer-inquiries` with 4 records, `learned-facts`, `shopper-fit`, and one outbound-click line. `session-memory.json` was absent. That copy is crash-consistent. A restorable backup of the writer follows "Write freeze": freeze, GET until `frozen` is true and `pending` is false, then copy. Unfreeze only to resume writes on that same process. Runtime env values and the git inventory snapshot were not in the Nov 8 copy. A denied desktop SSH login still does not prove the Render account has no other keys. This pull request registers none.
- [ ] **H4 Billing.** The console was independently read as billing account `01E001-C07D15-6638A4`, appearing open, with 2000 USD available at 100 percent from Mar 19, 2026 through Mar 19, 2028. This agent did not open that console. Which SKUs the credit pays is still unconfirmed, so the credit is not yet proof it covers Compute Engine, disk, or IPv4. Do not create a second billing account. Reopening a closed account would still bill every linked project.
- [ ] **H5 Memory headroom.** e2-small is the approved runtime target. A 2 GiB cgroup was not enforceable in the sandbox that ran the build (permission denied on `memory.max`; the parent limit was 15,706,882,048 bytes). Sampled peaks there: API build about 469 MiB RSS, web build about 1371 MiB RSS, server VmHWM about 1459 MiB after the smoke calls. That is not proof the VM's 2 GiB cap will hold the build and the OS together. If the VM build is OOM-killed, build off the box and copy `dist`. Do not resize the machine from this document.

## Staging preflight on the existing VM

Do this only after the blank data disk is mounted at `/var/data`. Do not format a disk that is already mounted. Do not restore the 2:48 PM backup onto it. Do not point DNS at the VM. Do not open a firewall port for the app. Do not SSH from this repository's automation. The commands below are for an operator shell on the VM.

Machine, as created and verified outside this pull request: `matchrv-core-20261108`, Debian 12 bookworm image `Debian12-bookworm-v20261102`, amd64, e2-small (2 GiB, shared-core), project `main-business-514122`, zone `us-central1-a`, 30 GB standard boot disk, 10 GB data disk `matchrv-core-data`, static address `34.171.66.221` named `matchrv-core-ip`. No service account, no IAM changes, and no firewall changes were part of that create. No application is on it yet.

### What this sandbox already ran

Direct tests on Nov 8, 2026, against commit `15b9c9604d27c33d031ba65183ead958039043a3` (it is an ancestor of this branch, and the only file differing from it is this document). These did not run on the VM.

- Public archive, no credentials: `https://codeload.github.com/MatchRV/AI-RV-Marketplace-Infrastructure-/tar.gz/15b9c9604d27c33d031ba65183ead958039043a3` returned HTTP 200. The first archive entry is `AI-RV-Marketplace-Infrastructure--15b9c9604d27c33d031ba65183ead958039043a3/`. ETag `c5cdcbe4eb3fb8108cf398e6084723b881b06bb2f372451f5ec679fb2f8ba0d0`. Do not send an `Authorization` header. If that URL stops returning 200, stop. Do not put a token on the VM.
- Snapshot file `lib/agent-core/data/inventory.snapshot.json.gz`: `gzip -t` passed. SHA-256 `afffb9bf17cd38f60deaa2475076af7bf88767f800f45135519d6964f94fe00d`. Compressed 42,990,266 bytes. Gzip trailer isize 521,508,319. The bundle does not embed this file. The checkout must keep it at that path.
- Node in the sandbox was v22.23.4 and pnpm 10.33.0. The deployed blueprint pins Node 22.22.0. Both satisfy `engines.node` `>=22.12`. The VM should install 22.22.0. The smoke process was not that exact build.
- `pnpm run build:api` exit 0, sampled tree RSS about 469 MiB. `pnpm run build:web` exit 0, sampled tree RSS about 1371 MiB. Sampling interval 200 ms. Not a 2 GiB cgroup.
- Production start with `env -i` and only `PATH`, `HOME`, `NODE_ENV=production`, `DISABLE_DB=1`, `PORT`, and the five path variables. `DATABASE_URL` and every SMTP, Gmail, ntfy, Twilio, CRM, Anthropic, Clerk, Gemini, OpenAI, and PostHog name were absent. Startup log: database mode `none`, Anthropic not configured, scraper cron disabled, web dist served. No enrichment cron line.
- Listen socket was `tcp6` address `::` (every interface). `app.listen(port)` in `artifacts/api-server/src/index.ts` takes no host. Current code cannot bind loopback. That is a blocker for "listen only on localhost." Do not patch it in this preparation. Do not add a firewall allow for `PORT`. Reach the process through an SSH local forward to `127.0.0.1`, which succeeded here because IPv4-mapped connections were accepted.
- After listen, VmHWM was 1,241,728 KiB. After the calls below, VmHWM was 1,494,160 KiB. The temp state directory stayed empty.
- `GET /api/healthz` 200 `{"status":"ok"}`.
- `GET /api/listings?limit=1` 200, one listing, `total` 131718.
- `GET /api/search/filters` 200.
- `POST /api/swipe/deck` with only `rvType` returned 422 `location_required`. With `{"rvType":"travel_trailer","zip":"98402"}` it returned 200 and a `cards` array of 60. Do not call `GET /api/out`.
- `POST /api/agent/search` with the body below returned 200 and 12 rows. The handler slices with `Math.max(limit, 12)`, so `limit: 3` does not mean three rows. `shownToAgent` is the requested limit in code; this smoke test did not print that field.
- `POST /api/outfitter/chat` returned 503 `ai_not_configured` before any model call.
- `POST /mcp` `initialize` returned serverInfo `matchrv` `2.2.7`. `tools/list` returned the eleven names in Task 3. `search_rvs` with the body below returned `status` `shortlist` and 3 results. `outfitter_guide` returned 3 topics.

### Install on the VM

Confirm the data disk, then stop if it is missing. Do not `mkfs` from this procedure.

```bash
findmnt -T /var/data -n -o FSTYPE,SOURCE,TARGET
```

`TARGET` must be `/var/data` and `SOURCE` must be the data disk (the by-id path for `matchrv-core-data`), not the boot disk. Then:

Node 22.22.0 from that official archive is already installed on the VM, and `sudo corepack enable` already linked `corepack` and `pnpm` under `/usr/local/bin`. Do not extract Node again. Do not run `sudo corepack prepare`.

`sudo corepack prepare pnpm@10.33.0 --activate` writes pnpm only into root's Corepack home (`/root/.cache/node/corepack` when sudo sets `HOME=/root`). The shell shim `/usr/local/lib/node_modules/corepack/dist/pnpm.js` then runs as the calling user. With no `package.json` above the working directory and no last-known-good file in that user's home, Corepack 0.34.0 asks the registry for the `latest` dist-tag. On Nov 9, 2026 that tag was pnpm 12.18.0, and the shim's default `COREPACK_ENABLE_DOWNLOAD_PROMPT` is `1`, so a terminal asks before downloading `pnpm-12.18.0.tgz`. The `corepack` command itself defaults that prompt to `0`, so root's prepare of 10.33.0 does not ask. Answering `n` still records 12.18.0 in that user's `lastKnownGood.json` before the download aborts. That is not an installed pnpm, and it is the wrong version.

The pinned commit's `package.json` says `"packageManager": "pnpm@10.33.0"` and has no `devEngines`. Inside that checkout, the same shim selects 10.33.0 even if the user's last-known-good file says 12.18.0. `COREPACK_DEFAULT_TO_LATEST=0` is not the pin: this Corepack build's internal default is pnpm 10.13.1. Do not set `COREPACK_INTEGRITY_KEYS=0`.

Activate 10.33.0 as `matchrv`, in the extracted source, after the snapshot check below. `pnpm --version` must print `10.33.0`. If a prompt appears, the URL must be `pnpm-10.33.0.tgz` before anyone answers `y`. If the URL contains `12.18.0`, answer `n` and stop. Do not run bare `pnpm` from `/tmp`.

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin matchrv || true
sudo install -d -o matchrv -g matchrv /opt/matchrv /var/data
curl -fsSL -o /tmp/matchrv-15b9c96.tar.gz \
  https://codeload.github.com/MatchRV/AI-RV-Marketplace-Infrastructure-/tar.gz/15b9c9604d27c33d031ba65183ead958039043a3
sudo tar -C /opt/matchrv -xzf /tmp/matchrv-15b9c96.tar.gz
sudo chown -R matchrv:matchrv /opt/matchrv /var/data
sudo -u matchrv bash -lc 'cd /opt/matchrv/AI-RV-Marketplace-Infrastructure--15b9c9604d27c33d031ba65183ead958039043a3 && sha256sum lib/agent-core/data/inventory.snapshot.json.gz && gzip -t lib/agent-core/data/inventory.snapshot.json.gz'
```

Stop if the SHA-256 is not `afffb9bf17cd38f60deaa2475076af7bf88767f800f45135519d6964f94fe00d`. Then, as `matchrv`, from that directory:

```bash
sudo -u matchrv -H bash -lc 'cd /opt/matchrv/AI-RV-Marketplace-Infrastructure--15b9c9604d27c33d031ba65183ead958039043a3 && /usr/local/bin/corepack prepare pnpm@10.33.0 --activate && /usr/local/bin/pnpm --version'
```

Stop unless that prints `10.33.0` and does not offer `pnpm-12.18.0.tgz`. The same user and directory then run the build `render.yaml` uses. The VM had about 1.5 GiB free when this was written, and a sandbox web build peaked near 1371 MiB RSS with no 2 GiB cap, so this build can be OOM-killed:

```bash
sudo -u matchrv -H bash -lc 'cd /opt/matchrv/AI-RV-Marketplace-Infrastructure--15b9c9604d27c33d031ba65183ead958039043a3 && pnpm install --filter "@workspace/api-server..." --filter "@workspace/rv-marketplace..." && pnpm run build:web && pnpm run build:api'
```

If the kernel OOM-kills that build, stop. Build those two commands on another machine from this same tarball and copy `artifacts/api-server/dist` and `artifacts/rv-marketplace/dist` into the checkout. Do not check out a newer `main`.

`/etc/matchrv.env` mode `640`, owner `root:matchrv`. These are the whole non-secret values. Do not add `DATABASE_URL`. Do not add SMTP, Gmail, ntfy, Twilio, CRM, Anthropic, Clerk, Gemini, OpenAI, or PostHog names. Leaving `POSTHOG_PROJECT_API_KEY` unset is what disables capture. An empty `POSTHOG_HOST` would not disable it if the key were set.

```
NODE_ENV=production
DISABLE_DB=1
PORT=8080
LEARNED_FACTS_PATH=/var/data/learned-facts.json
SESSION_MEMORY_PATH=/var/data/session-memory.json
INQUIRIES_PATH=/var/data/dealer-inquiries.json
SHOPPER_FIT_PATH=/var/data/shopper-fit.json
OUTBOUND_CLICKS_PATH=/var/data/outbound-clicks.jsonl
```

Do not paste a unit from this page and do not run `systemctl enable` or `systemctl start` from it. The reviewed files are `prepare-staging.sh` and `matchrv-staging-isolation-check.sh`. The prepare script writes `/etc/matchrv.env` and `/etc/systemd/system/matchrv.service` only after the data disk UUID is `0b11bb49-dae0-4f36-bfe2-04e057025376`, the filesystem is ext4, `var-data.mount` is active, user `matchrv` is not root, and `artifacts/api-server/dist/index.cjs` matches the off-VM build. It refuses a different existing file. It does not start the service.

The unit's pre-start guard is `/usr/bin/findmnt` with `--source UUID=0b11bb49-dae0-4f36-bfe2-04e057025376`, `--mountpoint /var/data`, and `--types ext4` together. It is not a shell snippet. systemd expands `$` variables and `%` specifiers in `ExecStartPre=` before the program runs ([systemd.service](https://www.freedesktop.org/software/systemd/man/systemd.service.html)), so a line that contains `$out` or `printf %s` would not reach `/bin/sh` intact. A non-zero findmnt status fails the unit. There is no `-` prefix. The command runs as `matchrv` because `User=` applies to `ExecStartPre=` unless the line is prefixed with `+`.

The unit uses `PrivateNetwork=yes` ([systemd.exec](https://www.freedesktop.org/software/systemd/man/systemd.exec.html)). That gives the process a network namespace whose only device is loopback, so a listen on every interface is not a listen in the host namespace. The same page says this implies `PrivateMounts=` and remounts `/sys`. It does not move the release directory or `/var/data`. `MemoryMax=1500M` and `MemorySwapMax=0` are a staging cap for the current free memory. They are not a production capacity result. `Restart=no`. There is no `[Install]` section.

The VPC view showed public ICMP, 22, and 3389, plus internal `10.128.0.0/9`. It did not show a public 80, 443, or 8080 rule. `compute.organizations.listAssociations` was denied, so inherited policies are unknown. That view is not proof port 8080 is closed. Do not grant IAM to learn the answer, and do not open a firewall rule. The private namespace is the control for this phase. Outbound network is also absent, which is acceptable while Anthropic and the other delivery keys stay unset. A later full AI test is a separate gate.

After a separate decision to start, run the isolation check. It does not start the service. If the host network namespace is the service namespace, the host has a TCP 8080 listener, or `nsenter -t PID -n curl http://127.0.0.1:8080/api/healthz` fails, the check stops the service. An SSH local forward to host port 8080 does not reach this unit.

Side effects this env avoids, from the code at the pinned commit:

- `DISABLE_DB=1` and no `DATABASE_URL` select mode `none`. Enrichment starts only when mode is not `none` and Anthropic is configured. The scraper cron starts only for `postgres` when the sibling scraper script exists. The GitHub archive does not include that sibling.
- Unset Anthropic keys make `POST /api/outfitter/chat` return 503 `ai_not_configured`.
- Unset PostHog key makes `activeConfig()` return null.
- Inquiry mail runs only inside `sendInquiry` when `dry_run` is false and SMTP or Gmail is configured. Do not call `send_dealer_inquiry` or `GET /api/out` on this host.

Smoke only inside the service network namespace, after the isolation check has passed. Use `nsenter -t "$PID" -n curl` against `http://127.0.0.1:8080`. Do not curl the host address and do not publish port 8080. Expect health `{"status":"ok"}`, listings HTTP 200, filters HTTP 200, swipe HTTP 200 with `cards`, agent search HTTP 200, outfitter HTTP 503. MCP `initialize` should name `matchrv`, and `search_rvs` should return a shortlist. The journal should include `db: none` and `scraper cron disabled`, and should not include `Scrape scheduler active` or `Hourly batch starting`.

`/var/data` may gain files only if something writes. These read calls left the sandbox directory empty. If `dealer-inquiries.json` or `outbound-clicks.jsonl` appears, stop. Do not load the 2:48 PM archive. Do not call a delivering inquiry.

## What the code actually writes

`LEARNED_FACTS_PATH` defaults the directory. These env names override the files. A backup of `/var/data` alone is incomplete when any resolved path sits outside that mount. Paths outside the mount are ephemeral on Render ([persistent disks](https://render.com/docs/disks)).

| Env name | File when unset, beside `LEARNED_FACTS_PATH` | Durable write |
| --- | --- | --- |
| `SESSION_MEMORY_PATH` | `session-memory.json` | `teach_outfitter` schedules a full-file write in 400ms |
| `INQUIRIES_PATH` | `dealer-inquiries.json` | non-dry-run `sendInquiry` schedules a full-file write in 300ms |
| `SHOPPER_FIT_PATH` | `shopper-fit.json` | `search_rvs` calls `rememberFit` when the caller has a scope id, 400ms |
| `OUTBOUND_CLICKS_PATH` | `outbound-clicks.jsonl` | `GET /api/out` appends a line immediately |
| `CURATED_FACTS_PATH` | `data/curated-facts.json` in the repo | read-only |

`sendInquiry` persists with `.filter((i) => !i.dryRun)`. A dry run is memory-only. It does not prove the disk. `INQUIRY_DRY_RUN` forces that path. `prepareInquiry` does not write the store. Those four durable writes go through the freeze gate in "Write freeze". JSON files are replaced via a temp file and `rename`. The click log is still one appended line.

`search_rvs` does not write when `resolveScope` returns `id: null` (no OpenAI subject, no OpenAI session, no `mcp-session-id`, no `session_key`). A preflight search must omit those or it will write `shopper-fit.json`.

`activeConfig()` returns null when `POSTHOG_PROJECT_API_KEY` is unset. An empty `POSTHOG_HOST` does not disable capture: `normalizeHost` defaults it to `https://us.i.posthog.com` whenever the key is set. A host that is set to something other than that URL or `https://eu.i.posthog.com` does disable capture, but the preflight still leaves the key unset. Setting the key is a separate authorization.

`app.listen(port)` does not pass a host, so Node listens on every interface. The guest firewall and the VPC firewall must expose 443 only. Do not publish the Node port.

`render.yaml` sets `DISABLE_DB=1` and `LEARNED_FACTS_PATH=/var/data/learned-facts.json`. `DATABASE_URL` wins over `DISABLE_DB` in `lib/db/src/index.ts`. Leave `DATABASE_URL` unset. Observed process RSS on Render was about 643–716 MiB, and the snapshot gzip trailer is 521,508,319 bytes. That is why 1 GB is too small at runtime. It is not a measurement of a compile.

## Write freeze

Use this on the running process that owns `/var/data`. It does not restart the process, and it does not change DNS. The admin key is the existing `ADMIN_KEY` (`x-admin-key`). Export it in the operator shell from the private env store. Do not print it, and do not run these commands under shell trace (`set -x`).

The route is open when `DISABLE_DB=1`. It does not read the database and the response has no records.

- `POST /api/admin/data-dir` with `{"action":"freeze"}` waits for an inquiry delivery that already started, flushes every pending debounced save, then refuses new durable writes.
- `GET /api/admin/data-dir` returns `frozen`, `pending`, and `pendingWriters`. `pendingWriters` is a list of store names. Copy only when `frozen` is true and `pending` is false.
- `POST /api/admin/data-dir` with `{"action":"unfreeze"}` accepts durable writes again.

From a shell that can reach the process (the Render service shell, or loopback on the VM). `PORT` is the process port.

```bash
curl -fsS -X POST "http://127.0.0.1:${PORT}/api/admin/data-dir" \
  -H "content-type: application/json" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -d '{"action":"freeze"}'
curl -fsS "http://127.0.0.1:${PORT}/api/admin/data-dir" \
  -H "x-admin-key: ${ADMIN_KEY}"
```

A quiet freeze looks like `{"frozen":true,"pending":false,"pendingWriters":[]}`. If `pending` is true, wait and GET again, or POST freeze again. Do not start the copy while `pending` is true. Do not send SIGTERM, SIGINT, or restart the process until the copy is finished and verified. A restart comes back unfrozen and will accept writes onto the disk being copied. A clean SIGTERM or SIGINT flushes pending debounced writes and then exits. SIGKILL skips that flush.

What keeps working: shopper reads, search, and the MCP tools. `search_rvs` does not update `shopper-fit.json` during the freeze. `GET /api/out` still redirects and does not append a click line.

Lead submissions during the freeze are refused before delivery and before they are stored. `send_dealer_inquiry` and a confirmed `POST /api/inquiries` return `writes_frozen`, `retryable: true`, and, on HTTP, status 503 with `Retry-After: 120`. Nothing is emailed, nothing is queued in memory for later, and the confirmation token stays unused. The shopper retries the same send after unfreeze. Preview (`prepare_dealer_inquiry`, and a POST without `confirmation_token`) still works. Ops edits, forward confirmation, and the inquiry safety sweep also come back `writes_frozen` and do not change the inquiry file. `teach_outfitter` returns the same error and does not change session memory. A dry-run inquiry stays memory-only and does not rewrite the inquiry file.

Unfreeze resumes writes on this process. Unfreeze after the copy has started makes that copy incomplete. After a verified copy, leave this process frozen until it is no longer the writer. Unfreeze is the abort path when the copy is discarded and this process should take shopper writes again.

```bash
curl -fsS -X POST "http://127.0.0.1:${PORT}/api/admin/data-dir" \
  -H "content-type: application/json" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -d '{"action":"unfreeze"}'
```

Expect `"frozen":false`. A missing or wrong `x-admin-key` is HTTP 403. The staging tarball pinned in the install section is an older SHA and does not include this route. Jonathan names `APPROVED_SHA`. Do not retarget that install from this paragraph.

## Who owns what

Jonathan owns billing, the decision to reopen, DNS including any TXT record, OS updates, backups, restores, and the bill. A later helper runs commands only after the gate for that command is open. This pull request does none of those.

## Financial preflight (planning estimate only)

Public list prices gathered for this runbook from Google's pricing pages. On Nov 8, 2026 at 3:09 PM PST the e2-small target was approved at about 18 USD/month gross plus usage. The VM named below was created after that. This is still not an invoice and not a ceiling Google will enforce. This pull request did not create the VM.

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

e2-small (2 GiB, shared-core) is the approved runtime machine. It is still a poor place to compile if the build is OOM-killed. e2-medium remains only a list-price comparison, not a second machine to create.

An alerts-only budget does not cap spending ([budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets)). A spend cap pauses one eligible service on one project ([spend caps](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)). Do not treat either, including a 2026 preview, as an off switch for this VM.

## Other gates

Migration of the current core does not wait on Supabase. A paused Supabase export is separate preservation work. It is not required for `DISABLE_DB=1`, and it is not done.

- [ ] **G1 Billing.** e2-small is approved. The account appears open and the 2000 USD credit is visible. SKU coverage for Compute Engine, disk, and in-use IPv4 is still not copied from the Credits page. That line stays open.
- [ ] **G2 Crash-consistent copy.** The 2:48 PM four-file copy exists and is labeled crash-consistent. A later frozen copy uses "Write freeze" and still waits on H1 until that copy is verified. Env values are still not in a private store.
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

Wait at least one second, or stop the fixture with SIGTERM or SIGINT. Those signals flush the 400ms session-memory timer before exit. SIGKILL does not. `session-memory.json` under the fixture directory must parse as an object. Print the key count only. Reboot. The service must come back because of the boot design in Task 2, and the fixture file's per-file SHA-256 must match. If the process is absent after reboot, the boot design failed. Stop.

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

**Cutover is blocked by H1 and H2.** When both are closed, the order is: run "Write freeze" on Render while the process stays up, GET until `pending` is false, stream every affected file, verify per-file SHA-256 on the private copy and again on the VM, confirm the VM is the only writer, then change A and AAAA. Leave the Render process frozen until it is no longer the writer. Suspend is not the freeze. Suspend removes SSH, so it cannot come before the frozen copy. Do not delete Render. Overlap cost continues until Jonathan later approves stopping it.

### Task 6: Rollback

Rollback is blocked by the same freeze. On the VM, `systemctl stop` sends SIGTERM, and the process flushes debounced writes before it exits. Freeze first anyway, and copy only after GET reports `pending: false`, because a stop ends the process. Then copy every affected file to the private machine and verify per-file SHA-256.

Render must be running to receive files, and it must already be frozen so resume does not accept new shopper writes during the copy. Copy the frozen tree into the resolved paths, including overrides. Verify the on-disk per-file SHA-256 matches the frozen manifest. Only then point DNS back and unfreeze Render with `{"action":"unfreeze"}`. Leave the VM stopped as a writer. "Decide whether to copy" is not a restore. A partial copy with both sides writable loses records.

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

Supabase export (separate preservation, not a blocker for this core), new Postgres, Clerk restore, Cloud Run, a load balancer, changing MCP tool schemas, registering SSH keys, and running any command above.
