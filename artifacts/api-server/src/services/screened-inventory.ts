import { getInventory } from "./agent-inventory";
import { screenMcpInventory } from "./mcp-inventory-quality";

/**
 * The MCP-screened inventory view (stale listings, implausible prices and category conflicts held back).
 * One shared instance for search_rvs / get_rv and the website swipe deck, so both use the same eligibility screen.
 */
let screened: ReturnType<typeof screenMcpInventory> | undefined;
export function getScreenedInventory() { return screened ??= screenMcpInventory(getInventory()); }
