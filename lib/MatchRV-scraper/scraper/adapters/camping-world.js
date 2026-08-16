/**
 * MatchRV Scraper - Camping World Adapter
 *
 * Camping World (rv.campingworld.com) uses a Next.js RSC (React Server Components)
 * streaming architecture. Inventory data is embedded in the __next_f chunks
 * on the page as a "hits" array with rich product data.
 *
 * Strategy:
 *   1. Navigate to the dealer inventory page
 *   2. Extract all product records from the RSC stream's "hits" array
 *   3. Paginate using ?page=N until no more results
 *   4. Map each hit to the MatchRV canonical schema
 *
 * URL pattern: https://rv.campingworld.com/rvs-for-sale/dealer/{location-slug}
 * Pagination: ?page=1, ?page=2, etc. (24 results per page)
 */

import { BaseAdapter } from './base.js';
import { normalizeRvRecord } from '../output/schema.js';
import { log } from '../utils.js';

export class CampingWorldAdapter extends BaseAdapter {
  constructor(inventoryUrl) {
    super(inventoryUrl);
    this.dealerName = 'Camping World';
    this._allHits = [];
  }

  /**
   * Collect all inventory by paginating through the RSC-rendered pages.
   * Each page embeds ~24 hits in the __next_f stream.
   */
  async collectInventoryLinks(page) {
    const baseUrl = this.inventoryUrl.split('?')[0];
    let pageNum = 1;
    let totalFound = 0;
    const maxPages = 50; // Safety limit — raised from 20 to capture large locations

    while (pageNum <= maxPages) {
      const url = pageNum === 1 ? baseUrl : `${baseUrl}?page=${pageNum}`;
      log.info(`Fetching page ${pageNum}: ${url}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(12000); // Wait for RSC stream to complete

      const hits = await this._extractHitsFromRSC(page);

      if (hits.length === 0) {
        log.info(`Page ${pageNum}: no hits found — stopping pagination`);
        break;
      }

      this._allHits.push(...hits);
      totalFound += hits.length;
      log.info(`Page ${pageNum}: extracted ${hits.length} hits (${totalFound} total)`);

      // If we got fewer than 24, we're on the last page
      if (hits.length < 24) {
        break;
      }

      pageNum++;
    }

    // Extract dealer info from first hit
    if (this._allHits.length > 0) {
      const first = this._allHits[0];
      if (first.dealer) {
        this.dealerName = `Camping World of ${first.dealer.billingCity || 'Unknown'}`;
        this.dealerLocation = `${first.dealer.billingCity}, ${first.dealer.billingStateCode}`;
      }
    }

    log.info(`Total hits collected: ${this._allHits.length}`);

    // Return URLs for the summary count
    return this._allHits.map(h =>
      `https://rv.campingworld.com/rv/${h.assetSlug}`
    );
  }

  /**
   * Extract the hits array from the RSC __next_f stream on the current page.
   */
  async _extractHitsFromRSC(page) {
    return await page.evaluate(() => {
      const chunks = (self.__next_f || [])
        .map(c => (typeof c[1] === 'string' ? c[1] : ''))
        .join('');

      // Find the hits array in the RSC data
      const hitsIdx = chunks.indexOf('"hits":[{');
      if (hitsIdx === -1) return [];

      // Extract the hits array by finding matching brackets
      let depth = 0;
      let start = hitsIdx + 6; // after "hits":
      let end = start;

      for (let i = start; i < chunks.length && i < start + 500000; i++) {
        if (chunks[i] === '[') depth++;
        if (chunks[i] === ']') {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }

      try {
        const hitsJson = chunks.slice(start, end);
        // RSC uses "$" prefix for React refs - clean them for parsing
        // The hits should be valid JSON already
        return JSON.parse(hitsJson);
      } catch {
        // Fallback: extract individual records using regex
        const records = [];
        const regex = /"objectID":"(\d+[A-Za-z]?)"/g;
        let match;
        while ((match = regex.exec(chunks)) !== null) {
          // For each objectID, try to extract a chunk around it
          const pos = match.index;
          // Find the start of this object
          let objStart = chunks.lastIndexOf('{', pos);
          if (objStart === -1) continue;

          // Find matching end brace
          let d = 0;
          let objEnd = objStart;
          for (let i = objStart; i < chunks.length && i < objStart + 5000; i++) {
            if (chunks[i] === '{') d++;
            if (chunks[i] === '}') {
              d--;
              if (d === 0) { objEnd = i + 1; break; }
            }
          }

          try {
            const obj = JSON.parse(chunks.slice(objStart, objEnd));
            if (obj.objectID && obj.make) records.push(obj);
          } catch {}
        }
        return records;
      }
    });
  }

  /**
   * Return all preloaded records from RSC extraction.
   */
  getPreloadedRecords() {
    if (!this._allHits || this._allHits.length === 0) return null;
    return this._allHits.map(h => this._mapHit(h));
  }

  /**
   * Map a Camping World RSC hit to the MatchRV canonical schema.
   */
  _mapHit(h) {
    const condition = (h.condition || '').toLowerCase();
    const dealer = h.dealer || {};

    return normalizeRvRecord({
      dealer_name: `Camping World of ${dealer.billingCity || 'Unknown'}`,
      dealer_domain: 'campingworld.com',
      dealer_location: dealer.billingCity
        ? `${dealer.billingCity}, ${dealer.billingStateCode}`
        : null,
      source_inventory_url: this.inventoryUrl,
      source_detail_url: `https://rv.campingworld.com/rv/${h.assetSlug}`,
      scraped_at: new Date().toISOString(),

      inventory_status: h.assetStatus === 'a' ? 'available' : 'unknown',
      condition: condition === 'new' ? 'new' : condition === 'used' ? 'used' : 'unknown',

      year: h.year,
      make: this._titleCase(h.make),
      model: (h.model || '').toUpperCase(),
      title: `${h.year} ${this._titleCase(h.make)} ${h.brand ? this._titleCase(h.brand) : ''} ${(h.model || '').toUpperCase()}`.trim(),
      stock_number: h.stockNumber || h.objectID,
      vin: h.chassisNumber || null,

      rv_type: h.classDisplay || this._classCodeToType(h.classCode),

      price: h.publishedPrice || h.queryPrice,
      sale_price: h.specialWebPrice || null,
      msrp: h.totalListPrice || null,

      fuel_type: h.fuelType || null,
      mileage: h.mileage || null,

      length: h.lengthFeet ? `${Math.round(h.lengthFeet)}' ${Math.round((h.lengthFeet % 1) * 12)}\"` : null,
      dry_weight: h.wwwDryWeight || null,

      sleeps: h.wwwTotalSleeps || null,
      slideouts: h.wwwNumSlideRooms || null,

      image_urls: h.images?.imageUrl ? [h.images.imageUrl] : [],
      image_count: h.images?.imageUrl ? 1 : 0,
      primary_image: h.images?.imageUrl || null,

      extraction_confidence: 'high',
      extraction_notes: [`Extracted from Camping World RSC stream (glCode: ${h.glCode})`],
      raw_json_blobs: [h],
      field_sources: {
        year: 'rsc:year',
        make: 'rsc:make',
        model: 'rsc:model',
        price: 'rsc:publishedPrice',
        vin: 'rsc:chassisNumber',
        rv_type: 'rsc:classDisplay',
      },
    });
  }

  /** Title-case a string (e.g. "grand design" → "Grand Design") */
  _titleCase(str) {
    if (!str) return null;
    return str.replace(/\b\w/g, c => c.toUpperCase());
  }

  /** Map classCode to readable RV type */
  _classCodeToType(code) {
    const map = {
      tt: 'Travel Trailer',
      fw: 'Fifth Wheel',
      a: 'Class A',
      ad: 'Class A Diesel',
      c: 'Class C',
      cd: 'Class C Diesel',
      b: 'Class B',
      bd: 'Class B Diesel',
      fd: 'Folding/Pop-Up',
      tc: 'Truck Camper',
      th: 'Toy Hauler',
      pk: 'Park Model',
    };
    return map[(code || '').toLowerCase()] || null;
  }

  /** No-op — records are already normalized in _mapHit. */
  transformRecord(record) {
    return record;
  }
}
