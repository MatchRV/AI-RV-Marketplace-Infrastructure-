# DEMO_CHECKLIST — preflight for recording & judging

## Environment

- [ ] Live deploy healthy: `GET /api/healthz` → `{"status":"ok"}`;
      `GET /api/agent/meta` → 1,056 units, 10 tools.
- [ ] **Warm the page once** before recording (first visit compiles/caches;
      subsequent loads are fast).
- [ ] ChatGPT **desktop app** signed in; open the deploy URL in the in-app
      browser; confirm the **Site tools** indicator lists MatchRV's 10 tools.
- [ ] Fallback runtime: Chrome 149+ with `chrome://flags/#enable-webmcp-testing`
      enabled and relaunched. (CLI equivalent for any [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/)
      ≥149 binary: launch with `--enable-features=WebMCPTesting`; verified
      working on 152.) Sanity-check the native layer any time with
      `pnpm --filter @workspace/scripts run native-webmcp`.
- [ ] Second fallback: the `/shop` guided demo runs clean end-to-end (works in
      any browser; pauses at the human-approval step by design).
- [ ] Network: hardwired or strong Wi-Fi; close bandwidth hogs. Dealer photo
      CDNs (images.poulsborv.com etc.) load — spot-check three result cards.
- [ ] Server freshly restarted before recording (clears prior lead dedupe
      and rate-limit counters so the submit succeeds live): redeploy or
      restart the process.

## Exact prompts (copy from here)

1. Main: `I have an F-150 rated around 8,000 lbs and two kids. Find a
   bunkhouse travel trailer under $45k, under 30 feet, within 150 miles of
   Tacoma — we boondock, so prioritize solar and lithium. Best three, explain
   the compromises.`
2. Refine: `Drop the budget to $35k.`
3. Action: `Ask the dealer about the Keystone — and confirm the solar
   situation. My name is Alex Rivera, alex.rivera@example.com, 253-555-0142.`

## Expected responses (verify in rehearsal)

- [ ] Search: funnel ≈ "1,056 searched → ~43 verified, ~129 unverified";
      top results include 2025 Keystone Springdale Mini 1760BH ($19,994,
      Kent, 13 mi) and Dutchmen Kodiak Cub 162BH.
- [ ] Chips show: travel trailer · ≤$45,000 · ≤30 ft · tow: F-150 rated
      8,000 lbs · sleeps 6+ · must: Bunkhouse · prefer: Solar, Lithium ·
      150 mi of Tacoma · boondocking.
- [ ] Explain: score ~70, 7/7 hard checks, unknowns list includes solar.
- [ ] Prepare: approval card shows dealer Poulsbo RV · Kent, the drafted
      message asks to confirm solar, consent line visible.
- [ ] Early submit → agent reports "awaiting human approval" (never a send).
- [ ] After Approve: receipt with lead id + "demo environment" delivery note.

## Recording

- [ ] 1920×1080 (or 2560×1440 downscaled), 60fps if available; browser at
      100% zoom; hide bookmarks bar; light theme OS chrome out of frame.
- [ ] Microphone tested; narration recorded with the take (or dubbed after —
      audio is REQUIRED by the rules).
- [ ] No secrets on screen: no real emails, no admin pages, no env files,
      DevTools closed. Demo identity only (Alex Rivera / example.com).
- [ ] Do a full rehearsal take, then the real take. Keep the rehearsal file
      as the fallback recording.
- [ ] Under 3:00 total. Export 1080p MP4 → upload to YouTube (public),
      title "MatchRV — agent-native RV shopping with WebMCP".

## Fallback plan

- **Committed fallback footage:** `docs/demo/native-webmcp-run.webm` — a
  silent ~70 s capture of the real product driven through a real Chrome's
  native `document.modelContext` (search → human chip edit → agent refine →
  explain → compare → approval → receipt). Narrate over it per
  DEMO_SCRIPT.md if live recording fails. Re-record any time (photos load on
  a normal network):
  `pnpm --filter @workspace/scripts run fetch-chrome` then
  `pnpm --filter @workspace/scripts run record-broll` (with `pnpm dev` up).
- Agent runtime misbehaving on the day → record the identical flow with the
  guided demo (labeled on screen as simulating the agent's tool calls) and
  show the ChatGPT Site-tools discovery separately at the top.
- Deploy down → `pnpm dev` locally and record against localhost (the
  experience is identical; say so on camera).

## Submission package (Devpost)

- [ ] Live URL (loads in ChatGPT in-app browser)
- [ ] Public repo URL — repo set to **public**, MIT license visible at top
- [ ] YouTube video URL (<3 min, public, audio)
- [ ] Text description pasted from [DEVPOST_SUBMISSION.md](./DEVPOST_SUBMISSION.md)
- [ ] Submitted before **Sep 3, 2026, 1:00 PM PT** (aim for Sep 2)
