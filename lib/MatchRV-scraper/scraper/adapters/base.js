/**
 * MatchRV Scraper - Base Adapter
 *
 * The generic adapter handles any dealer website using a multi-source
 * extraction pipeline. Dealer-specific adapters extend this class
 * to override selectors, pagination logic, or field extraction.
 *
 * Extension points:
 *   - getInventoryListSelector()  → CSS selector for listing links
 *   - getNextPageSelector()       → CSS selector for "next page" button
 *   - getPaginationType()         → 'click' | 'url' | 'scroll'
 *   - extractDetailFields(page)   → custom detail page extraction
 *   - transformRecord(record)     → post-process a record
 */

import { attachNetworkCapture, extractFromNetworkResponses } from '../extractors/network.js';
import {
  extractJsonLd, parseJsonLdVehicle,
  extractInlineScriptData, extractMetaTags, parseMetaFields,
} from '../extractors/structured-data.js';
import { extractAllImages } from '../extractors/images.js';
import { extractSpecs } from '../extractors/specs.js';
import { extractDomFields, extractDealerInfo, parseTitle } from '../extractors/dom.js';
import { normalizeRvRecord } from '../output/schema.js';
import { scoreConfidence } from './confidence.js';
import {
  log, normalizeUrl, extractDomain, retry, randomDelay, saveDebugArtifacts,
} from '../utils.js';
import config from '../config.js';

export class BaseAdapter {
  constructor(inventoryUrl) {
    this.inventoryUrl = inventoryUrl;
    this.domain = extractDomain(inventoryUrl);
    this.dealerName = null;
    this.dealerLocation = null;
  }

  /** Override in subclass to provide domain-specific listing link selector. */
  getInventoryListSelector() {
    return [
      'a[href*="/inventory/"]',
      'a[href*="/vehicle/"]',
      'a[href*="/listing/"]',
      'a[href*="/unit/"]',
      'a[href*="/rv/"]',
      'a[href*="/detail/"]',
      'a[href*="/stock/"]',
      'a[href*="/used-"]',
      'a[href*="/new-"]',
      'a[href*="/pre-owned"]',
      '.inventory-listing a',
      '.vehicle-card a',
      '.listing-card a',
      '.inventory-item a',
      '[class*="inventory"] a[href]',
      '[class*="listing"] a[href]',
      '[class*="vehicle-card"] a[href]',
      '[data-vehicle] a',
    ].join(', ');
  }

  /** Override to customize next-page navigation. */
  getNextPageSelector() {
    return [
      'a.next', '.pagination .next a', '.pagination a[rel="next"]',
      '[class*="next-page"]', '[class*="pagination"] a:has-text("Next")',
      '[class*="pagination"] a:has-text(">")', '[aria-label="Next page"]',
      '.pager-next a', 'a[class*="arrow-right"]',
    ].join(', ');
  }

  /** 'click' = click next button, 'scroll' = infinite scroll, 'url' = URL param. */
  getPaginationType() {
    return 'click';
  }

  /** Max pages to paginate through. Override for dealers with huge inventories. */
  getMaxPages() {
    return 50;
  }

  /**
   * If the adapter extracts all records during collectInventoryLinks()
   * (e.g., from an API response), return them here to skip per-page extraction.
   * Return null to use the normal per-page flow.
   */
  getPreloadedRecords() {
    return null;
  }

  // ── Inventory Link Collection ──────────────────────────────────────────

  /**
   * Collect all RV detail page links from inventory listing pages.
   *
   * @param {import('playwright').Page} page
   * @returns {Promise<string[]>} Array of absolute detail page URLs
   */
  async collectInventoryLinks(page) {
    log.info(`Navigating to inventory page: ${this.inventoryUrl}`);

    await page.goto(this.inventoryUrl, {
      waitUntil: 'domcontentloaded',
      timeout: config.navigationTimeout,
    });

    // Wait for content to render
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Extract dealer info from first page
    const dealerInfo = await extractDealerInfo(page);
    this.dealerName = dealerInfo.dealer_name;
    this.dealerLocation = dealerInfo.dealer_location;

    const allLinks = new Set();
    let pageNum = 1;
    const maxPages = this.getMaxPages();

    while (pageNum <= maxPages) {
      log.info(`Scanning inventory page ${pageNum}...`);

      const pageLinks = await this._extractLinksFromPage(page);
      const prevSize = allLinks.size;
      for (const link of pageLinks) allLinks.add(link);

      log.info(`Page ${pageNum}: found ${pageLinks.length} links (${allLinks.size} total unique)`);

      // No new links found — we've probably seen all pages
      if (allLinks.size === prevSize && pageNum > 1) {
        log.info('No new links on this page — stopping pagination');
        break;
      }

      // Try to go to next page
      const hasNext = await this._goToNextPage(page);
      if (!hasNext) {
        log.info('No more pages to paginate');
        break;
      }

      pageNum++;
      await randomDelay();
    }

    const links = [...allLinks];
    log.info(`Total unique detail links collected: ${links.length}`);
    return links;
  }

  async _extractLinksFromPage(page) {
    const selector = this.getInventoryListSelector();
    const baseUrl = page.url();

    const hrefs = await page.evaluate((sel) => {
      const anchors = document.querySelectorAll(sel);
      const urls = new Set();
      for (const a of anchors) {
        const href = a.href;
        if (href && !href.includes('#') && !href.includes('javascript:')) {
          urls.add(href);
        }
      }
      return [...urls];
    }, selector);

    // Filter to only links on the same domain
    return hrefs
      .map(h => normalizeUrl(h, baseUrl))
      .filter(h => h && new URL(h).hostname.replace(/^www\./, '') === this.domain);
  }

  async _goToNextPage(page) {
    const paginationType = this.getPaginationType();

    if (paginationType === 'scroll') {
      return this._infiniteScroll(page);
    }

    const nextSel = this.getNextPageSelector();
    try {
      const nextBtn = page.locator(nextSel).first();
      if (await nextBtn.isVisible({ timeout: 3000 })) {
        await nextBtn.click();
        await page.waitForLoadState('domcontentloaded', { timeout: config.navigationTimeout });
        await page.waitForTimeout(2000);
        return true;
      }
    } catch { /* no next button */ }

    return false;
  }

  async _infiniteScroll(page) {
    const prevHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3000);
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    return newHeight > prevHeight;
  }

  // ── Detail Page Extraction ─────────────────────────────────────────────

  /**
   * Extract all data from a single RV detail page.
   * Runs the full multi-source extraction pipeline:
   *   1. Network capture (set up before navigation)
   *   2. Navigate to page
   *   3. JSON-LD extraction
   *   4. Inline script blob extraction
   *   5. Meta tag extraction
   *   6. Spec table extraction
   *   7. DOM field extraction
   *   8. Image extraction (comprehensive)
   *   9. Merge fields by priority
   *  10. Normalize and score confidence
   *
   * @param {import('playwright').Page} page
   * @param {string} detailUrl
   * @returns {Promise<object>} Normalized RV record
   */
  async extractDetailPage(page, detailUrl) {
    const now = new Date().toISOString();
    const fieldSources = {};

    // ── Step 1: Set up network capture BEFORE navigating ──
    const networkCapture = attachNetworkCapture(page);

    // ── Step 2: Navigate ──
    log.info(`Extracting: ${detailUrl}`);
    await page.goto(detailUrl, {
      waitUntil: 'domcontentloaded',
      timeout: config.navigationTimeout,
    });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // ── Step 3-8: Run extractors ──
    // (many can run concurrently since they're reading the same loaded page)
    const [
      jsonLdBlocks,
      inlineData,
      metaTags,
      specsResult,
      domResult,
    ] = await Promise.all([
      extractJsonLd(page),
      extractInlineScriptData(page),
      extractMetaTags(page),
      extractSpecs(page),
      extractDomFields(page),
    ]);

    // Detach network capture now that page is loaded
    networkCapture.detach();

    // Process structured data
    const jsonLdResult = parseJsonLdVehicle(jsonLdBlocks);
    const metaFields = parseMetaFields(metaTags);
    const networkResult = extractFromNetworkResponses(networkCapture.responses);

    // ── Step 8: Image extraction (needs scrolling + interaction) ──
    const imageUrls = await extractAllImages(
      page,
      networkResult.images,
      jsonLdResult.images,
      inlineData.images,
    );

    // ── Step 9: Merge fields by priority ──
    // Priority: network > inline script > JSON-LD > specs > DOM > meta > title parse
    const merged = {};

    const sources = [
      { data: networkResult.fields, source: 'xhr' },
      { data: inlineData.fields, source: 'script_blob' },
      { data: jsonLdResult.fields, source: 'json_ld' },
      { data: specsResult.fields, source: 'specs_table' },
      { data: domResult.fields, source: 'dom' },
      { data: metaFields, source: 'meta' },
    ];

    for (const { data, source } of sources) {
      for (const [key, val] of Object.entries(data)) {
        if (val !== null && val !== undefined && val !== '' && !(key in merged)) {
          merged[key] = val;
          fieldSources[key] = source;
        }
      }
    }

    // Title parse as absolute last resort for year/make/model
    const title = merged.title || domResult.fields.title;
    if (title && (!merged.year || !merged.make)) {
      const parsed = parseTitle(title);
      for (const [key, val] of Object.entries(parsed)) {
        if (val !== null && val !== undefined && !(key in merged)) {
          merged[key] = val;
          fieldSources[key] = 'inferred_from_title';
        }
      }
    }

    // ── Step 10: Build and normalize the record ──
    const record = normalizeRvRecord({
      ...merged,
      dealer_name: this.dealerName || merged.dealer_name,
      dealer_domain: this.domain,
      dealer_location: this.dealerLocation || merged.dealer_location,
      source_inventory_url: this.inventoryUrl,
      source_detail_url: detailUrl,
      scraped_at: now,
      last_seen_at: now,
      title: title,
      description: domResult.description || merged.description,
      features: specsResult.features,
      specs: specsResult.specs,
      image_urls: imageUrls,
      video_urls: domResult.videoUrls || [],
      floorplan: domResult.floorplan,
      brochure_url: domResult.brochure,
      raw_json_blobs: [
        ...networkResult.rawBlobs,
        ...jsonLdResult.rawBlobs,
        ...inlineData.rawBlobs,
      ],
      field_sources: fieldSources,
    });

    // Score confidence
    const { confidence, notes } = scoreConfidence(record);
    record.extraction_confidence = confidence;
    record.extraction_notes = notes;

    // Debug: save artifacts for low-confidence extractions
    if (confidence === 'low' && config.saveScreenshotsOnLowConfidence) {
      await saveDebugArtifacts(page, `low-confidence_${record.stock_number || record.vin || 'unknown'}`);
    }

    return record;
  }

  /**
   * Hook for subclasses to transform a record after extraction.
   * @param {object} record - Normalized RV record
   * @returns {object}
   */
  transformRecord(record) {
    return record;
  }
}
