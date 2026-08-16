/**
 * MatchRV Scraper - InteractRV Adapter
 *
 * Handles dealers using the InteractRV inventory management platform.
 * InteractRV sites serve server-rendered HTML with AJAX pagination
 * via the `.ajaxUnitList()` jQuery plugin.
 *
 * Strategy:
 *   - Inventory listing pages are server-rendered HTML (no API needed)
 *   - Detail pages contain rich spec tables, pricing, images
 *   - Unit IDs are embedded in JavaScript (`var unitIds = [...]`)
 *   - Pagination: URL-based using `?pg=N` parameter
 *   - Detail URL pattern: /product/{slug}-{unitId}-{pageId}
 *
 * Known InteractRV dealers:
 *   - Fife RV Center (fifervcenter.com)
 *   - Many other WA/OR RV dealers
 */

import { BaseAdapter } from './base.js';
import { log } from '../utils.js';

export class InteractRvAdapter extends BaseAdapter {
  constructor(inventoryUrl) {
    super(inventoryUrl);
  }

  /**
   * InteractRV listing pages use `.unit` list items with links to
   * `/product/` detail pages.
   */
  getInventoryListSelector() {
    return [
      '.unitList .unit a[href*="/product/"]',
      'li.unit a[href*="/product/"]',
      '.unit-title a[href*="/product/"]',
      'a[href*="/product/"][href*="-"]',
      // Fallback broader selectors
      '.ajax-unit-list a[href*="/product/"]',
      '.unitContainer a[href*="/product/"]',
    ].join(', ');
  }

  /**
   * InteractRV uses numbered pagination links, not a "Next" button.
   * We use URL-based pagination with `?pg=N`.
   */
  getPaginationType() {
    return 'url';
  }

  getNextPageSelector() {
    return [
      '.pagination a[href*="pg="]',
      '.paging a',
      'a.page-next',
      '.pagination a:has-text("Next")',
      '.pagination a:has-text(">")',
    ].join(', ');
  }

  /**
   * Override pagination to use URL params since InteractRV uses `?pg=N`.
   * First try to get the max results per page set to maximum (72),
   * then paginate through all pages.
   */
  async collectInventoryLinks(page) {
    // Modify URL to request max results per page
    let startUrl = this.inventoryUrl;
    if (!startUrl.includes('resultsperpage=')) {
      const sep = startUrl.includes('?') ? '&' : '?';
      startUrl = `${startUrl}${sep}resultsperpage=72`;
    }

    log.info(`Navigating to inventory page: ${startUrl}`);
    await page.goto(startUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Extract dealer info
    const dealerInfo = await page.evaluate(() => {
      const nameEl = document.querySelector('.dealer-name, .logo-text, [class*="dealer"] h1');
      const locEl = document.querySelector('.dealer-address, [class*="address"], .location-info');
      return {
        dealer_name: nameEl?.textContent?.trim() || null,
        dealer_location: locEl?.textContent?.trim() || null,
      };
    });
    this.dealerName = dealerInfo.dealer_name || this.dealerName;
    this.dealerLocation = dealerInfo.dealer_location || this.dealerLocation;

    // Try to extract total count from "Showing X - Y of Z" text
    const totalInfo = await page.evaluate(() => {
      const text = document.body.innerText;
      const match = text.match(/showing\s+\d+\s*[-–]\s*\d+\s+of\s+(\d+)/i);
      return match ? parseInt(match[1], 10) : null;
    });

    if (totalInfo) {
      log.info(`InteractRV reports ${totalInfo} total units`);
    }

    const allLinks = new Set();
    let pageNum = 1;
    const maxPages = this.getMaxPages();

    while (pageNum <= maxPages) {
      log.info(`Scanning InteractRV inventory page ${pageNum}...`);

      const pageLinks = await this._extractLinksFromPage(page);
      const prevSize = allLinks.size;
      for (const link of pageLinks) allLinks.add(link);

      log.info(`Page ${pageNum}: found ${pageLinks.length} links (${allLinks.size} total unique)`);

      // No new links = done
      if (allLinks.size === prevSize && pageNum > 1) {
        log.info('No new links — stopping pagination');
        break;
      }

      // Go to next page using URL param
      pageNum++;
      const nextUrl = this._buildPageUrl(startUrl, pageNum);
      try {
        await page.goto(nextUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1500);

        // Check if page has inventory content (might have gone past last page)
        const hasContent = await page.evaluate(() => {
          return document.querySelectorAll('.unit, .unitContainer, li.unit').length > 0;
        });

        if (!hasContent) {
          log.info('Empty page — stopping pagination');
          break;
        }
      } catch (err) {
        log.warn(`Failed to load page ${pageNum}: ${err.message}`);
        break;
      }
    }

    const links = [...allLinks];
    log.info(`Total unique InteractRV detail links: ${links.length}`);
    return links;
  }

  /**
   * Build paginated URL for InteractRV.
   * Handles existing query params correctly.
   */
  _buildPageUrl(baseUrl, pageNum) {
    const url = new URL(baseUrl);
    url.searchParams.set('pg', String(pageNum));
    return url.toString();
  }

  /**
   * InteractRV detail pages have rich spec tables.
   * We rely on the base adapter's multi-source extraction pipeline
   * which handles spec tables, DOM fields, and images well.
   *
   * We add InteractRV-specific overrides for better data capture.
   */
  transformRecord(record) {
    // InteractRV sometimes puts "Fife, WA" or "Port Orchard, WA" in location
    // Make sure dealer info is set
    if (!record.dealer_name && this.dealerName) {
      record.dealer_name = this.dealerName;
    }
    if (!record.dealer_location && this.dealerLocation) {
      record.dealer_location = this.dealerLocation;
    }

    // InteractRV uses "Sale Price" and "Retail Price" — ensure we capture both
    // The base extractor's spec table parsing should get these, but add notes
    if (!record.extraction_notes) record.extraction_notes = [];
    record.extraction_notes.push('Extracted via InteractRV adapter');

    return record;
  }
}
