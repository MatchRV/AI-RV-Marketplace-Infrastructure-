# MatchRV plugin package

This repo-scoped package points to the production MatchRV Streamable HTTP MCP endpoint. It packages the MCP shopping workflow; it does not deploy or change the server. The proposed six-tool Outfitter surface is in draft PR #32 and must be deployed before it appears during tool discovery.

The repo marketplace at `.agents/plugins/marketplace.json` exposes the plugin as a local source for installation and testing in supported ChatGPT Work/Codex surfaces. Restart the desktop app after checking out this branch, then install MatchRV from the local repo source and test it in a new conversation.

Check the discovered tools against `OPENAI_PLUGIN_SUBMISSION.md`. In particular, test that unknown specs stay unknown and `contact_dealer` previews before any submission. For public submission, use **With MCP** and the URL in `mcp.json`; review the submission checklist in `OPENAI_PLUGIN_SUBMISSION.md` first.

This portable package uses `mcp.json` and does not require a `plugin_asdk_app_...` identifier. A registered ChatGPT developer-mode app mapping can be added later if that integration path is needed.
