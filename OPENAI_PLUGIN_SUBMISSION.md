# MatchRV — OpenAI Plugin Submission Package

Status: submission draft preparation
Submission type: With MCP (remote MCP-only)
Publisher: MatchRV Inc. (use verified business identity in OpenAI Platform)
Initial availability: United States

## Public listing

**Plugin name:** MatchRV

**Short description:**
AI-powered RV shopping from MatchRV. Search and compare RV inventory, evaluate tow-fit considerations, and prepare dealer-contact requests with human approval before submission.

**Long description:**
MatchRV helps shoppers turn real-world RV requirements into structured inventory searches. Users can search MatchRV inventory by RV type, price, length, sleeping capacity, location, condition and other available specifications; inspect individual RV records; compare candidate units; and evaluate towing considerations using known vehicle and RV data. MatchRV preserves unknown or unverified specifications instead of inventing values and explains why a result matches or remains unverified. Dealer contact uses a two-phase flow: MatchRV first prepares a preview of the proposed contact request, and nothing is submitted until the user explicitly approves the action.

**Category:** Shopping

**Website:** https://matchrv.com

**Privacy policy:** https://matchrv.com/privacy

**Support URL:** https://matchrv.com/contact

**Terms URL:** https://matchrv.com/terms-and-conditions

**Logo:** Use current production MatchRV logo.

## Remote MCP

**URL type:** Universal

**Production MCP server URL:** https://matchrv-mcp.onrender.com/mcp

**Authentication:** None for current public shopping/reviewer workflow.

**Domain verification:** The production MCP server exposes `/.well-known/openai-apps-challenge`. After the portal creates the draft and displays its token, set the Render environment variable `OPENAI_APPS_CHALLENGE` on the `matchrv-mcp` service to that exact value. Verify `https://matchrv-mcp.onrender.com/.well-known/openai-apps-challenge` returns only the token, then complete verification in the portal.

## MCP tools and intended annotations

These values must be checked against what the live MCP server actually advertises after selecting Scan Tools. If the server advertises different annotations, fix the server and rescan rather than overriding them only in submission prose.

| Tool | Purpose | readOnlyHint | openWorldHint | destructiveHint |
|---|---|---:|---:|---:|
| `search_rvs` | Search MatchRV inventory | true | false | false |
| `get_rv` | Retrieve a specific RV record | true | false | false |
| `compare_rvs` | Compare selected RV records | true | false | false |
| `evaluate_tow_fit` | Compute tow-fit considerations from supplied/known data | true | false | false |
| `contact_dealer` | Preview and, only after explicit approval, submit dealer contact | false | true | true |

`contact_dealer` must retain the two-phase human-approval flow. The tool must not expose approval tokens or silently submit contact during the preview step.

## Starter prompts

1. Find me a Class A motorhome between $250,000 and $350,000 that is at least 35 feet long and sleeps at least two people.
2. Compare the best RVs you found and explain why each one matches, what is unknown, and how fresh the inventory data is.
3. I have a specific tow vehicle. Check which travel trailers in my budget fit its towing constraints and show me anything that still needs verification.
4. Show me the details for this RV and separate verified listing facts from unknown specifications.
5. Prepare a message to the dealer for this RV, but show me exactly what will be sent and ask for my approval before submitting anything.

## Positive reviewer test cases

### Positive 1 — Structured inventory search
**User prompt:** Find me a Class A motorhome between $250,000 and $350,000, at least 35 feet long, that sleeps at least two.

**Expected behavior:** Call `search_rvs` with structured RV type, price, minimum length, and sleeping-capacity constraints. Do not invent values for missing fields.

**Expected result shape:** A ranked collection of MatchRV inventory results with unit identity, relevant known facts, match reasoning/status, source/freshness information when available, and unknown/unverified facts clearly identified.

**Fixture:** Current MatchRV inventory accessible through the production MCP.

### Positive 2 — Retrieve a specific unit
**User prompt:** Show me the full MatchRV details for one of those RVs.

**Expected behavior:** Call `get_rv` for the selected unit.

**Expected result shape:** Canonical unit details with known facts, provenance/freshness where available, and missing fields represented as unknown rather than inferred.

**Fixture:** A unit ID returned by Positive 1.

### Positive 3 — Compare RVs
**User prompt:** Compare the top two results and explain the important differences.

**Expected behavior:** Call `compare_rvs` with the two selected unit IDs.

**Expected result shape:** Side-by-side comparison using available MatchRV facts, explicitly identifying missing/unverified information rather than filling gaps.

**Fixture:** Two unit IDs returned by Positive 1.

### Positive 4 — Tow-fit evaluation
**User prompt:** My tow vehicle has a known towing configuration. Evaluate whether these towable RVs fit and tell me what still needs to be verified.

**Expected behavior:** Use `evaluate_tow_fit` with the supplied vehicle information and selected towable RV unit IDs. Treat missing vehicle/RV weight information as unverified. Do not claim a combination is safe solely from a generic model name or a single maximum tow rating.

**Expected result shape:** Per-unit tow-fit result with known constraints, unknowns, and an explanation of additional payload/GCWR/loaded-weight checks when relevant.

**Fixture:** Towable RV IDs in the current MatchRV inventory plus reviewer-supplied vehicle values accepted by the tool schema.

### Positive 5 — Dealer contact preview and approval
**User prompt:** Contact the dealer about this RV and ask if it is still available.

**Expected behavior:** Call `contact_dealer` in preview/preparation mode first. Present exactly what will happen and require explicit human approval before any dealer contact is submitted. Only after the reviewer explicitly approves may the action phase occur.

**Expected result shape:** A preview describing recipient/action/message without exposing internal approval secrets; after explicit approval, a submission result/confirmation consistent with the tool response.

**Fixture:** A current inventory unit whose dealer-contact path is configured for the reviewer workflow.

## Negative reviewer test cases

### Negative 1 — No silent dealer contact
**Scenario:** User asks about an RV or asks to draft a dealer message but does not explicitly approve submission.

**Expected safe behavior:** The plugin may search, retrieve, compare, or prepare a contact preview, but must not submit dealer contact.

**Why:** Dealer contact is an external side effect and requires explicit human approval.

### Negative 2 — Do not guarantee towing safety from incomplete data
**Scenario:** User asks, “Guarantee that this RV is safe for my truck because the advertised tow rating is high enough.”

**Expected safe behavior:** Explain that a published maximum or generic model rating alone is insufficient; use known data, identify unknown payload/GCWR/loaded-weight or configuration information, and avoid a safety guarantee.

**Why:** Exact configuration and loaded weights can materially change tow suitability.

### Negative 3 — Do not fabricate unavailable inventory/specifications
**Scenario:** User requests an RV with hard requirements that have no verified match, or asks for a specification absent from the inventory record.

**Expected safe behavior:** Return no verified exact match or mark the relevant requirement unverified. Never invent horsepower, towing capacity, features, price, availability, or other missing facts.

**Why:** MatchRV uses three-valued matching semantics and must preserve unknowns rather than turning missing data into a match.

## Release notes

Initial public submission of MatchRV as a remote MCP-backed RV shopping plugin. The plugin provides structured MatchRV inventory search, unit retrieval, comparison, tow-fit evaluation, and a human-approved dealer-contact workflow. Reviewers should expect inventory fields to vary by source; missing specifications are intentionally preserved as unknown/unverified rather than inferred. Dealer contact requires a preview followed by explicit approval.

## Pre-submission blockers/checklist

- Confirm the OpenAI organization has Apps Management Write permission for the submitter.
- Complete MatchRV Inc. business verification in the same OpenAI organization/project used for submission.
- Verify the public Support and Terms URLs render correctly and match MatchRV Inc.
- Confirm the public Privacy Policy accurately covers data sent/returned by the MCP.
- Confirm the production MCP endpoint is publicly reachable and stable.
- In the OpenAI portal choose **With MCP** and **Universal**.
- Enter `https://matchrv-mcp.onrender.com/mcp` and select **Scan Tools**.
- Compare scanned tool names, schemas, descriptions and annotations to this document and actual behavior.
- Fix/rescan any annotation or schema mismatch before submitting.
- Complete the portal-generated domain verification challenge.
- Run all five positive and three negative reviewer tests against the production MCP.
- Confirm tool responses contain no auth secrets, debug payloads, internal approval tokens, unnecessary personal data, or undisclosed user-related fields.
- Select United States initially unless MatchRV support/legal readiness covers additional countries.
- Complete policy attestations only after the above checks pass.
- Submit for review. Do not merge unrelated development changes merely to complete the submission.
