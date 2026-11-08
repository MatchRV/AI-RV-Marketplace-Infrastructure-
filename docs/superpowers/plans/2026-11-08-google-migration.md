# Google migration preparation runbook

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a later, single-writer move of the live MatchRV Node process from Render onto one Google Compute Engine VM, keeping the current `DISABLE_DB=1` snapshot and `/var/data` files, without doing that move in this pull request.

**Architecture:** One small always-on Compute Engine VM with one durable disk mounted at `/var/data`, running the same Node build that is live today. Cloud Run is not the recommendation. It would drop local files on every new instance unless the inquiry and memory writers were changed first. This VM is a machine Jonathan operates. It is not a managed application platform.

**Tech Stack:** Existing MatchRV Node 22 / pnpm 10.33.0 build (`pnpm build:web`, `pnpm build:api`, `node artifacts/api-server/dist/index.cjs`). No new Postgres. No Supabase. Inventory stays the committed gzip snapshot.

## Global Constraints

- Preparation only. This pull request adds this document and does not execute it.
- Do not modify merged analytics PR 86, runtime code, `render.yaml`, or workflows.
- No deploy to any host. No Google API writes, resources, billing edits, SSH key registration, domain changes, env writes, or purchases.
- Latest `main` for this document is `15b9c9604d27c33d031ba65183ead958039043a3`.
- Live Render report used as input: 1:21 PM PST startup with `DISABLE_DB=1`, enrichment and scraper disabled, classic database pages disabled. Deployment `15b9c96` was live at 12:49 PM PST and `/api/healthz` returned 200.
- Real backups: none obtained. Render CLI authentication works. SSH from that network closes. Jonathan's Windows desktop reaches Render and is denied because no public key is registered. Registering a key was not authorized. Do not work around that.
- Reported Google for Startups credits are not verified and must not be treated as spendable. Reported window Mar 19, 2026 through Mar 19, 2028. Reported name `2024GFSCloudProgram-Start`. Reported remainder 2000 USD. Billing account is closed.
- Do not create a second billing account and expect credits to move.
- Reopening the closed billing account, per Google, makes every project linked to that account able to incur charges again, not only MatchRV.
- Iowa hourly rates below are a planning estimate, not an account quote and not a spend cap. Region and machine purchase stay unapproved until Jonathan accepts them.
- No new Postgres is required to host the inventory core. Optional accounts and trips are already disabled and are not restored by this move.
- Do not print contact fields, tokens, or env values in logs, archives, or this file.

## Plain English

MatchRV's live site is one Node program. The RV catalog is a file shipped in git, not a database. Notes the site must keep (inquiries, taught facts, click counts) sit in `/var/data` on a Render disk. Nothing from that disk has been copied off yet.

The later move, if Jonathan approves the bill, is one Google virtual machine with a normal disk in the same place. Jonathan would own updates, backups, restores, and watching the bill. Google will not do that for him on this shape of machine. A budget email does not turn the machine off.

He should not reopen the closed Google billing account until he has looked at every project tied to it. Reopening turns billing back on for all of them. The startup credits he found are a report, not a confirmation they can pay for this machine.

---

## What is live, from the repo

`origin/main` `15b9c9604d27c33d031ba65183ead958039043a3`.

`render.yaml` sets `DISABLE_DB=1`, `NODE_ENV=production`, and `LEARNED_FACTS_PATH=/var/data/learned-facts.json`. The blueprint disk is named `matchrv-learned`, mounted at `/var/data`, size 1 GB. Only files under that mount survive a Render restart. The rest of the container disk is ephemeral. Do not archive the container root and call it a backup. Official disk behavior: [Render persistent disks](https://render.com/docs/disks).

`lib/db/src/index.ts` chooses the database mode in this order: if `DATABASE_URL` is set, mode is `postgres`; otherwise if `DISABLE_DB=1`, mode is `none`; otherwise PGlite starts. Leave `DATABASE_URL` unset on the new machine. Setting it would ignore `DISABLE_DB=1` and try Postgres at startup.

With mode `none`, `artifacts/api-server/src/app.ts` still serves `/api/agent`, `/api/outfitter`, `/api/listings`, `/api/search`, `/api/inquiries`, `/api/swipe`, `/api/out`, `/api/healthz`, and `/mcp`. Other `/api` routes answer 503 `database_disabled`. `artifacts/api-server/src/index.ts` does not start the enrichment cron or the scraper cron in this mode. That matches the 1:21 PM PST log.

Inventory for `/mcp` and snapshot listings is `lib/agent-core/data/inventory.snapshot.json.gz` in git, loaded by `artifacts/api-server/src/services/agent-inventory.ts`. The gzip trailer on this commit records 521,508,319 uncompressed bytes (about 497 MiB). The process RSS observed on Render was about 643–716 MiB. A 1 GB machine is too small for that plus the inflate at boot.

Files the running process writes, all under the directory of `LEARNED_FACTS_PATH` unless overridden:

| Env name | Default file next to `LEARNED_FACTS_PATH` | Role |
| --- | --- | --- |
| `LEARNED_FACTS_PATH` | `learned-facts.json` | Legacy path. Session memory is stored beside it, not by loading this file into answers. |
| `SESSION_MEMORY_PATH` | `session-memory.json` | Per-conversation Outfitter facts. |
| `CURATED_FACTS_PATH` | `data/curated-facts.json` in the repo if unset | Read-only curated facts. Comes from git, not from the disk. |
| `INQUIRIES_PATH` | `dealer-inquiries.json` | Inquiry records. |
| `SHOPPER_FIT_PATH` | `shopper-fit.json` | Fit facts. |
| `OUTBOUND_CLICKS_PATH` | `outbound-clicks.jsonl` | Dealer-click lines. |

Back up the whole `/var/data` tree. Do not back up five filenames and assume that is the disk.

`app.listen(port)` in `artifacts/api-server/src/index.ts` uses `PORT`. Production throws if `PORT` is missing. Render sets `PORT`. The VM must set it too. The call does not pass a bind address.

Public tool names and `/mcp` behavior stay as they are in this commit. This document does not change them.

## Who owns what

Jonathan owns the Google billing account, which projects are linked, payment method, promotions, budgets, the decision to reopen, SSH public-key registration at Render, DNS for `matchrv.com`, OS updates, backup schedule, restore drills, and watching the bill. A later agent may copy files and run the documented commands only after he says that gate is open. Neither a bot nor this pull request may reopen billing, create projects, buy a VM, register an SSH key, or change DNS.

This VM is not Cloud Run, Cloud SQL, or App Engine. Google will not patch the guest, rotate backups, or page him. If he wants a platform that restarts and scales the process for him, that is Cloud Run, and it is a different project: the writers in `learned-store.ts`, `dealer-inquiries.ts`, `shopper-fit.ts`, and `outbound-clicks.ts` would have to stop using the local disk. That code change is out of scope here.

## Financial preflight (planning estimate only)

Do not treat credits as active. Do not create another billing account to receive them. Credits are not documented as transferable that way, and this plan does not assume a transfer.

Official reopen page: [Close or reopen your Cloud Billing account](https://docs.cloud.google.com/billing/docs/how-to/close-or-reopen-billing-account).

Google's own sentence: when you reopen a closed Cloud Billing account, all projects linked to and paid by that account start incurring charges for billable services in those projects. Before reactivation, resolve payments issues or suspensions. The control is **Reopen billing account** on that same account's Account management page, and only if the account is self-serve and the payments block is cleared. An invoiced account is reopened by Cloud Billing Support, not by the console button.

Jonathan's account-side checklist, before he clicks reopen:

- [ ] List every project linked to the closed billing account. Reopening bills all of them, not a MatchRV-only subset.
- [ ] Read payment-method and declined-payment status. The console hides **Reopen billing account** until those are cleared.
- [ ] Read promotion status for `2024GFSCloudProgram-Start`. Record the name shown, the remaining amount shown, which services and SKUs it can pay, and the expiry shown. The reported remainder (2000 USD) and the reported window (start Mar 19, 2026, expiry Mar 19, 2028) are not verified here. The Mar 19, 2028 date, once confirmed on the account, is the date the credit stops.
- [ ] Confirm the credit applies to Compute Engine, persistent disk, and external IPv4 in the chosen region. A credit that does not list those SKUs does not pay this plan.
- [ ] Do not open a second billing account expecting the credit to follow.

Planning estimate for Iowa (`us-central1`), using the public rates Jonathan checked. This is not an invoice, not a quote from the billing account, and not a ceiling Google will enforce.

| Piece | Published rate used | 730-hour month |
| --- | --- | --- |
| e2-small, shared-core, not a dedicated 2-CPU machine | 0.016752855 USD/hour | 12.23 USD |
| e2-medium, shared-core, not a dedicated 2-CPU machine | 0.03350571 USD/hour | 24.46 USD |
| 30 GiB standard boot disk + 10 GiB standard data disk | 0.04 USD/GiB-month | 1.60 USD |
| One in-use external IPv4 | about 3.65 USD/month | 3.65 USD |
| Illustrative 10 GiB of regional snapshots | | 0.50 USD |

Illustrative sum before egress, logs, operations, tax, and every other linked project: about 17.98 USD/month on e2-small, about 30.21 USD/month on e2-medium.

Sources, as checked for this estimate:

- [General-purpose machine pricing](https://cloud.google.com/products/compute/pricing/general-purpose)
- [Disk and image pricing](https://cloud.google.com/compute/disks-image-pricing)
- [Network pricing](https://cloud.google.com/vpc/network-pricing)

e2-small is the planning baseline because the process already sits around 643–716 MiB and the snapshot inflate needs headroom past 1 GB. e2-medium is the larger shared-core option on the same page. Jonathan still has to read the memory column on that page and approve a machine before anyone creates one. No region and no machine type are purchased by this document.

A budget alert is not a spend cap. Google's budgets document says an alerts-only budget does not automatically cap Google Cloud usage or spending ([Create, edit, or delete budgets and budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)). Spend-cap budgets ([Manage spend cap budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)) pause only an eligible service on one project. Do not plan on a spend cap, including a 2026 preview of that feature, to stop this Compute Engine VM. Set an alert below the number Jonathan is willing to see, and treat a human shutting the VM down as the only off switch.

## Gates that are still closed

None of these are done. Later implementation stops until they are.

- [ ] **G1 Billing.** Jonathan inspected linked projects, payments, and the promotion. He reopened the existing account only if he accepts charges on all linked projects. Credit name, SKUs, remainder, and Mar 19, 2028 expiry are copied from the console into his private notes. He approved either the e2-small or e2-medium Iowa estimate in writing, knowing it excludes egress, logs, tax, and other projects.
- [ ] **G2 Render disk backup.** A tar of the entire running `/var/data`, its sha256, and JSON key counts (no contact fields) are stored off Render. See the backup task. Not obtained yet.
- [ ] **G3 Private configuration.** Jonathan copied env names and values from the Render dashboard into a private store. The git repo must not receive values. Names to account for are listed below. `DATABASE_URL` must be absent on the new host.
- [ ] **G4 Supabase.** A paused Supabase export is a separate job. It is not required for this core. Do not block the VM on it, and do not invent a dump while the project is paused.
- [ ] **G5 SSH identity.** Jonathan registers his own public key on his Render account using [Render SSH](https://render.com/docs/ssh). This preparation does not register a key and does not use another network path. Render CLI auth without a registered key is not SSH. SSH works only while the instance is running. A stopped instance cannot be copied this way.

## Env names (no values)

Set on the VM for the same behavior as today:

- `DISABLE_DB=1` (the digit 1, not a secret)
- `PORT` (Render injects this; the VM must set it)
- `NODE_ENV=production`
- `LEARNED_FACTS_PATH=/var/data/learned-facts.json`
- `NODE_VERSION` 22.22.0 as in `render.yaml`, and the repo requires Node `>=22.12`

Leave unset: `DATABASE_URL`, `PGLITE_DATA_DIR`.

Copy only if they are set on the live service. Do not invent them. Do not commit them.

- `INQUIRIES_PATH`, `SESSION_MEMORY_PATH`, `SHOPPER_FIT_PATH`, `OUTBOUND_CLICKS_PATH`, `CURATED_FACTS_PATH`
- `SESSION_MEMORY_TTL_DAYS`, `SHOPPER_FIT_TTL_DAYS`, `INQUIRY_RETENTION_DAYS`
- `INQUIRY_OPS_KEY`, `INQUIRY_SIGNING_SECRET`, `INQUIRY_OPS_EMAIL`, `INQUIRY_DRY_RUN`
- `DEALER_INQUIRY_ROUTES`, `DEALER_INQUIRY_ROUTES_PATH`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- `GMAIL_USER`, `GMAIL_APP_PASSWORD`
- `NTFY_TOPIC`, `NTFY_URL`
- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PROXY_URL`
- `ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `OUTFITTER_MODEL`
- `POSTHOG_PROJECT_API_KEY`, `POSTHOG_HOST`
- `OPENAI_APPS_CHALLENGE`
- `ADMIN_KEY`, `IMPORT_API_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `SMS_ALERT_TO`
- `STALE_LISTING_MAX_AGE_DAYS`
- `GEMINI_API_KEY` and other `GEMINI_*` names, `LOTLINK_CRM_WEBHOOK_URL`, `RIDB_API_KEY`, `NPS_API_KEY`

For the preflight VM, do not set SMTP, Gmail, ntfy, Twilio, or the CRM webhook. Those send mail or texts. Dry-run checks must not deliver.

## Future tasks (not run by this pull request)

### Task 1: Official backup of the running Render disk

**Files:** none in git. Output is a private archive Jonathan keeps.

**Owner:** Jonathan registers the SSH key and opens the shell. A helper may run the tar only after that shell exists.

Official steps are on [Render SSH](https://render.com/docs/ssh): generate a key pair locally, add the `.pub` contents under Account settings → SSH Public Keys, then use the service SSH command the dashboard shows for a **running** instance. Do not SSH a stopped instance. Do not add a key as part of this preparation.

- [ ] **Step 1.** Jonathan confirms the shell's cwd is the live service and `printenv DISABLE_DB` prints `1`. If it does not, stop. The backup would be the wrong mode.

- [ ] **Step 2.** Record the git revision the process was built from, without printing secrets:

```bash
printenv DISABLE_DB
printenv LEARNED_FACTS_PATH
# Expect DISABLE_DB=1 and LEARNED_FACTS_PATH=/var/data/learned-facts.json
```

- [ ] **Step 3.** Archive the entire mount, not a file list. Write the archive outside the mount only long enough to hash it, then copy it off the box. The archive must not stay solely on the ephemeral container disk.

```bash
sudo tar -C /var/data -czf /tmp/matchrv-var-data.tar.gz .
sha256sum /tmp/matchrv-var-data.tar.gz
tar -tzf /tmp/matchrv-var-data.tar.gz | wc -l
```

- [ ] **Step 4.** Count records. Print counts only. If a command would print names, emails, or message text, do not run it.

```bash
python3 - <<'PY'
import json, os
root = "/var/data"
for dirpath, _, files in os.walk(root):
    for name in files:
        path = os.path.join(dirpath, name)
        rel = os.path.relpath(path, root)
        if name.endswith(".json"):
            try:
                data = json.load(open(path))
            except Exception as exc:
                print(f"{rel}\tUNREADABLE\t{type(exc).__name__}")
                continue
            if isinstance(data, list):
                print(f"{rel}\tlist\t{len(data)}")
            elif isinstance(data, dict):
                print(f"{rel}\tobject\t{len(data)}")
            else:
                print(f"{rel}\t{type(data).__name__}\t1")
        elif name.endswith(".jsonl"):
            n = sum(1 for line in open(path) if line.strip())
            print(f"{rel}\tjsonl\t{n}")
        else:
            print(f"{rel}\tbytes\t{os.path.getsize(path)}")
PY
```

- [ ] **Step 5.** Download the tar and the sha256 to a machine Jonathan controls. Verify the hash matches. Delete `/tmp/matchrv-var-data.tar.gz` on the instance after the copy succeeds. Expected: hash matches, file list is the whole tree, no contact fields were printed.

### Task 2: Private preflight VM (after G1 and G2)

**Owner:** Jonathan approves the project, region (planning baseline Iowa), and machine (planning baseline e2-small). A helper creates nothing until that approval is explicit.

- [ ] **Step 1.** Create one Compute Engine VM and one standard persistent disk, 10 GiB, mounted at `/var/data`. Boot disk 30 GiB is the planning baseline, not a purchased size. Do not attach a second writer. Do not enable HTTP(S) to the world until the health check on the private path works.

- [ ] **Step 2.** On the VM, with `DATABASE_URL` unset:

```bash
git clone --branch <approved-sha> <repo-url> matchrv
cd matchrv
corepack enable && corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
pnpm build:web && pnpm build:api
```

Use commit `15b9c9604d27c33d031ba65183ead958039043a3` unless Jonathan names a newer `main`.

- [ ] **Step 3.** Install env from Jonathan's private store. Required names: `DISABLE_DB`, `PORT`, `NODE_ENV`, `LEARNED_FACTS_PATH`. Unpack the tar onto `/var/data` before the first start:

```bash
sudo tar -C /var/data -xzf matchrv-var-data.tar.gz
sha256sum matchrv-var-data.tar.gz
```

- [ ] **Step 4.** Start once, in the foreground, and read the log before any public DNS exists.

```bash
NODE_ENV=production DISABLE_DB=1 PORT=8080 LEARNED_FACTS_PATH=/var/data/learned-facts.json \
  node artifacts/api-server/dist/index.cjs
```

Expected log lines: database mode `none`, enrichment cron not started, scraper cron not started. `curl -fsS http://127.0.0.1:8080/api/healthz` returns 200.

- [ ] **Step 5.** Persist-after-restart. Reboot the VM. `/var/data` still contains the same tar listing and the same sha256 of a re-packed tree. Then start the process again. Health returns 200. If the disk is empty after reboot, stop. The disk was not durable.

### Task 3: HTTPS and `/mcp` before the A record changes

Google-managed certificates become `ACTIVE` only after public DNS A and AAAA records point at the load balancer ([Google-managed SSL certificates](https://cloud.google.com/load-balancing/docs/ssl-certificates/google-managed-certs)). That is a DNS cutover. Do not use that method as the pre-cutover test. Do not change `matchrv.com` A/AAAA records in this task.

- [ ] **Step 1.** Put a certificate that already names `matchrv.com` on the VM, or stop and say TLS is not testable yet. Getting that certificate with a TXT record only, without changing the A record, is Jonathan's DNS decision. This document does not make it.

- [ ] **Step 2.** From a laptop, without changing public DNS:

```bash
curl -fsS --resolve matchrv.com:443:<VM_PUBLIC_IP> https://matchrv.com/api/healthz
curl -fsS --resolve matchrv.com:443:<VM_PUBLIC_IP> \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"preflight","version":"0"}}}' \
  https://matchrv.com/mcp
```

Expected: health 200, and `initialize` lists the same server name `matchrv` as production. Do not call `send_dealer_inquiry` with `confirmed` true. Do not call a path that sends mail.

- [ ] **Step 3.** Dry-run inquiry only. Use the existing `dry_run: true` flag on `POST /api/inquiries` after a preview, against the VM via `--resolve`, with a clearly fake contact used only for this check. Expected status is the dry-run status. Confirm no SMTP or ntfy env vars are set on the VM before this call. If they are set, do not run the call.

### Task 4: Cutover and rollback

**Owner:** Jonathan says the public A record may change. Until then, production stays on Render.

Single writer: the Render process and the VM must not both accept shopper writes.

- [ ] **Step 1.** Take a fresh tar of `/var/data` (Task 1 steps 3–5) immediately before cutover. Count inquiries. If the count changes during the tar, run the tar again.

- [ ] **Step 2.** Jonathan suspends the Render service so it stops accepting traffic. The disk remains. SSH is then impossible, which is why the tar has to finish first. Do not delete the service. Do not delete the disk.

- [ ] **Step 3.** Load that tar on the VM `/var/data`. Restart the process. Repeat the health and `initialize` checks.

- [ ] **Step 4.** Jonathan changes the `matchrv.com` A/AAAA records to the VM address. Lower TTL a day earlier only if he approves that DNS edit. Overlap: Render suspension and the VM both exist, so he pays both until he later approves stopping Render billing. That overlap is intentional and short. It is not permission to delete Render.

- [ ] **Step 5.** Rollback is not only a DNS flip. If shoppers wrote inquiries on the VM after cutover, those writes are only on the VM disk. Before pointing DNS back:

  - Tar `/var/data` on the VM.
  - Decide, in writing, whether those new files are copied onto the Render disk.
  - Resume the Render service only after that decision. The Render disk still has whatever was written before suspension, including anything the last tar missed.
  - Then change DNS back.

  If DNS is flipped back without the VM tar, inquiries accepted on Google are stranded on a machine nobody is sending traffic to.

## Acceptance checks for a later execution

- `GET /api/healthz` is 200 on the VM with `DISABLE_DB=1` and no `DATABASE_URL`.
- Startup log matches the live Render log: enrichment off, scraper off, classic database routes disabled.
- `POST /mcp` `initialize` succeeds and tool names are unchanged from commit `15b9c96`.
- `/var/data` survives a reboot, hash-checked.
- Dry-run inquiry does not send mail. No real dealer inquiry is created.
- Render service and disk still exist. Deletion is a separate approval.
- Billing account reopen, credit SKU eligibility, and the Iowa estimate were approved before the VM existed.
- No secret values in git.

## Out of scope

Supabase export, new Postgres, Clerk account restore, Cloud Run, changing MCP tool schemas, analytics behavior, registering Render SSH keys, and any command in the tasks above. Those tasks are the later job. This pull request is the runbook only.
