/**
 * MatchRV Scraper - Scheduled Run
 *
 * Daily inventory sync that:
 *   1. Reads dealer list from dealers.json
 *   2. Scrapes each dealer's current inventory
 *   3. Diffs against stored state (new, removed, price changes)
 *   4. Updates the persistent inventory store
 *   5. Writes changelogs
 *   6. Prints a summary report
 *
 * Usage:
 *   node scraper/scheduled-run.js
 *
 * This is the entry point that Windows Task Scheduler calls at 3am daily.
 * It can also be run manually at any time.
 */

import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import config from './config.js';
import { getAdapter } from './adapters/registry.js';
import { buildSourceMeta, writeResults } from './output/writer.js';
import { loadInventory, saveInventory, listingKey } from './store/inventory-store.js';
import { diffInventory } from './store/diff.js';
import { writeChangelog, printChangeSummary } from './store/changelog-writer.js';
import { log, randomChoice, randomDelay, retry } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const startTime = new Date();
  log.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  log.info(`MatchRV Scheduled Scrape v${config.scraperVersion}`);
  log.info(`Started: ${startTime.toISOString()}`);
  log.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // ── Load dealer list ──
  const dealersPath = resolve(__dirname, '..', 'dealers.json');
  let dealerList;
  try {
    const raw = await readFile(dealersPath, 'utf-8');
    dealerList = JSON.parse(raw);
  } catch (err) {
    log.error(`Failed to read dealers.json: ${err.message}`);
    log.error(`Create ${dealersPath} with your dealer URLs. See dealers.json for format.`);
    process.exit(1);
  }

  const enabledDealers = dealerList.dealers.filter(d => d.enabled !== false);
  if (enabledDealers.length === 0) {
    log.warn('No enabled dealers in dealers.json — nothing to scrape');
    log.warn('Edit dealers.json and set "enabled": true for your dealers');
    process.exit(0);
  }

  log.info(`Dealers to scrape: ${enabledDealers.length}`);

  // ── Launch browser ──
  const browser = await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMo,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  const allResults = [];

  try {
    for (const dealer of enabledDealers) {
      try {
        const result = await scrapeAndDiffDealer(browser, dealer);
        allResults.push(result);
      } catch (err) {
        log.error(`Failed to process ${dealer.name || dealer.url}: ${err.message}`);
        allResults.push({
          dealer: dealer.name || dealer.url,
          error: err.message,
        });
      }

      // Delay between dealers to be respectful
      if (enabledDealers.indexOf(dealer) < enabledDealers.length - 1) {
        await randomDelay();
      }
    }
  } finally {
    await browser.close();
  }

  // ── Final report ──
  const elapsed = ((Date.now() - startTime.getTime()) / 1000 / 60).toFixed(1);

  console.log(`\n${'━'.repeat(60)}`);
  console.log(`DAILY SCRAPE COMPLETE — ${elapsed} minutes`);
  console.log(`${'━'.repeat(60)}`);
  for (const r of allResults) {
    if (r.error) {
      console.log(`  ✗ ${r.dealer} — ERROR: ${r.error}`);
    } else {
      console.log(`  ✓ ${r.dealer} — ${r.summary.new_listings} new, ${r.summary.removed_listings} removed, ${r.summary.price_changes} price changes`);
    }
  }
  console.log(`${'━'.repeat(60)}\n`);
}

/**
 * Scrape one dealer, diff against stored state, save updates.
 */
async function scrapeAndDiffDealer(browser, dealer) {
  const { url, name } = dealer;
  const crawlStart = new Date().toISOString();
  const adapter = getAdapter(url);

  log.info(`\n${'='.repeat(60)}`);
  log.info(`Dealer: ${name || adapter.domain}`);
  log.info(`URL: ${url}`);
  log.info(`${'='.repeat(60)}`);

  // ── Step 1: Load previous inventory state ──
  const storedInventory = await loadInventory(adapter.domain);
  const storedCount = Object.keys(storedInventory).length;
  log.info(`Stored inventory: ${storedCount} listings`);

  // ── Step 2: Scrape current inventory ──
  const context = await browser.newContext({
    userAgent: randomChoice(config.userAgents),
    viewport: config.viewport,
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    geolocation: { latitude: 47.6062, longitude: -122.3321 },
    permissions: ['geolocation'],
  });

  await context.route(/\.(woff2?|ttf|eot|otf)$/i, route => route.abort());
  await context.route(/google-analytics|googletagmanager|facebook\.net|doubleclick/i, route => route.abort());

  const records = [];
  let failed = 0;

  try {
    const listingPage = await context.newPage();
    listingPage.setDefaultTimeout(config.pageTimeout);

    const detailUrls = await adapter.collectInventoryLinks(listingPage);
    await listingPage.close();

    log.info(`Found ${detailUrls.length} detail URLs`);

    // Extract detail pages with concurrency control
    const concurrency = config.maxConcurrentDetailPages;
    const chunks = chunkArray(detailUrls, concurrency);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      log.info(`Batch ${i + 1}/${chunks.length} (${chunk.length} pages)`);

      const batchResults = await Promise.allSettled(
        chunk.map(async (detailUrl) => {
          const page = await context.newPage();
          page.setDefaultTimeout(config.detailPageTimeout);
          try {
            const record = await retry(
              () => adapter.extractDetailPage(page, detailUrl),
              { label: `detail: ${detailUrl}`, maxRetries: config.maxRetries }
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
        } else {
          failed++;
          log.error(`  ✗ ${result.reason?.message}`);
        }
      }

      if (i < chunks.length - 1) await randomDelay();
    }
  } finally {
    await context.close();
  }

  log.info(`Scraped ${records.length} listings (${failed} failed)`);

  // ── Step 3: Diff against stored inventory ──
  const { changes, updatedInventory, summary } = diffInventory(records, storedInventory);

  // ── Step 4: Save updated inventory state ──
  await saveInventory(adapter.domain, updatedInventory);

  // ── Step 5: Write changelog ──
  await writeChangelog(adapter.domain, changes, summary);

  // ── Step 6: Also write the full scrape output ──
  const sourceMeta = buildSourceMeta({
    domain: adapter.domain,
    crawlStart,
    listings: records.length + failed,
    scraped: records.length,
    failed,
  });
  if (records.length > 0) {
    await writeResults(adapter.domain, records, sourceMeta);
  }

  // ── Step 7: Print summary ──
  printChangeSummary(name || adapter.domain, changes, summary);

  return {
    dealer: name || adapter.domain,
    domain: adapter.domain,
    summary,
  };
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

main().catch(err => {
  log.error(`Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
