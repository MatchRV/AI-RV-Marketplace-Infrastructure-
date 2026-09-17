# MatchRV inventory (chatgpt-plugin-v1)

Source of truth dump for ChatGPT plugin / MCP work.

| File | Description |
|------|-------------|
| `inventory_master.csv` | Merged MarketCheck + Replit package (~22k rows) |
| `replit_listings_6882.csv` | Original Replit/WA-OR-ID package (~6.9k listings) |

The live MCP service still reads `lib/agent-core/data/inventory.snapshot.json` until that snapshot is rebuilt from this master and redeployed.
