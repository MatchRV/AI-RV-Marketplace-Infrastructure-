/**
 * MatchRV Scraper - Network Extractor
 *
 * Captures XHR/fetch responses during page load to find inventory data,
 * gallery arrays, and pricing payloads that the frontend JS fetches.
 *
 * This is the HIGHEST PRIORITY extraction source because network payloads
 * contain the dealer's actual data model — cleaner than DOM scraping.
 */

import { safeJsonParse, log } from '../utils.js';

// Patterns in response URLs that suggest inventory or media data
const INVENTORY_URL_PATTERNS = [
  /inventory/i,
  /vehicle/i,
  /listing/i,
  /stock/i,
  /unit/i,
  /detail/i,
  /product/i,
  /catalog/i,
  /search/i,
  /results/i,
  /api/i,
];

const MEDIA_URL_PATTERNS = [
  /photo/i,
  /image/i,
  /media/i,
  /gallery/i,
  /asset/i,
];

/**
 * Set up network interception on a page. Call BEFORE navigating.
 * Returns a collector object whose .responses array accumulates captured JSON payloads.
 *
 * @param {import('playwright').Page} page
 * @returns {{ responses: object[], detach: () => void }}
 */
export function attachNetworkCapture(page) {
  const captured = { responses: [] };

  const handler = async (response) => {
    try {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';

      // Only inspect JSON responses
      if (!contentType.includes('json') && !contentType.includes('javascript')) return;

      const isInventory = INVENTORY_URL_PATTERNS.some(p => p.test(url));
      const isMedia = MEDIA_URL_PATTERNS.some(p => p.test(url));

      if (!isInventory && !isMedia) return;

      const body = await response.text().catch(() => null);
      if (!body) return;

      const parsed = safeJsonParse(body);
      if (!parsed) return;

      captured.responses.push({
        url,
        type: isMedia ? 'media' : 'inventory',
        data: parsed,
        status: response.status(),
      });

      log.debug(`Captured network JSON: ${url} (${isMedia ? 'media' : 'inventory'})`);
    } catch {
      // Response body may not be available (e.g., redirects) — ignore silently
    }
  };

  page.on('response', handler);

  captured.detach = () => {
    page.off('response', handler);
  };

  return captured;
}

/**
 * Extract inventory fields from captured network responses.
 * Searches through all captured payloads for recognizable vehicle data.
 *
 * @param {object[]} responses - Array of { url, type, data } from network capture
 * @returns {{ fields: object, images: string[], rawBlobs: object[] }}
 */
export function extractFromNetworkResponses(responses) {
  const fields = {};
  const images = [];
  const rawBlobs = [];

  for (const resp of responses) {
    const { data, type, url } = resp;

    // Walk the data structure looking for vehicle-shaped objects
    const candidates = findVehicleObjects(data);
    for (const obj of candidates) {
      rawBlobs.push({ source_url: url, type, data: obj });
      mergeVehicleFields(obj, fields);
    }

    // Look for image arrays anywhere in the data
    const foundImages = findImageArrays(data);
    images.push(...foundImages);
  }

  return { fields, images, rawBlobs };
}

/**
 * Recursively search a data structure for objects that look like vehicle records.
 * A "vehicle object" has at least 2 of: vin, stockNumber, year, make, model, price.
 */
function findVehicleObjects(data, depth = 0) {
  if (depth > 8 || !data) return [];

  const results = [];

  if (Array.isArray(data)) {
    for (const item of data) {
      results.push(...findVehicleObjects(item, depth + 1));
    }
  } else if (typeof data === 'object') {
    const keys = Object.keys(data).map(k => k.toLowerCase());
    const vehicleSignals = ['vin', 'stocknumber', 'stock_number', 'stockno',
      'year', 'make', 'model', 'price', 'msrp', 'listprice'];
    const matchCount = vehicleSignals.filter(s => keys.some(k => k.includes(s))).length;

    if (matchCount >= 2) {
      results.push(data);
    } else {
      // Recurse into child objects
      for (const val of Object.values(data)) {
        if (val && typeof val === 'object') {
          results.push(...findVehicleObjects(val, depth + 1));
        }
      }
    }
  }

  return results;
}

/**
 * Find image URL arrays anywhere in a data structure.
 */
function findImageArrays(data, depth = 0) {
  if (depth > 8 || !data) return [];

  const images = [];

  if (Array.isArray(data)) {
    // Check if this array contains image URLs
    const urlItems = data.filter(item =>
      typeof item === 'string' && /\.(jpe?g|png|webp)/i.test(item)
    );
    if (urlItems.length > 0) {
      images.push(...urlItems);
    }

    // Check if array contains objects with image URL fields
    for (const item of data) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const imgUrl = item.url || item.src || item.href || item.imageUrl ||
          item.image_url || item.photo || item.photoUrl || item.original ||
          item.full || item.large || item.hi_res || item.highRes;
        if (typeof imgUrl === 'string' && /\.(jpe?g|png|webp)/i.test(imgUrl)) {
          images.push(imgUrl);
        }
      }
      if (item && typeof item === 'object') {
        images.push(...findImageArrays(item, depth + 1));
      }
    }
  } else if (typeof data === 'object') {
    for (const [key, val] of Object.entries(data)) {
      const keyLower = key.toLowerCase();
      if ((keyLower.includes('image') || keyLower.includes('photo') ||
           keyLower.includes('gallery') || keyLower.includes('media')) &&
          val && typeof val === 'object') {
        images.push(...findImageArrays(val, depth + 1));
      } else if (val && typeof val === 'object') {
        images.push(...findImageArrays(val, depth + 1));
      }
    }
  }

  return images;
}

/**
 * Merge fields from a vehicle-shaped object into the accumulator using
 * case-insensitive, multi-variant key matching.
 */
function mergeVehicleFields(obj, target) {
  const flat = flattenKeys(obj);

  const mappings = {
    vin: ['vin', 'vehicle_identification_number'],
    stock_number: ['stocknumber', 'stock_number', 'stockno', 'stock_no', 'stock', 'dealerstockno'],
    year: ['year', 'modelyear', 'model_year'],
    make: ['make', 'manufacturer'],
    model: ['model', 'modelname', 'model_name'],
    trim: ['trim', 'trimlevel', 'trim_level', 'series'],
    title: ['title', 'heading', 'name', 'vehicletitle', 'displayname'],
    price: ['price', 'listprice', 'list_price', 'sellingprice', 'selling_price',
            'internetprice', 'internet_price', 'askingprice'],
    sale_price: ['saleprice', 'sale_price', 'specialprice', 'discountprice'],
    msrp: ['msrp', 'retailprice', 'retail_price'],
    condition: ['condition', 'type', 'newused', 'new_used', 'inventorytype'],
    mileage: ['mileage', 'miles', 'odometer'],
    exterior_color: ['exteriorcolor', 'exterior_color', 'extcolor', 'color'],
    interior_color: ['interiorcolor', 'interior_color', 'intcolor'],
    engine: ['engine', 'enginedescription', 'engine_description'],
    fuel_type: ['fueltype', 'fuel_type', 'fuel'],
    transmission: ['transmission', 'trans'],
    drivetrain: ['drivetrain', 'drivetype', 'drive_type'],
    rv_type: ['bodytype', 'body_type', 'rvtype', 'rv_type', 'vehicletype',
              'vehicle_type', 'class', 'category'],
    description: ['description', 'comments', 'dealercomments', 'dealer_comments',
                   'vehicledescription'],
    length: ['length', 'overalllength', 'overall_length'],
    sleeps: ['sleeps', 'sleepscapacity'],
    slideouts: ['slideouts', 'slides', 'numberofslideouts', 'slide_outs'],
    dry_weight: ['dryweight', 'dry_weight', 'weight', 'uvw'],
    gvwr: ['gvwr', 'grossvehicleweightrating'],
    hitch_weight: ['hitchweight', 'hitch_weight', 'tongueweight', 'tongue_weight', 'pinweight'],
  };

  for (const [canonical, variants] of Object.entries(mappings)) {
    if (target[canonical] !== undefined && target[canonical] !== null) continue;
    for (const v of variants) {
      if (flat[v] !== undefined && flat[v] !== null && flat[v] !== '') {
        target[canonical] = flat[v];
        break;
      }
    }
  }
}

/** Flatten nested object keys to lowercase for easy matching. */
function flattenKeys(obj, prefix = '', result = {}) {
  for (const [key, val] of Object.entries(obj)) {
    const flatKey = (prefix + key).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      flattenKeys(val, flatKey, result);
    } else {
      result[flatKey] = val;
    }
  }
  return result;
}
