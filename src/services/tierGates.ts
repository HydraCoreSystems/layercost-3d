import type { MembershipTier } from '../store/useLayerCostStore';

/**
 * Pure tier gate rules. No React, no store access, no native modules, so the rules can be
 * tested in Node and read in one place. Screens ask canUse() and show the upgrade prompt;
 * they never compare tier strings themselves.
 */

export type Feature =
  // Free
  | 'singleFilamentCalculator'
  | 'onePrinterProfile'
  | 'basicMarkup'
  // Pro (lifetime unlock or Studio Pass)
  | 'amsBatchOptimizer'
  | 'slicerImport'
  | 'allMarketplacePresets'
  | 'threeTierPricing'
  // Studio Pass only
  | 'spoolDepletion'
  | 'taxProfitLedger'
  | 'lowFilamentWarnings'
  | 'aiListingCopywriter';

export const FEATURE_MIN_TIER: Record<Feature, MembershipTier> = {
  singleFilamentCalculator: 'free',
  onePrinterProfile: 'free',
  basicMarkup: 'free',

  amsBatchOptimizer: 'pro',
  slicerImport: 'pro',
  allMarketplacePresets: 'pro',
  threeTierPricing: 'pro',

  spoolDepletion: 'studio',
  taxProfitLedger: 'studio',
  lowFilamentWarnings: 'studio',
  aiListingCopywriter: 'studio',
};

/**
 * Open decision for the owner, not enforced yet: the brief lists "unlimited catalog and
 * PDF exports" under Pro but does not say what Free gets. Until a free catalog cap and a
 * free PDF export rule are chosen, catalog saves and PDF exports stay open to every tier.
 */

const TIER_RANK: Record<MembershipTier, number> = { free: 0, pro: 1, studio: 2 };

export function tierAtLeast(tier: MembershipTier, minimum: MembershipTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[minimum];
}

export function canUse(tier: MembershipTier, feature: Feature): boolean {
  return tierAtLeast(tier, FEATURE_MIN_TIER[feature]);
}

export function requiredTierFor(feature: Feature): MembershipTier {
  return FEATURE_MIN_TIER[feature];
}

export const FREE_LIMITS = {
  filamentSlots: 1,
  printerProfiles: 1,
} as const;

export function maxFilamentSlots(tier: MembershipTier): number {
  return canUse(tier, 'amsBatchOptimizer') ? Number.POSITIVE_INFINITY : FREE_LIMITS.filamentSlots;
}

export function canAddFilamentSlot(tier: MembershipTier, currentSlotCount: number): boolean {
  return currentSlotCount < maxFilamentSlots(tier);
}

/** Adding a printer profile. Existing printers are never removed when a plan lapses. */
export function canAddPrinterProfile(tier: MembershipTier, currentPrinterCount: number): boolean {
  if (tier !== 'free') return true;
  return currentPrinterCount < FREE_LIMITS.printerProfiles;
}

/** Free users price with a plain cash sale. Every other fee preset needs Pro. */
export const FREE_MARKETPLACE_PRESET_ID = 'cash';

export function canUseMarketplacePreset(tier: MembershipTier, presetId: string): boolean {
  return canUse(tier, 'allMarketplacePresets') || presetId === FREE_MARKETPLACE_PRESET_ID;
}

/** Plate quantity above one is the batch optimizer. */
export function canUsePlateQuantity(tier: MembershipTier, quantity: number): boolean {
  return quantity <= 1 || canUse(tier, 'amsBatchOptimizer');
}

export function upgradeMessage(feature: Feature): { title: string; body: string } {
  const need = requiredTierFor(feature);
  if (need === 'studio') {
    return {
      title: 'Studio Pass Feature',
      body: 'This feature is part of LayerCost Studio Pass ($3.99/month or $29.99/year). Open the plans screen to subscribe or restore a purchase.',
    };
  }
  return {
    title: 'LayerCost Pro Feature',
    body: 'This feature is included with LayerCost Pro ($8.99 once) and with Studio Pass. Open the plans screen to buy or restore a purchase.',
  };
}

export interface TierLimitedQuote {
  filamentSlots: Array<{ purgeGramsPerPlate: number }>;
  plateQuantity: number;
  marketplaceId: string;
}

/**
 * The quote the math should run on. A saved quote can hold Pro inputs (several AMS slots,
 * a plate of 4, an Etsy fee preset), for example the starter quote or one saved while on a
 * paid plan. Free users get the single filament, one unit, cash sale version of it. The
 * saved quote itself is never changed, so upgrading or restoring brings everything back.
 */
export function limitQuoteForTier<T extends TierLimitedQuote>(tier: MembershipTier, quote: T): T {
  let next = quote;
  if (!canUse(tier, 'amsBatchOptimizer')) {
    next = {
      ...next,
      filamentSlots: next.filamentSlots.slice(0, FREE_LIMITS.filamentSlots).map((slot) => ({
        ...slot,
        purgeGramsPerPlate: 0,
      })),
      plateQuantity: 1,
    };
  }
  if (!canUseMarketplacePreset(tier, next.marketplaceId)) {
    next = { ...next, marketplaceId: FREE_MARKETPLACE_PRESET_ID };
  }
  return next;
}
