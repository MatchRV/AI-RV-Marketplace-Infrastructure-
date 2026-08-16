---
name: Vite BASE_URL API fetch bug
description: Why manual fetch calls in the rv-marketplace app must NOT prepend import.meta.env.BASE_URL to /api paths
---

## Rule
Never write `fetch(\`${BASE}/api/...\`)` where BASE = `import.meta.env.BASE_URL`. Use `/api/...` directly.

**Why:** Vite's `base` config sets `BASE_URL` to `/rv-marketplace/`. Prepending it produces `/rv-marketplace/api/match-report/generate`. The Vite dev server proxy is only configured for `/api` (not `/rv-marketplace/api`), so the request hits Vite's SPA fallback, returns `index.html` (200 OK), `res.json()` throws on the HTML, gets caught silently, and sessionStorage is never set.

**How to apply:** Any raw `fetch` in the rv-marketplace app that calls the API server must use `/api/...` without the BASE prefix. The Vite proxy forwards `/api/*` → `http://localhost:8080`. In production, the Replit reverse proxy does the same. The generated api-client-react uses `setBaseUrl()` separately and is not affected.
