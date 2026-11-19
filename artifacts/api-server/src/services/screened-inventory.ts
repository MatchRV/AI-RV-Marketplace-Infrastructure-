import { perSnapshot } from "./agent-inventory";
import { screenMcpInventory } from "./mcp-inventory-quality";

/**
 * The MCP-screened inventory view (stale listings, implausible prices and category conflicts held back).
 * One shared instance for search_rvs / get_rv and the website swipe deck, so both use the same eligibility screen.
 * Computed once per loaded snapshot; a snapshot reload gets a fresh screen.
 */
export const getScreenedInventory = perSnapshot((inv) => screenMcpInventory(inv));
