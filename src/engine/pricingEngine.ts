export type MaterialType =
  | 'PLA'
  | 'Matte PLA'
  | 'Silk PLA'
  | 'PLA+'
  | 'PLA-CF'
  | 'PETG'
  | 'PETG-CF'
  | 'TPU'
  | 'ABS'
  | 'ASA'
  | 'PA-CF'
  | 'Resin';

export interface PrinterProfile {
  id: string;
  name: string;
  brand: string;
  powerWatts: number;
  purchasePrice: number;
  lifespanHours: number;
  maintenancePerHour: number;
  maxPlateCapacityHint?: number;
}

export interface FilamentSpool {
  id: string;
  name: string;
  brand: string;
  material: MaterialType;
  colorName: string;
  colorHex: string;
  spoolPrice: number;
  spoolWeightGrams: number;
  remainingGrams: number;
  lowStockThresholdGrams: number;
}

export interface HardwareItem {
  id: string;
  name: string;
  category: 'magnet' | 'insert' | 'keyring' | 'fastener' | 'electronics' | 'packaging' | 'other';
  packPrice: number;
  packQuantity: number;
}

export interface FilamentSlotUsage {
  slotIndex: number; // 1 = A1, 2 = A2, 3 = A3, 4 = A4
  spoolId: string;
  label?: string;
  colorHex?: string;
  costPerKgOverride?: number;
  /** Model weight in grams for a SINGLE unit */
  modelGramsPerUnit: number;
  /** Support weight in grams for a SINGLE unit */
  supportGramsPerUnit: number;
  /** AMS purge/flush ("poop") + prime tower grams per PLATE (shared across all items on the plate) */
  purgeGramsPerPlate: number;
}

export interface BomLineItem {
  id: string;
  hardwareId?: string;
  name: string;
  unitCost: number;
  quantityPerUnit: number;
}

export type PricingMode = 'multiplier' | 'targetProfit' | 'targetMargin' | 'customPrice';

export interface PrintQuoteInput {
  id?: string;
  productName: string;
  sku: string;
  category: string;
  notes?: string;

  printerId: string;
  electricityRatePerKwh: number;

  /** Print time for 1 unit (excluding fixed bed warmup/leveling) */
  printHoursPerUnit: number;
  printMinutesPerUnit: number;
  /** Fixed bed warmup, auto-leveling, and AMS filament calibration minutes per plate (shared across batch) */
  plateWarmupMinutes: number;
  /** Extra print time minutes per color swap layer across the plate (if not already in print time) */
  plateColorSwapMinutes: number;

  /** Number of units on a full batch plate */
  plateQuantity: number;

  filamentSlots: FilamentSlotUsage[];
  bomItems: BomLineItem[];
  packagingCostPerUnit: number;

  /** Hands-on plate prep & clearing minutes per plate (amortized across batch) */
  prepMinutesPerPlate: number;
  /** Hands-on support removal, assembly, and packing minutes per unit */
  postProcessMinutesPerUnit: number;
  laborRatePerHour: number;

  /** Failure / scrap rate percentage (e.g. 5 = 5% buffer) */
  scrapRatePercent: number;

  /** Pricing strategy controls */
  pricingMode: PricingMode;
  wholesaleMultiplier: number;
  retailMultiplier: number;
  targetNetProfitPerUnit: number;
  targetMarginPercent: number;
  customRetailPrice: number;

  marketplaceId: string;
  etsyOffsiteAdsEnabled: boolean;
  shippingChargedToBuyer: number;
  shippingActualCost: number;
}

export interface UnitCostBreakdown {
  batchSize: number;
  printHoursPerUnitEffective: number;

  // Grams per unit
  modelGramsPerUnit: number;
  supportGramsPerUnit: number;
  purgeGramsPerUnit: number;
  totalGramsPerUnit: number;
  totalGramsForPlate: number;

  // Cost components per unit ($)
  modelFilamentCost: number;
  supportFilamentCost: number;
  purgeFilamentCost: number;
  totalFilamentCost: number;

  electricityCost: number;
  printerDepreciationCost: number;
  printerMaintenanceCost: number;
  totalMachineCost: number;

  hardwareBomCost: number;
  packagingCost: number;
  platePrepLaborCost: number;
  postProcessLaborCost: number;
  totalLaborCost: number;

  subtotalBeforeScrap: number;
  scrapBufferCost: number;
  /** True landed production cost per unit including labor, machine, filament, BOM, and scrap */
  trueUnitCost: number;
  /** Hard out-of-pocket material + machine + packaging cost (excluding owner labor) */
  hardOutOfPocketCost: number;
}

export interface FullPricingAnalysis {
  singleUnit: UnitCostBreakdown;
  batchUnit: UnitCostBreakdown;
  activeUnit: UnitCostBreakdown; // Uses batchUnit if plateQuantity > 1, else singleUnit
  savingsPerUnitInBatch: number;
  savingsPercentInBatch: number;
  purgeWastePercentSingle: number;
  purgeWastePercentBatch: number;
  spoolWarnings: Array<{
    spoolId: string;
    spoolName: string;
    requiredPlateGrams: number;
    remainingGrams: number;
    shortfallGrams: number;
  }>;
}

export function getSpoolCostPerGram(spool?: FilamentSpool, overridePerKg?: number): number {
  if (typeof overridePerKg === 'number' && overridePerKg > 0) {
    return overridePerKg / 1000;
  }
  if (!spool || spool.spoolWeightGrams <= 0) {
    return 0.022; // Default $22/kg
  }
  return spool.spoolPrice / spool.spoolWeightGrams;
}

export function calculateUnitBreakdown(
  input: PrintQuoteInput,
  batchSize: number,
  printer: PrinterProfile,
  spools: FilamentSpool[]
): UnitCostBreakdown {
  const safeBatch = Math.max(1, Math.round(batchSize));
  const spoolMap = new Map(spools.map((s) => [s.id, s]));

  let modelGramsPerUnit = 0;
  let supportGramsPerUnit = 0;
  let purgeGramsPerUnit = 0;

  let modelFilamentCost = 0;
  let supportFilamentCost = 0;
  let purgeFilamentCost = 0;

  for (const slot of input.filamentSlots) {
    const spool = spoolMap.get(slot.spoolId);
    const costPerGram = getSpoolCostPerGram(spool, slot.costPerKgOverride);

    const mGrams = Math.max(0, slot.modelGramsPerUnit || 0);
    const sGrams = Math.max(0, slot.supportGramsPerUnit || 0);
    const pGramsPerPlate = Math.max(0, slot.purgeGramsPerPlate || 0);
    const pGramsPerUnit = pGramsPerPlate / safeBatch;

    modelGramsPerUnit += mGrams;
    supportGramsPerUnit += sGrams;
    purgeGramsPerUnit += pGramsPerUnit;

    modelFilamentCost += mGrams * costPerGram;
    supportFilamentCost += sGrams * costPerGram;
    purgeFilamentCost += pGramsPerUnit * costPerGram;
  }

  const totalGramsPerUnit = modelGramsPerUnit + supportGramsPerUnit + purgeGramsPerUnit;
  const totalGramsForPlate = totalGramsPerUnit * safeBatch;
  const totalFilamentCost = modelFilamentCost + supportFilamentCost + purgeFilamentCost;

  // Print time per unit:
  // Base unit time + amortized plate warmup & AMS color-swap overhead
  const unitPrintMinutesBase =
    Math.max(0, input.printHoursPerUnit || 0) * 60 + Math.max(0, input.printMinutesPerUnit || 0);
  const sharedPlateMinutes =
    Math.max(0, input.plateWarmupMinutes || 0) + Math.max(0, input.plateColorSwapMinutes || 0);
  const effectiveMinutesPerUnit = unitPrintMinutesBase + sharedPlateMinutes / safeBatch;
  const printHoursPerUnitEffective = effectiveMinutesPerUnit / 60;

  // Machine costs
  const kw = Math.max(0, printer.powerWatts) / 1000;
  const electricityCost =
    kw * printHoursPerUnitEffective * Math.max(0, input.electricityRatePerKwh || 0);
  const depreciationPerHour =
    printer.lifespanHours > 0 ? Math.max(0, printer.purchasePrice) / printer.lifespanHours : 0;
  const printerDepreciationCost = depreciationPerHour * printHoursPerUnitEffective;
  const printerMaintenanceCost =
    Math.max(0, printer.maintenancePerHour) * printHoursPerUnitEffective;
  const totalMachineCost = electricityCost + printerDepreciationCost + printerMaintenanceCost;

  // Hardware BOM & Packaging
  const hardwareBomCost = (input.bomItems || []).reduce(
    (sum, item) => sum + Math.max(0, item.unitCost || 0) * Math.max(0, item.quantityPerUnit || 0),
    0
  );
  const packagingCost = Math.max(0, input.packagingCostPerUnit || 0);

  // Labor
  const laborRatePerMinute = Math.max(0, input.laborRatePerHour || 0) / 60;
  const platePrepLaborCost =
    (Math.max(0, input.prepMinutesPerPlate || 0) / safeBatch) * laborRatePerMinute;
  const postProcessLaborCost =
    Math.max(0, input.postProcessMinutesPerUnit || 0) * laborRatePerMinute;
  const totalLaborCost = platePrepLaborCost + postProcessLaborCost;

  const subtotalBeforeScrap =
    totalFilamentCost + totalMachineCost + hardwareBomCost + packagingCost + totalLaborCost;
  const scrapMultiplier = Math.max(0, input.scrapRatePercent || 0) / 100;
  // Scrap applies to filament, machine time, and plate prep
  const scrapRiskBase = totalFilamentCost + totalMachineCost + platePrepLaborCost;
  const scrapBufferCost = scrapRiskBase * scrapMultiplier;

  const trueUnitCost = subtotalBeforeScrap + scrapBufferCost;
  const hardOutOfPocketCost =
    totalFilamentCost +
    totalMachineCost +
    hardwareBomCost +
    packagingCost +
    (totalFilamentCost + totalMachineCost) * scrapMultiplier;

  return {
    batchSize: safeBatch,
    printHoursPerUnitEffective,
    modelGramsPerUnit,
    supportGramsPerUnit,
    purgeGramsPerUnit,
    totalGramsPerUnit,
    totalGramsForPlate,
    modelFilamentCost,
    supportFilamentCost,
    purgeFilamentCost,
    totalFilamentCost,
    electricityCost,
    printerDepreciationCost,
    printerMaintenanceCost,
    totalMachineCost,
    hardwareBomCost,
    packagingCost,
    platePrepLaborCost,
    postProcessLaborCost,
    totalLaborCost,
    subtotalBeforeScrap,
    scrapBufferCost,
    trueUnitCost,
    hardOutOfPocketCost,
  };
}

export function analyzePrintQuote(
  input: PrintQuoteInput,
  printer: PrinterProfile,
  spools: FilamentSpool[]
): FullPricingAnalysis {
  const singleUnit = calculateUnitBreakdown(input, 1, printer, spools);
  const batchUnit = calculateUnitBreakdown(input, input.plateQuantity, printer, spools);
  const activeUnit = input.plateQuantity > 1 ? batchUnit : singleUnit;

  const savingsPerUnitInBatch = Math.max(0, singleUnit.trueUnitCost - batchUnit.trueUnitCost);
  const savingsPercentInBatch =
    singleUnit.trueUnitCost > 0 ? (savingsPerUnitInBatch / singleUnit.trueUnitCost) * 100 : 0;

  const purgeWastePercentSingle =
    singleUnit.totalGramsPerUnit > 0
      ? ((singleUnit.purgeGramsPerUnit + singleUnit.supportGramsPerUnit) /
          singleUnit.totalGramsPerUnit) *
        100
      : 0;
  const purgeWastePercentBatch =
    batchUnit.totalGramsPerUnit > 0
      ? ((batchUnit.purgeGramsPerUnit + batchUnit.supportGramsPerUnit) /
          batchUnit.totalGramsPerUnit) *
        100
      : 0;

  // Check if any spool has insufficient remaining filament for a full plate
  const spoolMap = new Map(spools.map((s) => [s.id, s]));
  const reqBySpool = new Map<string, number>();
  const safeBatch = Math.max(1, Math.round(input.plateQuantity));

  for (const slot of input.filamentSlots) {
    if (!slot.spoolId) continue;
    const plateGramsForSlot =
      (Math.max(0, slot.modelGramsPerUnit) + Math.max(0, slot.supportGramsPerUnit)) * safeBatch +
      Math.max(0, slot.purgeGramsPerPlate);
    if (plateGramsForSlot > 0) {
      reqBySpool.set(slot.spoolId, (reqBySpool.get(slot.spoolId) || 0) + plateGramsForSlot);
    }
  }

  const spoolWarnings: FullPricingAnalysis['spoolWarnings'] = [];
  for (const [spoolId, requiredPlateGrams] of reqBySpool.entries()) {
    const spool = spoolMap.get(spoolId);
    if (spool && requiredPlateGrams > spool.remainingGrams) {
      spoolWarnings.push({
        spoolId,
        spoolName: `${spool.brand} ${spool.colorName} (${spool.material})`,
        requiredPlateGrams,
        remainingGrams: spool.remainingGrams,
        shortfallGrams: requiredPlateGrams - spool.remainingGrams,
      });
    }
  }

  return {
    singleUnit,
    batchUnit,
    activeUnit,
    savingsPerUnitInBatch,
    savingsPercentInBatch,
    purgeWastePercentSingle,
    purgeWastePercentBatch,
    spoolWarnings,
  };
}

