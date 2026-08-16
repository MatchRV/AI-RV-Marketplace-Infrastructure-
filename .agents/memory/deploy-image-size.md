---
name: Deployment image size limit
description: Publish fails if image exceeds 8 GiB; .replitignore rules and what must stay included
---

Published image has a hard 8 GiB limit; the build compiles fine and fails only at the final layer-push step with "image size is over the limit of 8 GiB".

**Why:** Backup archives, `attached_assets`, and `.cache` accumulated ~2.9 GB and pushed the image over the cap (July 2026 failure).

**How to apply:** Keep `.replitignore` excluding backup archives, `.cache`, `attached_assets/*`, `exports`, `output`. Two constraints when editing it:
- Keep `!attached_assets/matchrv-master_1776731519171.json` un-ignored — the api-server empty-DB bootstrap reads it (safe if missing: try/catch, but seeding silently won't happen).
- The rv-marketplace Vite `@assets` alias points into `attached_assets` but no source imports it; re-check before excluding more.

Production run commands are all pnpm/node — no Python in prod, so `.pythonlibs` can be excluded too if more headroom is ever needed.

Credentials must live in Replit Secrets, never `[userenv.shared]` in `.replit` — that section is plaintext, committed, and shipped in the image (cleaned up July 2026; Twilio token rotation recommended to user).
