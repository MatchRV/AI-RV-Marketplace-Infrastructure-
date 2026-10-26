import { describe, expect, it, vi } from 'vitest';
import { runEnrichmentTick, shouldStartEnrichmentCron } from '../src/services/listing-enrichment';

describe('enrichment cron guard (no-DB deploy must not crash hourly)', () => {
  it('never starts without a database, even with Anthropic configured', () => {
    expect(shouldStartEnrichmentCron('none', true)).toBe(false);
    expect(shouldStartEnrichmentCron('none', false)).toBe(false);
  });

  it('starts only with a database and Anthropic configured', () => {
    expect(shouldStartEnrichmentCron('postgres', true)).toBe(true);
    expect(shouldStartEnrichmentCron('embedded', true)).toBe(true);
    expect(shouldStartEnrichmentCron('postgres', false)).toBe(false);
  });

  it('a failing batch is logged and swallowed, never rejected', async () => {
    const err = Object.assign(new Error('No database in this deployment (DISABLE_DB=1).'), { name: 'DatabaseUnavailableError' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const batch = vi.fn().mockRejectedValue(err);
    await expect(runEnrichmentTick(batch)).resolves.toBeNull();
    expect(batch).toHaveBeenCalledWith(20);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[enrichment] Hourly batch failed'), err);
    spy.mockRestore();
  });

  it('a successful batch returns its result', async () => {
    const r = { processed: 1, enriched: 1, skipped: 0, errors: 0, remaining: 0 };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(runEnrichmentTick(async () => r)).resolves.toEqual(r);
    log.mockRestore();
  });
});
