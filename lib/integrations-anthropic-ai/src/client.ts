import Anthropic from "@anthropic-ai/sdk";

/**
 * Lazily-constructed Anthropic client. Features that use it (AI Outfitter
 * chat, listing enrichment, match reports) require the integration env vars;
 * everything else — including the WebMCP agent tool layer, which is fully
 * deterministic — must boot and run without them. Construction is deferred to
 * first use so a missing key degrades those specific features instead of
 * crashing the process at import time.
 */

export function isAnthropicConfigured(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL &&
      process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  );
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!isAnthropicConfigured()) {
      throw new Error(
        "Anthropic integration is not configured (AI_INTEGRATIONS_ANTHROPIC_BASE_URL / AI_INTEGRATIONS_ANTHROPIC_API_KEY). AI chat and enrichment features are unavailable; the WebMCP agent tools do not need them.",
      );
    }
    client = new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });
  }
  return client;
}

/** Proxy so existing `anthropic.messages.create(...)` call sites keep working. */
export const anthropic: Anthropic = new Proxy({} as Anthropic, {
  get(_target, prop) {
    return (getClient() as unknown as Record<PropertyKey, unknown>)[prop];
  },
});
