/**
 * MatchRV Scraper - Changelog Writer
 *
 * Writes inventory change reports (new, removed, price changes)
 * to JSON files and optionally a rolling NDJSON log.
 */

import { mkdir, writeFile, appendFile } from 'fs/promises';
import { resolve } from 'path';
import config from '../config.js';
import { domainSlug, log } from '../utils.js';

const CHANGELOG_DIR = resolve(config.outputDir, 'changelogs');

/**
 * Write a changelog for a single diff run.
 *
 * @param {string} domain - Dealer domain
 * @param {object[]} changes - Change records from diff engine
 * @param {object} summary - Diff summary stats
 */
export async function writeChangelog(domain, changes, summary) {
  await mkdir(CHANGELOG_DIR, { recursive: true });

  const slug = domainSlug(domain);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Skip writing if nothing changed
  if (changes.length === 0) {
    log.info(`No changes for ${domain} — skipping changelog`);
    return null;
  }

  // Per-run changelog (JSON)
  const filename = `${slug}_changes_${timestamp}.json`;
  const filepath = resolve(CHANGELOG_DIR, filename);

  const report = {
    domain,
    generated_at: new Date().toISOString(),
    summary,
    changes,
  };

  await writeFile(filepath, JSON.stringify(report, null, 2), 'utf-8');
  log.info(`Changelog written: ${filepath}`);

  // Append to rolling NDJSON log (one line per change, useful for ingestion)
  const ndjsonPath = resolve(CHANGELOG_DIR, `${slug}_changelog.ndjson`);
  const lines = changes.map(c => JSON.stringify(c)).join('\n') + '\n';
  await appendFile(ndjsonPath, lines, 'utf-8');

  return filepath;
}

/**
 * Print a human-readable change summary to the console.
 */
export function printChangeSummary(domain, changes, summary) {
  console.log(`\n${'━'.repeat(60)}`);
  console.log(`INVENTORY CHANGES: ${domain}`);
  console.log(`${'━'.repeat(60)}`);
  console.log(`  Current listings:  ${summary.total_current}`);
  console.log(`  Tracked listings:  ${summary.total_stored}`);
  console.log(`  New:               ${summary.new_listings}`);
  console.log(`  Removed:           ${summary.removed_listings}`);
  console.log(`  Price changes:     ${summary.price_changes}`);
  console.log(`  Back on market:    ${summary.back_on_market}`);
  console.log(`  Unchanged:         ${summary.unchanged}`);

  if (changes.length === 0) {
    console.log('\n  No changes detected.\n');
    return;
  }

  // New listings
  const newItems = changes.filter(c => c.type === 'new');
  if (newItems.length > 0) {
    console.log(`\n  NEW LISTINGS (${newItems.length}):`);
    for (const c of newItems) {
      const r = c.record;
      const price = r.price ? `$${r.price.toLocaleString()}` : 'no price';
      console.log(`    + ${r.year || '?'} ${r.make || '?'} ${r.model || '?'} — ${price}`);
    }
  }

  // Removed listings
  const removedItems = changes.filter(c => c.type === 'removed');
  if (removedItems.length > 0) {
    console.log(`\n  REMOVED LISTINGS (${removedItems.length}):`);
    for (const c of removedItems) {
      const r = c.record;
      const days = c.details?.days_on_market;
      console.log(`    - ${r.year || '?'} ${r.make || '?'} ${r.model || '?'} (${days ? days + ' days on market' : 'unknown duration'})`);
    }
  }

  // Price changes
  const priceItems = changes.filter(c => c.type === 'price_change');
  if (priceItems.length > 0) {
    console.log(`\n  PRICE CHANGES (${priceItems.length}):`);
    for (const c of priceItems) {
      const r = c.record;
      for (const pc of c.details.changes) {
        const arrow = pc.direction === 'decreased' ? '↓' : '↑';
        const amt = pc.amount ? `$${pc.amount.toLocaleString()}` : '';
        const pct = pc.pct ? ` (${pc.pct}%)` : '';
        console.log(`    ${arrow} ${r.year || '?'} ${r.make || '?'} ${r.model || '?'} — ${pc.field}: $${pc.old_value?.toLocaleString()} → $${pc.new_value?.toLocaleString()} ${amt}${pct}`);
      }
    }
  }

  // Back on market
  const backItems = changes.filter(c => c.type === 'back_on_market');
  if (backItems.length > 0) {
    console.log(`\n  BACK ON MARKET (${backItems.length}):`);
    for (const c of backItems) {
      const r = c.record;
      const days = c.details?.days_off_market;
      console.log(`    ↺ ${r.year || '?'} ${r.make || '?'} ${r.model || '?'} (off for ${days || '?'} days)`);
    }
  }

  console.log('');
}
