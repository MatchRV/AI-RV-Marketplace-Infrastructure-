/**
 * MatchRV Scraper - Inventory Diff Engine
 *
 * Compares a fresh scrape against stored inventory state to detect:
 *   - NEW listings (not previously seen)
 *   - REMOVED listings (previously seen, not in current scrape)
 *   - PRICE CHANGES (price or sale_price differs)
 *   - BACK ON MARKET (previously removed, now seen again)
 *
 * Produces a structured changelog for downstream consumption
 * (database ingestion, alerts, dashboards, etc.)
 */

import { listingKey } from './inventory-store.js';
import { log } from '../utils.js';

/**
 * Diff current scrape results against stored inventory.
 *
 * @param {object[]} currentRecords - Normalized RV records from this scrape
 * @param {object} storedInventory - Previous state keyed by listingKey
 * @returns {{ changes: object[], updatedInventory: object, summary: object }}
 */
export function diffInventory(currentRecords, storedInventory) {
  const now = new Date().toISOString();
  const changes = [];
  const updatedInventory = { ...storedInventory };
  const currentKeys = new Set();

  // ── Process current scrape results ──
  for (const record of currentRecords) {
    const key = listingKey(record);
    if (!key) {
      log.warn(`Skipping record with no identity key: ${record.source_detail_url}`);
      continue;
    }

    currentKeys.add(key);
    const existing = storedInventory[key];

    if (!existing) {
      // ── NEW LISTING ──
      changes.push({
        type: 'new',
        key,
        timestamp: now,
        record: summaryFields(record),
        details: null,
      });

      updatedInventory[key] = {
        ...record,
        _first_seen: now,
        _last_seen: now,
        _removed_at: null,
      };

    } else if (existing._removed_at) {
      // ── BACK ON MARKET (was removed, now seen again) ──
      changes.push({
        type: 'back_on_market',
        key,
        timestamp: now,
        record: summaryFields(record),
        details: {
          removed_at: existing._removed_at,
          days_off_market: daysBetween(existing._removed_at, now),
        },
      });

      updatedInventory[key] = {
        ...record,
        _first_seen: existing._first_seen,
        _last_seen: now,
        _removed_at: null,
      };

    } else {
      // ── EXISTING — check for price changes ──
      const priceChanges = detectPriceChanges(existing, record);

      if (priceChanges.length > 0) {
        changes.push({
          type: 'price_change',
          key,
          timestamp: now,
          record: summaryFields(record),
          details: { changes: priceChanges },
        });
      }

      // Update stored record with latest data
      updatedInventory[key] = {
        ...record,
        _first_seen: existing._first_seen,
        _last_seen: now,
        _removed_at: null,
        _price_history: [
          ...(existing._price_history || []),
          ...(priceChanges.length > 0
            ? [{ timestamp: now, changes: priceChanges }]
            : []),
        ],
      };
    }
  }

  // ── Detect REMOVED listings ──
  // A listing is "removed" if it was in the store, not marked removed,
  // and is NOT in the current scrape results.
  for (const [key, existing] of Object.entries(storedInventory)) {
    if (currentKeys.has(key)) continue;
    if (existing._removed_at) continue; // Already marked removed

    changes.push({
      type: 'removed',
      key,
      timestamp: now,
      record: summaryFields(existing),
      details: {
        first_seen: existing._first_seen,
        last_seen: existing._last_seen,
        days_on_market: daysBetween(existing._first_seen, now),
      },
    });

    updatedInventory[key] = {
      ...existing,
      _last_seen: existing._last_seen,
      _removed_at: now,
      inventory_status: 'sold', // Assume removed = sold (most common reason)
    };
  }

  // ── Summary ──
  const summary = {
    timestamp: now,
    total_current: currentRecords.length,
    total_stored: Object.keys(updatedInventory).length,
    new_listings: changes.filter(c => c.type === 'new').length,
    removed_listings: changes.filter(c => c.type === 'removed').length,
    price_changes: changes.filter(c => c.type === 'price_change').length,
    back_on_market: changes.filter(c => c.type === 'back_on_market').length,
    unchanged: currentRecords.length - changes.filter(c =>
      c.type === 'new' || c.type === 'price_change' || c.type === 'back_on_market'
    ).length,
  };

  log.info(`Diff complete: ${summary.new_listings} new, ${summary.removed_listings} removed, ${summary.price_changes} price changes, ${summary.back_on_market} back on market`);

  return { changes, updatedInventory, summary };
}

/**
 * Compare price fields between old and new records.
 * Tracks changes in: price, sale_price, msrp.
 *
 * @returns {object[]} Array of { field, old_value, new_value, direction, amount, pct }
 */
function detectPriceChanges(oldRecord, newRecord) {
  const priceFields = ['price', 'sale_price', 'msrp'];
  const changes = [];

  for (const field of priceFields) {
    const oldVal = oldRecord[field];
    const newVal = newRecord[field];

    // Skip if both null or both the same
    if (oldVal === newVal) continue;
    if (oldVal === null && newVal === null) continue;

    // A price appearing or disappearing is also a change
    if (oldVal === null && newVal !== null) {
      changes.push({
        field,
        old_value: null,
        new_value: newVal,
        direction: 'appeared',
        amount: null,
        pct: null,
      });
      continue;
    }

    if (oldVal !== null && newVal === null) {
      changes.push({
        field,
        old_value: oldVal,
        new_value: null,
        direction: 'removed',
        amount: null,
        pct: null,
      });
      continue;
    }

    // Numeric comparison
    const diff = newVal - oldVal;
    if (Math.abs(diff) < 1) continue; // Ignore rounding differences

    changes.push({
      field,
      old_value: oldVal,
      new_value: newVal,
      direction: diff > 0 ? 'increased' : 'decreased',
      amount: Math.abs(diff),
      pct: oldVal > 0 ? parseFloat((Math.abs(diff) / oldVal * 100).toFixed(2)) : null,
    });
  }

  return changes;
}

/**
 * Extract summary fields for the changelog (enough to identify the unit
 * without including the entire record).
 */
function summaryFields(record) {
  return {
    year: record.year,
    make: record.make,
    model: record.model,
    trim: record.trim,
    vin: record.vin,
    stock_number: record.stock_number,
    price: record.price,
    sale_price: record.sale_price,
    msrp: record.msrp,
    condition: record.condition,
    rv_type: record.rv_type,
    dealer_name: record.dealer_name,
    dealer_domain: record.dealer_domain,
    source_detail_url: record.source_detail_url,
    image_count: record.image_count,
    primary_image: record.primary_image,
  };
}

/** Days between two ISO date strings. */
function daysBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}
