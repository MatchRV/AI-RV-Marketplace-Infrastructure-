# MatchRV inventory (chatgpt-plugin-v1)

Source-of-truth dump for ChatGPT plugin / MCP work.

| File | Description |
|------|-------------|
| `inventory_master.csv` | Merged MarketCheck + Replit package (~24.7k rows / ~15.9k unique VINs) |
| `replit_listings_6882.csv` | Original Replit WA/OR/ID package (~6.9k listings) |

Live MCP serves `lib/agent-core/data/inventory.snapshot.json` rebuilt from this master (~24.3k CanonicalUnits / ~15.5k VINs after year/make filters).
