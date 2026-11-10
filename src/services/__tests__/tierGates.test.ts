import { describe, it, expect } from 'vitest';
import {
  FEATURE_MIN_TIER,
  FREE_MARKETPLACE_PRESET_ID,
  canAddFilamentSlot,
  canAddPrinterProfile,
  canUse,
  canUseMarketplacePreset,
  canUsePlateQuantity,
  limitQuoteForTier,
  requiredTierFor,
  tierAtLeast,
  type Feature,
} from '../tierGates';
import { MARKETPLACE_PRESETS } from '../../engine/marketplaceFees';
import type { MembershipTier } from '../../store/useLayerCostStore';

const FREE_FEATURES: Feature[] = ['singleFilamentCalculator', 'onePrinterProfile', 'basicMarkup'];
const PRO_FEATURES: Feature[] = ['amsBatchOptimizer', 'slicerImport', 'allMarketplacePresets', 'threeTierPricing'];
const STUDIO_FEATURES: Feature[] = ['spoolDepletion', 'taxProfitLedger', 'lowFilamentWarnings', 'aiListingCopywriter'];

describe('tier ordering', () => {
  it('ranks free below pro below studio', () => {
    expect(tierAtLeast('free', 'free')).toBe(true);
    expect(tierAtLeast('free', 'pro')).toBe(false);
    expect(tierAtLeast('pro', 'pro')).toBe(true);
    expect(tierAtLeast('pro', 'studio')).toBe(false);
    expect(tierAtLeast('studio', 'pro')).toBe(true);
  });
});

describe('feature gates', () => {
  it('opens the free features on every tier', () => {
    for (const tier of ['free', 'pro', 'studio'] as MembershipTier[]) {
      for (const f of FREE_FEATURES) expect(canUse(tier, f), `${tier} ${f}`).toBe(true);
    }
  });

  it('keeps Pro features closed on free and open on pro and studio', () => {
    for (const f of PRO_FEATURES) {
      expect(canUse('free', f), f).toBe(false);
      expect(canUse('pro', f), f).toBe(true);
      expect(canUse('studio', f), f).toBe(true);
      expect(requiredTierFor(f)).toBe('pro');
    }
  });

  it('keeps Studio Pass features closed on free and on the lifetime Pro unlock', () => {
    for (const f of STUDIO_FEATURES) {
      expect(canUse('free', f), f).toBe(false);
      expect(canUse('pro', f), f).toBe(false);
      expect(canUse('studio', f), f).toBe(true);
      expect(requiredTierFor(f)).toBe('studio');
    }
  });

  it('assigns every feature to exactly one list above', () => {
    const listed = [...FREE_FEATURES, ...PRO_FEATURES, ...STUDIO_FEATURES].sort();
    expect(Object.keys(FEATURE_MIN_TIER).sort()).toEqual(listed);
  });
});

describe('limits', () => {
  it('allows one filament slot on free and any number on pro', () => {
    expect(canAddFilamentSlot('free', 0)).toBe(true);
    expect(canAddFilamentSlot('free', 1)).toBe(false);
    expect(canAddFilamentSlot('pro', 4)).toBe(true);
    expect(canAddFilamentSlot('studio', 4)).toBe(true);
  });

  it('allows one printer profile on free and unlimited on paid tiers', () => {
    expect(canAddPrinterProfile('free', 0)).toBe(true);
    expect(canAddPrinterProfile('free', 1)).toBe(false);
    expect(canAddPrinterProfile('free', 5)).toBe(false);
    expect(canAddPrinterProfile('pro', 5)).toBe(true);
    expect(canAddPrinterProfile('studio', 5)).toBe(true);
  });

  it('limits free to a solo print and unlocks batches on pro', () => {
    expect(canUsePlateQuantity('free', 1)).toBe(true);
    expect(canUsePlateQuantity('free', 2)).toBe(false);
    expect(canUsePlateQuantity('pro', 16)).toBe(true);
  });

  it('limits free to the cash preset and opens every preset on pro', () => {
    expect(canUseMarketplacePreset('free', FREE_MARKETPLACE_PRESET_ID)).toBe(true);
    const others = MARKETPLACE_PRESETS.filter((m) => m.id !== FREE_MARKETPLACE_PRESET_ID);
    expect(others.length).toBeGreaterThan(0);
    for (const m of others) {
      expect(canUseMarketplacePreset('free', m.id), m.id).toBe(false);
      expect(canUseMarketplacePreset('pro', m.id), m.id).toBe(true);
    }
    expect(MARKETPLACE_PRESETS.some((m) => m.id === FREE_MARKETPLACE_PRESET_ID)).toBe(true);
  });
});

describe('limitQuoteForTier', () => {
  const quote = {
    marketplaceId: 'etsy',
    plateQuantity: 8,
    filamentSlots: [
      { purgeGramsPerPlate: 20 },
      { purgeGramsPerPlate: 18 },
      { purgeGramsPerPlate: 10 },
    ],
  };

  it('reduces a Pro style quote to single filament, one unit, cash sale on free', () => {
    const limited = limitQuoteForTier('free', quote);
    expect(limited.filamentSlots).toHaveLength(1);
    expect(limited.filamentSlots[0].purgeGramsPerPlate).toBe(0);
    expect(limited.plateQuantity).toBe(1);
    expect(limited.marketplaceId).toBe(FREE_MARKETPLACE_PRESET_ID);
  });

  it('does not change the saved quote', () => {
    limitQuoteForTier('free', quote);
    expect(quote.filamentSlots).toHaveLength(3);
    expect(quote.plateQuantity).toBe(8);
    expect(quote.marketplaceId).toBe('etsy');
  });

  it('leaves the quote alone on pro and studio', () => {
    expect(limitQuoteForTier('pro', quote)).toBe(quote);
    expect(limitQuoteForTier('studio', quote)).toBe(quote);
  });
});
