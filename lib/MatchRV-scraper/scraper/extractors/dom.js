/**
 * MatchRV Scraper - DOM Extractor
 *
 * Extracts vehicle fields directly from the rendered DOM as a LAST RESORT.
 * This is the lowest-priority extraction source because DOM layout varies
 * wildly between dealer site platforms. But it catches fields that
 * structured data and network responses missed.
 *
 * Strategy: use broad selector patterns that work across many dealer platforms,
 * then fall back to text pattern matching in the page body.
 */

import { cleanString, log } from '../utils.js';

/**
 * Extract vehicle fields from the rendered DOM.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{ fields: object, description: string|null }>}
 */
export async function extractDomFields(page) {
  const result = await page.evaluate(() => {
    const fields = {};

    // ── Title / heading ────────────────────────────────────────────────────
    const titleSelectors = [
      'h1', '.vehicle-title', '.listing-title', '.vdp-title',
      '[class*="vehicle-title"]', '[class*="listing-title"]',
      '[data-vehicle-title]', '.detail-title',
    ];
    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        if (text && text.length > 5 && text.length < 200) {
          fields.title = text;
          break;
        }
      }
    }

    // ── Price ──────────────────────────────────────────────────────────────
    const priceSelectors = [
      '.price', '.vehicle-price', '.listing-price', '.sale-price',
      '.internet-price', '.our-price', '.final-price',
      '[class*="price"]', '[data-price]', '[itemprop="price"]',
      '.payment-price', '.asking-price',
    ];
    for (const sel of priceSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        // Must look like a price (contains $ or numbers)
        if (/\$[\d,]+/.test(text) || /[\d,]+/.test(text)) {
          // Check if this is sale price or regular price
          const parent = el.closest('[class*="sale"], [class*="special"], [class*="internet"]');
          if (parent) {
            fields.sale_price = text.replace(/[^0-9.]/g, '');
          } else {
            fields.price = text.replace(/[^0-9.]/g, '');
          }
        }
      }
    }

    // MSRP specifically
    const msrpSelectors = ['.msrp', '[class*="msrp"]', '[class*="retail-price"]'];
    for (const sel of msrpSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        if (/[\d,]+/.test(text)) {
          fields.msrp = text.replace(/[^0-9.]/g, '');
        }
      }
    }

    // ── VIN ────────────────────────────────────────────────────────────────
    const vinSelectors = [
      '[class*="vin"]', '[data-vin]', '[itemprop="vehicleIdentificationNumber"]',
    ];
    for (const sel of vinSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        // VIN is always 17 alphanumeric characters
        const vinMatch = text.match(/[A-HJ-NPR-Z0-9]{17}/i);
        if (vinMatch) {
          fields.vin = vinMatch[0].toUpperCase();
          break;
        }
      }
    }

    // ── Stock Number ───────────────────────────────────────────────────────
    const stockSelectors = [
      '[class*="stock"]', '[data-stock]', '[class*="stk"]',
    ];
    for (const sel of stockSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        const stockMatch = text.match(/(?:stock|stk|#)\s*[:#]?\s*(\S+)/i) ||
                           text.match(/^[\w-]+$/);
        if (stockMatch) {
          fields.stock_number = (stockMatch[1] || stockMatch[0]).trim();
          break;
        }
      }
    }

    // ── Status (sold/available) ────────────────────────────────────────────
    const soldIndicators = document.querySelectorAll('.sold, .sold-banner, [class*="sold"], .status-sold');
    if (soldIndicators.length > 0) {
      for (const el of soldIndicators) {
        if (el.textContent.toLowerCase().includes('sold')) {
          fields.inventory_status = 'sold';
          break;
        }
      }
    }
    const pendingIndicators = document.querySelectorAll('[class*="pending"], .sale-pending');
    if (pendingIndicators.length > 0) {
      fields.inventory_status = 'pending';
    }

    // ── Condition ──────────────────────────────────────────────────────────
    const condSelectors = [
      '[class*="condition"]', '[data-condition]', '[class*="new-used"]',
    ];
    for (const sel of condSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim().toLowerCase();
        if (text.includes('new') && !text.includes('used')) fields.condition = 'new';
        else if (text.includes('used') || text.includes('pre-owned')) fields.condition = 'used';
        break;
      }
    }

    // ── Description ────────────────────────────────────────────────────────
    let description = null;
    const descSelectors = [
      '.description', '.vehicle-description', '.listing-description',
      '.dealer-comments', '.comments', '.vehicle-comments',
      '[class*="description"]', '[itemprop="description"]',
    ];
    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        if (text.length > 20) {
          description = text;
          break;
        }
      }
    }

    // ── Video URLs ─────────────────────────────────────────────────────────
    const videoUrls = [];
    const iframes = document.querySelectorAll('iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="video"]');
    for (const iframe of iframes) {
      videoUrls.push(iframe.src);
    }
    const videoSources = document.querySelectorAll('video source[src]');
    for (const vs of videoSources) {
      videoUrls.push(vs.src);
    }

    // ── Floorplan ──────────────────────────────────────────────────────────
    let floorplan = null;
    const fpSelectors = [
      'a[href*="floorplan"]', 'img[src*="floorplan"]', 'img[alt*="floorplan"]',
      'a[href*="floor-plan"]', 'img[src*="floor-plan"]',
      '[class*="floorplan"] img', '[class*="floor-plan"] img',
    ];
    for (const sel of fpSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        floorplan = el.href || el.src || null;
        break;
      }
    }

    // ── Brochure ───────────────────────────────────────────────────────────
    let brochure = null;
    const brochureLinks = document.querySelectorAll('a[href*="brochure"], a[href*=".pdf"]');
    for (const a of brochureLinks) {
      if (a.textContent.toLowerCase().includes('brochure') ||
          a.href.toLowerCase().includes('brochure')) {
        brochure = a.href;
        break;
      }
    }

    return { fields, description, videoUrls, floorplan, brochure };
  });

  log.debug(`DOM extraction found ${Object.keys(result.fields).length} fields`);
  return result;
}

/**
 * Try to parse year/make/model from a title string as a LAST RESORT.
 * Only use when structured sources didn't provide these fields.
 *
 * @param {string} title
 * @returns {{ year?: number, make?: string, model?: string, condition?: string }}
 */
export function parseTitle(title) {
  if (!title) return {};

  const fields = {};

  // "New 2024 Forest River Cherokee 274BRK" or "Used 2023 Keystone Cougar 29RKS"
  const match = title.match(/\b(new|used|pre-?owned)?\s*(\d{4})\s+(\S+)\s+(.+)/i);
  if (match) {
    if (match[1]) {
      const cond = match[1].toLowerCase();
      fields.condition = cond.includes('new') ? 'new' : 'used';
    }
    fields.year = parseInt(match[2], 10);
    fields.make = match[3];
    // Model is everything after make — may include trim
    fields.model = cleanString(match[4]);
  }

  return fields;
}

/**
 * Extract dealer name and location from the page.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{ dealer_name: string|null, dealer_location: string|null }>}
 */
export async function extractDealerInfo(page) {
  return page.evaluate(() => {
    let name = null;
    let location = null;

    // Dealer name from common selectors
    const nameSelectors = [
      '[class*="dealer-name"]', '[class*="dealership-name"]',
      '.dealer-info h1', '.dealer-info h2', '.dealer-info .name',
      '[itemprop="name"]',
    ];
    for (const sel of nameSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        if (text.length > 2 && text.length < 100) {
          name = text;
          break;
        }
      }
    }

    // Fall back to <title> or og:site_name
    if (!name) {
      const ogSiteName = document.querySelector('meta[property="og:site_name"]');
      if (ogSiteName) name = ogSiteName.getAttribute('content');
    }

    // Dealer location
    const locSelectors = [
      '[class*="dealer-location"]', '[class*="dealer-address"]',
      '[itemprop="address"]', '.dealer-info .address',
      '.location', '.store-location',
    ];
    for (const sel of locSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        location = el.textContent.trim().replace(/\s+/g, ' ');
        break;
      }
    }

    return { dealer_name: name, dealer_location: location };
  });
}
