# SECURITY_NOTES — threat model for the agent layer (and repo-wide findings)

Scope: the WebMCP tool surface (`/api/agent/*`, `src/agent/*`) built for the
challenge, plus honest notes on pre-existing legacy surfaces we did not
rebuild.

## Threats considered → mitigations

### 1. Prompt injection driving an unauthorized write
An attacker-controlled string (a dealer description, a hostile page the agent
read earlier) tells the agent to "submit the lead now."
- **Mitigation:** authorization never lives in the model. `submit_dealer_contact`
  succeeds only against a preview in `approved` state, and approval is set by
  a human click in the page UI — a server-side state machine
  (`awaiting_human_approval → approved|rejected → submitted`), TTL-bounded.
  An early submit returns a structured 409 refusal. ChatGPT's own
  consequential-action confirmation layers on top of ours.
- **Residual:** in this demo the approve endpoint trusts the page context
  rather than an authenticated user identity. Production binds approval to
  the signed-in shopper's session (Clerk), yielding a per-user audit chain.

### 2. Malicious/malformed tool arguments
- Every tool input is Zod-validated twice — client handler and server route —
  from the same schema that generated the advertised JSON Schema. Strict
  types, enums, ranges, length caps; unknown RV types, absurd prices, or
  oversized payloads are rejected with field-level issues (no echo of
  attacker-controlled content beyond the failing value).
- IDs are looked up, never interpolated: unit ids resolve through a Map; no
  SQL is built from agent input anywhere in the agent layer.

### 3. Content injection from dealer data into agents
Dealer-authored text is external content. The agent layer strips raw prose
from tool outputs (descriptions stay on the page), length-caps titles, and
marks the tools that do carry dealer-derived strings
(`get_unit_details`, `compare_units`) with `untrustedContentHint: true` so
agent runtimes treat them accordingly.

### 4. Lead spam / duplicate submissions
- One submitted lead per (unit, email) per server session; duplicates get a
  structured refusal telling the agent to stop.
- Previews expire after 30 minutes unapproved.
- **Residual:** no global rate limiting on the demo deploy (see limitations).

### 5. Data exfiltration via tools
Tools expose only public marketplace inventory + the shopper's own staged
lead. No user enumeration, no dealer contact books, no admin data on the
agent surface. `exposedTo` is left default (same-origin).

### 6. Secrets
The agent layer requires **zero** secrets. Anthropic/Clerk/Twilio/Gmail
integrations are optional, lazy-initialized, and their absence degrades only
their own features. No Supabase is used anywhere; no service keys ship to the
client.

## Pre-existing findings we did NOT build but must flag

- **`sql.raw` string interpolation** with quote-escaping exists in legacy
  paths (`sync-from-scraper.ts`, `outfitter.ts:676`, `admin.ts`,
  `listing-enrichment.ts`). Inputs are scraper/admin-controlled rather than
  public, but these should move to parameterized queries. Tracked in
  ROADMAP.
- **`POST /api/leads` (legacy public route) has no input validation** —
  predates this work; the agent lead flow does not use it.
- **`.replit` committed environment values** include a Google Places API key
  and operator phone numbers. **Rotate the Places key** and move these to
  Replit secrets; git history retains them until rewritten.
- Legacy lead email templates interpolate user text into HTML unescaped
  (operator-inbox XSS surface).
- CORS reflects any origin with credentials (legacy `app.ts` setting) — the
  agent endpoints are same-origin-consumed and credential-free, but this
  should tighten before production.

## Remaining limitations (honest list)

- No rate limiting or abuse throttling on the demo deploy.
- Approve/reject endpoints are page-trust, not user-auth (see §1 residual).
- The in-memory preview store and dedupe reset on process restart (fine for
  a demo; production wants the DB-backed store the schema already supports).
- The embedded demo database is world-writable by design — it holds only
  public inventory and demo leads, and delivers nothing externally.
