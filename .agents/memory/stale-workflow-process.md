---
name: Stale workflow process after restart
description: WorkflowsRestart can leave an orphan old process holding the port, silently serving stale code
---

Restarting the API Server workflow (or likely any workflow) can leave the *previous* process alive and still bound to its port, so curl tests hit old code even though the restart "succeeded" and fresh startup logs appear.

**Why:** Observed while testing new route code — behavior stayed stale through two restarts; `ps aux | grep index.ts` showed two tsx processes from different restart times; the older one owned port 8080.

**How to apply:** If a behavior change doesn't show up after a workflow restart, run `ps aux | grep <entrypoint>` and kill orphaned older processes, then restart the workflow again before concluding the code is wrong.
