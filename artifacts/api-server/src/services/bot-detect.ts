/**
 * In-house user-agent classifier for analytics. No third-party UA database.
 *
 * Only used to tag analytics events (is_bot / bot_name / bot_category). It is
 * never an access-control decision: a user agent is self-reported and can lie.
 *
 * Order matters. Agent-on-behalf-of-a-user agents (ChatGPT-User, Claude-User,
 * Perplexity-User) are checked before the crawlers from the same vendor, and
 * specific names are checked before the generic "bot|spider|crawler" fallback.
 */

export type BotCategory =
  | "search_crawler"
  | "ai_crawler"
  | "ai_agent_user"
  | "seo_tool"
  | "social_preview"
  | "generic_script"
  | "headless"
  | "other_crawler";

export interface BotMatch {
  is_bot: true;
  bot_name: string;
  bot_category: BotCategory;
}

export interface HumanMatch {
  is_bot: false;
}

export type UaClassification = BotMatch | HumanMatch;

/** [pattern, stable bot_name, category]. Patterns are case-insensitive. */
const RULES: ReadonlyArray<readonly [RegExp, string, BotCategory]> = [
  // AI agents fetching on behalf of a person in a chat.
  [/chatgpt-user/i, "chatgpt-user", "ai_agent_user"],
  [/openai-mcp/i, "openai-mcp", "ai_agent_user"],
  [/claude-user/i, "claude-user", "ai_agent_user"],
  [/perplexity-user/i, "perplexity-user", "ai_agent_user"],
  [/mistralai-user/i, "mistralai-user", "ai_agent_user"],
  [/duckassistbot/i, "duckassistbot", "ai_agent_user"],
  [/meta-externalfetcher/i, "meta-externalfetcher", "ai_agent_user"],
  // AI crawlers / indexers.
  [/oai-searchbot/i, "oai-searchbot", "ai_crawler"],
  [/gptbot/i, "gptbot", "ai_crawler"],
  [/claude-searchbot/i, "claude-searchbot", "ai_crawler"],
  [/claudebot/i, "claudebot", "ai_crawler"],
  [/claude-web/i, "claude-web", "ai_crawler"],
  [/anthropic-ai/i, "anthropic-ai", "ai_crawler"],
  [/perplexitybot/i, "perplexitybot", "ai_crawler"],
  [/meta-externalagent/i, "meta-externalagent", "ai_crawler"],
  [/bytespider/i, "bytespider", "ai_crawler"],
  [/ccbot/i, "ccbot", "ai_crawler"],
  [/amazonbot/i, "amazonbot", "ai_crawler"],
  [/applebot-extended/i, "applebot-extended", "ai_crawler"],
  [/cohere-ai/i, "cohere-ai", "ai_crawler"],
  [/diffbot/i, "diffbot", "ai_crawler"],
  [/youbot/i, "youbot", "ai_crawler"],
  [/timpibot/i, "timpibot", "ai_crawler"],
  [/googleother/i, "googleother", "ai_crawler"],
  // Search engines.
  [/googlebot|google-inspectiontool|adsbot-google|mediapartners-google|storebot-google|apis-google|feedfetcher-google/i, "googlebot", "search_crawler"],
  [/bingbot|bingpreview|msnbot|adidxbot/i, "bingbot", "search_crawler"],
  [/applebot/i, "applebot", "search_crawler"],
  [/yandex\w*bot|yandex\.com\/bots/i, "yandexbot", "search_crawler"],
  [/duckduckbot|duckduckgo-favicons-bot/i, "duckduckbot", "search_crawler"],
  [/baiduspider/i, "baiduspider", "search_crawler"],
  [/petalbot/i, "petalbot", "search_crawler"],
  [/seznambot/i, "seznambot", "search_crawler"],
  [/sogou/i, "sogou", "search_crawler"],
  [/yahoo! slurp/i, "yahoo-slurp", "search_crawler"],
  [/qwantbot|qwant-news/i, "qwantbot", "search_crawler"],
  [/mojeekbot/i, "mojeekbot", "search_crawler"],
  // Social / link preview fetchers.
  [/facebookexternalhit|facebookcatalog/i, "facebookexternalhit", "social_preview"],
  [/twitterbot/i, "twitterbot", "social_preview"],
  [/linkedinbot/i, "linkedinbot", "social_preview"],
  [/slackbot|slack-imgproxy/i, "slackbot", "social_preview"],
  [/discordbot/i, "discordbot", "social_preview"],
  [/telegrambot/i, "telegrambot", "social_preview"],
  [/whatsapp/i, "whatsapp", "social_preview"],
  [/pinterestbot|pinterest\/0\./i, "pinterestbot", "social_preview"],
  [/redditbot/i, "redditbot", "social_preview"],
  [/skypeuripreview/i, "skypeuripreview", "social_preview"],
  // SEO tools.
  [/ahrefsbot|ahrefssiteaudit/i, "ahrefsbot", "seo_tool"],
  [/semrushbot|siteauditbot|splitsignalbot/i, "semrushbot", "seo_tool"],
  [/mj12bot/i, "mj12bot", "seo_tool"],
  [/dotbot/i, "dotbot", "seo_tool"],
  [/rogerbot/i, "rogerbot", "seo_tool"],
  [/screaming frog/i, "screaming-frog", "seo_tool"],
  [/serpstatbot/i, "serpstatbot", "seo_tool"],
  [/dataforseobot/i, "dataforseobot", "seo_tool"],
  [/barkrowler/i, "barkrowler", "seo_tool"],
  [/blexbot/i, "blexbot", "seo_tool"],
  [/megaindex/i, "megaindex", "seo_tool"],
  // Headless browsers and automation.
  [/headlesschrome/i, "headlesschrome", "headless"],
  [/phantomjs/i, "phantomjs", "headless"],
  [/puppeteer/i, "puppeteer", "headless"],
  [/playwright/i, "playwright", "headless"],
  [/selenium|webdriver/i, "selenium", "headless"],
  [/lighthouse|chrome-lighthouse|pagespeed/i, "lighthouse", "headless"],
  [/electron\/[\d.]+.*(bot|crawler)/i, "electron-bot", "headless"],
  // Scripts and HTTP libraries.
  [/python-requests/i, "python-requests", "generic_script"],
  [/python-httpx/i, "python-httpx", "generic_script"],
  [/aiohttp/i, "aiohttp", "generic_script"],
  [/python-urllib|python\/[\d.]+ /i, "python-urllib", "generic_script"],
  [/scrapy/i, "scrapy", "generic_script"],
  [/^curl\//i, "curl", "generic_script"],
  [/^wget\//i, "wget", "generic_script"],
  [/go-http-client/i, "go-http-client", "generic_script"],
  [/node-fetch/i, "node-fetch", "generic_script"],
  [/^node(\.js)?\b|undici/i, "node", "generic_script"],
  [/axios/i, "axios", "generic_script"],
  [/okhttp/i, "okhttp", "generic_script"],
  [/^java\/|apache-httpclient/i, "java-http", "generic_script"],
  [/libwww-perl|lwp::simple/i, "libwww-perl", "generic_script"],
  [/postmanruntime/i, "postman", "generic_script"],
  [/insomnia/i, "insomnia", "generic_script"],
  [/httpie/i, "httpie", "generic_script"],
  [/uptimerobot|pingdom|statuscake|site24x7|betteruptime|uptime-kuma|checkly|datadog synthetic/i, "uptime-monitor", "generic_script"],
  // Generic fallback for self-declared bots.
  [/bot\b|bot\/|spider|crawler|crawl\b|scraper|fetcher|archiver|ia_archiver/i, "other-bot", "other_crawler"],
];

const MAX_UA = 512;

/** Classify a raw user agent. Empty or missing UA is a script, not a person. */
export function classifyUserAgent(userAgent: string | null | undefined): UaClassification {
  const ua = (userAgent ?? "").slice(0, MAX_UA).trim();
  if (!ua) return { is_bot: true, bot_name: "empty-ua", bot_category: "generic_script" };
  for (const [pattern, name, category] of RULES) {
    if (pattern.test(ua)) return { is_bot: true, bot_name: name, bot_category: category };
  }
  // Real browsers all send "Mozilla/5.0". Anything else that reached here is a
  // client we do not know (custom SDK, app); tag it but do not guess a name.
  if (!/^mozilla\/5\.0/i.test(ua) && !/^opera\//i.test(ua)) {
    return { is_bot: true, bot_name: "unknown-client", bot_category: "generic_script" };
  }
  return { is_bot: false };
}

/** Distinct id used for a classified bot, so each bot is one PostHog id, not one per hit. */
export function botDistinctId(match: BotMatch): string {
  return `bot:${match.bot_name}`;
}
