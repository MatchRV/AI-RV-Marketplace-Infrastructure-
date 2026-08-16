/**
 * MatchRV Scraper - Small Dealer Adapter
 *
 * Handles small independent RV dealers that use common off-the-shelf
 * platforms (DealerSocket, DealerInspire, EasyDealerWebsites, WordPress
 * RV plugins, or plain custom sites). These dealers often have:
 *
 *   - Inventory rendered by JavaScript (requires longer waits)
 *   - Inconsistent or non-standard CSS class names
 *   - Listing links buried inside carousel widgets or grid containers
 *   - No standard pagination — single page with all units
 *
 * Known dealers using this adapter:
 *   - Central Washington RV (centralwashingtonrv.com)
 *   - Rodeo City RV (rodeocityrv.com)
 *   - Awesome RV (awesomerv.com)
 *   - Johnson RV (johnsonrv.com)
 */

import { BaseAdapter } from './base.js';
import { log } from '../utils.js';

export class SmallDealerAdapter extends BaseAdapter {
  constructor(inventoryUrl) {
    super(inventoryUrl);
  }

  /**
   * Extended selector list that covers common small-dealer platforms.
   * Prioritizes specific inventory patterns before broad fallbacks.
   */
  getInventoryListSelector() {
    return [
      // Standard inventory URL patterns
      'a[href*="/inventory/"]',
      'a[href*="/vehicle/"]',
      'a[href*="/listing/"]',
      'a[href*="/unit/"]',
      'a[href*="/rv/"]',
      'a[href*="/detail/"]',
      'a[href*="/stock/"]',
      // Condition-based URL patterns (common on DealerSocket/DealerInspire)
      'a[href*="/used-"]',
      'a[href*="/new-"]',
      'a[href*="/pre-owned"]',
      // Sale / search result patterns
      'a[href*="-for-sale"]',
      'a[href*="/search/"]',
      'a[href*="/rvs/"]',
      'a[href*="/motorhomes/"]',
      'a[href*="/trailers/"]',
      // WordPress RV plugin classes
      '.inventory-listing a',
      '.vehicle-card a',
      '.listing-card a',
      '.inventory-item a',
      '.inventory-card a',
      '.rv-listing a',
      '.unit-card a',
      '.product-card a',
      // Generic class fragments
      '[class*="inventory"] a[href]',
      '[class*="listing"] a[href]',
      '[class*="vehicle"] a[href]',
      '[class*="unit-card"] a',
      '[class*="rv-card"] a',
      '[data-vehicle] a',
      '[data-unit] a',
      // Grid/tile wrappers
      '.grid-item a[href]',
      '.tile a[href]',
      '.card a[href]',
      // Table-based layouts (older sites)
      'table.inventory a[href]',
      'tr.vehicle a[href]',
      // Broadest fallback — any anchor whose text looks like an RV
      'a[href]:not([href="#"]):not([href^="mailto:"]):not([href^="tel:"])',
    ].join(', ');
  }

  /** Most small dealers have click-through "Next" pagination or single pages. */
  getPaginationType() {
    return 'click';
  }

  getNextPageSelector() {
    return [
      'a.next', '.pagination .next a', '.pagination a[rel="next"]',
      '[class*="next-page"]', '[class*="pagination"] a:has-text("Next")',
      '[class*="pagination"] a:has-text(">")', '[aria-label="Next page"]',
      '.pager-next a', 'a[class*="arrow-right"]',
      'button:has-text("Load More")',
      'a:has-text("Load More")',
      '[class*="load-more"]',
      '.page-next a',
    ].join(', ');
  }

  /**
   * Override collectInventoryLinks to give small dealers more time.
   * Many use WordPress plugins or Gravity Forms widgets that take 5-10s
   * to render their inventory grid after the main page loads.
   */
  async collectInventoryLinks(page) {
    log.info(`[SmallDealer] Navigating to: ${this.inventoryUrl}`);

    await page.goto(this.inventoryUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Wait for JS-rendered content — small dealer sites are often slow
    log.info('[SmallDealer] Waiting for page to fully render...');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Try to trigger lazy-load by scrolling once
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // Let the base adapter handle link extraction + pagination from here
    const dealerInfo = await page.evaluate(() => {
      const nameEl = document.querySelector(
        '.site-title, .dealer-name, header h1, .logo-text, [class*="dealership-name"]'
      );
      const locEl = document.querySelector(
        '[class*="address"], [class*="location"], footer address, .contact-info'
      );
      return {
        dealer_name: nameEl?.textContent?.trim() || document.title.split('|')[0]?.trim() || null,
        dealer_location: locEl?.textContent?.trim() || null,
      };
    });
    this.dealerName = dealerInfo.dealer_name || this.dealerName;
    this.dealerLocation = dealerInfo.dealer_location || this.dealerLocation;

    const allLinks = new Set();
    let pageNum = 1;
    const maxPages = this.getMaxPages();

    while (pageNum <= maxPages) {
      log.info(`[SmallDealer] Scanning page ${pageNum}...`);

      const pageLinks = await this._extractLinksFromPage(page);

      // Filter to likely RV detail links by checking common URL patterns
      const rvLinks = pageLinks.filter(url => this._looksLikeRvDetailPage(url));

      const prevSize = allLinks.size;
      for (const link of rvLinks) allLinks.add(link);

      log.info(`[SmallDealer] Page ${pageNum}: ${rvLinks.length} RV links (${allLinks.size} total unique)`);

      if (allLinks.size === prevSize && pageNum > 1) {
        log.info('[SmallDealer] No new links — stopping pagination');
        break;
      }

      const hasNext = await this._goToNextPage(page);
      if (!hasNext) {
        log.info('[SmallDealer] No more pages');
        break;
      }

      pageNum++;
      await page.waitForTimeout(2000);
    }

    const links = [...allLinks];
    log.info(`[SmallDealer] Total unique detail links: ${links.length}`);
    return links;
  }

  /**
   * Filter out links that are clearly not RV detail pages.
   * Rejects nav links, social, contact pages, etc.
   */
  _looksLikeRvDetailPage(url) {
    try {
      const u = new URL(url);
      const path = u.pathname.toLowerCase();
      // Must be on same domain (already filtered upstream) and not a nav/admin page
      const blocklist = [
        '/contact', '/about', '/financing', '/service', '/parts',
        '/blog', '/news', '/events', '/careers', '/team',
        '/privacy', '/terms', '/sitemap', '/login', '/register',
        '/cart', '/checkout', '/account', '/wp-admin', '/wp-login',
        '/tag/', '/category/', '/author/',
        '/search', '/map', '/directions',
      ];
      for (const b of blocklist) {
        if (path === b || path.startsWith(b + '/') || path.startsWith(b + '?')) {
          return false;
        }
      }
      // Reject paths that are likely just the inventory root (no slug)
      const segments = path.split('/').filter(Boolean);
      if (segments.length < 1) return false;
      // Require some path depth or an inventory-looking keyword
      const hasInventoryWord = [
        'inventory', 'vehicle', 'listing', 'unit', 'rv', 'detail',
        'stock', 'used', 'new', 'for-sale', 'motorhome', 'trailer',
      ].some(w => path.includes(w));
      return hasInventoryWord || segments.length >= 2;
    } catch {
      return false;
    }
  }

  /** Post-process: ensure dealer info is set. */
  transformRecord(record) {
    if (!record.dealer_name && this.dealerName) {
      record.dealer_name = this.dealerName;
    }
    if (!record.dealer_location && this.dealerLocation) {
      record.dealer_location = this.dealerLocation;
    }
    if (!record.extraction_notes) record.extraction_notes = [];
    record.extraction_notes.push('Extracted via SmallDealer adapter');
    return record;
  }
}
