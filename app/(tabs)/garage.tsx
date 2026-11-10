import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLayerCost } from '../../src/store/useLayerCostStore';
import { useEntitlement } from '../../src/services/EntitlementProvider';
import { canAddPrinterProfile, canUse } from '../../src/services/tierGates';
import {
  FilamentSpool,
  HardwareItem,
  MaterialType,
  PrinterProfile,
  getSpoolCostPerGram,
} from '../../src/engine/pricingEngine';

type GarageSubTab = 'spools' | 'printers' | 'hardware';

const MATERIAL_OPTIONS: MaterialType[] = [
  'PLA',
  'Matte PLA',
  'Silk PLA',
  'PLA+',
  'PETG',
  'TPU',
  'ABS',
  'ASA',
  'PA-CF',
];

export default function GarageScreen() {
  const {
    membershipTier,
    spools,
    printers,
    hardware,
    addOrUpdateSpool,
    refillSpool,
    deleteSpool,
    addOrUpdatePrinter,
    deletePrinter,
    addOrUpdateHardware,
    deleteHardware,
  } = useLayerCost();

  const { requireFeature } = useEntitlement();
  const hasLowStockWarnings = canUse(membershipTier, 'lowFilamentWarnings');

  const [subTab, setSubTab] = useState<GarageSubTab>('spools');

  // New Spool Form state
  const [spoolName, setSpoolName] = useState('');
  const [spoolBrand, setSpoolBrand] = useState('Bambu Lab');
  const [spoolMaterial, setSpoolMaterial] = useState<MaterialType>('PLA');
  const [spoolColorHex, setSpoolColorHex] = useState('#38BDF8');
  const [spoolPrice, setSpoolPrice] = useState('19.99');
  const [spoolWeight, setSpoolWeight] = useState('1000');

  // New Printer Form state
  const [printerName, setPrinterName] = useState('');
  const [printerBrand, setPrinterBrand] = useState('Bambu Lab');
  const [printerWatts, setPrinterWatts] = useState('135');
  const [printerPrice, setPrinterPrice] = useState('799');
  const [printerLifespan, setPrinterLifespan] = useState('4000');
  const [printerMaint, setPrinterMaint] = useState('0.12');

  // New Hardware Form state
  const [hwName, setHwName] = useState('');
  const [hwCategory, setHwCategory] = useState<HardwareItem['category']>('magnet');
  const [hwPackPrice, setHwPackPrice] = useState('9.99');
  const [hwPackQty, setHwPackQty] = useState('100');

  const handleAddSpool = () => {
    if (!spoolName.trim()) return;
    const weight = Math.max(100, parseFloat(spoolWeight) || 1000);
    const newSpool: FilamentSpool = {
      id: `spool-${Date.now()}`,
      name: spoolName.trim(),
      brand: spoolBrand.trim() || 'Generic',
      material: spoolMaterial,
      colorName: spoolName.trim(),
      colorHex: spoolColorHex.startsWith('#') ? spoolColorHex : `#${spoolColorHex}`,
      spoolPrice: Math.max(1, parseFloat(spoolPrice) || 19.99),
      spoolWeightGrams: weight,
      remainingGrams: weight,
      lowStockThresholdGrams: Math.round(weight * 0.18),
    };
    addOrUpdateSpool(newSpool);
    setSpoolName('');
  };

  const handleAdjustSpoolGrams = (spool: FilamentSpool, delta: number) => {
    const nextRemaining = Math.max(
      0,
      Math.min(spool.spoolWeightGrams, spool.remainingGrams + delta)
    );
    addOrUpdateSpool({
      ...spool,
      remainingGrams: nextRemaining,
    });
  };

  const handleAddPrinter = () => {
    if (!printerName.trim()) return;
    // Free plans keep one printer profile. Existing profiles are never removed.
    if (!canAddPrinterProfile(membershipTier, printers.length) && !requireFeature('amsBatchOptimizer')) return;
    const newPrinter: PrinterProfile = {
      id: `printer-${Date.now()}`,
      name: printerName.trim(),
      brand: printerBrand.trim() || 'Custom',
      powerWatts: Math.max(10, parseFloat(printerWatts) || 120),
      purchasePrice: Math.max(50, parseFloat(printerPrice) || 500),
      lifespanHours: Math.max(500, parseFloat(printerLifespan) || 4000),
      maintenancePerHour: Math.max(0, parseFloat(printerMaint) || 0.1),
      maxPlateCapacityHint: 10,
    };
    addOrUpdatePrinter(newPrinter);
    setPrinterName('');
  };

  const handleAddHardware = () => {
    if (!hwName.trim()) return;
    const newHw: HardwareItem = {
      id: `hw-${Date.now()}`,
      name: hwName.trim(),
      category: hwCategory,
      packPrice: Math.max(0.1, parseFloat(hwPackPrice) || 9.99),
      packQuantity: Math.max(1, parseInt(hwPackQty, 10) || 100),
    };
    addOrUpdateHardware(newHw);
    setHwName('');
  };

  const lowStockCount = hasLowStockWarnings
    ? spools.filter((s) => s.remainingGrams <= s.lowStockThresholdGrams).length
    : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Sub-navigation */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, subTab === 'spools' && styles.tabBtnActive]}
          onPress={() => setSubTab('spools')}
        >
          <Text style={[styles.tabBtnText, subTab === 'spools' && styles.tabBtnTextActive]}>
            🧵 Spools ({spools.length})
          </Text>
          {lowStockCount > 0 && (
            <View style={styles.lowBadge}>
              <Text style={styles.lowBadgeText}>{lowStockCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, subTab === 'printers' && styles.tabBtnActive]}
          onPress={() => setSubTab('printers')}
        >
          <Text style={[styles.tabBtnText, subTab === 'printers' && styles.tabBtnTextActive]}>
            🖨️ Printers ({printers.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, subTab === 'hardware' && styles.tabBtnActive]}
          onPress={() => setSubTab('hardware')}
        >
          <Text style={[styles.tabBtnText, subTab === 'hardware' && styles.tabBtnTextActive]}>
            🔩 BOM Parts ({hardware.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* SPOOLS SUB-TAB */}
      {subTab === 'spools' && (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Filament Spool Locker & Fuel Gauges</Text>
            <Text style={styles.sectionSub}>
              Track exact $/g per spool and remaining filament weight so a mid-plate runout never ruins a print batch.
            </Text>

            {spools.map((spool) => {
              const pct = Math.min(
                100,
                Math.max(0, Math.round((spool.remainingGrams / spool.spoolWeightGrams) * 100))
              );
              const isLow = hasLowStockWarnings && spool.remainingGrams <= spool.lowStockThresholdGrams;
              const costPerGram = getSpoolCostPerGram(spool);

              return (
                <View
                  key={spool.id}
                  style={[styles.itemCard, isLow && styles.itemCardLowStock]}
                >
                  <View style={styles.itemHeader}>
                    <View style={styles.spoolTitleWrap}>
                      <View
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: spool.colorHex || '#38BDF8' },
                        ]}
                      />
                      <View>
                        <Text style={styles.itemTitle}>{spool.name}</Text>
                        <Text style={styles.itemMeta}>
                          {spool.brand} • {spool.material} • ${spool.spoolPrice.toFixed(2)} /{' '}
                          {spool.spoolWeightGrams}g (${costPerGram.toFixed(3)}/g)
                        </Text>
                      </View>
                    </View>
                    {isLow && (
                      <View style={styles.lowStockPill}>
                        <Text style={styles.lowStockPillText}>⚠️ LOW STOCK</Text>
                      </View>
                    )}
                  </View>

                  {/* Fuel gauge bar */}
                  <View style={styles.gaugeTrack}>
                    <View
                      style={[
                        styles.gaugeFill,
                        {
                          width: `${pct}%`,
                          backgroundColor: isLow
                            ? '#F59E0B'
                            : pct > 50
                            ? '#10B981'
                            : '#38BDF8',
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.spoolFooter}>
                    <Text style={styles.remainingText}>
                      <Text style={styles.remainingStrong}>{spool.remainingGrams}g</Text> /{' '}
                      {spool.spoolWeightGrams}g remaining ({pct}%)
                    </Text>

                    <View style={styles.spoolActions}>
                      <TouchableOpacity
                        style={styles.quickBtn}
                        onPress={() => handleAdjustSpoolGrams(spool, -50)}
                      >
                        <Text style={styles.quickBtnText}>-50g</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.quickBtn}
                        onPress={() => handleAdjustSpoolGrams(spool, 50)}
                      >
                        <Text style={styles.quickBtnText}>+50g</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.refillBtn}
                        onPress={() => refillSpool(spool.id, spool.spoolWeightGrams)}
                      >
                        <Text style={styles.refillBtnText}>↻ Fresh Spool</Text>
                      </TouchableOpacity>
                      {spools.length > 1 && (
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => deleteSpool(spool.id)}
                        >
                          <Text style={styles.deleteBtnText}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Add New Spool Card */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Add New Filament Spool</Text>
            <View style={styles.formGrid}>
              <View style={styles.fieldFull}>
                <Text style={styles.label}>Spool / Color Name</Text>
                <TextInput
                  style={styles.input}
                  value={spoolName}
                  onChangeText={setSpoolName}
                  placeholder="e.g. Galaxy Nebula Purple"
                  placeholderTextColor="#64748B"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>Brand</Text>
                <TextInput
                  style={styles.input}
                  value={spoolBrand}
                  onChangeText={setSpoolBrand}
                  placeholder="Bambu Lab"
                  placeholderTextColor="#64748B"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>Hex Swatch</Text>
                <TextInput
                  style={styles.input}
                  value={spoolColorHex}
                  onChangeText={setSpoolColorHex}
                  placeholder="#8B5CF6"
                  placeholderTextColor="#64748B"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>Spool Price ($)</Text>
                <TextInput
                  style={styles.input}
                  value={spoolPrice}
                  onChangeText={setSpoolPrice}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>Spool Net Weight (g)</Text>
                <TextInput
                  style={styles.input}
                  value={spoolWeight}
                  onChangeText={setSpoolWeight}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={[styles.label, { marginTop: 10 }]}>Material Type</Text>
            <View style={styles.pillRow}>
              {MATERIAL_OPTIONS.map((mat) => (
                <TouchableOpacity
                  key={mat}
                  style={[styles.pill, spoolMaterial === mat && styles.pillActive]}
                  onPress={() => setSpoolMaterial(mat)}
                >
                  <Text
                    style={[styles.pillText, spoolMaterial === mat && styles.pillTextActive]}
                  >
                    {mat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.primaryAddBtn} onPress={handleAddSpool}>
              <Text style={styles.primaryAddBtnText}>+ Add Spool to Locker</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* PRINTERS SUB-TAB */}
      {subTab === 'printers' && (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>3D Printer Fleet & Hourly Wear Rates</Text>
            <Text style={styles.sectionSub}>
              Automatically factors machine depreciation, nozzle/belt maintenance, and wattage draw into every print hour.
            </Text>

            {printers.map((printer) => {
              const depPerHr = printer.purchasePrice / Math.max(1, printer.lifespanHours);
              const totalHourlyWear = depPerHr + printer.maintenancePerHour;

              return (
                <View key={printer.id} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <View>
                      <Text style={styles.itemTitle}>{printer.name}</Text>
                      <Text style={styles.itemMeta}>
                        {printer.brand} • {printer.powerWatts}W avg draw • ${printer.purchasePrice}{' '}
                        over {printer.lifespanHours} hrs
                      </Text>
                    </View>
                    {printers.length > 1 && (
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => deletePrinter(printer.id)}
                      >
                        <Text style={styles.deleteBtnText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.printerMetricsRow}>
                    <View style={styles.metricBadge}>
                      <Text style={styles.metricLabel}>Depreciation/hr</Text>
                      <Text style={styles.metricVal}>${depPerHr.toFixed(2)}/hr</Text>
                    </View>
                    <View style={styles.metricBadge}>
                      <Text style={styles.metricLabel}>Maintenance/hr</Text>
                      <Text style={styles.metricVal}>
                        ${printer.maintenancePerHour.toFixed(2)}/hr
                      </Text>
                    </View>
                    <View style={styles.metricBadge}>
                      <Text style={styles.metricLabel}>Total Machine/hr</Text>
                      <Text style={[styles.metricVal, { color: '#38BDF8' }]}>
                        ${totalHourlyWear.toFixed(2)}/hr
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Add Printer to Fleet</Text>
            <View style={styles.formGrid}>
              <View style={styles.fieldFull}>
                <Text style={styles.label}>Printer Model Name</Text>
                <TextInput
                  style={styles.input}
                  value={printerName}
                  onChangeText={setPrinterName}
                  placeholder="e.g. Bambu Lab P1S #2"
                  placeholderTextColor="#64748B"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>Purchase Price ($)</Text>
                <TextInput
                  style={styles.input}
                  value={printerPrice}
                  onChangeText={setPrinterPrice}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>Lifespan (Hours)</Text>
                <TextInput
                  style={styles.input}
                  value={printerLifespan}
                  onChangeText={setPrinterLifespan}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>Avg Power Draw (Watts)</Text>
                <TextInput
                  style={styles.input}
                  value={printerWatts}
                  onChangeText={setPrinterWatts}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>Maint. & Nozzles ($/hr)</Text>
                <TextInput
                  style={styles.input}
                  value={printerMaint}
                  onChangeText={setPrinterMaint}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <TouchableOpacity style={styles.primaryAddBtn} onPress={handleAddPrinter}>
              <Text style={styles.primaryAddBtnText}>+ Add Printer Profile</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* HARDWARE / BOM SUB-TAB */}
      {subTab === 'hardware' && (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Non-Printed Hardware & BOM Parts</Text>
            <Text style={styles.sectionSub}>
              Enter bulk pack prices (magnets, M3 inserts, keyrings, LEDs, boxes) and LayerCost calculates exact per-piece cost.
            </Text>

            {hardware.map((item) => {
              const unitCost = item.packPrice / Math.max(1, item.packQuantity);
              return (
                <View key={item.id} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <View>
                      <Text style={styles.itemTitle}>{item.name}</Text>
                      <Text style={styles.itemMeta}>
                        Category: {item.category.toUpperCase()} • Pack: $
                        {item.packPrice.toFixed(2)} for {item.packQuantity} pcs
                      </Text>
                    </View>
                    <View style={styles.hwRight}>
                      <Text style={styles.hwUnitCost}>${unitCost.toFixed(3)} / ea</Text>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => deleteHardware(item.id)}
                      >
                        <Text style={styles.deleteBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Add Hardware / BOM Component</Text>
            <View style={styles.formGrid}>
              <View style={styles.fieldFull}>
                <Text style={styles.label}>Part Name</Text>
                <TextInput
                  style={styles.input}
                  value={hwName}
                  onChangeText={setHwName}
                  placeholder="e.g. 10x3mm Neodymium Magnet"
                  placeholderTextColor="#64748B"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>Bulk Pack Price ($)</Text>
                <TextInput
                  style={styles.input}
                  value={hwPackPrice}
                  onChangeText={setHwPackPrice}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.label}>Pieces in Pack</Text>
                <TextInput
                  style={styles.input}
                  value={hwPackQty}
                  onChangeText={setHwPackQty}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={[styles.label, { marginTop: 10 }]}>Category</Text>
            <View style={styles.pillRow}>
              {(
                ['magnet', 'insert', 'keyring', 'electronics', 'packaging', 'other'] as const
              ).map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.pill, hwCategory === cat && styles.pillActive]}
                  onPress={() => setHwCategory(cat)}
                >
                  <Text style={[styles.pillText, hwCategory === cat && styles.pillTextActive]}>
                    {cat.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.primaryAddBtn} onPress={handleAddHardware}>
              <Text style={styles.primaryAddBtnText}>+ Add BOM Component</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  content: {
    padding: 16,
    paddingBottom: 44,
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  tabBtnActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  tabBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  tabBtnTextActive: {
    color: '#090D16',
  },
  lowBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  lowBadgeText: {
    color: '#090D16',
    fontSize: 10,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  sectionSub: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 18,
  },
  itemCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  itemCardLowStock: {
    borderColor: '#F59E0B',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spoolTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#334155',
  },
  itemTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  itemMeta: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  lowStockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  lowStockPillText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '800',
  },
  gaugeTrack: {
    height: 8,
    backgroundColor: '#1E293B',
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 10,
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 4,
  },
  spoolFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  remainingText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  remainingStrong: {
    color: '#F8FAFC',
    fontWeight: '800',
  },
  spoolActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  quickBtnText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
  },
  refillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B981',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
  refillBtnText: {
    color: '#090D16',
    fontSize: 11,
    fontWeight: '800',
  },
  deleteBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  deleteBtnText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '800',
  },
  printerMetricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  metricBadge: {
    flex: 1,
    backgroundColor: '#111827',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
  metricVal: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  hwRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hwUnitCost: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '800',
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  fieldFull: {
    width: '100%',
  },
  fieldHalf: {
    flex: 1,
    minWidth: 140,
  },
  label: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#090D16',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#F8FAFC',
    fontSize: 13,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
    marginBottom: 14,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#090D16',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  pillActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  pillText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  pillTextActive: {
    color: '#090D16',
  },
  primaryAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#38BDF8',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  primaryAddBtnText: {
    color: '#090D16',
    fontSize: 13,
    fontWeight: '800',
  },
});
