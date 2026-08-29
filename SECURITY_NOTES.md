# SECURITY_NOTES — threat model for the agent layer (and repo-wide findings)

Scope: the WebMCP tool surface (`/api/agent/*`, `src/agent/*`), plus honest
notes on pre-existing legacy surfaces we did not rebuild. Updated after the
approval-boundary hardening; every mechanism below is covered by automated
tests (see WEBMCP_TEST_RESULTS.md §1–§3).

## Threats considered → mitigations

### 1. Prompt injection (or any non-human caller) manufacturing "human approved"
The consequential action — sending shopper contact info to a dealership —
must require a real human decision.
- **Two-phase, server-enforced state machine:** `prepare` stages a preview
  (`awaiting_human_approval`); `submit` succeeds only from `approved`; every
  transition is validated server-side.
- **Single-use approval token:** the server mints an unguessable token
  (`randomBytes(24)`, timing-safe compared) at preview creation and returns
  it only to the page. The page keeps it in a **module-private map** — it is
  never placed in session state, the test bridge, or any tool result (tested:
  a native tool result containing `apt_` fails the suite). Approve/reject
  endpoints require it; it is consumed on first decision and dies with the
  preview's 30-minute TTL.
- **No approval tool exists.** The agent tool surface has no path to a
  decision endpoint (tested), so neither a confused agent nor injected
  instructions can approve; nor can an out-of-band HTTP caller that learned a
  preview id (403 without the token — tested with forged and missing tokens).
- **Immutability:** `submit` carries only the preview id; the server submits
  the stored preview, so what's sent is byte-identical to what the human
  reviewed (tested). There is no API that mutates a staged preview.
- **Replay:** decisions after a decision → 409; duplicate submits → 409; one
  submitted lead per (unit, email) per server session (tested).
- ChatGPT's own consequential-action confirmation layers on top of all of
  this.

**Honest scoping:** the token binds approval to *the page that staged the
preview*, not to an authenticated user identity — the demo has no login on
the shopping flow. Production would bind previews to the signed-in shopper
(Clerk) for a per-user audit chain. We claim page-binding, not user-binding.

### 2. Malicious/malformed tool arguments
Zod-validated twice — client handler and server route — from the same schema
that generated the advertised JSON Schema. Strict types/enums/ranges/length
caps; field-level error lists without echoing free-form attacker content.
Unit ids resolve through a Map; no SQL is built from agent input anywhere in
the agent layer.

### 3. Content injection from dealer data into agents
Dealer-authored text is external content: raw prose is kept out of tool
outputs (descriptions stay on the page), titles are sanitized/capped, and the
tools that do carry dealer-derived strings (`get_unit_details`,
`compare_units`) are annotated `untrustedContentHint: true`.

### 4. Lead spam / abuse
Per-IP fixed-window rate limit (30 lead-flow operations / 10 min) with a
structured 429; single-use tokens; TTL'd previews; duplicate suppression.
Demo posture: submitted leads are recorded and **nothing is delivered to a
real dealership** — the receipt says so.

### 5. Data exfiltration via tools
Tools expose public marketplace inventory plus the caller's own staged lead.
No user enumeration, no dealer contact books, no admin surface. Preview ids
are unguessable capabilities; reading one back returns only what the staging
party already knew.

### 6. Secrets
The agent layer requires zero secrets. Committed values found during review
(a Google Places browser key, a personal phone number, an SMS-gateway
address, vendor account ids in `.replit` and one pasted asset) have been
**stripped/redacted from the tree**. ⚠️ They remain in git history until it
is rewritten — **rotate the Google Places key and treat the old values as
public before making the repository public** (a challenge requirement).
No Supabase anywhere; no service keys ship to the client (bundle scanned).

## CORS / same-origin posture
The demo API reflects origins (legacy `cors({origin:true})`) — acceptable
here because the approval token, not ambient browser state, is the
authorization for the only consequential action, and read endpoints serve
public inventory. Production hardening: pin allowed origins and add
`SameSite`/CSRF once authenticated sessions exist. WebMCP-side, tools are
registered top-level with the default `tools` Permissions-Policy (`self`);
`exposedTo` is not widened.

## Pre-existing findings we did NOT build but must flag
- Legacy `sql.raw` string interpolation (sync-from-scraper, outfitter,
  admin, enrichment) — scraper/admin-controlled inputs; should move to
  parameterized queries (ROADMAP).
- Legacy public `POST /api/leads` lacks validation (agent flow doesn't use
  it).
- Legacy lead email templates interpolate user text into HTML unescaped
  (operator-inbox XSS surface); demo sends no email.

## Remaining limitations (honest list)
- Approval is page-bound, not user-bound (see §1 scoping).
- Rate limiting is in-memory and per-process.
- Preview store + dedupe reset on process restart (fine for a demo; the
  schema already supports a DB-backed store).
- The embedded demo database is intentionally open — it holds only public
  inventory and demo leads and delivers nothing externally.
