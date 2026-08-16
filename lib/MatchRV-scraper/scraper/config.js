/**
 * MatchRV Scraper - Configuration
 *
 * Loads from .env with sensible defaults for production scraping.
 * All timeouts, concurrency, and behavioral settings live here.
 */

import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '.env') });

function envBool(key, fallback) {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v === 'true' || v === '1';
}

function envInt(key, fallback) {
  const v = process.env[key];
  if (v === undefined) return fallback;
  const parsed = parseInt(v, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function envStr(key, fallback) {
  return process.env[key] || fallback;
}

export const config = {
  // Browser
  headless: envBool('HEADLESS', true),
  slowMo: envInt('SLOW_MO', 0),

  // Timeouts
  pageTimeout: envInt('PAGE_TIMEOUT', 60000),
  navigationTimeout: envInt('NAVIGATION_TIMEOUT', 45000),
  detailPageTimeout: envInt('DETAIL_PAGE_TIMEOUT', 30000),

  // Concurrency
  maxConcurrentDetailPages: envInt('MAX_CONCURRENT_DETAIL_PAGES', 3),

  // Retry
  maxRetries: envInt('MAX_RETRIES', 3),
  retryDelayMs: envInt('RETRY_DELAY_MS', 2000),

  // Output
  outputDir: envStr('OUTPUT_DIR', resolve(__dirname, '..', 'output')),
  outputFormat: envStr('OUTPUT_FORMAT', 'json'),
  ndjson: envBool('NDJSON', true),

  // Debug
  debug: envBool('DEBUG', false),
  saveDebugHtml: envBool('SAVE_DEBUG_HTML', false),
  saveScreenshotsOnLowConfidence: envBool('SAVE_SCREENSHOTS_ON_LOW_CONFIDENCE', true),
  debugDir: resolve(__dirname, '..', 'debug'),

  // Rate limiting
  minDelayMs: envInt('MIN_DELAY_BETWEEN_REQUESTS_MS', 1000),
  maxDelayMs: envInt('MAX_DELAY_BETWEEN_REQUESTS_MS', 3000),

  // Identity
  scraperVersion: envStr('SCRAPER_VERSION', '1.0.0'),

  // Realistic browser fingerprints
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  ],

  // Viewport
  viewport: { width: 1920, height: 1080 },

  // Image filtering - patterns that indicate non-RV images (logos, badges, icons)
  imageExcludePatterns: [
    /logo/i,
    /favicon/i,
    /icon/i,
    /badge/i,
    /banner/i,
    /sprite/i,
    /placeholder/i,
    /no-?image/i,
    /no-?photo/i,
    /coming-?soon/i,
    /stock-?photo/i,
    /social/i,
    /facebook|twitter|instagram|youtube|linkedin|pinterest/i,
    /google-?map/i,
    /map-?marker/i,
    /pixel\.gif/i,
    /spacer/i,
    /1x1/i,
    /tracking/i,
    /analytics/i,
    /\.svg$/i,
  ],

  // Minimum image dimensions (pixels) to filter out tiny icons/tracking pixels
  minImageWidth: 200,
  minImageHeight: 150,
};

export default config;
