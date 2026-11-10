import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CATALOG,
  DEFAULT_COMPLETED_JOBS,
  DEFAULT_CURRENT_QUOTE,
  DEFAULT_HARDWARE,
  DEFAULT_PRINTERS,
  DEFAULT_SETTINGS,
  DEFAULT_SPOOLS,
  parsePersistedState,
} from '../useLayerCostStore';
import { createDebouncedSaver, getKvBackend, getKvStorage, resetKvStorageCache } from '../kvStorage';

afterEach(() => {
  vi.useRealTimers();
  resetKvStorageCache();
});

describe('loading saved state', () => {
  it('returns null for nothing saved or for corrupt data', () => {
    expect(parsePersistedState(null)).toBeNull();
    expect(parsePersistedState('')).toBeNull();
    expect(parsePersistedState('{not json')).toBeNull();
  });

  it('keeps every saved field from a full save', () => {
    const saved = {
      membershipTier: 'pro',
      onboardingCompleted: true,
      settings: { ...DEFAULT_SETTINGS, defaultLaborRate: 31 },
      printers: [DEFAULT_PRINTERS[0]],
      spools: [DEFAULT_SPOOLS[0]],
      hardware: [DEFAULT_HARDWARE[0]],
      currentQuote: { ...DEFAULT_CURRENT_QUOTE, productName: 'Saved Quote' },
      catalog: [DEFAULT_CATALOG[0]],
      completedJobs: [],
    };
    const state = parsePersistedState(JSON.stringify(saved))!;
    expect(state.onboardingCompleted).toBe(true);
    expect(state.settings.defaultLaborRate).toBe(31);
    expect(state.printers).toEqual([DEFAULT_PRINTERS[0]]);
    expect(state.spools).toEqual([DEFAULT_SPOOLS[0]]);
    expect(state.hardware).toEqual([DEFAULT_HARDWARE[0]]);
    expect(state.currentQuote.productName).toBe('Saved Quote');
    expect(state.catalog).toEqual([DEFAULT_CATALOG[0]]);
    // An empty completedJobs array is a real saved value and must survive.
    expect(state.completedJobs).toEqual([]);
  });

  it('fills gaps with defaults so older saves still load', () => {
    const state = parsePersistedState(JSON.stringify({ onboardingCompleted: false }))!;
    expect(state.settings).toEqual(DEFAULT_SETTINGS);
    expect(state.printers).toEqual(DEFAULT_PRINTERS);
    expect(state.spools).toEqual(DEFAULT_SPOOLS);
    expect(state.hardware).toEqual(DEFAULT_HARDWARE);
    expect(state.currentQuote).toEqual(DEFAULT_CURRENT_QUOTE);
    expect(state.catalog).toEqual(DEFAULT_CATALOG);
    expect(state.completedJobs).toEqual(DEFAULT_COMPLETED_JOBS);
  });

  it('merges new settings fields over an older settings object', () => {
    const state = parsePersistedState(JSON.stringify({ settings: { defaultLaborRate: 40 } }))!;
    expect(state.settings.defaultLaborRate).toBe(40);
    expect(state.settings.themeMode).toBe(DEFAULT_SETTINGS.themeMode);
  });

  it('never trusts a saved tier: old saves carried a made up studio tier', () => {
    for (const tier of ['studio', 'pro', 'free', undefined]) {
      const state = parsePersistedState(JSON.stringify({ membershipTier: tier }))!;
      expect(state.membershipTier).toBe('free');
    }
  });
});

describe('storage backend', () => {
  it('has no backend in plain Node, so importing the store has no side effects', () => {
    expect(getKvStorage()).toBeNull();
    expect(getKvBackend()).toBe('none');
  });
});

describe('debounced saver', () => {
  const memoryKv = () => {
    const data = new Map<string, string>();
    const writes: string[] = [];
    return {
      data,
      writes,
      kv: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => {
          data.set(k, v);
          writes.push(v);
        },
      },
    };
  };

  it('collapses rapid saves into one write of the latest value', () => {
    vi.useFakeTimers();
    const m = memoryKv();
    const saver = createDebouncedSaver(m.kv, 'k', 400);
    saver.save('a');
    saver.save('b');
    saver.save('c');
    expect(m.writes).toEqual([]);
    vi.advanceTimersByTime(399);
    expect(m.writes).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(m.writes).toEqual(['c']);
    expect(m.data.get('k')).toBe('c');
  });

  it('flush writes pending data immediately, for when the app goes to the background', () => {
    vi.useFakeTimers();
    const m = memoryKv();
    const saver = createDebouncedSaver(m.kv, 'k', 400);
    saver.save('latest');
    saver.flush();
    expect(m.data.get('k')).toBe('latest');
    vi.advanceTimersByTime(1000);
    expect(m.writes).toEqual(['latest']);
  });

  it('writes immediately when the delay is zero, which keeps the web behavior', () => {
    const m = memoryKv();
    const saver = createDebouncedSaver(m.kv, 'k', 0);
    saver.save('x');
    expect(m.writes).toEqual(['x']);
  });

  it('swallows storage errors like the original localStorage path did', () => {
    const saver = createDebouncedSaver(
      { getItem: () => null, setItem: () => { throw new Error('quota'); } },
      'k',
      0
    );
    expect(() => saver.save('x')).not.toThrow();
  });
});
