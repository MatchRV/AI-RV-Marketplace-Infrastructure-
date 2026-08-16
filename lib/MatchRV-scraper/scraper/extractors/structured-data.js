/**
 * MatchRV Scraper - Structured Data Extractor
 *
 * Extracts data from:
 *   1. JSON-LD (<script type="application/ld+json">)
 *   2. Inline script blobs containing JSON objects with vehicle data
 *   3. Meta tags (og:, product:, etc.)
 *
 * This is the SECOND priority source after network responses.
 * JSON-LD and inline blobs are embedded by dealer site platforms
 * (DealerOn, DealerSocket, Dealer.com, FusionZone, etc.) and are
 * typically more complete than what's rendered in the DOM.
 */

import { safeJsonParse, log } from '../utils.js';

/**
 * Extract all JSON-LD blocks from the page.
 * Many dealer sites embed Vehicle schema.org objects.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<object[]>} Array of parsed JSON-LD objects
 */
export async function extractJsonLd(page) {
  const blocks = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const results = [];
    for (const s of scripts) {
      try {
        const parsed = JSON.parse(s.textContent);
        results.push(parsed);
      } catch { /* skip malformed */ }
    }
    return results;
  });

  log.debug(`Found ${blocks.length} JSON-LD blocks`);
  return blocks;
}

/**
 * Extract vehicle-relevant data from JSON-LD blocks.
 * Looks for schema.org Vehicle, Product, or Auto types.
 */
export function parseJsonLdVehicle(jsonLdBlocks) {
  const fields = {};
  const images = [];
  const rawBlobs = [];

  for (const block of jsonLdBlocks) {
    const items = Array.isArray(block) ? block : [block];

    for (const item of items) {
      const type = (item['@type'] || '').toLowerCase();
      const isVehicle = type.includes('vehicle') || type.includes('product') ||
                        type.includes('auto') || type.includes('offer') ||
                        type.includes('car');

      if (!isVehicle && item['@graph']) {
        // Some sites wrap structured data in @graph
        const graphItems = Array.isArray(item['@graph']) ? item['@graph'] : [item['@graph']];
        for (const gi of graphItems) {
          const gt = (gi['@type'] || '').toLowerCase();
          if (gt.includes('vehicle') || gt.includes('product') || gt.includes('auto')) {
            extractFieldsFromLd(gi, fields, images);
            rawBlobs.push(gi);
          }
        }
        continue;
      }

      if (isVehicle || hasVehicleSignals(item)) {
        extractFieldsFromLd(item, fields, images);
        rawBlobs.push(item);
      }
    }
  }

  return { fields, images, rawBlobs };
}

function hasVehicleSignals(obj) {
  const keys = Object.keys(obj).map(k => k.toLowerCase());
  const signals = ['vin', 'stocknumber', 'make', 'model', 'vehicleengine',
                    'mileagefromodometer', 'fueltype'];
  return signals.filter(s => keys.some(k => k.includes(s))).length >= 2;
}

function extractFieldsFromLd(item, fields, images) {
  // Direct mappings from schema.org vehicle vocabulary
  const map = {
    name: 'title',
    vehicleIdentificationNumber: 'vin',
    vin: 'vin',
    sku: 'stock_number',
    mpn: 'stock_number',
    vehicleModelDate: 'year',
    modelDate: 'year',
    manufacturer: 'make',
    brand: 'make',
    model: 'model',
    vehicleConfiguration: 'trim',
    color: 'exterior_color',
    vehicleInteriorColor: 'interior_color',
    vehicleEngine: 'engine',
    fuelType: 'fuel_type',
    vehicleTransmission: 'transmission',
    driveWheelConfiguration: 'drivetrain',
    bodyType: 'rv_type',
    description: 'description',
    itemCondition: 'condition',
    mileageFromOdometer: 'mileage',
  };

  for (const [ldKey, ourKey] of Object.entries(map)) {
    if (fields[ourKey]) continue;

    let val = item[ldKey];
    if (val && typeof val === 'object') {
      val = val.value || val.name || val['@value'] || JSON.stringify(val);
    }
    if (val !== undefined && val !== null && val !== '') {
      // Clean up condition values
      if (ourKey === 'condition') {
        val = String(val).toLowerCase();
        if (val.includes('new')) val = 'new';
        else if (val.includes('used')) val = 'used';
        else val = 'unknown';
      }
      fields[ourKey] = val;
    }
  }

  // Extract price from offers
  const offers = item.offers || item.offer;
  if (offers) {
    const offerList = Array.isArray(offers) ? offers : [offers];
    for (const offer of offerList) {
      if (!fields.price && (offer.price || offer.lowPrice)) {
        fields.price = offer.price || offer.lowPrice;
      }
      if (!fields.currency && offer.priceCurrency) {
        fields.currency = offer.priceCurrency;
      }
      if (!fields.inventory_status && offer.availability) {
        const avail = String(offer.availability).toLowerCase();
        if (avail.includes('instock') || avail.includes('available')) {
          fields.inventory_status = 'available';
        } else if (avail.includes('sold') || avail.includes('outofstock')) {
          fields.inventory_status = 'sold';
        }
      }
    }
  }

  // Extract images
  const imageField = item.image || item.photo || item.images;
  if (imageField) {
    if (typeof imageField === 'string') {
      images.push(imageField);
    } else if (Array.isArray(imageField)) {
      for (const img of imageField) {
        if (typeof img === 'string') images.push(img);
        else if (img && (img.url || img.contentUrl)) {
          images.push(img.url || img.contentUrl);
        }
      }
    } else if (imageField.url || imageField.contentUrl) {
      images.push(imageField.url || imageField.contentUrl);
    }
  }
}

/**
 * Extract inline script blobs that contain JSON objects with vehicle data.
 * Many dealer platforms inject configuration or data objects into script tags
 * that aren't JSON-LD but contain full inventory records.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{ fields: object, images: string[], rawBlobs: object[] }>}
 */
export async function extractInlineScriptData(page) {
  const blobs = await page.evaluate(() => {
    const results = [];
    const scripts = document.querySelectorAll('script:not([src]):not([type="application/ld+json"])');

    for (const s of scripts) {
      const text = s.textContent || '';
      if (text.length < 50 || text.length > 500000) continue;

      // Look for JSON object assignments: var X = {...}; or window.X = {...};
      const patterns = [
        /(?:var|let|const|window\.)\s*\w+\s*=\s*(\{[\s\S]*?\});/g,
        /(?:var|let|const|window\.)\s*\w+\s*=\s*(\[[\s\S]*?\]);/g,
        /dataLayer\.push\((\{[\s\S]*?\})\)/g,
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          try {
            const parsed = JSON.parse(match[1]);
            results.push(parsed);
          } catch { /* not valid JSON — skip */ }
        }
      }
    }
    return results;
  });

  const fields = {};
  const images = [];
  const rawBlobs = [];

  for (const blob of blobs) {
    if (hasVehicleSignals(typeof blob === 'object' && !Array.isArray(blob) ? blob : {})) {
      rawBlobs.push(blob);
      // Extract fields using same logic as network extractor
      const flat = {};
      flattenObj(blob, flat);

      const simpleMap = {
        vin: 'vin', stocknumber: 'stock_number', year: 'year',
        make: 'make', model: 'model', trim: 'trim', price: 'price',
        msrp: 'msrp', condition: 'condition', mileage: 'mileage',
        exteriorcolor: 'exterior_color', interiorcolor: 'interior_color',
      };

      for (const [flatKey, val] of Object.entries(flat)) {
        const cleanKey = flatKey.replace(/[^a-z0-9]/g, '');
        for (const [search, canonical] of Object.entries(simpleMap)) {
          if (cleanKey.includes(search) && !fields[canonical] && val !== null && val !== '') {
            fields[canonical] = val;
          }
        }
      }
    }

    // Search for image URLs in blob
    const imgUrls = findImageUrls(blob);
    images.push(...imgUrls);
  }

  return { fields, images, rawBlobs };
}

function flattenObj(obj, result, prefix = '') {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    const key = (prefix + k).toLowerCase();
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenObj(v, result, key);
    } else {
      result[key] = v;
    }
  }
}

function findImageUrls(data, depth = 0) {
  if (depth > 6 || !data) return [];
  const urls = [];

  if (typeof data === 'string' && /\.(jpe?g|png|webp)/i.test(data)) {
    urls.push(data);
  } else if (Array.isArray(data)) {
    for (const item of data) urls.push(...findImageUrls(item, depth + 1));
  } else if (typeof data === 'object') {
    for (const val of Object.values(data)) {
      urls.push(...findImageUrls(val, depth + 1));
    }
  }

  return urls;
}

/**
 * Extract metadata from <meta> tags (Open Graph, product, etc.)
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<object>}
 */
export async function extractMetaTags(page) {
  return page.evaluate(() => {
    const meta = {};
    const tags = document.querySelectorAll('meta[property], meta[name]');
    for (const tag of tags) {
      const key = tag.getAttribute('property') || tag.getAttribute('name');
      const val = tag.getAttribute('content');
      if (key && val) meta[key] = val;
    }
    return meta;
  });
}

/**
 * Map Open Graph / meta tag data to vehicle fields.
 */
export function parseMetaFields(meta) {
  const fields = {};

  if (meta['og:title']) fields.title = meta['og:title'];
  if (meta['og:description']) fields.description = meta['og:description'];
  if (meta['og:image']) fields._meta_image = meta['og:image'];
  if (meta['product:price:amount']) fields.price = meta['product:price:amount'];
  if (meta['product:price:currency']) fields.currency = meta['product:price:currency'];
  if (meta['product:condition']) {
    const c = meta['product:condition'].toLowerCase();
    fields.condition = c.includes('new') ? 'new' : c.includes('used') ? 'used' : 'unknown';
  }

  return fields;
}
