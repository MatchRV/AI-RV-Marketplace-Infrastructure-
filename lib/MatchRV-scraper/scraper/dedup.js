/**
 * MatchRV Post-Processing Deduplication Script
 *
 * Reads JSON output files from output/, picks only the LATEST file per dealer,
 * merges them, deduplicates by VIN (same physical unit at multiple dealers),
 * and writes a master list to output/matchrv-master.json.
 *
 * Dedup rules:
 *   - Per-dealer: only the most recent scrape file is used (older runs ignored).
 *   - Cross-dealer VIN dedup: if two dealers list the same VIN, keep the record
 *     with more data/images.
 *   - No year/make/model grouping — different physical units can share specs.
 *
 * Usage: node scraper/dedup.js
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT, 'output');
const MASTER_FILE = join(OUTPUT_DIR, 'matchrv-master.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count how many non-null, non-empty fields a listing has. */
function dataScore(listing) {
  let score = 0;
  for (const [key, val] of Object.entries(listing)) {
    if (val === null || val === undefined || val === '') continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) continue;
    score++;
  }
  return score;
}

/** Return a comparable quality score for choosing between duplicates. */
function qualityScore(listing) {
  const imageCount = listing.image_count ?? (listing.image_urls?.length ?? 0);
  const fields = dataScore(listing);
  return imageCount * 1000 + fields * 10;
}

/**
 * Extract dealer domain from filename.
 * Files are named like: poulsborv-com_2026-04-19T21-17-33-019Z.json
 */
function dealerFromFilename(filename) {
  const match = filename.match(/^(.+?)_\d{4}-/);
  return match ? match[1] : filename;
}

/**
 * Extract timestamp from filename for sorting.
 * Returns the ISO portion: 2026-04-19T21-17-33-019Z → comparable string
 */
function timestampFromFilename(filename) {
  const match = filename.match(/_(\d{4}-.+?)\.json$/);
  return match ? match[1] : '';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('=== MatchRV Deduplication ===\n');

  if (!existsSync(OUTPUT_DIR)) {
    console.error(`Output directory not found: ${OUTPUT_DIR}`);
    process.exit(1);
  }

  const jsonFiles = readdirSync(OUTPUT_DIR)
    .filter(f => f.endsWith('.json') && f !== 'matchrv-master.json');

  if (jsonFiles.length === 0) {
    console.error('No JSON files found in output/');
    process.exit(1);
  }

  // 1. Pick only the latest file per dealer domain
  const latestByDealer = new Map();
  for (const file of jsonFiles) {
    const dealer = dealerFromFilename(file);
    const ts = timestampFromFilename(file);
    const existing = latestByDealer.get(dealer);
    if (!existing || ts > existing.ts) {
      latestByDealer.set(dealer, { file, ts });
    }
  }

  const selectedFiles = [...latestByDealer.values()].map(v => v.file);
  console.log(`Found ${jsonFiles.length} total file(s), using ${selectedFiles.length} (latest per dealer):`);
  selectedFiles.forEach(f => console.log(`  - ${f}`));
  console.log('');

  // 2. Read listings from selected files
  const allListings = [];
  for (const file of selectedFiles) {
    const filePath = join(OUTPUT_DIR, file);
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf-8'));
      const listings = data.listings ?? data;
      if (Array.isArray(listings)) {
        allListings.push(...listings);
      } else {
        console.warn(`  Skipping ${file} — unexpected format (no listings array)`);
      }
    } catch (err) {
      console.warn(`  Skipping ${file} — parse error: ${err.message}`);
    }
  }

  const totalInput = allListings.length;
  console.log(`Total input records (from latest files): ${totalInput}\n`);

  if (totalInput === 0) {
    console.log('Nothing to deduplicate.');
    return;
  }

  // 3. Cross-dealer VIN dedup — same physical unit at multiple dealers
  //    Keep the record with the best quality score.
  const vinMap = new Map();
  const noVin = [];

  for (const listing of allListings) {
    const vin = (listing.vin ?? '').trim().toUpperCase();
    if (!vin) {
      noVin.push(listing);
      continue;
    }
    if (vinMap.has(vin)) {
      const existing = vinMap.get(vin);
      if (qualityScore(listing) > qualityScore(existing)) {
        vinMap.set(vin, listing);
      }
    } else {
      vinMap.set(vin, listing);
    }
  }

  const masterList = [...vinMap.values(), ...noVin];
  const vinDupsRemoved = totalInput - masterList.length;
  console.log(`Cross-dealer VIN dedup: removed ${vinDupsRemoved} duplicate(s)`);

  // 4. Breakdown by rv_type
  const typeCounts = {};
  for (const listing of masterList) {
    const rvType = listing.rv_type ?? 'Unknown';
    typeCounts[rvType] = (typeCounts[rvType] ?? 0) + 1;
  }

  // 5. Write output
  const output = {
    _meta: {
      generated_at: new Date().toISOString(),
      source_files: selectedFiles.length,
      total_files_found: jsonFiles.length,
      total_input_records: totalInput,
      vin_duplicates_removed: vinDupsRemoved,
      final_count: masterList.length,
      breakdown_by_type: typeCounts,
    },
    listings: masterList,
  };

  writeFileSync(MASTER_FILE, JSON.stringify(output, null, 2), 'utf-8');

  // 6. Print stats
  console.log('\n=== Dedup Results ===');
  console.log(`  Source files used:      ${selectedFiles.length} (of ${jsonFiles.length} total)`);
  console.log(`  Total input records:    ${totalInput}`);
  console.log(`  VIN duplicates removed: ${vinDupsRemoved}`);
  console.log(`  Final count:            ${masterList.length}`);
  console.log('');
  console.log('Breakdown by RV type:');
  const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedTypes) {
    console.log(`  ${type}: ${count}`);
  }
  console.log(`\nMaster file written to: ${MASTER_FILE}`);
}

main();
