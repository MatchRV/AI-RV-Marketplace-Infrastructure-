# NARRATION — read this aloud over `matchrv-demo.mp4`

Video length: **2:08** (rules cap is 3:00; audio is required). The captions on screen are this text — you are reading what the judge sees, so pace to the caption changes below.

## How to produce the final video in one take (≈15 minutes)

1. Open `docs/demo/matchrv-demo.mp4` in any player, full screen, sound off (it's silent).
2. Start a screen recording **with your microphone on** — QuickTime (⌘⇧5 → Record → Options → your mic), OBS, or Loom.
3. Press play and read each line below as its caption appears. Calm pace; you have slack.
4. Stop, export as 1080p MP4, upload to YouTube as **Public** (or Unlisted), title: *MatchRV — agent-native RV shopping with WebMCP*.
5. Paste the YouTube link into the Devpost form and into `README.md` ("Demo video:").

Optional polish: record audio only (Voice Memos works) and mux it in with any editor — same script, same timings.

## Script, timed to the video

| Time | Say this |
| --- | --- |
| 0:00 | *(title card — pause, let it land)* MatchRV. Agent-native RV shopping, built on WebMCP. |
| 0:08 | Buying an RV means 30 dealer sites describing the same trailer 30 different ways. On real dealer pages, GVWR is machine-readable under 1% of the time. Agents can't shop on that web. |
| 0:14 | MatchRV fixes the layer underneath: this page exposes its real inventory as ten structured WebMCP tools — capabilities, not a chatbot. |
| 0:22 | One messy sentence in — F-150, two kids, bunkhouse trailer under $45k, under 30 ft, near Tacoma, we boondock, solar &amp; lithium — and the agent calls search_inventory with typed constraints. |
| 0:30 | 1,056 real units searched in ~15 ms. Same results on the page and in the agent — and the funnel says exactly what was excluded, and why. |
| 0:41 | The tow question is answered honestly: a bare “F-150” is a 5,000–13,500 lb range, so the rail states the range and asks for the door-sticker rating instead of guessing. |
| 0:48 | Every recommendation carries receipts: which hard checks passed on verified data, the exact score math, and what is unknown — solar the dealer never published stays a question mark. Unknown is not no. |
| 1:01 | Shared state, both directions. The human clicks a preference by hand — two entry doors — and it lands in the same session the agent reads. |
| 1:07 | “Drop the budget to $35k.” The agent's next call is a refine: everything else is kept, the whole funnel recomputes, and the ledger shows You, then Agent. |
| 1:17 | compare_units returns true values, not prose — best-in-row markers, tow margins spelled out, and unknown cells left visibly Unknown. The agent reasons over real numbers. |
| 1:31 | Now the consequential part. The agent can only stage a dealer contact: here is exactly what would be sent, behind a literal NOT SENT banner. The message it drafted asks the dealer to confirm the unknowns. |
| 1:40 | If the agent tries to submit early, the server refuses. Approval is a single-use token only this page holds — never in any tool result, never in the model's context. |
| 1:47 | The human clicks Approve. Now it goes through — once. |
| 1:51 | An exact receipt: dealer, unit, time, reference. Duplicates are blocked. And it never claims a real dealership was contacted — this is a demo environment, and it says so. |
| end | *(closing card)* The inventory was always online. Now agents can actually understand it. |

## If you want to say more than the captions

Add these where they fit — they're the facts judges reward:

- "All ten tools are discovered and executed through Chrome's own `document.modelContext` — this is a real WebMCP runtime, not a mock."
- "No LLM runs inside MatchRV. The site does deterministic arithmetic over 1,056 real units; the shopper's agent does the reasoning."
- "The approval token is minted by the server, held only by this page, single-use, and never appears in any tool result."
- "Everything you're seeing is live at matchrv-webmcp dot onrender dot com slash shop."
