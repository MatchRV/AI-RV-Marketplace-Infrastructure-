# Replit Deployment

## Live Environment

- **Replit:** @LotLinkHQ/workspace
- **URL:** (private — requires Replit login)
- **Stack:** Monorepo with turborepo/pnpm workspaces

## Key Files on Replit

| Path | Purpose |
|------|---------|
| `artifacts/api-server/src/routes/outfitter.ts` | Outfitter AI backend — conversation + matching |
| `artifacts/rv-marketplace/src/pages/outfitter.tsx` | Web chat UI |
| `artifacts/rv-marketplace/src/hooks/use-chat-session.ts` | Chat state management |
| `artifacts/lotlink-mobile/app/(tabs)/outfitter.tsx` | Mobile chat screen |

## Pending Deployment: Matching Engine Fix

**Date:** 2026-04-26
**What:** Replace the entire `outfitter.ts` file with the fixed version
**Local copy:** `MatchRV/outfitter-fixed.ts`
**Obsidian docs:** [[Outfitter Matching Engine]]

### How to Deploy

1. Open Replit @LotLinkHQ/workspace
2. Navigate to `artifacts/api-server/src/routes/outfitter.ts`
3. Replace the entire file contents with `outfitter-fixed.ts`
4. The key changes:
   - New functions: `estimateTowCapacity`, `buildListingFilters`, `rerankWithAI`, `getMatchedListings`
   - `TOW_CAPACITY` lookup table
   - `RERANK_SYSTEM_PROMPT` for AI re-ranking
   - Both `/outfitter/chat` and `/outfitter/recommendations` now use the full matching pipeline
5. Verify the DB has the columns referenced: `rv_type`, `sale_price`, `sleeps`, `length`, `gvwr`, `dry_weight`, `condition`, `inventory_status`, `fresh_water_capacity`, `generator`, `bunkhouse`, etc.
6. Test by running through the full Outfitter conversation and checking that recommendations match stated preferences

### Environment Requirements

- `ANTHROPIC_API_KEY` — needed for both the conversation Claude call AND the re-ranking Claude call (2 API calls per matching request)
- PostgreSQL database with populated `listings` table

## Packages / Workspace Structure

```
@workspace/integrations-anthropic-ai  — Anthropic SDK wrapper
@workspace/db                         — Drizzle ORM + schema
@workspace/api-client-react            — Generated API client for frontend
```

## Cost Consideration

The fix adds a second Claude API call for re-ranking (Sonnet, ~2K tokens). At $3/M input tokens, this adds roughly $0.005-0.01 per matching request. Worth it for accurate matches.
