# System Overview

## Architecture Diagram

```
User types message
        |
        v
+------------------------+       +------------------------+
|  Web: outfitter.tsx    |       |  Mobile: outfitter.tsx |
|  + use-chat-session    |       |  (state managed inline)|
+----------+-------------+       +----------+-------------+
           |                                |
           +----------------+---------------+
                            v
                 POST /api/outfitter/chat
                            |
                            v
             +------------------------------+
             |  routes/outfitter.ts          |
             |  1. Send to Claude with       |
             |     Golden Ticket prompt      |
             |  2. Extract <profile> JSON    |
             |  3. Extract <stage> tag       |
             |  4. Strip tags from message   |
             |  5. If matching stage:        |
             |     a. SQL filter (full       |
             |        profile, 15 candidates)|
             |     b. AI re-rank (Claude     |
             |        picks best 3)          |
             |     c. Generate personalized  |
             |        whyMatch descriptions  |
             +------------------------------+
                            |
                            v
              { message, profile, stage, recommendations }
                            |
                            v
              UI updates message stream + recommendations panel
```

## Three Layers

| Layer | Purpose | Revenue Model |
|-------|---------|---------------|
| RV Outfitter AI | Consumer-facing — guides buyers to their perfect RV | Lead gen, engagement |
| Marketplace | Buyer + dealer platform — listings, search, deals | Dealer subscriptions, featured listings |
| Data Intelligence | B2B analytics — market trends, pricing, demand | Enterprise data products |

## Key Endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/outfitter/chat` | POST | Main conversation endpoint — Claude + matching |
| `/api/outfitter/recommendations` | POST | Standalone recommendations from a saved profile |

## Tech Stack

- **Backend:** Express + TypeScript
- **AI:** Claude Sonnet 4.6 via Anthropic SDK
- **Database:** Drizzle ORM (PostgreSQL)
- **Web Frontend:** React + Vite
- **Mobile:** React Native (Expo)
- **Scraper:** Node.js, outputs normalized JSON per dealer
- **Hosting:** Replit (@LotLinkHQ/workspace)

## Data Flow

```
Dealer websites
      |
      v
  Scraper (lotlink-scraper)
      |  Extracts 68 fields per listing
      |  Writes JSON keyed by dealer domain
      v
  Inventory Store (diff engine)
      |  Detects: new, removed, price changes, back-on-market
      v
  PostgreSQL (listings table)
      |
      v
  Outfitter Matching Engine
      |  1. SQL WHERE (hard filters)
      |  2. AI re-rank (soft matching)
      v
  Top 3 personalized recommendations
```
