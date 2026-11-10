import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  FilamentSpool,
  HardwareItem,
  PrinterProfile,
  PrintQuoteInput,
} from '../engine/pricingEngine';

import {
  createDebouncedSaver,
  getKvBackend,
  getKvStorage,
  subscribeToAppLeave,
  type DebouncedSaver,
} from './kvStorage';

export type MembershipTier = 'free' | 'pro' | 'studio';
export type ThemeMode = 'dark' | 'light';

export interface ShopSettings {
  shopName: string;
  ownerName: string;
  locationRegion: string;
  currencySymbol: string;
  defaultElectricityRate: number;
  defaultLaborRate: number;
  defaultScrapRate: number;
  defaultRetailMultiplier: number;
  quoteFooterNote: string;
  themeMode: ThemeMode;
  showSplashOnStart: boolean;
}

export const DEFAULT_SETTINGS: ShopSettings = {
  shopName: 'LayerCost 3D Studio',
  ownerName: 'Studio Maker',
  locationRegion: 'US National Average',
  currencySymbol: '$',
  defaultElectricityRate: 0.14,
  defaultLaborRate: 22,
  defaultScrapRate: 5,
  defaultRetailMultiplier: 3.2,
  quoteFooterNote:
    'Thank you for supporting our 3D print studio! Custom colors & bulk orders available.',
  themeMode: 'dark',
  showSplashOnStart: true,
};

export interface CompletedPrintJob {
  id: string;
  dateIso: string;
  productName: string;
  sku: string;
  marketplaceName: string;
  unitsSold: number;
  totalGramsDeducted: number;
  grossRevenue: number;
  platformFees: number;
  productionCost: number;
  netProfit: number;
}

export const DEFAULT_PRINTERS: PrinterProfile[] = [
  {
    id: 'bambu-p1s-ams',
    name: 'Bambu Lab P1S + AMS',
    brand: 'Bambu Lab',
    powerWatts: 135,
    purchasePrice: 849,
    lifespanHours: 4000,
    maintenancePerHour: 0.12,
    maxPlateCapacityHint: 12,
  },
  {
    id: 'bambu-x1c-ams',
    name: 'Bambu Lab X1 Carbon + AMS',
    brand: 'Bambu Lab',
    powerWatts: 150,
    purchasePrice: 1449,
    lifespanHours: 4500,
    maintenancePerHour: 0.15,
    maxPlateCapacityHint: 12,
  },
  {
    id: 'bambu-a1-combo',
    name: 'Bambu Lab A1 + AMS Lite',
    brand: 'Bambu Lab',
    powerWatts: 120,
    purchasePrice: 489,
    lifespanHours: 3500,
    maintenancePerHour: 0.1,
    maxPlateCapacityHint: 12,
  },
  {
    id: 'bambu-a1-mini',
    name: 'Bambu Lab A1 Mini',
    brand: 'Bambu Lab',
    powerWatts: 95,
    purchasePrice: 299,
    lifespanHours: 3500,
    maintenancePerHour: 0.08,
    maxPlateCapacityHint: 6,
  },
  {
    id: 'prusa-mk4',
    name: 'Prusa MK4 / MK3S+',
    brand: 'Prusa Research',
    powerWatts: 110,
    purchasePrice: 799,
    lifespanHours: 5000,
    maintenancePerHour: 0.09,
    maxPlateCapacityHint: 10,
  },
];

export const DEFAULT_SPOOLS: FilamentSpool[] = [
  {
    id: 'spool-bambu-matte-charcoal',
    name: 'Matte Charcoal Black',
    brand: 'Bambu Lab',
    material: 'Matte PLA',
    colorName: 'Charcoal Black',
    colorHex: '#27272A',
    spoolPrice: 19.99,
    spoolWeightGrams: 1000,
    remainingGrams: 740,
    lowStockThresholdGrams: 180,
  },
  {
    id: 'spool-bambu-jade-white',
    name: 'Basic Jade White',
    brand: 'Bambu Lab',
    material: 'PLA',
    colorName: 'Jade White',
    colorHex: '#F4F4F5',
    spoolPrice: 18.99,
    spoolWeightGrams: 1000,
    remainingGrams: 615,
    lowStockThresholdGrams: 180,
  },
  {
    id: 'spool-polymaker-forest-green',
    name: 'PolyTerra Forest Green',
    brand: 'Polymaker',
    material: 'Matte PLA',
    colorName: 'Forest Green',
    colorHex: '#15803D',
    spoolPrice: 21.99,
    spoolWeightGrams: 1000,
    remainingGrams: 820,
    lowStockThresholdGrams: 180,
  },
  {
    id: 'spool-sunlu-silk-gold',
    name: 'Silk Gold Metallic',
    brand: 'SUNLU',
    material: 'Silk PLA',
    colorName: 'Silk Gold',
    colorHex: '#EAB308',
    spoolPrice: 23.99,
    spoolWeightGrams: 1000,
    remainingGrams: 490,
    lowStockThresholdGrams: 150,
  },
  {
    id: 'spool-elegoo-petg-black',
    name: 'Rapid PETG Black',
    brand: 'ELEGOO',
    material: 'PETG',
    colorName: 'Jet Black',
    colorHex: '#18181B',
    spoolPrice: 16.99,
    spoolWeightGrams: 1000,
    remainingGrams: 890,
    lowStockThresholdGrams: 180,
  },
  {
    id: 'spool-terracotta-pla',
    name: 'Matte Terracotta Clay',
    brand: 'Bambu Lab',
    material: 'Matte PLA',
    colorName: 'Terracotta',
    colorHex: '#C2410C',
    spoolPrice: 20.99,
    spoolWeightGrams: 1000,
    remainingGrams: 145,
    lowStockThresholdGrams: 180,
  },
];

export const DEFAULT_HARDWARE: HardwareItem[] = [
  {
    id: 'hw-mag-6x2',
    name: 'Neodymium Magnet 6x2mm',
    category: 'magnet',
    packPrice: 8.99,
    packQuantity: 100,
  },
  {
    id: 'hw-mag-8x3',
    name: 'Neodymium Magnet 8x3mm',
    category: 'magnet',
    packPrice: 11.5,
    packQuantity: 60,
  },
  {
    id: 'hw-insert-m3',
    name: 'M3 Brass Heat-Set Insert',
    category: 'insert',
    packPrice: 9.99,
    packQuantity: 100,
  },
  {
    id: 'hw-keyring-chain',
    name: '25mm Split Keyring + Chain',
    category: 'keyring',
    packPrice: 7.99,
    packQuantity: 50,
  },
  {
    id: 'hw-led-tealight',
    name: 'USB/Battery Warm LED Puck',
    category: 'electronics',
    packPrice: 14.99,
    packQuantity: 12,
  },
  {
    id: 'hw-box-6x6x6',
    name: '6x6x6 Kraft Corrugated Mailer + Bubble',
    category: 'packaging',
    packPrice: 21.0,
    packQuantity: 25,
  },
];

export const DEFAULT_CURRENT_QUOTE: PrintQuoteInput = {
  id: 'quote-default-planter',
  productName: 'Mid-Century Ribbed Self-Watering Planter (4")',
  sku: '3D-PLN-004',
  category: 'Planters & Botanical',
  notes: '2-color AMS print with inner reservoir insert and drainage lip.',
  printerId: 'bambu-p1s-ams',
  electricityRatePerKwh: 0.14,
  printHoursPerUnit: 3,
  printMinutesPerUnit: 25,
  plateWarmupMinutes: 7,
  plateColorSwapMinutes: 18,
  plateQuantity: 4,
  filamentSlots: [
    {
      slotIndex: 1,
      spoolId: 'spool-polymaker-forest-green',
      modelGramsPerUnit: 112,
      supportGramsPerUnit: 4,
      purgeGramsPerPlate: 28,
    },
    {
      slotIndex: 2,
      spoolId: 'spool-bambu-jade-white',
      modelGramsPerUnit: 38,
      supportGramsPerUnit: 0,
      purgeGramsPerPlate: 22,
    },
  ],
  bomItems: [],
  packagingCostPerUnit: 0.85,
  prepMinutesPerPlate: 6,
  postProcessMinutesPerUnit: 4,
  laborRatePerHour: 22,
  scrapRatePercent: 5,
  pricingMode: 'multiplier',
  wholesaleMultiplier: 2.0,
  retailMultiplier: 3.2,
  targetNetProfitPerUnit: 14.0,
  targetMarginPercent: 55,
  customRetailPrice: 26.99,
  marketplaceId: 'etsy',
  etsyOffsiteAdsEnabled: false,
  shippingChargedToBuyer: 5.99,
  shippingActualCost: 5.45,
};

export const DEFAULT_CATALOG: PrintQuoteInput[] = [
  DEFAULT_CURRENT_QUOTE,
  {
    id: 'cat-flexi-duck-ams',
    productName: 'Articulated Flexi Rubber Duck (3-Color AMS)',
    sku: '3D-FLX-DUCK',
    category: 'Articulated Fidgets',
    notes: 'High purge waste when printed solo; huge savings on 10-unit full plate!',
    printerId: 'bambu-p1s-ams',
    electricityRatePerKwh: 0.14,
    printHoursPerUnit: 1,
    printMinutesPerUnit: 10,
    plateWarmupMinutes: 7,
    plateColorSwapMinutes: 42,
    plateQuantity: 10,
    filamentSlots: [
      {
        slotIndex: 1,
        spoolId: 'spool-sunlu-silk-gold',
        modelGramsPerUnit: 28,
        supportGramsPerUnit: 0,
        purgeGramsPerPlate: 46,
      },
      {
        slotIndex: 2,
        spoolId: 'spool-terracotta-pla',
        modelGramsPerUnit: 6,
        supportGramsPerUnit: 0,
        purgeGramsPerPlate: 32,
      },
      {
        slotIndex: 3,
        spoolId: 'spool-bambu-matte-charcoal',
        modelGramsPerUnit: 3,
        supportGramsPerUnit: 0,
        purgeGramsPerPlate: 18,
      },
    ],
    bomItems: [
      {
        id: 'bom-kr-1',
        hardwareId: 'hw-keyring-chain',
        name: '25mm Split Keyring + Chain',
        unitCost: 0.16,
        quantityPerUnit: 1,
      },
    ],
    packagingCostPerUnit: 0.35,
    prepMinutesPerPlate: 5,
    postProcessMinutesPerUnit: 2,
    laborRatePerHour: 22,
    scrapRatePercent: 5,
    pricingMode: 'multiplier',
    wholesaleMultiplier: 2.0,
    retailMultiplier: 3.5,
    targetNetProfitPerUnit: 8.0,
    targetMarginPercent: 60,
    customRetailPrice: 12.99,
    marketplaceId: 'whatnot',
    etsyOffsiteAdsEnabled: false,
    shippingChargedToBuyer: 4.5,
    shippingActualCost: 4.5,
  },
  {
    id: 'cat-magnetic-moss-pole',
    productName: 'Modular Hex Moss Pole Section + Drip Cap',
    sku: '3D-MOSS-HEX',
    category: 'Grower Supplies',
    notes: 'PETG moisture-resistant build with magnetic alignment snaps.',
    printerId: 'bambu-a1-combo',
    electricityRatePerKwh: 0.14,
    printHoursPerUnit: 2,
    printMinutesPerUnit: 15,
    plateWarmupMinutes: 6,
    plateColorSwapMinutes: 0,
    plateQuantity: 6,
    filamentSlots: [
      {
        slotIndex: 1,
        spoolId: 'spool-elegoo-petg-black',
        modelGramsPerUnit: 78,
        supportGramsPerUnit: 3,
        purgeGramsPerPlate: 2,
      },
    ],
    bomItems: [
      {
        id: 'bom-mag-1',
        hardwareId: 'hw-mag-6x2',
        name: 'Neodymium Magnet 6x2mm',
        unitCost: 0.09,
        quantityPerUnit: 4,
      },
    ],
    packagingCostPerUnit: 0.65,
    prepMinutesPerPlate: 5,
    postProcessMinutesPerUnit: 3,
    laborRatePerHour: 22,
    scrapRatePercent: 4,
    pricingMode: 'targetProfit',
    wholesaleMultiplier: 2.0,
    retailMultiplier: 3.0,
    targetNetProfitPerUnit: 10.0,
    targetMarginPercent: 55,
    customRetailPrice: 18.99,
    marketplaceId: 'palmstreet',
    etsyOffsiteAdsEnabled: false,
    shippingChargedToBuyer: 5.0,
    shippingActualCost: 4.85,
  },
];

export const DEFAULT_COMPLETED_JOBS: CompletedPrintJob[] = [
  {
    id: 'job-1',
    dateIso: '2026-11-05T14:20:00.000Z',
    productName: 'Mid-Century Ribbed Self-Watering Planter (4")',
    sku: '3D-PLN-004',
    marketplaceName: 'Etsy',
    unitsSold: 4,
    totalGramsDeducted: 666,
    grossRevenue: 112.0,
    platformFees: 12.44,
    productionCost: 26.8,
    netProfit: 72.76,
  },
  {
    id: 'job-2',
    dateIso: '2026-11-06T19:45:00.000Z',
    productName: 'Articulated Flexi Rubber Duck (3-Color AMS)',
    sku: '3D-FLX-DUCK',
    marketplaceName: 'Whatnot',
    unitsSold: 10,
    totalGramsDeducted: 466,
    grossRevenue: 130.0,
    platformFees: 17.17,
    productionCost: 28.4,
    netProfit: 84.43,
  },
];

const STORAGE_KEY = 'layercost_3d_state_v1';

interface PersistedState {
  membershipTier: MembershipTier;
  onboardingCompleted: boolean;
  settings: ShopSettings;
  printers: PrinterProfile[];
  spools: FilamentSpool[];
  hardware: HardwareItem[];
  currentQuote: PrintQuoteInput;
  catalog: PrintQuoteInput[];
  completedJobs: CompletedPrintJob[];
}

interface LayerCostContextValue extends PersistedState {
  splashVisible: boolean;
  wizardVisible: boolean;
  dismissSplash: () => void;
  replaySplash: () => void;
  openSetupWizard: () => void;
  closeSetupWizard: () => void;
  updateSettings: (patch: Partial<ShopSettings>) => void;
  setPrintersList: (printers: PrinterProfile[]) => void;
  /** Called only by the billing layer after the store has verified what the user owns. */
  applyVerifiedMembershipTier: (tier: MembershipTier) => void;
  updateCurrentQuote: (patch: Partial<PrintQuoteInput>) => void;
  setCurrentQuoteFull: (quote: PrintQuoteInput) => void;
  saveCurrentToCatalog: () => PrintQuoteInput;
  deleteCatalogItem: (id: string) => void;
  loadCatalogItemIntoCalculator: (id: string) => void;
  addOrUpdatePrinter: (printer: PrinterProfile) => void;
  deletePrinter: (id: string) => void;
  addOrUpdateSpool: (spool: FilamentSpool) => void;
  refillSpool: (id: string, grams?: number) => void;
  deleteSpool: (id: string) => void;
  addOrUpdateHardware: (item: HardwareItem) => void;
  deleteHardware: (id: string) => void;
  logCompletedBatch: (entry: Omit<CompletedPrintJob, 'id' | 'dateIso'>, slotDeductions: Array<{ spoolId: string; grams: number }>) => void;
  resetDemoData: () => void;
}

const LayerCostContext = createContext<LayerCostContextValue | null>(null);

/**
 * Builds the in memory state from a saved JSON string, filling any gaps with defaults so
 * older saves keep loading. membershipTier in a save is never trusted: entitlement comes
 * from the App Store (see iapService), so every load starts at 'free' until the store
 * has verified a purchase. Saves from older builds carried a made up 'studio' tier.
 */
export function parsePersistedState(raw: string | null): PersistedState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      membershipTier: 'free',
      onboardingCompleted: Boolean(parsed.onboardingCompleted),
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      printers: Array.isArray(parsed.printers) && parsed.printers.length ? parsed.printers : DEFAULT_PRINTERS,
      spools: Array.isArray(parsed.spools) && parsed.spools.length ? parsed.spools : DEFAULT_SPOOLS,
      hardware: Array.isArray(parsed.hardware) && parsed.hardware.length ? parsed.hardware : DEFAULT_HARDWARE,
      currentQuote: parsed.currentQuote || DEFAULT_CURRENT_QUOTE,
      catalog: Array.isArray(parsed.catalog) && parsed.catalog.length ? parsed.catalog : DEFAULT_CATALOG,
      completedJobs: Array.isArray(parsed.completedJobs) ? parsed.completedJobs : DEFAULT_COMPLETED_JOBS,
    };
  } catch {
    return null;
  }
}

function loadInitialState(): PersistedState {
  const kv = getKvStorage();
  if (kv) {
    try {
      const loaded = parsePersistedState(kv.getItem(STORAGE_KEY));
      if (loaded) return loaded;
    } catch {
      // ignore storage errors
    }
  }
  return {
    membershipTier: 'free',
    onboardingCompleted: false,
    settings: DEFAULT_SETTINGS,
    printers: DEFAULT_PRINTERS,
    spools: DEFAULT_SPOOLS,
    hardware: DEFAULT_HARDWARE,
    currentQuote: DEFAULT_CURRENT_QUOTE,
    catalog: DEFAULT_CATALOG,
    completedJobs: DEFAULT_COMPLETED_JOBS,
  };
}

export function LayerCostProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(() => loadInitialState());
  const [splashVisible, setSplashVisible] = useState<boolean>(
    () => state.settings.showSplashOnStart !== false
  );
  const [wizardVisible, setWizardVisible] = useState<boolean>(false);

  const saverRef = useRef<DebouncedSaver | null>(null);

  useEffect(() => {
    const kv = getKvStorage();
    if (!kv) return undefined;
    // Native writes are batched because every calculator keystroke changes state.
    // Web keeps its original write on every change.
    const saver = createDebouncedSaver(kv, STORAGE_KEY, getKvBackend() === 'sqlite' ? 400 : 0);
    saverRef.current = saver;
    const unsubscribe = subscribeToAppLeave(saver.flush);
    return () => {
      unsubscribe();
      saver.flush();
      saverRef.current = null;
    };
  }, []);

  useEffect(() => {
    saverRef.current?.save(JSON.stringify(state));
  }, [state]);

  // Stable identity on purpose: the billing layer lists it as an effect dependency.
  const applyVerifiedMembershipTier = useCallback((membershipTier: MembershipTier) => {
    setState((prev) => (prev.membershipTier === membershipTier ? prev : { ...prev, membershipTier }));
  }, []);

  const updateCurrentQuote = (patch: Partial<PrintQuoteInput>) => {
    setState((prev) => ({
      ...prev,
      currentQuote: { ...prev.currentQuote, ...patch },
    }));
  };

  const setCurrentQuoteFull = (quote: PrintQuoteInput) => {
    setState((prev) => ({
      ...prev,
      currentQuote: { ...quote },
    }));
  };

  const saveCurrentToCatalog = (): PrintQuoteInput => {
    const id = state.currentQuote.id || `cat-${Date.now()}`;
    const saved: PrintQuoteInput = {
      ...state.currentQuote,
      id,
    };
    setState((prev) => {
      const exists = prev.catalog.some((c) => c.id === id);
      const nextCatalog = exists
        ? prev.catalog.map((c) => (c.id === id ? saved : c))
        : [saved, ...prev.catalog];
      return {
        ...prev,
        currentQuote: saved,
        catalog: nextCatalog,
      };
    });
    return saved;
  };

  const deleteCatalogItem = (id: string) => {
    setState((prev) => ({
      ...prev,
      catalog: prev.catalog.filter((c) => c.id !== id),
    }));
  };

  const loadCatalogItemIntoCalculator = (id: string) => {
    const found = state.catalog.find((c) => c.id === id);
    if (found) {
      setState((prev) => ({
        ...prev,
        currentQuote: JSON.parse(JSON.stringify(found)),
      }));
    }
  };

  const addOrUpdatePrinter = (printer: PrinterProfile) => {
    setState((prev) => {
      const exists = prev.printers.some((p) => p.id === printer.id);
      return {
        ...prev,
        printers: exists
          ? prev.printers.map((p) => (p.id === printer.id ? printer : p))
          : [...prev.printers, printer],
      };
    });
  };

  const deletePrinter = (id: string) => {
    setState((prev) => ({
      ...prev,
      printers: prev.printers.filter((p) => p.id !== id),
    }));
  };

  const addOrUpdateSpool = (spool: FilamentSpool) => {
    setState((prev) => {
      const exists = prev.spools.some((s) => s.id === spool.id);
      return {
        ...prev,
        spools: exists
          ? prev.spools.map((s) => (s.id === spool.id ? spool : s))
          : [...prev.spools, spool],
      };
    });
  };

  const refillSpool = (id: string, grams = 1000) => {
    setState((prev) => ({
      ...prev,
      spools: prev.spools.map((s) =>
        s.id === id ? { ...s, remainingGrams: grams, spoolWeightGrams: Math.max(s.spoolWeightGrams, grams) } : s
      ),
    }));
  };

  const deleteSpool = (id: string) => {
    setState((prev) => ({
      ...prev,
      spools: prev.spools.filter((s) => s.id !== id),
    }));
  };

  const addOrUpdateHardware = (item: HardwareItem) => {
    setState((prev) => {
      const exists = prev.hardware.some((h) => h.id === item.id);
      return {
        ...prev,
        hardware: exists
          ? prev.hardware.map((h) => (h.id === item.id ? item : h))
          : [...prev.hardware, item],
      };
    });
  };

  const deleteHardware = (id: string) => {
    setState((prev) => ({
      ...prev,
      hardware: prev.hardware.filter((h) => h.id !== id),
    }));
  };

  const logCompletedBatch: LayerCostContextValue['logCompletedBatch'] = (entry, slotDeductions) => {
    const newJob: CompletedPrintJob = {
      ...entry,
      id: `job-${Date.now()}`,
      dateIso: new Date().toISOString(),
    };
    setState((prev) => {
      const deductMap = new Map<string, number>();
      for (const d of slotDeductions) {
        if (d.spoolId && d.grams > 0) {
          deductMap.set(d.spoolId, (deductMap.get(d.spoolId) || 0) + d.grams);
        }
      }
      const nextSpools = prev.spools.map((spool) => {
        const used = deductMap.get(spool.id) || 0;
        if (used <= 0) return spool;
        return {
          ...spool,
          remainingGrams: Math.max(0, Math.round(spool.remainingGrams - used)),
        };
      });
      return {
        ...prev,
        spools: nextSpools,
        completedJobs: [newJob, ...prev.completedJobs],
      };
    });
  };

  const resetDemoData = () => {
    setState((prev) => ({
      membershipTier: prev.membershipTier,
      onboardingCompleted: true,
      settings: DEFAULT_SETTINGS,
      printers: DEFAULT_PRINTERS,
      spools: DEFAULT_SPOOLS,
      hardware: DEFAULT_HARDWARE,
      currentQuote: DEFAULT_CURRENT_QUOTE,
      catalog: DEFAULT_CATALOG,
      completedJobs: DEFAULT_COMPLETED_JOBS,
    }));
  };

  const dismissSplash = () => {
    setSplashVisible(false);
    if (!state.onboardingCompleted) {
      setWizardVisible(true);
    }
  };

  const replaySplash = () => {
    setSplashVisible(true);
  };

  const openSetupWizard = () => {
    setWizardVisible(true);
  };

  const closeSetupWizard = () => {
    setWizardVisible(false);
    setState((prev) => ({ ...prev, onboardingCompleted: true }));
  };

  const updateSettings = (patch: Partial<ShopSettings>) => {
    setState((prev) => {
      const nextSettings = { ...prev.settings, ...patch };
      return {
        ...prev,
        settings: nextSettings,
        currentQuote: {
          ...prev.currentQuote,
          electricityRatePerKwh:
            patch.defaultElectricityRate !== undefined
              ? patch.defaultElectricityRate
              : prev.currentQuote.electricityRatePerKwh,
          laborRatePerHour:
            patch.defaultLaborRate !== undefined
              ? patch.defaultLaborRate
              : prev.currentQuote.laborRatePerHour,
          scrapRatePercent:
            patch.defaultScrapRate !== undefined
              ? patch.defaultScrapRate
              : prev.currentQuote.scrapRatePercent,
          retailMultiplier:
            patch.defaultRetailMultiplier !== undefined
              ? patch.defaultRetailMultiplier
              : prev.currentQuote.retailMultiplier,
        },
      };
    });
  };

  const setPrintersList = (printers: PrinterProfile[]) => {
    if (!printers.length) return;
    setState((prev) => ({
      ...prev,
      printers,
      currentQuote: {
        ...prev.currentQuote,
        printerId: printers[0].id,
      },
    }));
  };

  return React.createElement(
    LayerCostContext.Provider,
    {
      value: {
        ...state,
        splashVisible,
        wizardVisible,
        dismissSplash,
        replaySplash,
        openSetupWizard,
        closeSetupWizard,
        updateSettings,
        setPrintersList,
        applyVerifiedMembershipTier,
        updateCurrentQuote,
        setCurrentQuoteFull,
        saveCurrentToCatalog,
        deleteCatalogItem,
        loadCatalogItemIntoCalculator,
        addOrUpdatePrinter,
        deletePrinter,
        addOrUpdateSpool,
        refillSpool,
        deleteSpool,
        addOrUpdateHardware,
        deleteHardware,
        logCompletedBatch,
        resetDemoData,
      },
    },
    children
  );
}

export function useLayerCost() {
  const ctx = useContext(LayerCostContext);
  if (!ctx) {
    throw new Error('useLayerCost must be used inside LayerCostProvider');
  }
  return ctx;
}
