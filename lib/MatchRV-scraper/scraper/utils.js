/**
 * MatchRV Scraper - Utilities
 *
 * Shared helpers: logging, URL normalization, retry logic, delay, deduplication.
 */

import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import config from './config.js';

// ── Logging ──────────────────────────────────────────────────────────────────

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = config.debug ? LOG_LEVELS.debug : LOG_LEVELS.info;

function ts() {
  return new Date().toISOString();
}

export const log = {
  error: (...args) => currentLevel >= LOG_LEVELS.error && console.error(`[${ts()}] ERROR`, ...args),
  warn: (...args) => currentLevel >= LOG_LEVELS.warn && console.warn(`[${ts()}] WARN`, ...args),
  info: (...args) => currentLevel >= LOG_LEVELS.info && console.log(`[${ts()}] INFO`, ...args),
  debug: (...args) => currentLevel >= LOG_LEVELS.debug && console.log(`[${ts()}] DEBUG`, ...args),
};

// ── URL Helpers ──────────────────────────────────────────────────────────────

/** Resolve a possibly-relative URL against a base URL. Returns null for invalid URLs. */
export function normalizeUrl(href, baseUrl) {
  if (!href || typeof href !== 'string') return null;
  href = href.trim();
  if (href.startsWith('data:') || href.startsWith('blob:') || href === '#') return null;

  try {
    const url = new URL(href, baseUrl);
    // Strip tracking fragments but keep meaningful ones
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

/** Extract the domain from a URL (no protocol, no www). */
export function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Normalize an image URL: prefer largest size, strip resize params where safe. */
export function normalizeImageUrl(url, baseUrl) {
  const abs = normalizeUrl(url, baseUrl);
  if (!abs) return null;

  try {
    const u = new URL(abs);
    // Common CDN resize params to strip for full-res
    const resizeParams = ['w', 'h', 'width', 'height', 'resize', 'size', 'fit', 'crop', 'quality', 'q'];
    for (const p of resizeParams) {
      u.searchParams.delete(p);
    }
    // Remove common thumbnail path segments
    return u.href
      .replace(/\/thumb(nail)?s?\//i, '/')
      .replace(/\/small\//i, '/')
      .replace(/\/medium\//i, '/')
      .replace(/_thumb\./i, '.')
      .replace(/_small\./i, '.')
      .replace(/_medium\./i, '.');
  } catch {
    return abs;
  }
}

/** Check if a URL looks like an RV photo vs a logo/icon/banner. */
export function isLikelyRvImage(url) {
  if (!url) return false;
  return !config.imageExcludePatterns.some(pattern => pattern.test(url));
}

/** Deduplicate an array of URLs, keeping first occurrence. */
export function deduplicateUrls(urls) {
  const seen = new Set();
  return urls.filter(url => {
    if (!url) return false;
    // Normalize for dedup: lowercase, strip trailing slash
    const key = url.toLowerCase().replace(/\/$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Delay / Rate Limiting ────────────────────────────────────────────────────

/** Sleep for a given number of milliseconds. */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Random delay between configured min and max to mimic human browsing. */
export function randomDelay() {
  const ms = config.minDelayMs + Math.random() * (config.maxDelayMs - config.minDelayMs);
  return sleep(ms);
}

// ── Retry Logic ──────────────────────────────────────────────────────────────

/**
 * Retry an async function with exponential backoff.
 * @param {Function} fn - Async function to retry
 * @param {object} opts - { maxRetries, delayMs, label }
 * @returns {Promise<*>} Result of fn
 */
export async function retry(fn, opts = {}) {
  const maxRetries = opts.maxRetries ?? config.maxRetries;
  const delayMs = opts.delayMs ?? config.retryDelayMs;
  const label = opts.label ?? 'operation';

  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      log.warn(`${label} attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt < maxRetries) {
        const backoff = delayMs * Math.pow(2, attempt - 1);
        await sleep(backoff);
      }
    }
  }
  throw lastError;
}

// ── Debug Helpers ────────────────────────────────────────────────────────────

/** Save debug artifacts (HTML + screenshot) for a page. */
export async function saveDebugArtifacts(page, label) {
  try {
    await mkdir(config.debugDir, { recursive: true });
    const safeName = label.replace(/[^a-z0-9_-]/gi, '_').slice(0, 80);
    const timestamp = Date.now();

    const html = await page.content();
    await writeFile(
      resolve(config.debugDir, `${safeName}_${timestamp}.html`),
      html,
      'utf-8'
    );

    await page.screenshot({
      path: resolve(config.debugDir, `${safeName}_${timestamp}.png`),
      fullPage: true,
    });

    log.debug(`Debug artifacts saved for: ${label}`);
  } catch (err) {
    log.warn(`Failed to save debug artifacts for ${label}: ${err.message}`);
  }
}

// ── Data Helpers ─────────────────────────────────────────────────────────────

/** Safely parse JSON, returning null on failure. */
export function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/** Clean a string value: trim whitespace, normalize internal whitespace, return null if empty. */
export function cleanString(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim().replace(/\s+/g, ' ');
  return s.length > 0 ? s : null;
}

/** Parse a price string into a number, stripping currency symbols and commas. */
export function parsePrice(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).replace(/[^0-9.]/g, '');
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

/** Parse an integer from a string. */
export function parseInt10(val) {
  if (val === null || val === undefined) return null;
  const n = parseInt(String(val).replace(/[^0-9-]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

/** Pick a random element from an array. */
export function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Generate a slug from a dealer domain for filenames. */
export function domainSlug(domain) {
  return domain.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
