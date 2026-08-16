/**
 * MatchRV Scraper - Coast Technology Stealth Suite Adapter
 *
 * Handles dealers using the Coast Technology "Stealth Suite" / WARP10
 * inventory platform. These sites load inventory entirely via JavaScript
 * widgets that fetch from inventory.coasttechnology.org.
 *
 * Strategy:
 *   - The inventory API requires server-side auth (WordPress tunnel)
 *   - We let Playwright render the page fully so the WARP10 widgets
 *     load and populate the DOM with inventory cards
 *   - Extract listing data from the rendered DOM
 *   - Visit detail pages for full specs
 *
 * Configuration is embedded in page JavaScript:
 *   - warp10_settings: { "company-ids": ["40"], "api-version": "3" }
 *   - warp10_environment: { "stealthInventoryAPIBaseURL": "..." }
 *
 * Known Stealth Suite dealers:
 *   - Tacoma RV (tacomarv.com) — company ID 40
 */

import { BaseAdapter } from './base.js';
import { log } from '../utils.js';

export class CoastStealthAdapter extends BaseAdapter {
  constructor(inventoryUrl) {
    super(inventoryUrl);
  }

  /**
   * Stealth Suite renders inventory cards via JavaScript.
   * These selectors target the WARP10 widget output.
   */
  getInventoryListSelector() {
    return [
      // WARP10 widget renders these
      '.warp10-srp-result a[href]',
      '.warp10-vehicle-card a[href]',
      '[class*="warp10"] a[href*="/rv/"]',
      '[class*="warp10"] a[href*="/vehicle/"]',
      '[class*="warp10"] a[href*="-for-sale"]',
      // Common Stealth Suite output patterns
      '.vehicle-result a[href]',
      '.srp-listing a[href]',
      '.inventory-result a[href]',
      '.listing-item a[href]',
      // Broader fallbacks for detail page links
      'a[href*="-for-sale-"]',
      'a[href*="/inventory/"]',
      '.results-container a[href]',
      '.search-results a[href]',
    ].join(', ');
  }

  /**
   * Stealth Suite often uses infinite scroll or "Load More" buttons.
   */
  getPaginationType() {
    return 'scroll';
  }

  getNextPageSelector() {
    return [
      '.warp10-load-more',
      '.load-more-btn',
      'button:has-text("Load More")',
      'button:has-text("Show More")',
      'a:has-text("Load More")',
      '[class*="load-more"]',
      '.pagination a:has-text("Next")',
      'a.next',
    ].join(', ');
  }

  /**
   * Override collection to handle JavaScript-rendered inventory.
   *
   * The WARP10 widget takes several seconds to fetch and render.
   * We wait for inventory cards to appear, then handle pagination.
   */
  async collectInventoryLinks(page) {
    log.info(`Navigating to Stealth Suite inventory: ${this.inventoryUrl}`);

    await page.goto(this.inventoryUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    // Stealth Suite needs extra time — widgets make API calls after page load
    log.info('Waiting for WARP10 widgets to render inventory...');
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});

    // Wait for inventory cards to appear in DOM
    const inventoryLoaded = await this._waitForInventory(page);
    if (!inventoryLoaded) {
      log.warn('WARP10 inventory did not render — trying fallback approach');
      // Try scrolling to trigger lazy loading
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(5000);
    }

    // Extract dealer info
    const dealerInfo = await page.evaluate(() => {
      // Stealth Suite sites often have address in footer or header
      const nameEl = document.querySelector('.site-title, .dealer-name, header h1, .logo-text');
      const locEl = document.querySelector('[class*="address"], [class*="location"], footer address');
      return {
        dealer_name: nameEl?.textContent?.trim() || document.title.split('|')[0]?.trim() || null,
        dealer_location: locEl?.textContent?.trim() || null,
      };
    });
    this.dealerName = dealerInfo.dealer_name || this.dealerName;
    this.dealerLocation = dealerInfo.dealer_location || this.dealerLocation;

    // Try to get total count
    const totalCount = await page.evaluate(() => {
      const text = document.body.innerText;
      // Look for "X Results", "Showing X vehicles", "X RVs found", etc.
      const patterns = [
        /(\d+)\s*results?\b/i,
        /showing\s+(\d+)/i,
        /(\d+)\s*vehicles?\s*(found|available)/i,
        /(\d+)\s*rvs?\s*(found|available)/i,
        /(\d+)\s*units?\s*(found|available)/i,
      ];
      for (const p of patterns) {
        const m = text.match(p);
        if (m) return parseInt(m[1], 10);
      }
      return null;
    });

    if (totalCount) {
      log.info(`Stealth Suite reports ${totalCount} total units`);
    }

    // Collect links — may need to scroll/paginate
    const allLinks = new Set();
    let attempts = 0;
    const maxAttempts = 60; // Raised from 30 to capture deeper inventories
    let consecutiveNoNew = 0; // retry counter for zero-new-link scrolls

    while (attempts < maxAttempts) {
      const pageLinks = await this._extractLinksFromPage(page);
      const prevSize = allLinks.size;
      for (const link of pageLinks) allLinks.add(link);
      const gotNew = allLinks.size > prevSize;

      log.info(`Scroll ${attempts + 1}: ${allLinks.size} total unique links${gotNew ? '' : ' (no new)'}`);

      if (!gotNew) {
        consecutiveNoNew++;

        // Try clicking "Load More" button as alternative
        const clicked = await this._clickLoadMore(page);
        if (clicked) {
          // Wait for new content and retry without burning attempts
          await page.waitForTimeout(4000);
          consecutiveNoNew = 0;
          attempts++;
          continue;
        }

        // Retry scroll up to 3 times before giving up (handles slow WARP10 API responses)
        if (consecutiveNoNew <= 3) {
          log.info(`No new links — retry ${consecutiveNoNew}/3 (waiting for WARP10 API)`);
          await page.waitForTimeout(3000);
          await this._infiniteScroll(page);
          attempts++;
          continue;
        }

        log.info('No more inventory to load after retries');
        break;
      }

      consecutiveNoNew = 0;

      // Try scrolling for more
      const scrolled = await this._infiniteScroll(page);
      if (!scrolled) {
        // Try Load More button
        const clicked = await this._clickLoadMore(page);
        if (!clicked) break;
        await page.waitForTimeout(3000);
      }

      attempts++;
    }

    const links = [...allLinks];
    log.info(`Total unique Stealth Suite detail links: ${links.length}`);
    return links;
  }

  /**
   * Wait for WARP10 widget to render inventory cards.
   * Polls the DOM for up to 20 seconds.
   */
  async _waitForInventory(page) {
    const selectors = [
      '.warp10-srp-result',
      '.warp10-vehicle-card',
      '[class*="warp10"][class*="result"]',
      '.vehicle-result',
      '.srp-listing',
      '.inventory-result',
      '.listing-item',
      '.results-container > *',
    ];

    for (let i = 0; i < 10; i++) {
      const found = await page.evaluate((sels) => {
        for (const sel of sels) {
          if (document.querySelectorAll(sel).length > 0) return true;
        }
        return false;
      }, selectors);

      if (found) {
        log.info('WARP10 inventory cards detected in DOM');
        await page.waitForTimeout(2000); // Let remaining cards render
        return true;
      }

      await page.waitForTimeout(2000);
    }

    return false;
  }

  /**
   * Try to click a "Load More" / "Show More" button.
   */
  async _clickLoadMore(page) {
    const selectors = this.getNextPageSelector().split(', ');
    for (const sel of selectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          log.info(`Clicked load-more button: ${sel}`);
          return true;
        }
      } catch { /* not found */ }
    }
    return false;
  }

  /**
   * Override infinite scroll with longer wait — Stealth Suite API calls
   * take more time than static pages.
   */
  async _infiniteScroll(page) {
    const prevHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(4000); // Stealth Suite needs more time
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    return newHeight > prevHeight;
  }

  /**
   * Post-process records from Stealth Suite sites.
   */
  transformRecord(record) {
    if (!record.dealer_name && this.dealerName) {
      record.dealer_name = this.dealerName;
    }
    if (!record.dealer_location && this.dealerLocation) {
      record.dealer_location = this.dealerLocation;
    }

    if (!record.extraction_notes) record.extraction_notes = [];
    record.extraction_notes.push('Extracted via Coast Technology Stealth Suite adapter');

    return record;
  }
}
