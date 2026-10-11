import { describe, it, expect } from 'vitest';
import { buildCorpus, extractSpecsFromText, extractBunkhouse } from '../src/enrich.js';
describe('unit-specific evidence', () => {
  it('rejects awning and component dimensions', () => {
    expect(extractSpecsFromText(buildCorpus('Vibe 26RK', "Set up the 18' electric awning. Shower 36 x 30 inches.", [])).lengthFt).toBeNull();
  });
  it('accepts explicit overall length', () => {
    expect(extractSpecsFromText(buildCorpus('', 'Overall Length: 30 ft 8 in', [])).lengthFt).toBeCloseTo(30.6667, 3);
    expect(extractSpecsFromText(buildCorpus('', 'With a length of 28 feet and a width of 8 feet.', [])).lengthFt).toBe(28);
    expect(extractSpecsFromText(buildCorpus('', 'Overall length: 29.5 ft', [])).lengthFt).toBe(29.5);
  });
  it('does not treat generic bunkhouse equipment as unit evidence', () => {
    expect(extractBunkhouse(null, buildCorpus('Vibe 26RK', 'Rear Kitchen Two Lounge Chairs', ['Teddy Bear Series Bunk Mats (Bunkhouse Models)']), '26RK').value).toBeNull();
  });
  it('retains explicit bunks and labels model-only inference', () => {
    expect(extractBunkhouse(null, buildCorpus('', 'Double-size bunks in the back.', []), '261BHXL').source).toBe('derived_text');
    expect(extractBunkhouse(null, buildCorpus('', '', []), '261BHXL').source).toBe('derived_model_code');
  });
});
