/**
 * MatchRV Scraper - Specs Extractor
 *
 * Extracts specification tables and key-value lists from the detail page DOM.
 * Dealer sites present specs in many formats:
 *   - HTML tables
 *   - Definition lists (<dl>)
 *   - Key-value div grids
 *   - Labeled spans/divs
 *
 * The extractor captures the raw key-value pairs as specs{} and also
 * maps recognized keys to canonical RV fields.
 */

import { cleanString, log } from '../utils.js';

/**
 * Extract specs from all common DOM patterns.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{ specs: object, fields: object, features: string[] }>}
 */
export async function extractSpecs(page) {
  const raw = await page.evaluate(() => {
    const specs = {};
    const features = [];

    // ── 1. HTML tables ─────────────────────────────────────────────────────
    // Look for tables that contain spec-like data
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const rows = table.querySelectorAll('tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td, th');
        if (cells.length === 2) {
          const key = cells[0].textContent.trim();
          const val = cells[1].textContent.trim();
          if (key && val && key.length < 80 && val.length < 500) {
            specs[key] = val;
          }
        }
      }
    }

    // ── 2. Definition lists ────────────────────────────────────────────────
    const dls = document.querySelectorAll('dl');
    for (const dl of dls) {
      const dts = dl.querySelectorAll('dt');
      const dds = dl.querySelectorAll('dd');
      const len = Math.min(dts.length, dds.length);
      for (let i = 0; i < len; i++) {
        const key = dts[i].textContent.trim();
        const val = dds[i].textContent.trim();
        if (key && val && key.length < 80) {
          specs[key] = val;
        }
      }
    }

    // ── 3. Key-value div patterns ──────────────────────────────────────────
    // Common on dealer sites: <div class="spec-row"><span class="label">X</span><span class="value">Y</span></div>
    const kvSelectors = [
      { container: '.specs', label: '.label, .spec-label, .spec-key, .key', value: '.value, .spec-value, .val' },
      { container: '.specifications', label: '.label, .spec-label', value: '.value, .spec-value' },
      { container: '.vehicle-specs', label: '.label', value: '.value' },
      { container: '.detail-specs', label: '.label, .key', value: '.value, .val' },
      { container: '.features-specs', label: '.label', value: '.value' },
      { container: '[class*="spec"]', label: '[class*="label"], [class*="key"]', value: '[class*="value"], [class*="val"]' },
    ];

    for (const { container, label, value } of kvSelectors) {
      const containers = document.querySelectorAll(container);
      for (const c of containers) {
        const labels = c.querySelectorAll(label);
        const values = c.querySelectorAll(value);
        const len = Math.min(labels.length, values.length);
        for (let i = 0; i < len; i++) {
          const k = labels[i].textContent.trim();
          const v = values[i].textContent.trim();
          if (k && v && k.length < 80) {
            specs[k] = v;
          }
        }
      }
    }

    // ── 4. Spec rows with colon separation ─────────────────────────────────
    // <li>Length: 32 ft</li> or <div>Sleeps: 6</div>
    const specContainers = document.querySelectorAll('.specs li, .specifications li, .vehicle-details li, .detail-list li, [class*="spec"] li');
    for (const li of specContainers) {
      const text = li.textContent.trim();
      const colonIdx = text.indexOf(':');
      if (colonIdx > 0 && colonIdx < 60) {
        const key = text.slice(0, colonIdx).trim();
        const val = text.slice(colonIdx + 1).trim();
        if (key && val) {
          specs[key] = val;
        }
      }
    }

    // ── 5. Features list ───────────────────────────────────────────────────
    const featureSelectors = [
      '.features li', '.feature-list li', '.vehicle-features li',
      '.standard-features li', '.optional-features li',
      '.equipment li', '[class*="feature"] li',
    ];
    for (const sel of featureSelectors) {
      const items = document.querySelectorAll(sel);
      for (const item of items) {
        const text = item.textContent.trim();
        if (text && text.length > 2 && text.length < 200) {
          features.push(text);
        }
      }
    }

    return { specs, features };
  });

  // Map recognized spec keys to canonical fields
  const fields = mapSpecsToFields(raw.specs);

  log.debug(`Extracted ${Object.keys(raw.specs).length} spec pairs, ${raw.features.length} features`);

  return {
    specs: raw.specs,
    fields,
    features: raw.features,
  };
}

/**
 * Map raw spec key-value pairs to canonical RV record fields.
 * Uses fuzzy key matching to handle the many ways dealers label specs.
 */
function mapSpecsToFields(specs) {
  const fields = {};

  const keyMap = [
    { field: 'year', patterns: [/^year$/i] },
    { field: 'make', patterns: [/^make$/i, /^manufacturer$/i, /^brand$/i] },
    { field: 'model', patterns: [/^model$/i] },
    { field: 'trim', patterns: [/^trim$/i, /^series$/i] },
    { field: 'vin', patterns: [/^vin$/i, /vehicle.*ident/i] },
    { field: 'stock_number', patterns: [/^stock/i, /^stk/i] },
    { field: 'condition', patterns: [/^condition$/i, /^new.*used$/i] },
    { field: 'rv_type', patterns: [/^type$/i, /^class$/i, /^body.*type/i, /^category$/i, /^rv.*type/i] },
    { field: 'exterior_color', patterns: [/ext.*color/i, /^color$/i] },
    { field: 'interior_color', patterns: [/int.*color/i] },
    { field: 'mileage', patterns: [/^mileage$/i, /^miles$/i, /^odometer$/i] },
    { field: 'engine', patterns: [/^engine$/i, /engine.*desc/i] },
    { field: 'fuel_type', patterns: [/^fuel/i] },
    { field: 'transmission', patterns: [/^trans/i] },
    { field: 'drivetrain', patterns: [/^drive/i] },
    { field: 'length', patterns: [/^length$/i, /overall.*length/i, /^unit.*length/i] },
    { field: 'width', patterns: [/^width$/i] },
    { field: 'height', patterns: [/^height$/i, /^ext.*height/i] },
    { field: 'dry_weight', patterns: [/dry.*weight/i, /^weight$/i, /^uvw$/i, /unloaded.*weight/i] },
    { field: 'gvwr', patterns: [/^gvwr$/i, /gross.*vehicle.*weight/i] },
    { field: 'hitch_weight', patterns: [/hitch.*weight/i, /tongue.*weight/i, /pin.*weight/i] },
    { field: 'payload_capacity', patterns: [/payload/i, /cargo.*capacity/i, /^ccc$/i] },
    { field: 'sleeps', patterns: [/^sleeps$/i, /sleep.*capacity/i] },
    { field: 'slideouts', patterns: [/slide.?outs?/i, /^slides$/i, /number.*slide/i] },
    { field: 'fresh_water_capacity', patterns: [/fresh.*water/i] },
    { field: 'gray_water_capacity', patterns: [/gray.*water/i, /grey.*water/i] },
    { field: 'black_water_capacity', patterns: [/black.*water/i] },
    { field: 'fuel_capacity', patterns: [/fuel.*cap/i, /gas.*tank/i] },
    { field: 'propane_capacity', patterns: [/propane/i, /lp.*cap/i] },
    { field: 'axle_count', patterns: [/axle/i] },
    { field: 'air_conditioner', patterns: [/air.*cond/i, /^a\/c$/i, /^ac$/i] },
    { field: 'awning', patterns: [/awning/i] },
    { field: 'generator', patterns: [/generator/i, /^genset$/i] },
    { field: 'leveling_jacks', patterns: [/level.*jack/i, /jack.*level/i] },
  ];

  for (const [rawKey, rawVal] of Object.entries(specs)) {
    const val = cleanString(rawVal);
    if (!val) continue;

    for (const { field, patterns } of keyMap) {
      if (fields[field]) continue;
      if (patterns.some(p => p.test(rawKey))) {
        fields[field] = val;
        break;
      }
    }
  }

  return fields;
}
