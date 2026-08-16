/**
 * MatchRV Scraper - Confidence Scoring
 *
 * Scores extraction confidence based on field completeness,
 * source quality, and data consistency.
 *
 * High: identity + pricing + specs + images from structured sources
 * Medium: most core fields present but some from DOM or inferred
 * Low: missing critical fields or relying heavily on inference
 */

/**
 * Score the confidence of an extracted RV record.
 *
 * @param {object} record - Normalized RV record
 * @returns {{ confidence: string, notes: string[] }}
 */
export function scoreConfidence(record) {
  const notes = [];
  let score = 0;

  // ── Identity (max 25 points) ──
  if (record.vin) {
    score += 15;
  } else {
    notes.push('Missing VIN');
  }
  if (record.stock_number) {
    score += 10;
  } else {
    notes.push('Missing stock number');
  }

  // ── Core vehicle info (max 25 points) ──
  if (record.year) score += 5;
  else notes.push('Missing year');

  if (record.make) score += 5;
  else notes.push('Missing make');

  if (record.model) score += 5;
  else notes.push('Missing model');

  if (record.title) score += 5;
  if (record.rv_type) score += 5;
  else notes.push('Missing RV type/class');

  // ── Pricing (max 15 points) ──
  if (record.price || record.sale_price) {
    score += 10;
    if (record.msrp) score += 5;
  } else {
    notes.push('Missing price');
  }

  // ── Images (max 15 points) ──
  if (record.image_count >= 10) {
    score += 15;
  } else if (record.image_count >= 5) {
    score += 10;
  } else if (record.image_count >= 1) {
    score += 5;
    notes.push(`Only ${record.image_count} image(s) found`);
  } else {
    notes.push('No images found');
  }

  // ── Specs completeness (max 10 points) ──
  const specFields = [
    'length', 'dry_weight', 'gvwr', 'sleeps', 'slideouts',
    'fresh_water_capacity', 'hitch_weight',
  ];
  const specCount = specFields.filter(f => record[f] !== null).length;
  if (specCount >= 5) score += 10;
  else if (specCount >= 3) score += 6;
  else if (specCount >= 1) score += 3;
  else notes.push('Missing most spec fields');

  // ── Source quality (max 10 points) ──
  const sources = Object.values(record.field_sources);
  const structuredCount = sources.filter(s =>
    s === 'xhr' || s === 'json_ld' || s === 'script_blob'
  ).length;
  const inferredCount = sources.filter(s => s === 'inferred_from_title').length;

  if (structuredCount >= 5) score += 10;
  else if (structuredCount >= 2) score += 5;

  if (inferredCount >= 3) {
    score -= 5;
    notes.push('Multiple fields inferred from title — low trust');
  }

  // ── Determine confidence level ──
  let confidence;
  if (score >= 70) confidence = 'high';
  else if (score >= 40) confidence = 'medium';
  else confidence = 'low';

  // Override to low if critical identity fields are missing
  if (!record.vin && !record.stock_number && !record.title) {
    confidence = 'low';
    notes.push('No identity anchor (VIN, stock number, or title)');
  }

  return { confidence, notes };
}
