// mcp.matchrv.com has no DNS record; the live public MCP endpoint is matchrv.com/mcp.
export const MCP_ENDPOINT = "https://matchrv.com/mcp";
export const MCP_FALLBACK_ENDPOINT = "https://matchrv.com/mcp";
export const MCP_JSON_CONFIG = JSON.stringify({ mcpServers: { MatchRV: { url: MCP_ENDPOINT } } }, null, 2);
