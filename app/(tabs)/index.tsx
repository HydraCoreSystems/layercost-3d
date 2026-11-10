import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  analyzePrintQuote,
  BomLineItem,
  FilamentSlotUsage,
  PricingMode,
} from '../../src/engine/pricingEngine';
import {
  calculateThreeTierPricing,
  MARKETPLACE_PRESETS,
} from '../../src/engine/marketplaceFees';
import {
  parse3mfArchive,
  parseGcodeContent,
  parseSlicerPreviewText,
} from '../../src/engine/slicerParser';
import { useLayerCost } from '../../src/store/useLayerCostStore';
import { exportSingleQuotePdf } from '../../src/services/pdfExport';
import { useEntitlement } from '../../src/services/EntitlementProvider';
import {
  canUse,
  canUseMarketplacePreset,
  limitQuoteForTier,
} from '../../src/services/tierGates';

function NumField({
  label,
  value,
  onChange,
  suffix,
  prefix,
  step = 1,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  prefix?: string;
  step?: number;
  min?: number;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  const displayed = focused ? text : String(Number(value.toFixed(2)));

  const handleText = (raw: string) => {
    setText(raw);
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed)) {
      onChange(Math.max(min, parsed));
    } else if (raw === '') {
      onChange(min);
    }
  };

  const bump = (delta: number) => {
    const next = Math.max(min, Number((value + delta).toFixed(2)));
    setText(String(next));
    onChange(next);
  };

  return (
    <View style={styles.numFieldWrap}>
      <Text style={styles.numFieldLabel}>{label}</Text>
      <View style={styles.numFieldBox}>
        <Pressable onPress={() => bump(-step)} style={styles.stepBtn}>
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <View style={styles.numInputRow}>
          {prefix ? <Text style={styles.affixText}>{prefix}</Text> : null}
          <TextInput
            value={displayed}
            onFocus={() => {
              setText(String(Number(value.toFixed(2))));
              setFocused(true);
            }}
            onBlur={() => setFocused(false)}
            onChangeText={handleText}
            keyboardType="decimal-pad"
            style={styles.numInput}
            selectTextOnFocus
          />
          {suffix ? <Text style={styles.affixText}>{suffix}</Text> : null}
        </View>
        <Pressable onPress={() => bump(step)} style={styles.stepBtn}>
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function CalculatorScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;

  const {
    membershipTier,
    printers,
    spools,
    hardware,
    currentQuote,
    catalog,
    updateCurrentQuote,
    saveCurrentToCatalog,
    loadCatalogItemIntoCalculator,
    logCompletedBatch,
  } = useLayerCost();
  const { openPaywall, requireFeature } = useEntitlement();

  // The quote the math runs on. Free plans get single filament, one unit, cash sale;
  // the saved quote is untouched so upgrading or restoring brings everything back.
  const quote = useMemo(
    () => limitQuoteForTier(membershipTier, currentQuote),
    [membershipTier, currentQuote]
  );
  const hasBatchOptimizer = canUse(membershipTier, 'amsBatchOptimizer');
  const hasThreeTier = canUse(membershipTier, 'threeTierPricing');
  const hasLowFilamentWarnings = canUse(membershipTier, 'lowFilamentWarnings');

  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [scanText, setScanText] = useState(
    'Model filament: 64.5g\nFlush / Purge filament: 28.4g\nSupport: 3.2g\nTotal time: 2h 45m'
  );
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const selectedPrinter = useMemo(
    () => printers.find((p) => p.id === currentQuote.printerId) || printers[0],
    [printers, currentQuote.printerId]
  );

  const analysis = useMemo(
    () => analyzePrintQuote(quote, selectedPrinter, spools),
    [quote, selectedPrinter, spools]
  );

  const pricing = useMemo(
    () => calculateThreeTierPricing(analysis.activeUnit, quote),
    [analysis.activeUnit, quote]
  );

  const showToast = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const handleImportSlicerFile = async () => {
    if (!requireFeature('slicerImport')) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const asset = res.assets[0];
      const fileName = asset.name || 'print.3mf';

      let bytes: Uint8Array | null = null;
      if (Platform.OS === 'web' && (asset as any).file) {
        const buf = await (asset as any).file.arrayBuffer();
        bytes = new Uint8Array(buf);
      } else if (asset.uri) {
        const response = await fetch(asset.uri);
        const buf = await response.arrayBuffer();
        bytes = new Uint8Array(buf);
      }

      if (!bytes) return;

      if (fileName.toLowerCase().endsWith('.3mf')) {
        const parsed = parse3mfArchive(bytes, fileName);
        applyParsedSlicerResult(parsed);
      } else {
        const text = new TextDecoder().decode(bytes);
        const parsed = parseGcodeContent(text, fileName);
        applyParsedSlicerResult(parsed);
      }
    } catch (err: any) {
      Alert.alert(
        'Slicer Import Notice',
        err?.message || 'Could not parse that file. Try a .3mf or .gcode file.'
      );
    }
  };

  const applyParsedSlicerResult = (
    parsed: ReturnType<typeof parseGcodeContent>
  ) => {
    const newSlots: FilamentSlotUsage[] =
      parsed.filaments.length > 0
        ? parsed.filaments.map((f, idx) => ({
            slotIndex: idx + 1,
            spoolId: spools[idx % spools.length]?.id || spools[0].id,
            modelGramsPerUnit: f.usedGrams,
            supportGramsPerUnit: idx === 0 ? parsed.totalSupportGrams : 0,
            purgeGramsPerPlate:
              idx === 0 ? parsed.totalPurgeGrams : 0,
          }))
        : [
            {
              slotIndex: 1,
              spoolId: spools[0].id,
              modelGramsPerUnit: parsed.totalModelGrams || 25,
              supportGramsPerUnit: parsed.totalSupportGrams || 0,
              purgeGramsPerPlate: parsed.totalPurgeGrams || 0,
            },
          ];

    updateCurrentQuote({
      productName: parsed.productNameSuggestion || currentQuote.productName,
      printHoursPerUnit: parsed.printHours,
      printMinutesPerUnit: parsed.printMinutes,
      filamentSlots: newSlots,
    });
    showToast(`✓ ${parsed.summaryNote}`);
  };

  const handleRunTextScan = () => {
    const parsed = parseSlicerPreviewText(scanText);
    applyParsedSlicerResult(parsed);
    setScanModalVisible(false);
  };

  const updateSlot = (index: number, patch: Partial<FilamentSlotUsage>) => {
    const next = currentQuote.filamentSlots.map((slot, i) =>
      i === index ? { ...slot, ...patch } : slot
    );
    updateCurrentQuote({ filamentSlots: next });
  };

  const addFilamentSlot = () => {
    if (!requireFeature('amsBatchOptimizer')) return;
    const nextIdx = currentQuote.filamentSlots.length + 1;
    const defaultSpool =
      spools[(nextIdx - 1) % spools.length]?.id || spools[0].id;
    updateCurrentQuote({
      filamentSlots: [
        ...currentQuote.filamentSlots,
        {
          slotIndex: nextIdx,
          spoolId: defaultSpool,
          modelGramsPerUnit: 15,
          supportGramsPerUnit: 0,
          purgeGramsPerPlate: 18,
        },
      ],
    });
  };

  const removeFilamentSlot = (index: number) => {
    if (currentQuote.filamentSlots.length <= 1) return;
    updateCurrentQuote({
      filamentSlots: currentQuote.filamentSlots
        .filter((_, i) => i !== index)
        .map((s, idx) => ({ ...s, slotIndex: idx + 1 })),
    });
  };

  const toggleHardwareInBom = (hwId: string) => {
    const hw = hardware.find((h) => h.id === hwId);
    if (!hw) return;
    const unitCost = Number((hw.packPrice / Math.max(1, hw.packQuantity)).toFixed(3));
    const existing = currentQuote.bomItems.find((b) => b.hardwareId === hwId);
    if (existing) {
      updateCurrentQuote({
        bomItems: currentQuote.bomItems.filter((b) => b.hardwareId !== hwId),
      });
    } else {
      const newItem: BomLineItem = {
        id: `bom-${Date.now()}-${hwId}`,
        hardwareId: hw.id,
        name: hw.name,
        unitCost,
        quantityPerUnit: 2,
      };
      updateCurrentQuote({
        bomItems: [...currentQuote.bomItems, newItem],
      });
    }
  };

  const updateBomQty = (id: string, qty: number) => {
    if (qty <= 0) {
      updateCurrentQuote({
        bomItems: currentQuote.bomItems.filter((b) => b.id !== id),
      });
      return;
    }
    updateCurrentQuote({
      bomItems: currentQuote.bomItems.map((b) =>
        b.id === id ? { ...b, quantityPerUnit: qty } : b
      ),
    });
  };

  const handleLogCompletedBatch = () => {
    if (!requireFeature('spoolDepletion')) return;
    const batchQty = Math.max(1, quote.plateQuantity);
    const deductions = currentQuote.filamentSlots.map((slot) => ({
      spoolId: slot.spoolId,
      grams:
        (slot.modelGramsPerUnit + slot.supportGramsPerUnit) * batchQty +
        slot.purgeGramsPerPlate,
    }));

    logCompletedBatch(
      {
        productName: currentQuote.productName,
        sku: currentQuote.sku,
        marketplaceName: pricing.marketplace.shortName,
        unitsSold: batchQty,
        totalGramsDeducted: Math.round(analysis.activeUnit.totalGramsForPlate),
        grossRevenue: Number(pricing.plateTotalRevenue.toFixed(2)),
        platformFees: Number(pricing.plateTotalFees.toFixed(2)),
        productionCost: Number(pricing.plateTotalCost.toFixed(2)),
        netProfit: Number(pricing.plateTotalNetProfit.toFixed(2)),
      },
      deductions
    );

    showToast(
      `✓ Logged batch of ${batchQty} (${Math.round(
        analysis.activeUnit.totalGramsForPlate
      )}g deducted from spools, +$${pricing.plateTotalNetProfit.toFixed(2)} profit recorded)`
    );
  };

  const u = analysis.activeUnit;
  const rev = pricing.retailEvaluation;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      {/* Top Preset Bar & Slicer Import */}
      <View style={styles.topActionsBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.presetScroll}
        >
          {catalog.map((item) => {
            const active = item.id === currentQuote.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => item.id && loadCatalogItemIntoCalculator(item.id)}
                style={[styles.presetChip, active && styles.presetChipActive]}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    active && styles.presetChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {item.productName}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() =>
              updateCurrentQuote({
                id: `quote-${Date.now()}`,
                productName: 'New Custom 3D Print',
                sku: `3D-${Math.floor(100 + Math.random() * 900)}`,
              })
            }
            style={styles.newQuoteChip}
          >
            <Text style={styles.newQuoteChipText}>+ New Print</Text>
          </Pressable>
        </ScrollView>

        <View style={styles.importBtnsRow}>
          <Pressable onPress={handleImportSlicerFile} style={styles.importBtn}>
            <Text style={styles.importBtnText}>📂 Import .3mf / .gcode</Text>
          </Pressable>
          <Pressable
            onPress={() => setScanModalVisible(true)}
            style={[styles.importBtn, styles.importBtnAlt]}
          >
            <Text style={styles.importBtnText}>📸 Scan Slicer Screen</Text>
          </Pressable>
        </View>
      </View>

      {statusBanner ? (
        <View style={styles.toastBanner}>
          <Text style={styles.toastText}>{statusBanner}</Text>
        </View>
      ) : null}

      {hasLowFilamentWarnings && analysis.spoolWarnings.length > 0 ? (
        <View style={styles.warningBanner}>
          <Text style={styles.warningTitle}>
            ⚠️ Low Filament Alert for Plate of {quote.plateQuantity}:
          </Text>
          {analysis.spoolWarnings.map((w) => (
            <Text key={w.spoolId} style={styles.warningItem}>
              • {w.spoolName} needs {w.requiredPlateGrams.toFixed(0)}g, but only{' '}
              {w.remainingGrams}g remains on spool ({w.shortfallGrams.toFixed(0)}g short).
            </Text>
          ))}
        </View>
      ) : null}

      {/* HERO 3-TIER PRICE OUTPUT CARD */}
      <View style={styles.heroPanel}>
        <View style={styles.heroHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroEyebrow}>
              LIVE PRICING • PLATE OF {u.batchSize} UNIT{u.batchSize > 1 ? 'S' : ''} •{' '}
              {pricing.marketplace.name.toUpperCase()}
            </Text>
            <Text style={styles.heroProductName}>{currentQuote.productName}</Text>
          </View>
          <View style={styles.trueCostBadge}>
            <Text style={styles.trueCostLabel}>TRUE LANDED COST</Text>
            <Text style={styles.trueCostValue}>${u.trueUnitCost.toFixed(2)}/ea</Text>
            <Text style={styles.trueCostSub}>
              Hard cash cost: ${u.hardOutOfPocketCost.toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={[styles.tiersRow, isWide && styles.tiersRowWide]}>
          {hasThreeTier ? (
            <>
          {/* Tier 1: Live Auction Floor */}
          <View style={styles.tierBox}>
            <Text style={styles.tierBoxTag}>TIER 1 • AUCTION FLOOR</Text>
            <Text style={styles.tierBoxPrice}>
              ${pricing.auctionFloorWholeDollar}.00
            </Text>
            <Text style={styles.tierBoxSub}>
              Exact break-even: ${pricing.breakEvenPrice.toFixed(2)}
            </Text>
            <Text style={styles.tierBoxNote}>
              Never start a Whatnot / PalmStreet bid below ${pricing.auctionFloorWholeDollar}
            </Text>
          </View>

          {/* Tier 2: Wholesale B2B */}
          <View style={styles.tierBox}>
            <Text style={styles.tierBoxTag}>
              TIER 2 • WHOLESALE ({currentQuote.wholesaleMultiplier}x)
            </Text>
            <Text style={styles.tierBoxPrice}>
              ${pricing.wholesalePrice.toFixed(2)}
            </Text>
            <Text style={styles.tierBoxSub}>
              Net Profit: +${pricing.wholesaleNetProfit.toFixed(2)}/ea (
              {pricing.wholesaleMarginPercent.toFixed(0)}%)
            </Text>
            <Text style={styles.tierBoxNote}>
              Direct B2B price for plant shops & retail boutiques
            </Text>
          </View>

            </>
          ) : (
            <Pressable onPress={openPaywall} style={styles.tierBox}>
              <Text style={styles.tierBoxTag}>TIER 1 + 2 • AUCTION FLOOR & WHOLESALE</Text>
              <Text style={styles.tierBoxNote}>
                Three tier price output is part of LayerCost Pro. Tap to see plans.
              </Text>
            </Pressable>
          )}

          {/* Tier 3: Recommended Retail */}
          <View style={[styles.tierBox, styles.tierBoxHighlight]}>
            <View style={styles.tierHighlightTop}>
              <Text style={styles.tierBoxTagHighlight}>
                TIER 3 • {pricing.marketplace.shortName.toUpperCase()} RETAIL
              </Text>
              <Text style={styles.psychTag}>
                Try ${pricing.suggestedRoundedRetailPrice.toFixed(2)}
              </Text>
            </View>
            <Text style={styles.tierBoxPriceHighlight}>
              ${rev.listingPrice.toFixed(2)}
            </Text>
            <Text style={styles.tierBoxSubHighlight}>
              Net Profit in Pocket: +${rev.netProfit.toFixed(2)}/ea (
              {rev.netMarginPercent.toFixed(0)}% margin)
            </Text>
            <Text style={styles.tierBoxNoteHighlight}>
              Full Plate ({u.batchSize} units): +${pricing.plateTotalNetProfit.toFixed(2)} net
              profit • ${rev.effectiveHourlyProfitPerPrintHour.toFixed(2)}/print hr
            </Text>
          </View>
        </View>

        {/* Hero Action Buttons */}
        <View style={styles.heroActionsRow}>
          <Pressable
            onPress={() => {
              saveCurrentToCatalog();
              showToast(`✓ Saved "${currentQuote.productName}" to Product Catalog`);
            }}
            style={styles.heroActionBtn}
          >
            <Text style={styles.heroActionBtnText}>💾 Save to Catalog</Text>
          </Pressable>

          <Pressable
            onPress={() =>
              exportSingleQuotePdf(quote, selectedPrinter, spools)
            }
            style={styles.heroActionBtn}
          >
            <Text style={styles.heroActionBtnText}>📄 Export Quote PDF</Text>
          </Pressable>

          <Pressable
            onPress={handleLogCompletedBatch}
            style={[styles.heroActionBtn, styles.heroActionBtnPrimary]}
          >
            <Text style={styles.heroActionBtnPrimaryText}>
              ✅ Finish Plate ({u.batchSize}x) & Deduct Spools
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Main Responsive Two-Column Grid */}
      <View style={[styles.columnsContainer, isWide && styles.columnsContainerWide]}>
        {/* LEFT COLUMN */}
        <View style={[styles.col, isWide && styles.colLeft]}>
          {/* 1. SINGLE VS FULL PLATE BATCH OPTIMIZER */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                ⚡ Single Print vs. Full Plate Batch Optimizer
              </Text>
              <Text style={styles.cardBadge}>AMS Poop Saver</Text>
            </View>
            <Text style={styles.cardHint}>
              Printing multiple items on one build plate shares AMS color purge waste and bed prep across the whole batch:
            </Text>

            <View style={styles.batchChipsRow}>
              {[1, 2, 4, 6, 8, 10, 12, 16].map((qty) => {
                const active = quote.plateQuantity === qty;
                return (
                  <Pressable
                    key={qty}
                    onPress={() => {
                      if (qty > 1 && !requireFeature('amsBatchOptimizer')) return;
                      updateCurrentQuote({ plateQuantity: qty });
                    }}
                    style={[styles.batchChip, active && styles.batchChipActive]}
                  >
                    <Text
                      style={[
                        styles.batchChipText,
                        active && styles.batchChipTextActive,
                      ]}
                    >
                      {qty === 1 ? '1 (Solo)' : `${qty} / plate`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.batchCompareRow}>
              <View style={styles.batchCompareBox}>
                <Text style={styles.batchCompareLabel}>SOLO PRINT (1 UNIT)</Text>
                <Text style={styles.batchCompareCost}>
                  ${analysis.singleUnit.trueUnitCost.toFixed(2)} / unit
                </Text>
                <Text style={styles.batchCompareDetail}>
                  Purge waste: {analysis.singleUnit.purgeGramsPerUnit.toFixed(1)}g/ea (
                  {analysis.purgeWastePercentSingle.toFixed(0)}% of filament)
                </Text>
              </View>

              <View style={[styles.batchCompareBox, styles.batchCompareBoxActive]}>
                <Text style={styles.batchCompareLabelActive}>
                  BATCH PLATE ({quote.plateQuantity} UNITS)
                </Text>
                <Text style={styles.batchCompareCostActive}>
                  ${analysis.batchUnit.trueUnitCost.toFixed(2)} / unit
                </Text>
                <Text style={styles.batchCompareDetailActive}>
                  {quote.plateQuantity > 1
                    ? `Saves $${analysis.savingsPerUnitInBatch.toFixed(
                        2
                      )}/unit (${analysis.savingsPercentInBatch.toFixed(
                        0
                      )}% cheaper!) • Purge: ${analysis.batchUnit.purgeGramsPerUnit.toFixed(
                        1
                      )}g/ea`
                    : 'Increase plate quantity above to see batch savings'}
                </Text>
              </View>
            </View>
          </View>

          {/* 2. FILAMENT & AMS MULTICOLOR SLOTS */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                🎨 Filament Spools & AMS Purge ("Poop")
              </Text>
              <Pressable onPress={addFilamentSlot} style={styles.smallAddBtn}>
                <Text style={styles.smallAddBtnText}>+ Add AMS Slot</Text>
              </Pressable>
            </View>

            {quote.filamentSlots.map((slot, index) => {
              const currentSpool =
                spools.find((s) => s.id === slot.spoolId) || spools[0];
              return (
                <View key={index} style={styles.slotBox}>
                  <View style={styles.slotHeaderRow}>
                    <View style={styles.slotTitleRow}>
                      <View
                        style={[
                          styles.colorDot,
                          { backgroundColor: currentSpool?.colorHex || '#10B981' },
                        ]}
                      />
                      <Text style={styles.slotTitle}>
                        AMS Slot A{index + 1}: {currentSpool?.brand}{' '}
                        {currentSpool?.colorName} ({currentSpool?.material})
                      </Text>
                    </View>
                    {quote.filamentSlots.length > 1 ? (
                      <Pressable
                        onPress={() => removeFilamentSlot(index)}
                        style={styles.removeSlotBtn}
                      >
                        <Text style={styles.removeSlotBtnText}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.spoolPickerRow}
                  >
                    {spools.map((sp) => {
                      const selected = sp.id === slot.spoolId;
                      return (
                        <Pressable
                          key={sp.id}
                          onPress={() => updateSlot(index, { spoolId: sp.id })}
                          style={[
                            styles.spoolChip,
                            selected && styles.spoolChipSelected,
                          ]}
                        >
                          <View
                            style={[
                              styles.spoolChipDot,
                              { backgroundColor: sp.colorHex },
                            ]}
                          />
                          <Text
                            style={[
                              styles.spoolChipText,
                              selected && styles.spoolChipTextSelected,
                            ]}
                          >
                            {sp.colorName} (${sp.spoolPrice}/kg • {sp.remainingGrams}g left)
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  <View style={styles.slotInputsGrid}>
                    <NumField
                      label="Model (g / 1 unit)"
                      value={slot.modelGramsPerUnit}
                      onChange={(n) => updateSlot(index, { modelGramsPerUnit: n })}
                      suffix="g"
                      step={5}
                    />
                    <NumField
                      label="Supports (g / unit)"
                      value={slot.supportGramsPerUnit}
                      onChange={(n) =>
                        updateSlot(index, { supportGramsPerUnit: n })
                      }
                      suffix="g"
                      step={2}
                    />
                    {hasBatchOptimizer ? (
                    <NumField
                      label="AMS Purge (g / plate)"
                      value={slot.purgeGramsPerPlate}
                      onChange={(n) =>
                        updateSlot(index, { purgeGramsPerPlate: n })
                      }
                      suffix="g"
                      step={5}
                    />
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>

          {/* 3. PRODUCT IDENTITY & PRINTER / TIME */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🖨️ Product, Printer & Print Time</Text>

            <View style={styles.textInputsRow}>
              <View style={{ flex: 2 }}>
                <Text style={styles.inputLabel}>Product Name</Text>
                <TextInput
                  value={currentQuote.productName}
                  onChangeText={(t) => updateCurrentQuote({ productName: t })}
                  style={styles.textInput}
                  placeholder="Product Name"
                  placeholderTextColor="#64748B"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>SKU</Text>
                <TextInput
                  value={currentQuote.sku}
                  onChangeText={(t) => updateCurrentQuote({ sku: t })}
                  style={styles.textInput}
                  placeholder="SKU"
                  placeholderTextColor="#64748B"
                />
              </View>
            </View>

            <Text style={[styles.inputLabel, { marginTop: 10 }]}>
              Select 3D Printer Profile
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              {printers.map((p) => {
                const selected = p.id === currentQuote.printerId;
                const depPerHr =
                  p.lifespanHours > 0 ? p.purchasePrice / p.lifespanHours : 0;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => updateCurrentQuote({ printerId: p.id })}
                    style={[
                      styles.printerChip,
                      selected && styles.printerChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.printerChipName,
                        selected && { color: '#10B981' },
                      ]}
                    >
                      {p.name}
                    </Text>
                    <Text style={styles.printerChipSub}>
                      {p.powerWatts}W • ${(depPerHr + p.maintenancePerHour).toFixed(2)}/hr wear
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.slotInputsGrid}>
              <NumField
                label="Print Hours (1 unit)"
                value={currentQuote.printHoursPerUnit}
                onChange={(n) => updateCurrentQuote({ printHoursPerUnit: n })}
                suffix="h"
                step={1}
              />
              <NumField
                label="Print Mins (1 unit)"
                value={currentQuote.printMinutesPerUnit}
                onChange={(n) => updateCurrentQuote({ printMinutesPerUnit: n })}
                suffix="m"
                step={5}
              />
              <NumField
                label="AMS Swap Overhead / Plate"
                value={currentQuote.plateColorSwapMinutes}
                onChange={(n) =>
                  updateCurrentQuote({ plateColorSwapMinutes: n })
                }
                suffix="m"
                step={5}
              />
              <NumField
                label="Power Rate ($/kWh)"
                value={currentQuote.electricityRatePerKwh}
                onChange={(n) =>
                  updateCurrentQuote({ electricityRatePerKwh: n })
                }
                prefix="$"
                step={0.02}
              />
              <NumField
                label="Scrap / Fail Buffer"
                value={currentQuote.scrapRatePercent}
                onChange={(n) => updateCurrentQuote({ scrapRatePercent: n })}
                suffix="%"
                step={1}
              />
            </View>
          </View>
        </View>

        {/* RIGHT COLUMN */}
        <View style={[styles.col, isWide && styles.colRight]}>
          {/* 4. MARKETPLACE FEE REVERSE-CALCULATOR */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                🏪 Marketplace Fee Reverse-Calculator
              </Text>
              <Text style={styles.cardBadge}>Net Profit Solver</Text>
            </View>

            <Text style={styles.inputLabel}>Sales Channel / Platform</Text>
            <View style={styles.marketplaceGrid}>
              {MARKETPLACE_PRESETS.map((mp) => {
                const active = mp.id === quote.marketplaceId;
                return (
                  <Pressable
                    key={mp.id}
                    onPress={() => {
                      if (!canUseMarketplacePreset(membershipTier, mp.id) && !requireFeature('allMarketplacePresets')) return;
                      updateCurrentQuote({ marketplaceId: mp.id });
                    }}
                    style={[styles.mpChip, active && styles.mpChipActive]}
                  >
                    <Text
                      style={[
                        styles.mpChipTitle,
                        active && styles.mpChipTitleActive,
                      ]}
                    >
                      {mp.shortName}
                    </Text>
                    <Text style={styles.mpChipSub} numberOfLines={1}>
                      {((mp.commissionRate + mp.processingRate) * 100).toFixed(1)}%
                      {mp.fixedFee > 0 ? ` + $${mp.fixedFee.toFixed(2)}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {quote.marketplaceId === 'etsy' ? (
              <Pressable
                onPress={() =>
                  updateCurrentQuote({
                    etsyOffsiteAdsEnabled: !currentQuote.etsyOffsiteAdsEnabled,
                  })
                }
                style={[
                  styles.offsiteToggle,
                  currentQuote.etsyOffsiteAdsEnabled && styles.offsiteToggleOn,
                ]}
              >
                <Text style={styles.offsiteToggleText}>
                  {currentQuote.etsyOffsiteAdsEnabled ? '☑' : '☐'} Include Etsy
                  Offsite Ads Fee (+15% attribution buffer)
                </Text>
              </Pressable>
            ) : null}

            <Text style={[styles.inputLabel, { marginTop: 12 }]}>
              How Do You Want to Set Your Retail Price?
            </Text>
            <View style={styles.modeTabsRow}>
              {(
                [
                  { id: 'multiplier', label: 'Markup (x)' },
                  { id: 'targetProfit', label: 'Target Net $' },
                  { id: 'targetMargin', label: 'Target Margin %' },
                  { id: 'customPrice', label: 'Test Price $' },
                ] as Array<{ id: PricingMode; label: string }>
              ).map((m) => {
                const active = currentQuote.pricingMode === m.id;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => updateCurrentQuote({ pricingMode: m.id })}
                    style={[styles.modeTab, active && styles.modeTabActive]}
                  >
                    <Text
                      style={[
                        styles.modeTabText,
                        active && styles.modeTabTextActive,
                      ]}
                    >
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.slotInputsGrid}>
              {currentQuote.pricingMode === 'multiplier' ? (
                <NumField
                  label="Retail Multiplier (x)"
                  value={currentQuote.retailMultiplier}
                  onChange={(n) => updateCurrentQuote({ retailMultiplier: n })}
                  suffix="x"
                  step={0.25}
                  min={1.1}
                />
              ) : null}
              {currentQuote.pricingMode === 'targetProfit' ? (
                <NumField
                  label="Target Net Profit / Unit"
                  value={currentQuote.targetNetProfitPerUnit}
                  onChange={(n) =>
                    updateCurrentQuote({ targetNetProfitPerUnit: n })
                  }
                  prefix="$"
                  step={1}
                />
              ) : null}
              {currentQuote.pricingMode === 'targetMargin' ? (
                <NumField
                  label="Target Net Margin (%)"
                  value={currentQuote.targetMarginPercent}
                  onChange={(n) =>
                    updateCurrentQuote({ targetMarginPercent: n })
                  }
                  suffix="%"
                  step={5}
                  min={5}
                />
              ) : null}
              {currentQuote.pricingMode === 'customPrice' ? (
                <NumField
                  label="Test Listing Price ($)"
                  value={currentQuote.customRetailPrice}
                  onChange={(n) => updateCurrentQuote({ customRetailPrice: n })}
                  prefix="$"
                  step={1}
                />
              ) : null}

              <NumField
                label="Wholesale Multiplier"
                value={currentQuote.wholesaleMultiplier}
                onChange={(n) => updateCurrentQuote({ wholesaleMultiplier: n })}
                suffix="x"
                step={0.25}
                min={1.1}
              />
              <NumField
                label="Shipping Charged ($)"
                value={currentQuote.shippingChargedToBuyer}
                onChange={(n) =>
                  updateCurrentQuote({ shippingChargedToBuyer: n })
                }
                prefix="$"
                step={0.5}
              />
              <NumField
                label="Actual Label Cost ($)"
                value={currentQuote.shippingActualCost}
                onChange={(n) => updateCurrentQuote({ shippingActualCost: n })}
                prefix="$"
                step={0.5}
              />
            </View>

            {/* Fee Breakdown Receipt */}
            <View style={styles.receiptBox}>
              <Text style={styles.receiptTitle}>
                {pricing.marketplace.name} — Per-Order Ledger Breakdown
              </Text>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Customer Pays (Item + Shipping)</Text>
                <Text style={styles.receiptVal}>
                  ${(rev.listingPrice + rev.shippingCharged).toFixed(2)}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>
                  Platform Commission & Processing Fees
                </Text>
                <Text style={[styles.receiptVal, { color: '#F87171' }]}>
                  −${rev.totalPlatformFees.toFixed(2)}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Shipping Label Cost</Text>
                <Text style={styles.receiptVal}>
                  −${rev.shippingActualCost.toFixed(2)}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>
                  True Landed Production Cost (Plate of {u.batchSize})
                </Text>
                <Text style={styles.receiptVal}>
                  −${u.trueUnitCost.toFixed(2)}
                </Text>
              </View>
              <View style={[styles.receiptRow, styles.receiptTotalRow]}>
                <Text style={styles.receiptTotalLabel}>
                  Net Profit in Your Pocket (After All Costs & Fees)
                </Text>
                <Text style={styles.receiptTotalVal}>
                  +${rev.netProfit.toFixed(2)} ({rev.netMarginPercent.toFixed(1)}%)
                </Text>
              </View>
            </View>
          </View>

          {/* 5. HARDWARE BOM, PACKAGING & HANDS-ON LABOR */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              🔩 Hardware (BOM), Packaging & Hands-On Labor
            </Text>
            <Text style={styles.cardHint}>
              Tap hardware items below to include magnets, heat-set inserts, keyrings, or LEDs in unit cost:
            </Text>

            <View style={styles.hwChipsWrap}>
              {hardware.map((hw) => {
                const inBom = currentQuote.bomItems.find(
                  (b) => b.hardwareId === hw.id
                );
                const unitCost = hw.packPrice / Math.max(1, hw.packQuantity);
                return (
                  <Pressable
                    key={hw.id}
                    onPress={() => toggleHardwareInBom(hw.id)}
                    style={[styles.hwChip, inBom && styles.hwChipActive]}
                  >
                    <Text
                      style={[
                        styles.hwChipText,
                        inBom && styles.hwChipTextActive,
                      ]}
                    >
                      {inBom ? `✓ ${inBom.quantityPerUnit}x ` : '+ '}
                      {hw.name} (${unitCost.toFixed(2)}/ea)
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {currentQuote.bomItems.length > 0 ? (
              <View style={styles.bomListBox}>
                {currentQuote.bomItems.map((item) => (
                  <View key={item.id} style={styles.bomItemRow}>
                    <Text style={styles.bomItemName}>
                      {item.name} (${item.unitCost.toFixed(2)}/ea)
                    </Text>
                    <View style={styles.bomStepperRow}>
                      <Pressable
                        onPress={() =>
                          updateBomQty(item.id, item.quantityPerUnit - 1)
                        }
                        style={styles.miniStepBtn}
                      >
                        <Text style={styles.miniStepText}>−</Text>
                      </Pressable>
                      <Text style={styles.bomQtyText}>
                        {item.quantityPerUnit}x ($
                        {(item.unitCost * item.quantityPerUnit).toFixed(2)})
                      </Text>
                      <Pressable
                        onPress={() =>
                          updateBomQty(item.id, item.quantityPerUnit + 1)
                        }
                        style={styles.miniStepBtn}
                      >
                        <Text style={styles.miniStepText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={[styles.slotInputsGrid, { marginTop: 10 }]}>
              <NumField
                label="Box & Packing ($/unit)"
                value={currentQuote.packagingCostPerUnit}
                onChange={(n) =>
                  updateCurrentQuote({ packagingCostPerUnit: n })
                }
                prefix="$"
                step={0.15}
              />
              <NumField
                label="Bed Prep (mins / plate)"
                value={currentQuote.prepMinutesPerPlate}
                onChange={(n) => updateCurrentQuote({ prepMinutesPerPlate: n })}
                suffix="m"
                step={1}
              />
              <NumField
                label="Post-Process (mins / unit)"
                value={currentQuote.postProcessMinutesPerUnit}
                onChange={(n) =>
                  updateCurrentQuote({ postProcessMinutesPerUnit: n })
                }
                suffix="m"
                step={1}
              />
              <NumField
                label="Your Labor Rate ($/hr)"
                value={currentQuote.laborRatePerHour}
                onChange={(n) => updateCurrentQuote({ laborRatePerHour: n })}
                prefix="$"
                step={2}
              />
            </View>
          </View>

          {/* 6. ANATOMY OF TRUE UNIT COST */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              🔬 Anatomy of 1 Unit (Plate of {u.batchSize})
            </Text>
            {[
              {
                label: `Model & Support Filament (${(
                  u.modelGramsPerUnit + u.supportGramsPerUnit
                ).toFixed(1)}g)`,
                val: u.modelFilamentCost + u.supportFilamentCost,
                color: '#10B981',
              },
              {
                label: `AMS Purge / Flush Waste (${u.purgeGramsPerUnit.toFixed(
                  1
                )}g amortized)`,
                val: u.purgeFilamentCost,
                color: '#F59E0B',
              },
              {
                label: `Machine Power, Depreciation & Wear (${u.printHoursPerUnitEffective.toFixed(
                  2
                )}h)`,
                val: u.totalMachineCost,
                color: '#38BDF8',
              },
              {
                label: 'Hardware BOM & Packaging Supplies',
                val: u.hardwareBomCost + u.packagingCost,
                color: '#A78BFA',
              },
              {
                label: 'Hands-On Prep & Post-Processing Labor',
                val: u.totalLaborCost,
                color: '#F472B6',
              },
              {
                label: `Failure / Scrap Buffer (${currentQuote.scrapRatePercent}%)`,
                val: u.scrapBufferCost,
                color: '#FB7185',
              },
            ].map((row) => {
              const pct =
                u.trueUnitCost > 0
                  ? Math.min(100, (row.val / u.trueUnitCost) * 100)
                  : 0;
              return (
                <View key={row.label} style={styles.anatomyItem}>
                  <View style={styles.anatomyTop}>
                    <Text style={styles.anatomyLabel}>{row.label}</Text>
                    <Text style={styles.anatomyVal}>
                      ${row.val.toFixed(2)} ({pct.toFixed(0)}%)
                    </Text>
                  </View>
                  <View style={styles.anatomyTrack}>
                    <View
                      style={[
                        styles.anatomyFill,
                        { width: `${pct}%`, backgroundColor: row.color },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* SLICER SCREEN SCANNER MODAL */}
      <Modal
        visible={scanModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setScanModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              📸 Slicer Screen Reader (Bambu Studio / OrcaSlicer / PrusaSlicer)
            </Text>
            <Text style={styles.modalSub}>
              Paste or scan text from your slicer preview window (or use iPhone Live Text camera on your monitor) to auto-extract Model Grams, AMS Flush/Purge Grams, and Print Time:
            </Text>
            <TextInput
              value={scanText}
              onChangeText={setScanText}
              multiline
              style={styles.scanTextArea}
            />
            <View style={styles.modalBtnsRow}>
              <Pressable
                onPress={() => setScanModalVisible(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleRunTextScan} style={styles.modalApplyBtn}>
                <Text style={styles.modalApplyText}>
                  ⚡ Extract & Populate Calculator
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
    maxWidth: 1380,
    width: '100%',
    alignSelf: 'center',
  },
  topActionsBar: {
    marginBottom: 14,
    gap: 10,
  },
  presetScroll: {
    flexGrow: 0,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1E293B',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  presetChipActive: {
    backgroundColor: '#064E3B',
    borderColor: '#10B981',
  },
  presetChipText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
  },
  presetChipTextActive: {
    color: '#F8FAFC',
  },
  newQuoteChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderStyle: 'dashed',
  },
  newQuoteChipText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  importBtnsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  importBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  importBtnAlt: {
    borderColor: '#6366F1',
    backgroundColor: '#1E1B4B',
  },
  importBtnText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  toastBanner: {
    backgroundColor: '#064E3B',
    borderColor: '#10B981',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  toastText: {
    color: '#ECFDF5',
    fontSize: 13,
    fontWeight: '700',
  },
  warningBanner: {
    backgroundColor: '#451A03',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  warningTitle: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  warningItem: {
    color: '#FEF3C7',
    fontSize: 12,
    lineHeight: 18,
  },
  heroPanel: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 18,
    marginBottom: 18,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  heroEyebrow: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  heroProductName: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  trueCostBadge: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'flex-end',
  },
  trueCostLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  trueCostValue: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '800',
  },
  trueCostSub: {
    color: '#64748B',
    fontSize: 11,
  },
  tiersRow: {
    flexDirection: 'column',
    gap: 12,
  },
  tiersRowWide: {
    flexDirection: 'row',
  },
  tierBox: {
    flex: 1,
    backgroundColor: '#161F33',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#26334D',
  },
  tierBoxHighlight: {
    backgroundColor: '#062C22',
    borderColor: '#10B981',
    borderWidth: 1.5,
  },
  tierHighlightTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tierBoxTag: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tierBoxTagHighlight: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  psychTag: {
    color: '#A7F3D0',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#064E3B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tierBoxPrice: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
    marginVertical: 4,
  },
  tierBoxPriceHighlight: {
    color: '#ECFDF5',
    fontSize: 30,
    fontWeight: '900',
    marginVertical: 4,
  },
  tierBoxSub: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  tierBoxSubHighlight: {
    color: '#6EE7B7',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  tierBoxNote: {
    color: '#64748B',
    fontSize: 11,
  },
  tierBoxNoteHighlight: {
    color: '#A7F3D0',
    fontSize: 11,
  },
  heroActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  heroActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  heroActionBtnPrimary: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
    flexGrow: 1,
    alignItems: 'center',
  },
  heroActionBtnText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  heroActionBtnPrimaryText: {
    color: '#052E16',
    fontSize: 13,
    fontWeight: '900',
  },
  columnsContainer: {
    flexDirection: 'column',
    gap: 16,
  },
  columnsContainerWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  col: {
    width: '100%',
    gap: 16,
  },
  colLeft: {
    flex: 1.08,
  },
  colRight: {
    flex: 1,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  cardBadge: {
    backgroundColor: '#1E293B',
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cardHint: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  batchChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  batchChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  batchChipActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  batchChipText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
  },
  batchChipTextActive: {
    color: '#052E16',
    fontWeight: '900',
  },
  batchCompareRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  batchCompareBox: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#161F33',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#26334D',
  },
  batchCompareBoxActive: {
    backgroundColor: '#062C22',
    borderColor: '#10B981',
  },
  batchCompareLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
  },
  batchCompareLabelActive: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
  },
  batchCompareCost: {
    color: '#F8FAFC',
    fontSize: 19,
    fontWeight: '800',
    marginVertical: 4,
  },
  batchCompareCostActive: {
    color: '#ECFDF5',
    fontSize: 19,
    fontWeight: '900',
    marginVertical: 4,
  },
  batchCompareDetail: {
    color: '#94A3B8',
    fontSize: 11,
  },
  batchCompareDetailActive: {
    color: '#A7F3D0',
    fontSize: 11,
    fontWeight: '600',
  },
  smallAddBtn: {
    backgroundColor: '#064E3B',
    borderColor: '#10B981',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  smallAddBtnText: {
    color: '#ECFDF5',
    fontSize: 12,
    fontWeight: '700',
  },
  slotBox: {
    backgroundColor: '#161F33',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#26334D',
  },
  slotHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  slotTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#F8FAFC',
  },
  slotTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  removeSlotBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#3F1D28',
  },
  removeSlotBtnText: {
    color: '#FDA4AF',
    fontSize: 11,
    fontWeight: '700',
  },
  spoolPickerRow: {
    marginBottom: 10,
  },
  spoolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  spoolChipSelected: {
    borderColor: '#10B981',
    backgroundColor: '#062C22',
  },
  spoolChipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  spoolChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  spoolChipTextSelected: {
    color: '#ECFDF5',
    fontWeight: '700',
  },
  slotInputsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  numFieldWrap: {
    flex: 1,
    minWidth: 130,
  },
  numFieldLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  numFieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#090D16',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  stepBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#1E293B',
  },
  stepBtnText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
  },
  numInputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  numInput: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    minWidth: 42,
    paddingVertical: 6,
  },
  affixText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  textInputsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#090D16',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  printerChip: {
    backgroundColor: '#161F33',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#26334D',
  },
  printerChipSelected: {
    borderColor: '#10B981',
    backgroundColor: '#062C22',
  },
  printerChipName: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
  },
  printerChipSub: {
    color: '#94A3B8',
    fontSize: 11,
  },
  marketplaceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mpChip: {
    minWidth: 108,
    flex: 1,
    backgroundColor: '#161F33',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#26334D',
  },
  mpChipActive: {
    backgroundColor: '#062C22',
    borderColor: '#10B981',
  },
  mpChipTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
  },
  mpChipTitleActive: {
    color: '#34D399',
  },
  mpChipSub: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 2,
  },
  offsiteToggle: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#161F33',
    borderWidth: 1,
    borderColor: '#334155',
  },
  offsiteToggleOn: {
    backgroundColor: '#451A03',
    borderColor: '#F59E0B',
  },
  offsiteToggleText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  modeTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#090D16',
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  modeTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 7,
  },
  modeTabActive: {
    backgroundColor: '#10B981',
  },
  modeTabText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  modeTabTextActive: {
    color: '#052E16',
    fontWeight: '900',
  },
  receiptBox: {
    marginTop: 14,
    backgroundColor: '#090D16',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  receiptTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  receiptLabel: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  receiptVal: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  receiptTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    marginTop: 6,
    paddingTop: 8,
  },
  receiptTotalLabel: {
    color: '#ECFDF5',
    fontSize: 13,
    fontWeight: '800',
  },
  receiptTotalVal: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '900',
  },
  hwChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hwChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#161F33',
    borderWidth: 1,
    borderColor: '#26334D',
  },
  hwChipActive: {
    backgroundColor: '#062C22',
    borderColor: '#10B981',
  },
  hwChipText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
  hwChipTextActive: {
    color: '#ECFDF5',
    fontWeight: '800',
  },
  bomListBox: {
    marginTop: 10,
    backgroundColor: '#161F33',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  bomItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bomItemName: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  bomStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniStepBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  miniStepText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
  },
  bomQtyText: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
  },
  anatomyItem: {
    marginBottom: 10,
  },
  anatomyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  anatomyLabel: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  anatomyVal: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  anatomyTrack: {
    height: 7,
    backgroundColor: '#1E293B',
    borderRadius: 4,
    overflow: 'hidden',
  },
  anatomyFill: {
    height: '100%',
    borderRadius: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 20,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalSub: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  scanTextArea: {
    backgroundColor: '#090D16',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 10,
    color: '#F8FAFC',
    padding: 12,
    minHeight: 110,
    fontSize: 13,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  modalBtnsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  modalCancelText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
  },
  modalApplyBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#10B981',
  },
  modalApplyText: {
    color: '#052E16',
    fontSize: 13,
    fontWeight: '900',
  },
});

