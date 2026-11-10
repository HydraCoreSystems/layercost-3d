import { describe, it, expect } from 'vitest';
import { analyzePrintQuote } from '../pricingEngine';
import {
  calculateThreeTierPricing,
  evaluateListingPrice,
  getMarketplacePreset,
  solvePriceForTargetNetProfit,
} from '../marketplaceFees';
import { parseGcodeContent, parseSlicerPreviewText } from '../slicerParser';
import {
  DEFAULT_CURRENT_QUOTE,
  DEFAULT_PRINTERS,
  DEFAULT_SPOOLS,
} from '../../store/useLayerCostStore';

describe('LayerCost 3D Pricing Engine', () => {
  it('amortizes AMS multicolor purge and plate warmup across full-plate batches', () => {
    const quote = {
      ...DEFAULT_CURRENT_QUOTE,
      plateQuantity: 8,
    };
    const result = analyzePrintQuote(quote, DEFAULT_PRINTERS[0], DEFAULT_SPOOLS);

    expect(result.singleUnit.batchSize).toBe(1);
    expect(result.batchUnit.batchSize).toBe(8);

    // Purge per unit on 8-unit plate should be 1/8th of single unit purge
    expect(result.batchUnit.purgeGramsPerUnit).toBeCloseTo(
      result.singleUnit.purgeGramsPerUnit / 8,
      2
    );

    // Batch unit cost must be strictly lower than single unit cost
    expect(result.batchUnit.trueUnitCost).toBeLessThan(
      result.singleUnit.trueUnitCost
    );
    expect(result.savingsPerUnitInBatch).toBeGreaterThan(0);
    expect(result.savingsPercentInBatch).toBeGreaterThan(5);
  });

  it('solves reverse marketplace fees accurately for Etsy and Whatnot', () => {
    const quote = {
      ...DEFAULT_CURRENT_QUOTE,
      marketplaceId: 'etsy',
      etsyOffsiteAdsEnabled: false,
      shippingChargedToBuyer: 5.0,
      shippingActualCost: 5.0,
    };
    const analysis = analyzePrintQuote(quote, DEFAULT_PRINTERS[0], DEFAULT_SPOOLS);
    const etsyPreset = getMarketplacePreset('etsy');
    const targetProfit = 12.0;

    const solvedPrice = solvePriceForTargetNetProfit(
      targetProfit,
      analysis.activeUnit.trueUnitCost,
      quote,
      etsyPreset
    );
    const evalResult = evaluateListingPrice(
      solvedPrice,
      analysis.activeUnit,
      quote,
      etsyPreset
    );

    expect(evalResult.netProfit).toBeCloseTo(targetProfit, 2);

    // Enabling Etsy 15% Offsite Ads should require a higher retail price for the same profit
    const solvedWithOffsiteAds = solvePriceForTargetNetProfit(
      targetProfit,
      analysis.activeUnit.trueUnitCost,
      { ...quote, etsyOffsiteAdsEnabled: true },
      etsyPreset
    );
    expect(solvedWithOffsiteAds).toBeGreaterThan(solvedPrice);

    // 3-Tier Pricing output check
    const tiers = calculateThreeTierPricing(analysis.activeUnit, {
      ...quote,
      marketplaceId: 'whatnot',
      wholesaleMultiplier: 2.0,
      retailMultiplier: 3.2,
    });

    expect(tiers.auctionFloorWholeDollar).toBeGreaterThanOrEqual(
      Math.ceil(tiers.breakEvenPrice)
    );
    expect(tiers.wholesalePrice).toBeCloseTo(
      analysis.activeUnit.trueUnitCost * 2.0,
      2
    );
    expect(tiers.suggestedRoundedRetailPrice).toBeGreaterThan(
      tiers.wholesalePrice
    );
  });

  it('parses Bambu Studio / OrcaSlicer G-code comments and slicer screen text', () => {
    const sampleGcode = `
; header
; filament used [g] = 114.5, 36.2
; total filament used for wipe tower [g] = 24.0
; estimated printing time (normal mode) = 3h 42m 10s
`;
    const parsedGcode = parseGcodeContent(
      sampleGcode,
      'articulated_dragon_plate1.gcode'
    );
    expect(parsedGcode.filaments.map((f) => f.usedGrams)).toEqual([114.5, 36.2]);
    expect(parsedGcode.totalPurgeGrams).toBe(24.0);
    expect(parsedGcode.printHours).toBe(3);
    expect(parsedGcode.printMinutes).toBe(42);

    const sampleOcr = `
Bambu Studio Preview
Model: 88.4 g
Flushed: 31.2 g
Support: 6.5 g
Total print time: 2h 19m
`;
    const parsedOcr = parseSlicerPreviewText(sampleOcr);
    expect(parsedOcr.totalModelGrams).toBeCloseTo(88.4, 1);
    expect(parsedOcr.totalPurgeGrams).toBeCloseTo(31.2, 1);
    expect(parsedOcr.totalSupportGrams).toBeCloseTo(6.5, 1);
    expect(parsedOcr.printHours).toBe(2);
    expect(parsedOcr.printMinutes).toBe(19);
  });
});
