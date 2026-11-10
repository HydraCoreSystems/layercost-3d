import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { analyzePrintQuote } from '../../src/engine/pricingEngine';
import { calculateThreeTierPricing } from '../../src/engine/marketplaceFees';
import { useLayerCost } from '../../src/store/useLayerCostStore';
import { canUse, limitQuoteForTier } from '../../src/services/tierGates';
import {
  exportCatalogCheatSheetPdf,
  exportSingleQuotePdf,
} from '../../src/services/pdfExport';

export default function CatalogScreen() {
  const router = useRouter();
  const {
    catalog,
    printers,
    spools,
    loadCatalogItemIntoCalculator,
    deleteCatalogItem,
    membershipTier,
  } = useLayerCost();
  const hasThreeTier = canUse(membershipTier, 'threeTierPricing');

  const [search, setSearch] = useState('');
  const [liveShowMode, setLiveShowMode] = useState(false);

  const filtered = catalog.filter(
    (c) =>
      c.productName.toLowerCase().includes(search.toLowerCase()) ||
      c.sku.toLowerCase().includes(search.toLowerCase()) ||
      c.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search products, SKUs, or categories..."
          placeholderTextColor="#64748B"
          style={styles.searchInput}
        />

        <View style={styles.topBtnsRow}>
          <Pressable
            onPress={() => setLiveShowMode(!liveShowMode)}
            style={[styles.modeBtn, liveShowMode && styles.modeBtnActive]}
          >
            <Text
              style={[
                styles.modeBtnText,
                liveShowMode && styles.modeBtnTextActive,
              ]}
            >
              {liveShowMode
                ? '🔥 Live Auction Floor View (ON)'
                : '🎙️ Switch to Live Show Cheat-Sheet'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => exportCatalogCheatSheetPdf(filtered, printers, spools)}
            style={styles.pdfBtn}
          >
            <Text style={styles.pdfBtnText}>📄 Export Master Price Sheet PDF</Text>
          </Pressable>
        </View>
      </View>

      {liveShowMode ? (
        <View style={styles.liveBanner}>
          <Text style={styles.liveBannerTitle}>
            🎙️ LIVE AUCTION & CRAFT BOOTH CHEAT SHEET
          </Text>
          <Text style={styles.liveBannerSub}>
            High-contrast view for Whatnot / PalmStreet streams. Never let a bid drop below the amber Auction Floor!
          </Text>
        </View>
      ) : null}

      {filtered.map((item) => {
        const printer =
          printers.find((p) => p.id === item.printerId) || printers[0];
        // Free plans see the single filament, one unit, cash sale view of each saved item.
        const shown = limitQuoteForTier(membershipTier, item);
        const analysis = analyzePrintQuote(shown, printer, spools);
        const pricing = calculateThreeTierPricing(analysis.activeUnit, shown);
        const u = analysis.activeUnit;

        return (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardTopRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.skuRow}>
                  <Text style={styles.skuBadge}>{item.sku || 'NO-SKU'}</Text>
                  <Text style={styles.catBadge}>{item.category}</Text>
                  <Text style={styles.channelBadge}>
                    {pricing.marketplace.shortName}
                  </Text>
                </View>
                <Text style={styles.productTitle}>{item.productName}</Text>
                <Text style={styles.metaLine}>
                  Printer: {printer.name} • Plate of {u.batchSize} ({u.totalGramsPerUnit.toFixed(0)}g/unit •{' '}
                  {u.printHoursPerUnitEffective.toFixed(1)}h/unit)
                </Text>
              </View>

              <View style={styles.actionsCol}>
                <Pressable
                  onPress={() => {
                    if (item.id) {
                      loadCatalogItemIntoCalculator(item.id);
                      router.push('/');
                    }
                  }}
                  style={styles.editBtn}
                >
                  <Text style={styles.editBtnText}>Edit in Calculator →</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.metricsRow}>
              <View style={styles.metricCell}>
                <Text style={styles.metricLabel}>TRUE COST</Text>
                <Text style={styles.metricValue}>${u.trueUnitCost.toFixed(2)}</Text>
                <Text style={styles.metricSub}>
                  Cash: ${u.hardOutOfPocketCost.toFixed(2)}
                </Text>
              </View>

              {hasThreeTier ? (
              <View style={[styles.metricCell, styles.floorCell]}>
                <Text style={styles.floorLabel}>AUCTION FLOOR</Text>
                <Text style={styles.floorValue}>
                  ${pricing.auctionFloorWholeDollar}.00
                </Text>
                <Text style={styles.metricSub}>
                  Min break-even: ${pricing.breakEvenPrice.toFixed(2)}
                </Text>
              </View>

              ) : null}

              {hasThreeTier ? (
              <View style={styles.metricCell}>
                <Text style={styles.metricLabel}>WHOLESALE</Text>
                <Text style={styles.metricValue}>
                  ${pricing.wholesalePrice.toFixed(2)}
                </Text>
                <Text style={styles.metricSub}>
                  +${pricing.wholesaleNetProfit.toFixed(2)}/ea
                </Text>
              </View>
              ) : null}

              <View style={[styles.metricCell, styles.retailCell]}>
                <Text style={styles.retailLabel}>
                  {pricing.marketplace.shortName.toUpperCase()} RETAIL
                </Text>
                <Text style={styles.retailValue}>
                  ${pricing.retailEvaluation.listingPrice.toFixed(2)}
                </Text>
                <Text style={styles.retailSub}>
                  Net: +${pricing.retailEvaluation.netProfit.toFixed(2)} (
                  {pricing.retailEvaluation.netMarginPercent.toFixed(0)}%)
                </Text>
              </View>
            </View>

            {!liveShowMode ? (
              <View style={styles.cardFooter}>
                <Text style={styles.footerInfo}>
                  Full Plate ({u.batchSize}x) Net Profit:{' '}
                  <Text style={{ color: '#10B981', fontWeight: '800' }}>
                    +${pricing.plateTotalNetProfit.toFixed(2)}
                  </Text>{' '}
                  • Total Plate Filament: {u.totalGramsForPlate.toFixed(0)}g
                </Text>
                <View style={styles.footerBtns}>
                  <Pressable
                    onPress={() => exportSingleQuotePdf(item, printer, spools)}
                    style={styles.smallBtn}
                  >
                    <Text style={styles.smallBtnText}>📄 Quote PDF</Text>
                  </Pressable>
                  {catalog.length > 1 && item.id ? (
                    <Pressable
                      onPress={() => deleteCatalogItem(item.id!)}
                      style={[styles.smallBtn, styles.deleteBtn]}
                    >
                      <Text style={styles.deleteBtnText}>Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'center',
  },
  topBar: {
    marginBottom: 16,
    gap: 10,
  },
  searchInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#F8FAFC',
    fontSize: 14,
  },
  topBtnsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modeBtnActive: {
    backgroundColor: '#451A03',
    borderColor: '#F59E0B',
  },
  modeBtnText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
  },
  modeBtnTextActive: {
    color: '#FDE68A',
  },
  pdfBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#064E3B',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  pdfBtnText: {
    color: '#ECFDF5',
    fontSize: 12,
    fontWeight: '800',
  },
  liveBanner: {
    backgroundColor: '#451A03',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  liveBannerTitle: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '900',
  },
  liveBannerSub: {
    color: '#FEF3C7',
    fontSize: 12,
    marginTop: 2,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 16,
    marginBottom: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  skuRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  skuBadge: {
    backgroundColor: '#1E293B',
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  catBadge: {
    backgroundColor: '#1E293B',
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  channelBadge: {
    backgroundColor: '#064E3B',
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  productTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
  },
  metaLine: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 3,
  },
  actionsCol: {
    alignItems: 'flex-end',
  },
  editBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  editBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCell: {
    flex: 1,
    minWidth: 130,
    backgroundColor: '#161F33',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#26334D',
  },
  floorCell: {
    backgroundColor: '#2E1605',
    borderColor: '#D97706',
  },
  retailCell: {
    backgroundColor: '#062C22',
    borderColor: '#10B981',
  },
  metricLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
  },
  floorLabel: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '900',
  },
  retailLabel: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '900',
  },
  metricValue: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '800',
    marginVertical: 3,
  },
  floorValue: {
    color: '#FDE68A',
    fontSize: 24,
    fontWeight: '900',
    marginVertical: 3,
  },
  retailValue: {
    color: '#ECFDF5',
    fontSize: 24,
    fontWeight: '900',
    marginVertical: 3,
  },
  metricSub: {
    color: '#94A3B8',
    fontSize: 11,
  },
  retailSub: {
    color: '#6EE7B7',
    fontSize: 11,
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  footerInfo: {
    color: '#94A3B8',
    fontSize: 12,
  },
  footerBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1E293B',
  },
  smallBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  deleteBtn: {
    backgroundColor: '#3F1D28',
  },
  deleteBtnText: {
    color: '#FDA4AF',
    fontSize: 11,
    fontWeight: '700',
  },
});

