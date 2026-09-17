# MatchRV inventory (chatgpt-plugin-v1)

| File | Description |
|------|-------------|
| `inventory_master.csv` | Merged MarketCheck + Replit package (~24.7k rows / ~15.9k unique VINs) |
| `replit_listings_6882.csv` | Original Replit WA/OR/ID package (~6.9k listings) |

Live MCP serves `lib/agent-core/data/inventory.snapshot.json` (~20.8k priced CanonicalUnits; length/sleeps backfilled from MarketCheck when present). Null/sub-$1k prices are dropped so ChatGPT searches don't look empty.
