# CHALLENGE_NOTES — OpenAI WebMCP Challenge (verified 2026-08-29)

Research notes for the MatchRV submission. Everything below was verified against
current official sources on 2026-08-29. Where a fact matters for how we build,
the implication is called out inline.

---

## 1. The challenge

- **Name:** The WebMCP Challenge — "10 days for exploring what's possible with WebMCP."
- **Host:** OpenAI, run on Devpost. Supporters: Cloudflare, Vercel, Render, Netlify, Shopify, Google Chrome.
- **Devpost:** https://webmcp.devpost.com/ (rules: https://webmcp.devpost.com/rules)
- **OpenAI page:** https://openai.com/webmcp-challenge/

### Dates (Pacific Time)
| Milestone | Date |
| --- | --- |
| Submissions open | Aug 25, 2026, 11:00 AM PT |
| **Submissions close** | **Sep 3, 2026, 1:00 PM PT** |
| Judging | Sep 4 – Sep 21, 2026 |
| Winners announced | ~Sep 23, 2026 |

> One secondary source reported a 5:00 PM PT close; the official Devpost rules
> page says **1:00 PM PT**. Treat 1:00 PM PT as the hard deadline.

### Eligibility
Individuals (age of majority+), teams, and organizations in countries with
OpenAI API access. Standard exclusions (sanctioned regions, promotion-entity
employees, judges).

### Prizes
Top 10 submissions each receive: $3,000 USD + 1-year ChatGPT Pro (3 members) +
swag + OpenAI social spotlight, plus sponsor prizes (Cloudflare $10k credits,
Vercel $4.2k credits, Render $300, Netlify $500 cash, Shopify gear, Chrome
3-month AI Ultra). One prize per project.

---

## 2. Official judging criteria (equally weighted — these differ from early drafts)

Quoted from the Devpost rules:

1. **WebMCP Leverage** — "How thoroughly and skillfully does the project use
   WebMCP? Does the code reflect genuine effort and a working, non-trivial
   implementation?"
2. **Execution** — "Does the project deliver a working or runnable project that
   has a complete, coherent product experience — not just a technical proof of
   concept?"
3. **Potential Impact** — "Does the project make a credible, specific case for
   solving a real problem for a real audience?"
4. **Creativity & Ambition** — "How creative and novel is the concept and does
   the project differ from existing concepts?"

Our internal five-lens spec (usefulness, originality, execution, thoughtful
WebMCP, human-agent experience) maps cleanly: usefulness → Potential Impact,
originality → Creativity & Ambition, thoughtful-WebMCP + human-agent
experience → WebMCP Leverage (+ Execution). We score against both sets in
`JUDGING_MATRIX.md`.

---

## 3. Required submission artifacts

From the official rules:

1. **Working live URL**, accessible via "ChatGPT's in-app browser or Google
   Chrome with WebMCP enabled." Login credentials may be provided to judges if
   needed.
2. **Public code repository** (GitHub/GitLab/Bitbucket) with an **open-source
   license "detectable and visible at the top of the repository page."**
   → Implication: `LICENSE` file (MIT) at repo root + license field in
   `package.json` + license badge in README. Repo must be public at submission
   time.
3. **Demo video**: public YouTube, **under 3 minutes**, **with audio**, must
   include "a clear demo of your project functioning" and explain the WebMCP
   usage. Judges are not required to watch past 3:00. → `DEMO_SCRIPT.md`.
4. **Text description** covering: how the use case fits WebMCP, UX
   improvements, human-agent collaboration possibilities, and implementation
   details. → `DEVPOST_SUBMISSION.md`.
5. Project must be built (or meaningfully extended with WebMCP) during the
   submission period. Extending an existing product with a genuine WebMCP layer
   is the intended shape — MatchRV qualifies (existing marketplace + new agent
   layer built during the window).

Hosting options suggested by the challenge: ChatGPT Sites, Cloudflare, Vercel,
Render, Netlify, Shopify, "or any provider."

---

## 4. WebMCP runtime facts (as they exist today)

Sources:
- Spec: https://webmachinelearning.github.io/webmcp/
- Chrome docs: https://developer.chrome.com/docs/ai/webmcp (+ `/imperative-api`,
  `/declarative-api`, `/best-practices`, `/secure-tools`)
- OpenAI guide: https://learn.chatgpt.com/docs/webmcp

### Where it runs
- **ChatGPT desktop app in-app browser** — supports WebMCP natively, no flags.
  Shows a "Site tools" indicator in the address bar. Users just ask for help on
  a page; the agent discovers and proposes site tools automatically.
- **Google Chrome 149+** — origin trial; local testing via
  `chrome://flags/#enable-webmcp-testing`.
- **Empirically verified by us (2026-08-29):** on Chrome for Testing 152,
  the flag's CLI equivalent is `--enable-features=WebMCPTesting`
  (`--enable-features=WebMCP`, `--enable-blink-features=WebMCP`, and
  `--enable-experimental-web-platform-features` also enable it);
  `document.modelContext` is the only entry point — `navigator.modelContext`
  is absent, confirming the documented current API shape.

### API surface (current)
- Entry point is **`document.modelContext`**. (`navigator.modelContext` was the
  earlier shape and still appears in older articles; feature-detect and support
  both: `const mc = document.modelContext ?? navigator.modelContext`.)
- Feature detection per OpenAI docs:
  `typeof document.modelContext?.registerTool === "function"`.
- **`registerTool(tool, options?)`** — tool: `{ name, title?, description,
  inputSchema (JSON Schema), execute, annotations? }`; options: `{ signal?
  (AbortSignal → unregister), exposedTo? (origins) }`.
- `execute(input, { signal }) => Promise<any>` — return values are
  **serialized to JSON strings** before reaching the agent. Returning a
  structured object is explicitly shown in OpenAI's own example.
- **Annotations:** `readOnlyHint: true` for non-mutating tools (agents use it
  to decide when to ask the user); `untrustedContentHint: true` when a tool
  returns user-generated/external content (prompt-injection defense signal).
- **`getTools()` / `executeTool()` / `toolchange` event** — the page can
  enumerate and invoke its own tools; we use this for the built-in tool
  console and automated tests.
- Name constraints: 1–128 chars, alphanumeric/hyphen/underscore/period.
- Permissions Policy **`tools`** (default `self`); cross-origin iframes need
  `allow="tools"`; WebMCP is only available in origin-isolated, fully active,
  top-level-ish documents.

### ChatGPT-specific constraints (from learn.chatgpt.com)
- **Imperative registration in the top-level page only.** No iframes. The
  **declarative API (HTML form attributes) is NOT supported in ChatGPT** — so
  our tool surface is 100% imperative `registerTool`.
- Consequential actions (messages, purchases…) go through ChatGPT's own
  confirmation policies **in addition to** whatever the site does. → We still
  build our own site-side approval UI: defense in depth and a better demo.
- Guidance: keep inputs narrow, describe side effects, return enough info for
  the agent to verify results, reuse existing app logic + auth.

### Best practices that shaped our design (Chrome docs)
- **Single-responsibility tools; keep the count low** — every registered tool
  consumes agent context. → We ship a focused surface (~9 tools), not 25.
- **Action-oriented names**; positive descriptions; explicit param types;
  prefer natural-language enums over opaque IDs.
- **Accept raw input** — don't force the agent to do math/transforms.
- **"Validate strictly in code, loosely in schema"** — return descriptive
  errors so the model can self-correct and retry.
- **Update UI state after tool calls** — "Agents may rely on the interface to
  plan next steps." → This is the shared-state session model at the heart of
  our submission.
- **Output size limits:** tool descriptions ≤ 500 chars; param descriptions
  ≤ 150 chars; names ≤ 30 chars; **individual tool outputs ~1.5K chars** to
  avoid agent guardrail conflicts. → Search returns compact candidate
  summaries + counts; `get_unit` returns the full record for one unit.
- Security page: mark UGC-returning tools `untrustedContentHint`; never expose
  write tools beyond origins genuinely authorized to act; expect prompt
  injection and design so a confused agent cannot cause an unauthorized write
  (server-side validation + human approval token, not trust in the model).

---

## 5. Competitive landscape (checked 2026-08-29)

- OpenAI showcase (https://developers.openai.com/showcase): games (Glass
  Towers, MiniTown), creative tools (Paperie, Waveform Studio), light commerce
  (Field Day, Verdant Market shared cart, Kiln). "WebMCP examples are coming
  soon" — no shipped WebMCP showcase entries yet at time of research. **No
  automotive / RV / real-estate / high-consideration marketplace examples.**
- Expected common submission patterns: to-do/productivity demos, shared-cart
  shopping toys, "AI fills my form" demos, chatbot-on-a-page.
- MatchRV's differentiation: a real fragmented-industry problem (RV dealer
  inventory), a normalized semantic layer with provenance and honest unknowns,
  deterministic explainable matching, tow-safety reasoning with uncertainty,
  and a two-phase human-approved dealer handoff — i.e., **vertical commerce as
  an agent-usable capability layer**, not a widget demo.

---

## 6. Implications checklist for this repo

- [x] Tool layer registered imperatively in the top-level SPA, feature-detected.
- [x] `readOnlyHint` on all read tools; write path split into
  `prepare_lead` (read/preview) + `submit_lead` (requires human approval
  token minted by the UI, enforced server-side).
- [x] Compact tool outputs (~≤1.5K chars target) with `get_unit` as the detail
  escape hatch.
- [x] MIT `LICENSE` at repo root + package.json license fields.
- [x] Runs with zero external services (deterministic in-repo dataset) so the
  live URL and judge clones never break.
- [x] `DEMO_SCRIPT.md` (< 3 min), `DEMO_CHECKLIST.md`, `DEVPOST_SUBMISSION.md`,
  `JUDGING_MATRIX.md`, `SECURITY_NOTES.md`, `WEBMCP_TEST_RESULTS.md`,
  `ROADMAP.md`.

## 7. Sources

- https://webmcp.devpost.com/ and https://webmcp.devpost.com/rules
- https://openai.com/webmcp-challenge/ (page 403s to bots; facts cross-checked
  via Devpost + Netlify announcement)
- https://www.netlify.com/blog/compete-openai-webmcp-challenge/
- https://webmachinelearning.github.io/webmcp/
- https://developer.chrome.com/docs/ai/webmcp
- https://developer.chrome.com/docs/ai/webmcp/imperative-api
- https://developer.chrome.com/docs/ai/webmcp/declarative-api
- https://developer.chrome.com/docs/ai/webmcp/best-practices
- https://developer.chrome.com/docs/ai/webmcp/secure-tools
- https://learn.chatgpt.com/docs/webmcp
- https://developers.openai.com/showcase
- https://webmcpchallenge.netlify.app/
