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
    expect(extractBunkhouse(null, buildCorpus('', '', []), '261BHXL', 'travel_trailer').source).toBe('derived_model_code');
  });
});

describe('release evidence boundaries', () => {
  it('does not promote family-wide bunk weight ratings', () => {
    const c = buildCorpus('Jay Flight 265MWS', 'Queen bed and rear bathroom.', ['300 lb.-rated single bunk beds', '600 lb. rated double bunk beds']);
    expect(extractBunkhouse(null, c, '265MWS').value).toBeNull();
  });
  it('preserves explicit negatives even with a bunk-like model code', () => {
    expect(extractBunkhouse(false, buildCorpus('', '', []), '26BH').value).toBe(false);
  });
  it('retains affirmative available inventory wording', () => {
    expect(extractBunkhouse(null, buildCorpus('', 'Available now with double-size bunks in the rear.', []), null).source).toBe('derived_text');
  });
  it('does not treat rounded listing badges as exact overall length', () => {
    expect(extractSpecsFromText(buildCorpus('', '', ['30ft long'])).lengthFt).toBeNull();
  });
  it('rejects component length wording and invalid inches', () => {
    expect(extractSpecsFromText(buildCorpus('', 'The awning has a length of 20 feet.', [])).lengthFt).toBeNull();
    expect(extractSpecsFromText(buildCorpus('', 'Overall Length: 29 ft 15 in', [])).lengthFt).toBeNull();
  });
});

describe('bunkhouse tag: facts only (Oct 29 rules)', () => {
  const empty = buildCorpus('', '', []);
  it('BH counts only on travel trailers, fifth wheels and toy haulers', () => {
    expect(extractBunkhouse(null, empty, '264BH', 'travel_trailer').value).toBe(true);
    expect(extractBunkhouse(null, empty, '380BHS', 'fifth_wheel').value).toBe(true);
    expect(extractBunkhouse(null, empty, '27DBH', 'toy_hauler').value).toBe(true);
  });
  it('BH on a motorhome (bath-and-a-half, e.g. Tiffin Phaeton 37BH) is not evidence', () => {
    expect(extractBunkhouse(null, buildCorpus('2024 Tiffin Phaeton 37BH', 'Bath and a half, king bed.', []), '37BH', 'class_a').value).toBeNull();
    expect(extractBunkhouse(null, empty, '31BH', 'class_c').value).toBeNull();
    expect(extractBunkhouse(null, empty, '26BH', null).value).toBeNull();
  });
  it('a motorhome still tags from its own listing text', () => {
    expect(extractBunkhouse(null, buildCorpus('Coachmen Pursuit 31BH', 'Bunk beds and a rear private bedroom.', []), '31BH', 'class_a').source).toBe('derived_text');
  });
  it('QB, DB, DBS and BUNK codes alone stay unknown until a brochure confirms', () => {
    for (const code of ['273QBXL', '28DB', '260DBS', '24BUNK']) {
      expect(extractBunkhouse(null, empty, code, 'travel_trailer').value).toBeNull();
    }
  });
  it('ignores the generic features list', () => {
    expect(extractBunkhouse(null, buildCorpus('2026 Alpha Wolf 21RB', 'Rear bath travel trailer.', ['Bunk Ladder', 'Bunkhouse TV Prep']), '21RB', 'travel_trailer').value).toBeNull();
  });
  it('ignores site navigation and review text glued into descriptions', () => {
    expect(extractBunkhouse(null, buildCorpus('KZ Ridgeway 38TBL', 'Took my 2018 bunkhouse rv in, got in and out in a day.', []), '38TBL', 'fifth_wheel').value).toBeNull();
    expect(extractBunkhouse(null, buildCorpus('Jayco 22RB', 'Shop all bunkhouse travel trailers | Service | Parts', []), '22RB', 'travel_trailer').value).toBeNull();
  });
  it('negation: "without ... a traditional bunkhouse" does not tag (vin:1UJBJHBJ7F1JH0137)', () => {
    const c = buildCorpus('2015 Jayco JAY FEATHER 19H', 'JAYCO X19H HYBRID TRAVEL TRAILER Lightweight • Spacious • Adventure-Ready Enjoy the perfect combination of easy towing, generous sleeping capacity, and dependable Jayco construction. The X19H offers hard-wall comfort with expandable tent beds, giving families plenty of room without the weight and length of a traditional bunkhouse trailer.', []);
    expect(extractBunkhouse(null, c, '19H', 'travel_trailer').value).toBeNull();
    expect(extractBunkhouse(null, buildCorpus('', 'A great alternative to a bunkhouse model.', []), null, 'travel_trailer').value).toBeNull();
    expect(extractBunkhouse(null, buildCorpus('', 'Rear bath instead of bunk beds.', []), null, 'travel_trailer').value).toBeNull();
  });
  it('keeps affirmative unit text', () => {
    expect(extractBunkhouse(null, buildCorpus('', 'Highlights: double-over-double bunks, outdoor kitchen.', []), '29MBD', 'travel_trailer').source).toBe('derived_text');
    expect(extractBunkhouse(null, buildCorpus('', 'No slide, but rear bunk beds for the kids.', []), null, 'travel_trailer').value).toBe(true);
  });
});
