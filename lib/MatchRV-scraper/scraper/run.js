/**
 * MatchRV Scraper - Main Entry Point
 *
 * Orchestrates the full scraping pipeline:
 *   1. Parse CLI args for inventory URL(s)
 *   2. Launch browser with realistic fingerprint
 *   3. For each dealer:
 *      a. Select adapter (generic or domain-specific)
 *      b. Collect inventory listing links
 *      c. Open each detail page and extract all fields + images
 *      d. Normalize and score confidence
 *      e. Write output JSON + NDJSON
 *   4. Print summary
 *
 * Usage:
 *   node scraper/run.js "https://dealer.com/inventory"
 *   node scraper/run.js "https://dealer1.com/rvs" "https://dealer2.com/inventory"
 *
 * Environment:
 *   HEADLESS=false   → show browser window (debug)
 *   DEBUG=true       → verbose logging + save debug artifacts
 *   MAX_CONCURRENT_DETAIL_PAGES=3  → parallel detail page extraction
 */

import { chromium } from 'playwright';
import config from './config.js';
import { getAdapter } from './adapters/registry.js';
import { buildSourceMeta, writeResults } from './output/writer.js';
import { log, randomChoice, randomDelay, retry } from './utils.js';

async function main() {
  const urls = process.argv.slice(2).filter(a => a.startsWith('http'));

  if (urls.length === 0) {
    console.log(`
MatchRV Inventory Scraper v${config.scraperVersion}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage:
  node scraper/run.js <inventory-url> [inventory-url-2] ...

Examples:
  node scraper/run.js "https://example-rv.com/inventory"
  node scraper/run.js "https://dealer1.com/rvs" "https://dealer2.com/new-rvs"

Environment variables:
  HEADLESS=false                    Show browser window
  DEBUG=true                        Verbose logging + debug artifacts
  MAX_CONCURRENT_DETAIL_PAGES=3     Parallel detail page workers
  MAX_RETRIES=3                     Retry failed detail pages

See .env.example for all options.
`);
    process.exit(0);
  }

  log.info(`MatchRV Scraper v${config.scraperVersion} starting`);
  log.info(`Mode: ${config.headless ? 'headless' : 'headed'} | Debug: ${config.debug}`);
  log.info(`Targets: ${urls.length} dealer URL(s)`);

  // ── Launch browser ──
  const browser = await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMo,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  const results = [];

  try {
    for (const inventoryUrl of urls) {
      try {
        const result = await scrapeDealer(browser, inventoryUrl);
        results.push(result);
      } catch (err) {
        log.error(`Failed to scrape ${inventoryUrl}: ${err.message}`);
        results.push({ url: inventoryUrl, error: err.message, records: 0 });
      }
    }
  } finally {
    await browser.close();
  }

  // ── Summary ──
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SCRAPE SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const r of results) {
    if (r.error) {
      console.log(`  ✗ ${r.url} — ERROR: ${r.error}`);
    } else {
      console.log(`  ✓ ${r.domain} — ${r.scraped} scraped, ${r.failed} failed, ${r.highConf} high confidence`);
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

/**
 * Scrape a single dealer's inventory.
 */
async function scrapeDealer(browser, inventoryUrl) {
  const crawlStart = new Date().toISOString();
  const adapter = getAdapter(inventoryUrl);

  log.info(`\n${'='.repeat(60)}`);
  log.info(`Scraping: ${adapter.domain}`);
  log.info(`Inventory URL: ${inventoryUrl}`);
  log.info(`${'='.repeat(60)}`);

  // Create a browser context with realistic fingerprint
  const context = await browser.newContext({
    userAgent: randomChoice(config.userAgents),
    viewport: config.viewport,
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    geolocation: { latitude: 47.6062, longitude: -122.3321 }, // Seattle, WA
    permissions: ['geolocation'],
  });

  // Block unnecessary resources to speed up loading
  await context.route(/\.(woff2?|ttf|eot|otf)$/i, route => route.abort());
  await context.route(/google-analytics|googletagmanager|facebook\.net|doubleclick/i, route => route.abort());

  const records = [];
  let failed = 0;

  try {
    // ── Step 1: Collect inventory links ──
    const listingPage = await context.newPage();
    listingPage.setDefaultTimeout(config.pageTimeout);

    const detailUrls = await adapter.collectInventoryLinks(listingPage);
    await listingPage.close();

    if (detailUrls.length === 0) {
      log.warn('No inventory links found — check selectors or URL');
      // Save debug for the listing page
      if (config.debug) {
        const debugPage = await context.newPage();
        await debugPage.goto(inventoryUrl, { waitUntil: 'domcontentloaded', timeout: config.navigationTimeout });
        await saveDebugArtifactsImport(debugPage, `no-links_${adapter.domain}`);
        await debugPage.close();
      }
    }

    log.info(`Found ${detailUrls.length} detail URLs to scrape`);

    // ── Step 2: Extract records ──
    // Check if adapter already has all records (e.g., from an API response)
    const preloaded = adapter.getPreloadedRecords();

    if (preloaded) {
      log.info(`Adapter preloaded ${preloaded.length} records from API — skipping per-page extraction`);
      for (const r of preloaded) {
        records.push(r);
      }
    } else {
      // Standard per-page extraction with concurrency control
      const concurrency = config.maxConcurrentDetailPages;
      const chunks = chunkArray(detailUrls, concurrency);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        log.info(`Processing batch ${i + 1}/${chunks.length} (${chunk.length} pages)`);

        const batchResults = await Promise.allSettled(
          chunk.map(async (url) => {
            const page = await context.newPage();
            page.setDefaultTimeout(config.detailPageTimeout);

            try {
              const record = await retry(
                () => adapter.extractDetailPage(page, url),
                { label: `detail: ${url}`, maxRetries: config.maxRetries }
              );
              return adapter.transformRecord(record);
            } finally {
              await page.close();
            }
          })
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            records.push(result.value);
            const r = result.value;
            log.info(`  ✓ ${r.year || '?'} ${r.make || '?'} ${r.model || '?'} | ${r.extraction_confidence} confidence | ${r.image_count} images`);
          } else {
            failed++;
            log.error(`  ✗ Failed: ${result.reason?.message}`);
          }
        }

        // Rate limiting between batches
        if (i < chunks.length - 1) {
          await randomDelay();
        }
      }
    }

    // ── Step 3: Write output ──
    const sourceMeta = buildSourceMeta({
      domain: adapter.domain,
      crawlStart,
      listings: detailUrls.length,
      scraped: records.length,
      failed,
    });

    if (records.length > 0) {
      await writeResults(adapter.domain, records, sourceMeta);
    }

    const highConf = records.filter(r => r.extraction_confidence === 'high').length;
    const medConf = records.filter(r => r.extraction_confidence === 'medium').length;
    const lowConf = records.filter(r => r.extraction_confidence === 'low').length;

    log.info(`\nDealer ${adapter.domain} complete:`);
    log.info(`  Scraped: ${records.length}/${detailUrls.length}`);
    log.info(`  Failed: ${failed}`);
    log.info(`  Confidence: ${highConf} high / ${medConf} medium / ${lowConf} low`);

    return {
      domain: adapter.domain,
      url: inventoryUrl,
      scraped: records.length,
      failed,
      highConf,
      medConf,
      lowConf,
    };
  } finally {
    await context.close();
  }
}

/** Split an array into chunks of a given size. */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** Import saveDebugArtifacts lazily to avoid circular deps */
async function saveDebugArtifactsImport(page, label) {
  const { saveDebugArtifacts } = await import('./utils.js');
  return saveDebugArtifacts(page, label);
}

main().catch(err => {
  log.error(`Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
