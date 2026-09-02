# DEMO_SCRIPT — 2:45, one take

Recording setup in [DEMO_CHECKLIST.md](./DEMO_CHECKLIST.md). Narration is
written to be read aloud verbatim at a calm pace. Screen state assumes the
ChatGPT desktop app's in-app browser with the deployed MatchRV URL open at
`/shop`, ChatGPT panel visible beside the page.

| Time | Screen | Narration (voice) | User/agent action | Judge takeaway |
| --- | --- | --- | --- | --- |
| 0:00–0:12 | `/shop` hero. Cursor circles "10 site tools exposed." | "Buying an RV means thirty dealer websites that all describe the same trailer differently. On dealer sites we measured, GVWR is machine-readable less than one percent of the time. Agents can't shop on that web. MatchRV fixes the layer underneath: this page exposes its real inventory as ten structured WebMCP tools." | Click the tools chip; the capability list pops open for ~2s. | The problem is real and the fix is *capabilities, not a chatbot*. |
| 0:12–0:35 | ChatGPT panel. Type the messy prompt. | "So I just ask for what I actually want — six constraints in one sentence." | Type/paste: *"I have an F-150 rated around 8,000 lbs and two kids. Find a bunkhouse travel trailer under $45k, under 30 feet, within 150 miles of Tacoma — we boondock, so prioritize solar and lithium. Best three, explain the compromises."* Send. | Messy human intent goes in raw. |
| 0:35–0:55 | Agent calls `search_inventory`; the page fills: constraint chips, funnel "1,056 → 43 verified · 129 unverified", result cards with match rings. | "The agent compiled my sentence into typed constraints and called one tool. A thousand and fifty-six real units searched in thirty milliseconds — and look at the page: same results, same constraints, and a funnel that says exactly what was excluded and why. A hundred forty-nine were over budget. Fifty were too far." | Hover the funnel exclusion lines. | Deterministic, transparent search — the agent and the human see one truth. |
| 0:55–1:15 | Click "Why this match?" on the top card. Receipts panel: ✓/✗/? rows, score math, amber unknowns. | "Every recommendation comes with receipts. Green checks are verified against the dealer's own listing. And see the question marks — solar is *unknown*, because the dealer never published it. MatchRV refuses to guess. Unknown is not no." | Scroll the provenance rows (source tags). | Explainability + provenance + honest unknowns — no AI hand-waving. |
| 1:15–1:35 | Human clicks the **2 entry doors** chip in the session rail. Ledger logs "You — added preference." Then ask ChatGPT: *"drop the budget to $35k."* Agent refines; chips + results update; ledger interleaves You/Agent. | "Here's the part I love. I click a preference by hand — and my agent's next move already knows, because we're editing the same session. No restarting the conversation. Watch the ledger: my move, then the agent's." | Chip click → agent refine (`mode: refine`). | Shared state, both directions — the actual human-agent experience. |
| 1:35–1:55 | Agent calls `compare_units` on the top 3; the comparison sheet opens: true values, ◀ best markers, "Unknown" cells in amber. | "Compare returns true values, not prose — best-in-row markers, and unknowns stay visibly unknown. My agent reasons over real numbers, including the tow math: this one's thirty-five hundred pounds dry against my eight-thousand-pound rating, with the margin spelled out." | Point at a dry-weight row + an Unknown cell. | Structured comparison an agent can actually reason over. |
| 1:55–2:25 | Say: *"Ask the dealer about the Keystone — and confirm the solar situation."* Agent calls `prepare_dealer_contact`; the approval card slides in: dealer, unit, my info, exact message (which asks the dealer to confirm solar), consent line. Click **Approve & allow send**. Agent submits; receipt appears. | "Now the consequential part. The agent can only *stage* the dealer contact — here's exactly what would be sent, and notice the message it drafted asks the dealership to confirm the unknowns. Nothing moves until I approve. If the agent tries to submit early, the server refuses it. I approve — now it goes through, once. Duplicates are blocked." | Approve click → `submit_dealer_contact` → receipt toast. | Write-action safety enforced by the site, not by trusting the model. |
| 2:25–2:45 | Zoom out to the whole page: ledger, chips, results. Fade to the closing card. | "None of this needed a scraper, a screenshot, or a leap of faith. WebMCP turns websites from pages agents must interpret into capabilities agents can reliably use — and MatchRV turns fragmented RV inventory into an agent-native shopping network. The inventory was always online. Now agents can actually understand it." | — | The thesis, and why it generalizes. |

**Closing frame (2:45):**

> **THE INVENTORY WAS ALWAYS ONLINE.**
> **NOW AGENTS CAN ACTUALLY UNDERSTAND IT.**
> MatchRV · Built on WebMCP

## Timing guards

- Hard cap 3:00; the script lands at ~2:45 leaving 15s of slack. If a tool
  call stalls >3s, cut on action (the page updates are the story, not the
  spinner).
- If ChatGPT phrases a confirmation dialog of its own before
  `submit_dealer_contact`, keep it in — say "and ChatGPT double-checks on top;
  belt and suspenders."

## First-15-seconds test

Problem stated with a measured number by 0:12. WebMCP doing something
scraping can't (typed search + shared page state) by 0:55. Differentiation
(receipts, unknowns, approval gate) by 1:55. Broader significance in the
final 20 seconds.
