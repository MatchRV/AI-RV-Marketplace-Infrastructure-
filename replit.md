# OutfitterRV — RV Marketplace

## Overview

AI-powered RV buying platform with a conversational "RV Outfitter" AI (professional outfitter methodology), CarGurus-style deal scoring, listings marketplace with filters, tow match checker, and dealer profiles.

pnpm workspace monorepo using TypeScript. All services run concurrently.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 (mounted at `/api`)
- **Frontend**: React 19 + Vite + TailwindCSS + shadcn/ui
- **Database**: PostgreSQL + Drizzle ORM
- **AI**: Anthropic Claude (via Replit AI Integrations proxy) — `claude-sonnet-4-6`
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **State management**: React Query (via generated hooks)

## Key Features

1. **AI Outfitter chat** — professional outfitter methodology, structured profile extraction via `<profile>` XML tags, live recommendations sidebar with Best Match/Runner Up/Great Option badges + whyMatch + matchScore
2. **Full matching engine** — SQL filters on type, budget (COALESCE sale_price/price), sleeps, length, tow capacity (12-vehicle lookup table), camping style (boondockingScore ≥50), condition; AI re-ranking via Claude Sonnet picks best 3 from 15 candidates with personalized whyMatch
3. **AI Enrichment Pipeline** — Claude Haiku enriches each listing with 21 boolean/enum fields (bed_size, outdoor_kitchen, solar_ready/installed, fireplace, floorplan type, rear_bedroom, etc.) and boondocking_score (0-100 composite)
4. **Deal scoring** — CarGurus-style: `great_deal`, `good_deal`, `fair_deal`, `high_price`, `overpriced`
5. **Comprehensive filter system** — 30+ filter params (type, make, price, condition, year, sleeps, length, slides, bed_size, tow weight, hitch type, mileage, camping style, 11 feature toggles, 5 floorplan chips, deals toggles); debounced 300ms, URL sync, localStorage persistence
6. **Listing detail** — Price history chart (recharts), tow match checker, dealer info
7. **Tow Match** — User enters vehicle; API checks against listing weight

## Production Inventory Auto-Import

Every new deployment creates a fresh production database. The server auto-imports 957 WA listings on startup whenever the `listings` table is empty — no manual step needed after publishing.

- Logic: `artifacts/api-server/src/lib/auto-import.ts` — shared by admin route + startup
- Source file: `attached_assets/matchrv-master_1776731519171.json` (108MB, bundled with app)
- Admin key: `ADMIN_KEY` env var (required, no fallback — admin routes fail closed if unset) — manual re-import: `POST /api/admin/import-inventory`
- Takes ~4 seconds; happens before server starts accepting traffic

## Live Inventory Scraper (Playwright)
Located at `MatchRV-scraper/` — Playwright-based scraper for 62 WA dealers. Runs headless Chromium.
- `MatchRV-scraper/dealers.json` — list of 62 dealers with adapter configs
- `MatchRV-scraper/data/*.json` — keyed JSON output per dealer (written by scraper)
- `artifacts/api-server/src/lib/sync-from-scraper.ts` — reads data/ JSON, normalizes fields, upserts to DB
- Scraper auto-runs every **6 hours** via `startScraperCron()` in `index.ts`
- Admin endpoints: `POST /api/admin/scrape` (trigger full run), `POST /api/admin/sync` (sync data/ to DB), `GET /api/admin/scrape-status` (status + dealer counts)
- Admin UI: `admin.tsx` → **Scraper tab** — shows status, trigger buttons, dealer listing counts

## Structure

```text
artifacts/
├── api-server/         # Express 5 API — port from $PORT (8080 in dev)
│   └── src/
│       ├── routes/
│       │   ├── listings.ts  # GET /api/listings (30+ filters), GET /api/listings/:id
│       │   ├── outfitter.ts # POST /api/outfitter/chat, /recommendations — full matching pipeline
│       │   ├── admin.ts     # POST /api/admin/import-inventory, /enrich; GET /api/admin/enrich-status, /stats
│       │   ├── match-report.ts # POST /api/match-report/generate (RV Match Report)
│       │   ├── search.ts    # GET /api/search/filters, POST /api/tow-match
│       │   └── health.ts    # GET /api/healthz
│       └── services/
│           └── listing-enrichment.ts  # Claude Haiku enrichment pipeline + hourly cron
├── rv-marketplace/     # React + Vite SPA — proxies /api → port 8080
│   └── src/
│       ├── pages/       # home.tsx, browse.tsx, outfitter.tsx, listing-detail.tsx
│       ├── components/  # layout.tsx, listing-card.tsx, ui-elements.tsx
│       └── hooks/       # use-chat-session.ts (AI chat state)
└── lotlink-mobile/     # Expo React Native mobile app
    └── app/
        ├── (tabs)/      # 5 tabs: index (Discover), browse, outfitter, saved, account
        │   ├── browse.tsx     # Full inventory (all 958 listings), pagination (load-more 24/page), comprehensive filter sheet (condition, price, year, sleeps, slides, lifestyle), sort, search
        │   ├── outfitter.tsx  # AI chat + match % badges on recommendation cards + Match Report modal (full ranked list with whyMatch)
        │   ├── index.tsx      # Discover (swipe cards)
        │   ├── saved.tsx      # Saved listings
        │   └── account.tsx    # Account/profile
        ├── listing/     # [id].tsx — full detail: image gallery, specs, Tow Match tool, Contact Dealer form (POST /api/leads), dealer card
        └── _layout.tsx  # Root layout: fonts, QueryClient, setBaseUrl(EXPO_PUBLIC_DOMAIN)
    └── components/
        ├── DealBadge.tsx  # Color-coded deal score pill
        └── ListingCard.tsx # Full listing card (image + specs + save)

lib/
├── api-spec/           # openapi.yaml + Orval codegen config
├── api-client-react/   # Generated React Query hooks
├── api-zod/            # Generated Zod schemas
├── db/                 # Drizzle schema (listings, dealers tables)
│   └── src/seed.ts     # Database seed script (335 original listings, 5 dealers)
└── integrations-anthropic-ai/  # Anthropic SDK via Replit proxy
```

## Running

- API server: `pnpm --filter @workspace/api-server run dev` (port 8080)
- Frontend: `pnpm --filter @workspace/rv-marketplace run dev` (Vite, PORT env var)
- Database push: `pnpm --filter @workspace/db run push`
- Database seed: `cd lib/db && /path/to/tsx src/seed.ts`

## Vite Proxy

The frontend Vite dev server proxies all `/api` requests to `http://localhost:8080`. This is configured in `artifacts/rv-marketplace/vite.config.ts`.

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection (auto-provisioned by Replit)
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` — Anthropic proxy base URL (auto-set)
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Anthropic proxy API key (auto-set)
- `PORT` — Each artifact reads its own PORT env var (assigned by Replit)

## Database Schema

- `listings` — **872 total RV listings** (335 original + 145 Poulsbo RV + 126 Fife RV Center + 13 Tacoma RV + 253 RV Country, all WA dealers) with deal scoring, price history, tow specs
- `dealers` — id 60 = Poulsbo RV, id 61 = Fife RV Center, id 62 = Tacoma RV, id 63 = RV Country; bootstrapped via `bootstrapPoulsboRV()` / `bootstrapFifeRV()` / `bootstrapTacomaRV()` / `bootstrapRVCountry()` in seed.ts on startup
- `analytics_events` — Client-side analytics (page views, listing views, searches, tow checks, outfitter sessions); indexed on event_type, created_at, dealer_id, listing_id
- `users` — Replit Auth users (OIDC)
- `sessions` — Server-side session store for auth
- `saved_listings` — User saved/favorited listings (unique userId+listingId)
- `saved_searches` — User saved search filters (JSONB)
- `price_alerts` — User price drop alerts per listing
- `dealer_messages` — User-to-dealer messages

## Authentication

- **Provider**: Clerk (Google + Apple sign-in)
- **Server middleware**: `@clerk/express` — `clerkMiddleware()` in app.ts; `getAuth(req)` in route handlers
- **Proxy**: `clerkProxyMiddleware` at `/api/__clerk` for production domain support
- **Frontend**: `@clerk/react` — `ClerkProvider` wraps app in App.tsx; `/sign-in` and `/sign-up` routes
- **Context**: `AuthProvider` wraps the app; `useAppAuth()` provides user + saved listings state (backed by Clerk's `useUser()` and `useAuth()`)
- **User features**: Saved listings, saved searches, price alerts, dealer messaging
- **UI**: Sign In/Out in header, user avatar dropdown with links to /saved, /searches, /alerts, /messages
- **Auth config**: Use the Auth pane in the workspace toolbar to enable/disable login providers, change branding, manage users

## Owner Analytics Dashboard

- **Route**: `/admin` (not linked from nav — owner-only access by URL)
- **Auth**: `ADMIN_KEY` env var checked via `x-admin-key` header (header only, no query param)
- **API endpoints**: `POST /api/analytics/event` (public, fire-and-forget), `GET /api/admin/analytics/*` (admin auth)
- **Dashboard panels**: Summary stats, activity timeline, dealer views, search trends, budget distribution, tow vehicle trends, AI outfitter insights, top listings, geographic demand
- **Time range toggles**: 7d / 30d / 90d
- **Client tracking**: analytics.ts fire-and-forget from Browse, ListingDetail, AI Outfitter; sessionId in sessionStorage; outfitter event deduplicated per stage transition

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root**: `pnpm run typecheck`
- **Project references** — when package A depends on B, A's tsconfig must list B in `references`

## AI Outfitter System

The `POST /api/outfitter/chat` endpoint:
1. Sends conversation to Claude with the RV Outfitter system prompt
2. Claude extracts buyer profile as `<profile>JSON</profile>` and `<stage>value</stage>` XML tags
3. Route strips these tags from the visible message
4. If stage is `matching` or `complete`, runs `getMatchedListings(profile)`:
   - **Layer 1 SQL**: filters on type, `COALESCE(sale_price,price)` ≤ budget, sleeps, length, tow cap, campingStyle → pulls 15 candidates
   - **Layer 2 AI re-rank**: Claude Sonnet picks best 3, writes personalized `whyMatch` + `matchScore`
5. Returns clean message + updatedProfile + recommendations + stage

## AI Enrichment Pipeline

`POST /api/admin/enrich?limit=N` (admin key required) triggers `enrichBatch(N)`:
- Queries listings where `enrichment_version < 1`, sends each to Claude Haiku (claude-haiku-4-5-20251001)
- Extracts 21 boolean/enum fields: outdoor_kitchen, solar_ready, solar_installed, bed_size, has_fireplace, pet_friendly, rear_bedroom, rear_living, front_kitchen, theater_seating, island_kitchen, walk_around_bed, outdoor_shower, outdoor_speakers, backup_camera, hydraulic_jacks, power_awning, enclosed_underbelly, heated_tanks, four_season, hitch_type
- Calculates `boondocking_score` (0-100): generator/solar +25, solar_ready +15, fresh_water ≥40 +20, ≥60 +10, enclosed_underbelly +10, heated_tanks +10, four_season +10, grey_water ≥40 +5, black_water ≥30 +5
- Infers hitch_type from rv_type when Claude can't determine it
- 200ms delay between listings to avoid rate limits
- Cost: ~$0.001 per listing (Claude Haiku)
- `GET /api/admin/enrich-status` — shows total/enriched/pending counts
- Hourly cron auto-enriches any new unenriched listings on server start
