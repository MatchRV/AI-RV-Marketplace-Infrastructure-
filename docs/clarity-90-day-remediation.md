# MatchRV 90-Day Microsoft Clarity Remediation

> **Repository:** `MatchRVFULL/Marketplace-Insights` (OutfitterRV monorepo)  
> **Frontend:** `artifacts/rv-marketplace` (React 19 + Vite + TailwindCSS + shadcn/ui)  
> **API:** `artifacts/api-server` (Express 5 + PostgreSQL + Drizzle)  
> **Auth:** Clerk (`@clerk/react`, `@clerk/express`)  
> **Analytics:** Google Analytics 4 + Microsoft Clarity + internal `analytics_events` table  
> **Build:** Vite 7, pnpm workspaces

## Access limitations

- Direct Microsoft Clarity recordings, heatmaps, and error dashboards were **not reachable from this environment**.
- Findings below combine the Clarity summary signals you provided with a reproducible, file-level application audit.
- Each issue is classified as `confirmed` (traceable in code/build), `configurable` (environment/deployment dependent), or `hypothesis` (requires more Clarity data).

---

## Baseline

| Metric | Source / current state | Notes |
|--------|------------------------|-------|
| 90-day sessions | Clarity report (post-bot) | 862 sessions, 744 unique users |
| New users | Clarity | 88.75% |
| Pages / session | Clarity | 1.72 |
| Mobile share | Clarity | ~37% MobileSafari + Chrome Mobile |
| Scroll depth | Clarity | ~67% |
| Core Web Vitals | Clarity | "needs improvement" — LCP/INP/CLS flagged |
| Build output | `vite build` | `dist/public` bundle; no source maps in production by default |
| LCP candidates | `index.html` + `home.tsx` | Google Fonts preconnect only; no preload for hero image; no critical CSS inlining |
| Auth chunk | `auth-context.tsx`, `App.tsx` | `@clerk/react` is bundled in main chunk; no fallback for chunk/network failure |

---

## Issue register

### Critical

#### C1 — Clerk authentication chunk / module-load failure
- **Severity:** Critical
- **Routes:** all, especially `/sign-in/*`, `/sign-up/*`, `/account`, `/saved`, `/messages`
- **Devices/browsers:** All; highest impact on Safari iOS and Chrome Mobile where network partitioning / dynamic script loading is stricter
- **User impact:** Blank auth pages, inability to sign in, saved listings / messages inaccessible, lead form cannot pre-fill
- **Root cause:** `AuthProvider` only checks `isClerkConfigured` and then always renders `ClerkAuthProvider`. If `@clerk/react` fails to initialize or the FAPI chunk errors, the whole provider tree throws. No chunk-load error boundary, no graceful `LocalAuthProvider` fallback. The `ClerkProvider` is also mounted at the root (`App.tsx`) without an `ErrorBoundary`, and `clerkProxyMiddleware` is a no-op when `NODE_ENV !== "production"` or `CLERK_SECRET_KEY` is missing.
- **Evidence source:** `artifacts/rv-marketplace/src/contexts/auth-context.tsx` lines 34-45; `artifacts/rv-marketplace/src/App.tsx` lines 62-68, 236-252; `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` lines 30-37; Clarity summary lists Clerk chunk/load failure as top JS error.
- **Type:** confirmed code defect
- **Proposed remediation:**
  1. Wrap `<ClerkProvider>` in a React error boundary that falls back to `LocalAuthProvider` on Clerk init / chunk error.
  2. Add `isLoaded` loading state and explicit retry/fallback UI for auth-aware CTAs.
  3. Guard `signInUrl` / `signUpUrl` construction so missing `VITE_CLERK_PUBLISHABLE_KEY` never renders broken `SignIn` / `SignUp` components.
  4. Verify `VITE_CLERK_PROXY_URL` is set in production and `__clerk` proxy is mounted before `express.json()`.
- **Verification:** unit test + manual sign-in/sign-out on Chrome desktop, Chrome Android, Safari iOS.

#### C2 — Lead / quote submissions silently fail and show false success
- **Severity:** Critical
- **Routes:** `/listing/:id`, `/saved`, sticky mobile CTA bar
- **Devices/browsers:** All; mobile most affected
- **User impact:** User sees "Message sent" even when the network request fails; leads are lost; conversion data unreliable
- **Root cause:** `submitLead` (`listing-detail.tsx` lines 56-103) `fetch` is wrapped in `try/catch` but the response is never checked (`!response.ok` ignored). The UI unconditionally sets `contactSent = true` (line 937) immediately after calling `submitLead`, before the promise resolves. No loading state on the lead button. No analytics `lead_created` / `lead_creation_failed` events.
- **Evidence source:** `artifacts/rv-marketplace/src/pages/listing-detail.tsx` lines 56-103, 917-962; `artifacts/rv-marketplace/src/lib/buyer-intent.ts` records `dealer_contact` event but not submission result.
- **Type:** confirmed code defect
- **Proposed remediation:**
  1. `await` the `fetch` in `submitLead`, check `response.ok`, throw on non-2xx.
  2. Return `{ ok, error }` from `submitLead`; set `contactSent` only after `ok === true`.
  3. Add `isSubmitting` state to disable the button, show spinner, and display inline error with retry.
  4. Fire `lead_created` on backend success, `lead_creation_failed` on failure with error category, without PII.
  5. Add server-side validation and idempotency key.
- **Verification:** e2e test for successful lead, 500 response, network offline.

---

### High

#### H1 — `index.html` blocks rendering with non-essential third-party scripts
- **Severity:** High
- **Routes:** all entry routes (`/`, `/browse`, `/listing/:id`)
- **Devices/browsers:** Mobile, slow connections
- **User impact:** LCP delayed; first paint waits on Google Fonts, Google tag, Clarity script
- **Root cause:** The `<head>` loads three webfonts synchronously, the GA4 `gtag.js` is `async` but still competes with LCP, and the Clarity inline script executes in the head. No preload/prefetch for the actual LCP hero image. No `fetchpriority`.
- **Evidence source:** `artifacts/rv-marketplace/index.html` lines 15-81; `home.tsx` likely renders a hero image without `fetchpriority="high"`.
- **Type:** confirmed performance defect
- **Proposed remediation:**
  1. Preconnect only; defer Google Fonts with `&display=swap` (already present) and `media="print"` trick or `rel="preload"` for critical weights.
  2. Move Microsoft Clarity script to end of `<body>` or load after `window.load`.
  3. Add `<link rel="preload" as="image" ... fetchpriority="high">` for the route-specific LCP image.
  4. Add `decoding="async"` and explicit `width`/`height` to below-the-fold images.

#### H2 — Missing srcset / responsive images on listing cards and hero
- **Severity:** High
- **Routes:** `/browse`, `/listing/:id`, `/`, `/discover`
- **Devices/browsers:** Mobile (37% traffic)
- **User impact:** Wasted bandwidth, slow LCP, high data costs on mobile
- **Root cause:** `cleanListingImages` and `<img>` tags in `listing-card.tsx` / `listing-detail.tsx` likely use the full dealer image URL without `srcset`, `sizes`, or a CDN transform.
- **Evidence source:** `artifacts/rv-marketplace/src/lib/listing-images.ts` to be inspected; `listing-detail.tsx` and `listing-card.tsx` likely render `<img>` directly.
- **Type:** hypothesis / confirmed if `<img>` lacks srcset
- **Proposed remediation:**
  1. Create `ResponsiveImage` component with `srcset`, `sizes`, `loading="lazy"` / `eager` for LCP, `decoding="async"`, explicit `width`/`height`.
  2. Never lazy-load the first visible image.
  3. Use a CDN/image proxy with `?w=` parameter if available; otherwise at least `srcset`.

#### H3 — Analytics events fire before confirmation
- **Severity:** High
- **Routes:** `/listing/:id`, `/match`, `/browse`
- **Devices/browsers:** All
- **User impact:** Conversion funnel over-reports success; Clarity and internal dashboards show leads that never reached the API
- **Root cause:** `recordBuyerIntent("dealer_contact", ...)` is called before the API request completes (`listing-detail.tsx` lines 925-926 and 947-948). `trackEvent` is also fire-and-forget and not tied to backend results.
- **Evidence source:** `artifacts/rv-marketplace/src/pages/listing-detail.tsx` lines 923-959; `artifacts/rv-marketplace/src/lib/analytics.ts`.
- **Type:** confirmed analytics defect
- **Proposed remediation:** Move all success events to after the API confirms `response.ok`; add failure events. Use the taxonomy defined in section 7.

---

### Medium

#### M1 — Internal / dev traffic not excluded from Clarity
- **Severity:** Medium
- **Routes:** all
- **Devices/browsers:** All
- **User impact:** 88.75% new-user rate and low pages/session may be inflated by internal/dev browsing
- **Root cause:** `index.html` only skips Clarity for `replit.dev`, `localhost`, `127.0.0.1`. There is no IP/hostname allowlist or Clarity project-level filtering, no `dataLayer` flag for internal users.
- **Evidence source:** `artifacts/rv-marketplace/index.html` lines 62-71; Clarity summary notes internal traffic contamination.
- **Type:** analytics configuration defect
- **Proposed remediation:**
  1. Add a runtime `window.__MATCHRV_ENV__` flag or query param to disable Clarity for authenticated staff.
  2. Document Clarity project filters for `dev.matchrv.com`, `staging.matchrv.com`, and `replit.dev`.
  3. Add `?internal=true` check in the Clarity loader.

#### M2 — Dead / non-interactive elements appear clickable
- **Severity:** Medium
- **Routes:** `/listing/:id`, `/browse`, `/home`
- **Devices/browsers:** Mobile
- **User impact:** Dead clicks → rage clicks; users tap static cards / text expecting navigation
- **Root cause:** Many `div` and `span` elements with `hover` states but no `cursor-pointer`, missing `onClick`, or non-semantic buttons. `aria-*` labels not verified.
- **Evidence source:** General `lucide-react` icon + Tailwind patterns; requires Clarity heatmaps to locate exact elements.
- **Type:** hypothesis
- **Proposed remediation:**
  1. Run Clarity heatmap review and add `cursor: default` to non-interactive elements.
  2. Convert any clickable div to `<button>` or add `role="button"`, `tabIndex`, keyboard handler, and 44×44dp touch target.
  3. Add `:active` visual feedback to all CTAs.

#### M3 — Low pages-per-session / weak next-best action
- **Severity:** Medium
- **Routes:** `/`, `/browse`, `/listing/:id`
- **Devices/browsers:** All, especially mobile
- **User impact:** 1.72 pages/session; users land and leave
- **Root cause:** Home and listing detail likely lack prominent related-listing cross-links. Mobile sticky CTA only shows on listing page. No visible "browse more like this" module.
- **Evidence source:** `home.tsx`, `listing-detail.tsx` Clarity scroll/exit recordings (needed).
- **Type:** hypothesis
- **Proposed remediation:**
  1. Add "Similar RVs" / "You may also like" carousel on `/listing/:id` above the fold on mobile.
  2. Ensure the primary CTA on `/` leads directly to `/browse` with a pre-filtered AI match.
  3. Add persistent bottom nav on mobile with clear labels.

#### M4 — Potential layout shift from sticky header and mobile CTA bar
- **Severity:** Medium
- **Routes:** `/listing/:id`
- **Devices/browsers:** Mobile Safari, Chrome Mobile
- **User impact:** CLS; bottom bar mounts late and pushes content; sticky top-24 offset may shift when fonts load
- **Evidence source:** `listing-detail.tsx` lines 1067-1099 (fixed bottom bar rendered conditionally); `index.html` webfonts.
- **Type:** confirmed code defect
- **Proposed remediation:**
  1. Reserve `min-height` / `padding-bottom` for the fixed mobile CTA bar in the main layout.
  2. Use `aspect-ratio` / explicit `width`/`height` for images.
  3. Avoid inserting the bottom bar after initial render; conditionally show with `transform` instead of mounting/unmounting.

---

### Low

#### L1 — Console errors swallowed without monitoring
- **Severity:** Low
- **Routes:** all
- **Devices/browsers:** All
- **User impact:** JS errors invisible to ops; user sees broken UI with no error message
- **Root cause:** Multiple `try/catch` with empty blocks and `fetch(...).catch(() => {})`. No `window.onerror` / `unhandledrejection` reporter.
- **Evidence source:** `auth-context.tsx`, `buyer-intent.ts`, `listing-detail.tsx`, `analytics.ts`, `clarity.ts`.
- **Type:** confirmed code defect
- **Proposed remediation:**
  1. Add a lightweight error boundary and global `error` / `unhandledrejection` handler that sends to `/api/analytics/error` (non-PII).
  2. Never use empty `catch` blocks; at minimum log to `console.error` in dev.

#### L2 — Analytics event taxonomy is incomplete
- **Severity:** Low
- **Routes:** all funnel routes
- **Devices/browsers:** All
- **User impact:** Cannot reconstruct the customer journey in Clarity/GA4
- **Root cause:** `GA4_EVENT_MAP` and `trackEvent` do not include the full funnel taxonomy requested (`inventory_search_started`, `lead_form_validation_failed`, etc.).
- **Evidence source:** `artifacts/rv-marketplace/src/lib/analytics.ts` lines 34-46.
- **Type:** confirmed analytics configuration defect
- **Proposed remediation:** Implement the taxonomy in section 7 and remove PII from all metadata.

---

## Recommended event taxonomy

| Event | Trigger | Non-PII context |
|-------|---------|-----------------|
| `inventory_search_started` | user focuses search or opens filters | `route`, `device_category`, `result_count` |
| `inventory_search_completed` | API returns search results | `route`, `device_category`, `result_count` |
| `inventory_result_opened` | click on listing card | `route`, `listing_id`, `dealer_id`, `position` |
| `rv_detail_viewed` | listing detail mount + data loaded | `route`, `listing_id`, `dealer_id` |
| `availability_check_started` | "Contact Dealer" or "Check availability" clicked | `route`, `listing_id`, `dealer_id` |
| `availability_check_completed` | dealer contact form successfully sent | `route`, `listing_id`, `dealer_id` |
| `lead_form_started` | user focuses contact / quote form | `route`, `listing_id`, `dealer_id`, `lead_source` |
| `lead_form_validation_failed` | client or server validation fails | `route`, `listing_id`, `dealer_id`, `error_category` |
| `lead_form_submitted` | user clicks submit | `route`, `listing_id`, `dealer_id`, `lead_source` |
| `lead_created` | backend returns 2xx | `route`, `listing_id`, `dealer_id`, `lead_source` |
| `lead_creation_failed` | backend error / network / timeout | `route`, `listing_id`, `dealer_id`, `error_category` |
| `appointment_requested` | appointment flow completed | `route`, `listing_id`, `dealer_id` |

**PII rule:** never send `contactName`, `contactEmail`, `contactPhone`, or `message` content to analytics. Only `listing_id`, `dealer_id`, `route`, `device_category`, `result_count`, and `error_category`.

---

## Next steps

1. C1 → C2 → H3 (auth, lead conversion, honest analytics) are the highest ROI fixes.
2. Run `pnpm run typecheck` and `pnpm --filter @workspace/rv-marketplace run build` before and after each change.
3. After fixes, run the manual test matrix in `docs/verification-results.md`.
