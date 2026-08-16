/**
 * MatchRV Scraper - Poulsbo RV Adapter
 *
 * Poulsbo RV (poulsborv.com) uses a custom WordPress REST API that returns
 * the entire inventory as JSON from /wp-json/pbrv/api/v1/products.
 * No detail page visits needed — all data comes from the API response.
 */

import { BaseAdapter } from './base.js';
import { normalizeRvRecord } from '../output/schema.js';
import { log } from '../utils.js';

export class PoulsboRvAdapter extends BaseAdapter {
  constructor(inventoryUrl) {
    super(inventoryUrl);
    this.dealerName = 'Poulsbo RV';
    this._apiProducts = null;
  }

  /**
   * Override the entire scrape flow. Instead of collecting links and visiting
   * detail pages, we intercept the products API and map all records directly.
   */
  async collectInventoryLinks(page) {
    // Intercept the products API response
    const apiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/wp-json/pbrv/api/v1/products') && resp.status() === 200,
      { timeout: 60000 }
    );

    log.info('Navigating to inventory page: ' + this.inventoryUrl);
    await page.goto(this.inventoryUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

    log.info('Waiting for products API response...');
    const response = await apiPromise;
    this._apiProducts = await response.json();

    log.info(`Products API returned ${this._apiProducts.length} items`);

    // No dedup — return all products from the API as-is

    // Return product URLs as "detail links" so the runner reports the right count.
    // But we won't actually visit them — extractDetailPage reads from _apiProducts.
    return this._apiProducts.map(p => p.url);
  }

  /**
   * Return all records preloaded from the API — no per-page extraction needed.
   */
  getPreloadedRecords() {
    if (!this._apiProducts) return null;
    return this._apiProducts.map(p => this._mapProduct(p));
  }

  /**
   * Fallback: if called per-URL, look up from cached API data.
   */
  async extractDetailPage(page, url) {
    const product = this._apiProducts.find(p => p.url === url);
    if (!product) {
      throw new Error(`Product not found in API data: ${url}`);
    }

    return this._mapProduct(product);
  }

  /**
   * Build full gallery URLs from the featured image URL.
   *
   * Poulsbo's CDN stores gallery images with a numbered suffix appended
   * before the file extension:
   *   featured:  .../2025-Coachmen-Cross-Trail-EV-20BH-Class-C-Stock-S709-on-sale-at-Poulsbo-RV.jpg
   *   gallery 1: ...-1.jpg
   *   gallery 2: ...-2.jpg
   *   ...
   *   gallery N: ...-N.jpg
   *
   * The API's `image_count` tells us how many images exist.
   */
  _buildGalleryUrls(featuredImage, imageCount) {
    if (!featuredImage) return [];

    const urls = [featuredImage]; // featured image is always first
    const totalGallery = (parseInt(imageCount, 10) || 1) - 1;

    if (totalGallery <= 0) return urls;

    // Strip file extension, append -N, re-add extension
    const extMatch = featuredImage.match(/(\.[a-z]{3,4})$/i);
    if (!extMatch) return urls;

    const ext = extMatch[1];
    const base = featuredImage.slice(0, -ext.length);

    for (let i = 1; i <= totalGallery; i++) {
      urls.push(`${base}-${i}${ext}`);
    }

    return urls;
  }

  /**
   * Map a Poulsbo RV API product to the MatchRV canonical schema.
   */
  _mapProduct(p) {
    const condition = (p.rv_condition || '').toLowerCase();
    const isPending = p.pending_sale === 'yes' || p.pending_sale === true;

    const galleryUrls = this._buildGalleryUrls(p.featured_image, p.image_count);
    const totalImages = galleryUrls.length;

    const record = normalizeRvRecord({
      dealer_name: 'Poulsbo RV',
      dealer_domain: this.domain,
      dealer_location: p.store_location || null,
      source_inventory_url: this.inventoryUrl,
      source_detail_url: p.url,
      scraped_at: new Date().toISOString(),

      inventory_status: isPending ? 'pending' : 'available',
      condition: condition === 'new' ? 'new' : condition === 'used' ? 'used' : 'unknown',

      year: p.model_year,
      make: p.make,
      model: p.model_name,
      title: p.product_name,
      stock_number: p.sku,
      vin: p.vin_number,

      rv_type: p.rv_type,

      price: p.regular_price,
      sale_price: p.sale_price || p.price,
      msrp: p.msrp_override || p.regular_price,

      fuel_type: p.fuel_type,
      mileage: p.mileage,

      length: p.length,
      dry_weight: p.dry_weight,

      sleeps: p.sleeping_capacity,
      slideouts: p.slide_outs_count,
      bunkhouse: p.has_bunkhouse === 'Yes' || p.has_bunkhouse === true,
      washer_dryer_prep: p.has_laundry_wiring === 'Yes' || p.has_laundry_wiring === true,

      description: p.product_description,

      image_urls: galleryUrls,
      image_count: totalImages,
      primary_image: p.featured_image || null,

      extraction_confidence: 'high',
      extraction_notes: [`Extracted from Poulsbo RV products API (${totalImages} gallery images built from CDN pattern)`],
      raw_json_blobs: [p],
      field_sources: {
        year: 'api:model_year',
        make: 'api:make',
        model: 'api:model_name',
        price: 'api:regular_price',
        sale_price: 'api:sale_price',
        vin: 'api:vin_number',
      },
    });

    return record;
  }

  /**
   * Deduplicate products in two passes:
   *
   * 1. By VIN — when the same VIN appears multiple times (e.g. a "coming soon"
   *    entry with no price + a priced listing), keep the one with a price.
   *
   * 2. By title + location for Class C and Travel Trailers — multiple identical
   *    models at the same lot collapse to one listing.
   */
  _dedup(products) {
    // Pass 1: VIN dedup
    const byVin = new Map();
    for (const p of products) {
      const vin = (p.vin_number || '').toUpperCase();
      if (!vin) {
        byVin.set(`__novin_${p.product_id}`, p);
        continue;
      }

      const existing = byVin.get(vin);
      if (!existing) {
        byVin.set(vin, p);
      } else {
        const existingPrice = parseFloat(existing.price) || 0;
        const newPrice = parseFloat(p.price) || 0;
        if (newPrice > 0 && existingPrice === 0) {
          byVin.set(vin, p);
        }
      }
    }

    // Pass 2: title + location dedup for Class C and Travel Trailers
    const dedupTypes = new Set(['Class C', 'Class C Diesel', 'Travel Trailer']);
    const byTitleLoc = new Map();
    const result = [];

    for (const p of byVin.values()) {
      if (dedupTypes.has(p.rv_type)) {
        const key = `${p.product_name}|${p.store_location || ''}`;
        if (!byTitleLoc.has(key)) {
          byTitleLoc.set(key, true);
          result.push(p);
        }
      } else {
        result.push(p);
      }
    }

    return result;
  }

  /** No-op — records are already normalized in _mapProduct. */
  transformRecord(record) {
    return record;
  }
}
