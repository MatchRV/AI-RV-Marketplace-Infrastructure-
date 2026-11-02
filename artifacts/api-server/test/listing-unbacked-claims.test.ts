import { describe, expect, it } from 'vitest';
import { getInventory } from '../src/services/agent-inventory';
import { getListingRows } from '../src/services/outfitter-inventory';
import { isBoilerplateDescription } from '../src/lib/description-boilerplate';

describe('snapshot listing rows: unknown stays unknown', () => {
  it('generator / solar are null when the unit does not say, never false', () => {
    const inv = getInventory();
    const rows = getListingRows();
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const unknownGen = inv.units.find((u) => u.generator.value === null)!;
    const unknownSolar = inv.units.find((u) => u.solar.value === null)!;
    expect(byId.get(unknownGen.id)!.generator).toBeNull();
    expect(byId.get(unknownSolar.id)!.solar).toBeNull();
    const knownGen = inv.units.find((u) => u.generator.value === true);
    if (knownGen) expect(byId.get(knownGen.id)!.generator).toBe(true);
    const r = byId.get(unknownGen.id)!;
    expect(r.awning).toBeNull();
    expect(r.washer_dryer).toBeNull();
  });
  it('flags cookie-banner descriptions', () => {
    expect(isBoilerplateDescription('This site uses cookies. Learn more.')).toBe(true);
    expect(isBoilerplateDescription('Rear living fifth wheel with fireplace and king bed.')).toBe(false);
  });
});
