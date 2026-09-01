import Anthropic from "@anthropic-ai/sdk";

/**
 * Lazily-constructed Anthropic client. Features that use it (AI Outfitter
 * chat, listing enrichment, match reports) require the integration env vars;
 * everything else — including the WebMCP agent tool layer, which is fully
 * deterministic — must boot and run without them. Construction is deferred to
 * first use so a missing key degrades those specific features instead of
 * crashing the process at import time.
 */

/**
 * The key can come from either the conventional ANTHROPIC_API_KEY or the
 * AI_INTEGRATIONS_ANTHROPIC_API_KEY name that Replit's AI integration injected.
 * A base URL is optional — the SDK talks to the public Anthropic API by
 * default — so a plain ANTHROPIC_API_KEY on any host is enough. Set
 * AI_INTEGRATIONS_ANTHROPIC_BASE_URL only to route through a gateway.
 */
function apiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
}

function baseUrl(): string | undefined {
  return process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined;
}

export function isAnthropicConfigured(): boolean {
  return Boolean(apiKey());
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!isAnthropicConfigured()) {
      throw new Error(
        "Anthropic integration is not configured: set ANTHROPIC_API_KEY. AI chat and enrichment features are unavailable without it; the WebMCP agent tools are deterministic and do not need it.",
      );
    }
    const url = baseUrl();
    client = new Anthropic({ apiKey: apiKey(), ...(url ? { baseURL: url } : {}) });
  }
  return client;
}

/** Proxy so existing `anthropic.messages.create(...)` call sites keep working. */
export const anthropic: Anthropic = new Proxy({} as Anthropic, {
  get(_target, prop) {
    return (getClient() as unknown as Record<PropertyKey, unknown>)[prop];
  },
});
