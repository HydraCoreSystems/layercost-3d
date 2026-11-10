import { PrintQuoteInput, UnitCostBreakdown } from './pricingEngine';

export interface MarketplacePreset {
  id: string;
  name: string;
  shortName: string;
  description: string;
  /** Commission rate applied to item price (e.g. 0.08 = 8%) */
  commissionRate: number;
  /** Payment processing rate applied to total collected (item + shipping) (e.g. 0.029 = 2.9%) */
  processingRate: number;
  /** Fixed fee per transaction in $ (e.g. 0.30) */
  fixedFee: number;
  /** Fixed listing renewal fee in $ (e.g. 0.20 on Etsy) */
  listingFee: number;
  /** Optional extra rate when Offsite Ads apply (e.g. 0.15 on Etsy) */
  offsiteAdsRate?: number;
}

export const MARKETPLACE_PRESETS: MarketplacePreset[] = [
  {
    id: 'etsy',
    name: 'Etsy Marketplace',
    shortName: 'Etsy',
    description: '6.5% transaction + 3% + $0.25 processing + $0.20 listing fee',
    commissionRate: 0.065,
    processingRate: 0.03,
    fixedFee: 0.25,
    listingFee: 0.2,
    offsiteAdsRate: 0.15,
  },
  {
    id: 'whatnot',
    name: 'Whatnot Live Auction',
    shortName: 'Whatnot',
    description: '8.0% category commission + 2.9% + $0.30 payment processing',
    commissionRate: 0.08,
    processingRate: 0.029,
    fixedFee: 0.3,
    listingFee: 0,
  },
  {
    id: 'palmstreet',
    name: 'PalmStreet Live / Purge',
    shortName: 'PalmStreet',
    description: '6.0% platform fee + 2.9% + $0.30 payment processing',
    commissionRate: 0.06,
    processingRate: 0.029,
    fixedFee: 0.3,
    listingFee: 0,
  },
  {
    id: 'tiktok',
    name: 'TikTok Shop',
    shortName: 'TikTok Shop',
    description: '6.0% referral fee (includes payment processing)',
    commissionRate: 0.06,
    processingRate: 0,
    fixedFee: 0,
    listingFee: 0,
  },
  {
    id: 'ebay',
    name: 'eBay Store',
    shortName: 'eBay',
    description: '13.25% final value fee + $0.30 per order',
    commissionRate: 0.1325,
    processingRate: 0,
    fixedFee: 0.3,
    listingFee: 0,
  },
  {
    id: 'shopify',
    name: 'Shopify / Web Store',
    shortName: 'Shopify',
    description: '2.9% + $0.30 online card processing',
    commissionRate: 0,
    processingRate: 0.029,
    fixedFee: 0.3,
    listingFee: 0,
  },
  {
    id: 'square',
    name: 'Craft Show (Square Tap)',
    shortName: 'Craft Booth',
    description: '2.6% + $0.15 in-person tap-to-pay',
    commissionRate: 0,
    processingRate: 0.026,
    fixedFee: 0.15,
    listingFee: 0,
  },
  {
    id: 'cash',
    name: 'Direct Cash / Venmo / Zelle',
    shortName: 'Cash / Direct',
    description: '0% platform fees',
    commissionRate: 0,
    processingRate: 0,
    fixedFee: 0,
    listingFee: 0,
  },
];

export interface FeeEvaluation {
  listingPrice: number;
  shippingCharged: number;
  shippingActualCost: number;
  shippingNetDiff: number;
  platformCommissionFee: number;
  paymentProcessingFee: number;
  fixedAndListingFees: number;
  offsiteAdsFee: number;
  totalPlatformFees: number;
  netPayoutAfterFees: number;
  trueUnitCost: number;
  hardOutOfPocketCost: number;
  netProfit: number;
  profitOverHardCost: number;
  netMarginPercent: number;
  roiPercent: number;
  effectiveHourlyProfitPerPrintHour: number;
  effectiveHourlyWageForHandsOn: number;
}

export interface ThreeTierPricingResult {
  marketplace: MarketplacePreset;
  /** Tier 1: Break-Even / Live Auction Minimum Floor */
  breakEvenPrice: number;
  /** Whole-dollar minimum live auction starting bid that never loses money */
  auctionFloorWholeDollar: number;
  /** Hard-cost cash floor (covers filament, electricity, wear, BOM, packaging, fees — before owner labor) */
  hardCashFloorPrice: number;

  /** Tier 2: Wholesale B2B Price (Direct to shops) */
  wholesalePrice: number;
  wholesaleNetProfit: number;
  wholesaleMarginPercent: number;

  /** Tier 3: Recommended Retail / Marketplace Listing Price */
  retailEvaluation: FeeEvaluation;
  /** Suggested psychological retail price (e.g. rounded to .99 or whole dollar) */
  suggestedRoundedRetailPrice: number;

  /** Batch plate totals (for plateQuantity units) */
  plateTotalRevenue: number;
  plateTotalCost: number;
  plateTotalFees: number;
  plateTotalNetProfit: number;
}

export function getMarketplacePreset(id: string): MarketplacePreset {
  return MARKETPLACE_PRESETS.find((m) => m.id === id) || MARKETPLACE_PRESETS[0];
}

export function evaluateListingPrice(
  listingPrice: number,
  unit: UnitCostBreakdown,
  input: PrintQuoteInput,
  marketplace: MarketplacePreset
): FeeEvaluation {
  const safePrice = Math.max(0, listingPrice);
  const shippingCharged = Math.max(0, input.shippingChargedToBuyer || 0);
  const shippingActualCost = Math.max(0, input.shippingActualCost || 0);
  const totalCollectedFromBuyer = safePrice + shippingCharged;

  const offsiteRate =
    marketplace.id === 'etsy' && input.etsyOffsiteAdsEnabled
      ? marketplace.offsiteAdsRate || 0
      : 0;

  // On Etsy/eBay/TikTok, commission & offsite ads apply to total collected (item + shipping)
  const commissionAppliesToShipping =
    marketplace.id === 'etsy' || marketplace.id === 'ebay' || marketplace.id === 'tiktok';

  const commissionBase = commissionAppliesToShipping ? totalCollectedFromBuyer : safePrice;
  const platformCommissionFee = commissionBase * marketplace.commissionRate;
  const offsiteAdsFee = commissionBase * offsiteRate;
  const paymentProcessingFee = totalCollectedFromBuyer * marketplace.processingRate;
  const fixedAndListingFees =
    safePrice > 0 ? marketplace.fixedFee + marketplace.listingFee : 0;

  const totalPlatformFees =
    platformCommissionFee + offsiteAdsFee + paymentProcessingFee + fixedAndListingFees;

  const shippingNetDiff = shippingCharged - shippingActualCost;
  const netPayoutAfterFees = safePrice + shippingNetDiff - totalPlatformFees;

  const netProfit = netPayoutAfterFees - unit.trueUnitCost;
  const profitOverHardCost = netPayoutAfterFees - unit.hardOutOfPocketCost;

  const netMarginPercent = safePrice > 0 ? (netProfit / safePrice) * 100 : 0;
  const roiPercent = unit.trueUnitCost > 0 ? (netProfit / unit.trueUnitCost) * 100 : 0;

  const effectiveHourlyProfitPerPrintHour =
    unit.printHoursPerUnitEffective > 0 ? netProfit / unit.printHoursPerUnitEffective : 0;

  const handsOnMinutesPerUnit =
    (Math.max(0, input.prepMinutesPerPlate || 0) / Math.max(1, unit.batchSize)) +
    Math.max(0, input.postProcessMinutesPerUnit || 0);
  const handsOnHours = handsOnMinutesPerUnit / 60;
  // Total earnings to owner = built-in labor pay + net profit above true cost
  const totalOwnerEarnings = unit.totalLaborCost + netProfit;
  const effectiveHourlyWageForHandsOn =
    handsOnHours > 0 ? totalOwnerEarnings / handsOnHours : totalOwnerEarnings;

  return {
    listingPrice: safePrice,
    shippingCharged,
    shippingActualCost,
    shippingNetDiff,
    platformCommissionFee,
    paymentProcessingFee,
    fixedAndListingFees,
    offsiteAdsFee,
    totalPlatformFees,
    netPayoutAfterFees,
    trueUnitCost: unit.trueUnitCost,
    hardOutOfPocketCost: unit.hardOutOfPocketCost,
    netProfit,
    profitOverHardCost,
    netMarginPercent,
    roiPercent,
    effectiveHourlyProfitPerPrintHour,
    effectiveHourlyWageForHandsOn,
  };
}

/**
 * Solves for the exact listing price needed to achieve `targetNetProfit` after all marketplace fees and shipping.
 */
export function solvePriceForTargetNetProfit(
  targetNetProfit: number,
  baseCostToCover: number,
  input: PrintQuoteInput,
  marketplace: MarketplacePreset
): number {
  const shippingCharged = Math.max(0, input.shippingChargedToBuyer || 0);
  const shippingActualCost = Math.max(0, input.shippingActualCost || 0);
  const offsiteRate =
    marketplace.id === 'etsy' && input.etsyOffsiteAdsEnabled
      ? marketplace.offsiteAdsRate || 0
      : 0;

  const commissionAppliesToShipping =
    marketplace.id === 'etsy' || marketplace.id === 'ebay' || marketplace.id === 'tiktok';

  const rateOnItem =
    marketplace.commissionRate + offsiteRate + marketplace.processingRate;
  const rateOnShipping = commissionAppliesToShipping
    ? marketplace.commissionRate + offsiteRate + marketplace.processingRate
    : marketplace.processingRate;

  const fixedFees = marketplace.fixedFee + marketplace.listingFee;
  const denominator = Math.max(0.05, 1 - rateOnItem);

  const numerator =
    targetNetProfit +
    baseCostToCover +
    fixedFees +
    shippingActualCost -
    shippingCharged * (1 - rateOnShipping);

  return Math.max(0, numerator / denominator);
}

/**
 * Solves for the exact listing price needed to achieve `targetMarginPercent` (Net Profit / Listing Price).
 */
export function solvePriceForTargetMargin(
  targetMarginPercent: number,
  baseCostToCover: number,
  input: PrintQuoteInput,
  marketplace: MarketplacePreset
): number {
  const shippingCharged = Math.max(0, input.shippingChargedToBuyer || 0);
  const shippingActualCost = Math.max(0, input.shippingActualCost || 0);
  const offsiteRate =
    marketplace.id === 'etsy' && input.etsyOffsiteAdsEnabled
      ? marketplace.offsiteAdsRate || 0
      : 0;

  const commissionAppliesToShipping =
    marketplace.id === 'etsy' || marketplace.id === 'ebay' || marketplace.id === 'tiktok';

  const rateOnItem =
    marketplace.commissionRate + offsiteRate + marketplace.processingRate;
  const rateOnShipping = commissionAppliesToShipping
    ? marketplace.commissionRate + offsiteRate + marketplace.processingRate
    : marketplace.processingRate;

  const clampedMargin = Math.min(0.75, Math.max(0, targetMarginPercent / 100));
  const fixedFees = marketplace.fixedFee + marketplace.listingFee;
  const denominator = Math.max(0.05, 1 - rateOnItem - clampedMargin);

  const numerator =
    baseCostToCover + fixedFees + shippingActualCost - shippingCharged * (1 - rateOnShipping);

  return Math.max(0, numerator / denominator);
}

export function calculateThreeTierPricing(
  unit: UnitCostBreakdown,
  input: PrintQuoteInput
): ThreeTierPricingResult {
  const marketplace = getMarketplacePreset(input.marketplaceId);

  // Tier 1: Break-Even Floor (0 net profit above trueUnitCost)
  const breakEvenPrice = solvePriceForTargetNetProfit(
    0,
    unit.trueUnitCost,
    input,
    marketplace
  );
  const hardCashFloorPrice = solvePriceForTargetNetProfit(
    0,
    unit.hardOutOfPocketCost,
    input,
    marketplace
  );
  const auctionFloorWholeDollar = Math.max(1, Math.ceil(breakEvenPrice));

  // Tier 2: Wholesale Price (B2B direct multiplier)
  const wholesaleMult = Math.max(1.1, input.wholesaleMultiplier || 2.0);
  const wholesalePrice = unit.trueUnitCost * wholesaleMult;
  const wholesaleNetProfit = wholesalePrice - unit.trueUnitCost;
  const wholesaleMarginPercent =
    wholesalePrice > 0 ? (wholesaleNetProfit / wholesalePrice) * 100 : 0;

  // Tier 3: Retail / Marketplace Price based on selected pricing mode
  let targetRetailPrice = 0;
  switch (input.pricingMode) {
    case 'targetProfit': {
      targetRetailPrice = solvePriceForTargetNetProfit(
        Math.max(0, input.targetNetProfitPerUnit || 0),
        unit.trueUnitCost,
        input,
        marketplace
      );
      break;
    }
    case 'targetMargin': {
      targetRetailPrice = solvePriceForTargetMargin(
        Math.max(0, input.targetMarginPercent || 50),
        unit.trueUnitCost,
        input,
        marketplace
      );
      break;
    }
    case 'customPrice': {
      targetRetailPrice = Math.max(0, input.customRetailPrice || 0);
      break;
    }
    case 'multiplier':
    default: {
      const retailMult = Math.max(1.1, input.retailMultiplier || 3.2);
      const desiredPreFeeProfit = unit.trueUnitCost * (retailMult - 1);
      targetRetailPrice = solvePriceForTargetNetProfit(
        desiredPreFeeProfit,
        unit.trueUnitCost,
        input,
        marketplace
      );
      break;
    }
  }

  const retailEvaluation = evaluateListingPrice(
    targetRetailPrice,
    unit,
    input,
    marketplace
  );

  const suggestedRoundedRetailPrice =
    targetRetailPrice > 1 ? Math.ceil(targetRetailPrice) - 0.01 : Math.ceil(targetRetailPrice);

  const batchQty = Math.max(1, unit.batchSize);
  const plateTotalRevenue = retailEvaluation.listingPrice * batchQty;
  const plateTotalCost = unit.trueUnitCost * batchQty;
  const plateTotalFees = retailEvaluation.totalPlatformFees * batchQty;
  const plateTotalNetProfit = retailEvaluation.netProfit * batchQty;

  return {
    marketplace,
    breakEvenPrice,
    auctionFloorWholeDollar,
    hardCashFloorPrice,
    wholesalePrice,
    wholesaleNetProfit,
    wholesaleMarginPercent,
    retailEvaluation,
    suggestedRoundedRetailPrice,
    plateTotalRevenue,
    plateTotalCost,
    plateTotalFees,
    plateTotalNetProfit,
  };
}

