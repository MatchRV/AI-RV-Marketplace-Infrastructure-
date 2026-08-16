/**
 * MatchRV Scraper - Inventory Store
 *
 * Persistent on-disk store for dealer inventory state.
 * Each dealer gets a JSON file in data/ keyed by a unique listing ID
 * (VIN > stock_number > detail URL hash). This allows the diff engine
 * to compare current scrape results against known state.
 *
 * File format: { [listingKey]: { ...rvRecord, _first_seen, _last_seen, _removed_at } }
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { domainSlug, log } from '../utils.js';

const DATA_DIR = resolve(import.meta.dirname, '..', '..', 'data');

/**
 * Generate a stable identity key for a listing.
 * Priority: VIN > stock_number > hash of detail URL.
 */
export function listingKey(record) {
  if (record.vin) return `vin:${record.vin}`;
  if (record.stock_number) return `stk:${record.stock_number}`;
  if (record.source_detail_url) {
    const hash = createHash('md5').update(record.source_detail_url).digest('hex').slice(0, 12);
    return `url:${hash}`;
  }
  return null;
}

/**
 * Get the store file path for a dealer domain.
 */
function storePathFor(domain) {
  return resolve(DATA_DIR, `${domainSlug(domain)}.json`);
}

/**
 * Load the current inventory state for a dealer.
 * Returns an object keyed by listingKey.
 *
 * @param {string} domain
 * @returns {Promise<object>}
 */
export async function loadInventory(domain) {
  const path = storePathFor(domain);
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      log.info(`No existing inventory for ${domain} — first run`);
      return {};
    }
    log.warn(`Failed to read inventory store for ${domain}: ${err.message}`);
    return {};
  }
}

/**
 * Save the inventory state for a dealer.
 *
 * @param {string} domain
 * @param {object} inventory - Keyed by listingKey
 */
export async function saveInventory(domain, inventory) {
  await mkdir(DATA_DIR, { recursive: true });
  const path = storePathFor(domain);
  await writeFile(path, JSON.stringify(inventory, null, 2), 'utf-8');
  log.info(`Inventory state saved: ${path} (${Object.keys(inventory).length} listings)`);
}
