import React, { useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLayerCost } from '../../src/store/useLayerCostStore';
import { analyzePrintQuote } from '../../src/engine/pricingEngine';
import {
  calculateThreeTierPricing,
  getMarketplacePreset,
} from '../../src/engine/marketplaceFees';
import { generateMarketplaceListingCopy } from '../../src/services/listingGenerator';
import { useEntitlement } from '../../src/services/EntitlementProvider';
import { canUse } from '../../src/services/tierGates';

export default function StudioScreen() {
  const {
    membershipTier,
    currentQuote,
    printers,
    spools,
    completedJobs,
    logCompletedBatch,
    resetDemoData,
  } = useLayerCost();

  const { openPaywall, requireFeature } = useEntitlement();
  const hasLedger = canUse(membershipTier, 'taxProfitLedger');
  const hasCopywriter = canUse(membershipTier, 'aiListingCopywriter');

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [batchLoggedBanner, setBatchLoggedBanner] = useState<string | null>(null);

  const selectedPrinter = useMemo(
    () => printers.find((p) => p.id === currentQuote.printerId) || printers[0],
    [printers, currentQuote.printerId]
  );

  const analysis = useMemo(
    () => analyzePrintQuote(currentQuote, selectedPrinter, spools),
    [currentQuote, selectedPrinter, spools]
  );

  const threeTier = useMemo(
    () => calculateThreeTierPricing(analysis.activeUnit, currentQuote),
    [analysis.activeUnit, currentQuote]
  );

  const listingCopy = useMemo(
    () => generateMarketplaceListingCopy(currentQuote, threeTier, spools),
    [currentQuote, threeTier, spools]
  );

  const ledgerTotals = useMemo(() => {
    return completedJobs.reduce(
      (acc, job) => {
        acc.grossRevenue += job.grossRevenue;
        acc.platformFees += job.platformFees;
        acc.productionCost += job.productionCost;
        acc.netProfit += job.netProfit;
        acc.totalGrams += job.totalGramsDeducted;
        acc.totalUnits += job.unitsSold;
        return acc;
      },
      {
        grossRevenue: 0,
        platformFees: 0,
        productionCost: 0,
        netProfit: 0,
        totalGrams: 0,
        totalUnits: 0,
      }
    );
  }, [completedJobs]);

  const handleCopy = async (label: string, text: string) => {
    try {
      await Clipboard.setStringAsync(text);
    } catch {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    }
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2200);
  };

  const handleCompleteCurrentBatch = () => {
    if (!requireFeature('spoolDepletion')) return;
    const qty = Math.max(1, currentQuote.plateQuantity);
    const preset = getMarketplacePreset(currentQuote.marketplaceId);
    const unitEval = threeTier.retailEvaluation;

    const deductions = currentQuote.filamentSlots.map((slot) => ({
      spoolId: slot.spoolId,
      grams: Math.round(
        (slot.modelGramsPerUnit + slot.supportGramsPerUnit) * qty + slot.purgeGramsPerPlate
      ),
    }));

    const totalGramsDeducted = deductions.reduce((sum, d) => sum + d.grams, 0);

    logCompletedBatch(
      {
        productName: currentQuote.productName,
        sku: currentQuote.sku,
        marketplaceName: preset.shortName,
        unitsSold: qty,
        totalGramsDeducted,
        grossRevenue: Number((unitEval.listingPrice * qty).toFixed(2)),
        platformFees: Number((unitEval.totalPlatformFees * qty).toFixed(2)),
        productionCost: Number((unitEval.trueUnitCost * qty).toFixed(2)),
        netProfit: Number((unitEval.netProfit * qty).toFixed(2)),
      },
      deductions
    );

    setBatchLoggedBanner(
      `Logged ${qty}x "${currentQuote.productName}" (+$${(unitEval.netProfit * qty).toFixed(
        2
      )} Net Profit) & deducted ${totalGramsDeducted}g from spools!`
    );
    setTimeout(() => setBatchLoggedBanner(null), 4000);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Studio Pass Status Hero */}
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>✨ LAYERCOST STUDIO PASS</Text>
          </View>
          <Text style={styles.heroPriceTag}>
            {membershipTier === 'studio'
              ? 'Studio Pass active'
              : 'Not active: Studio Pass unlocks this screen'}
          </Text>
        </View>
        <Text style={styles.heroTitle}>
          Automated Spool Depletion, Tax Profit Ledger & AI Listing Copywriter
        </Text>
        <Text style={styles.heroDesc}>
          Designed for active Etsy, Whatnot & Craft Show 3D print shops that want 1-tap inventory deduction and instant SEO listing copy.
        </Text>
        {membershipTier !== 'studio' && (
          <TouchableOpacity
            style={styles.unlockBtn}
            onPress={openPaywall}
          >
            <Text style={styles.unlockBtnText}>
              ⚡ See Studio Pass plans ($3.99/mo or $29.99/yr)
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 1-Tap Log Completed Print Batch & Deduct Spools */}
      <View style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>1-Tap Print Batch Completion</Text>
            <Text style={styles.sectionSub}>
              Deducts model + support + AMS purge grams from your active spools and records net profit in your tax ledger.
            </Text>
          </View>
        </View>

        <View style={styles.activeBatchBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.batchProductTitle}>
              {currentQuote.plateQuantity}x {currentQuote.productName}
            </Text>
            <Text style={styles.batchMeta}>
              Total Plate Filament: {Math.round(analysis.batchUnit.totalGramsForPlate)}g across{' '}
              {currentQuote.filamentSlots.length} slot(s) • Est. Net Profit: $
              {threeTier.plateTotalNetProfit.toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.logBatchBtn}
            onPress={handleCompleteCurrentBatch}
          >
            <Text style={styles.logBatchBtnText}>✓ Log Batch & Deduct Spools</Text>
          </TouchableOpacity>
        </View>

        {batchLoggedBanner && (
          <View style={styles.successBanner}>
            <Text style={styles.successBannerText}>✓ {batchLoggedBanner}</Text>
          </View>
        )}
      </View>

      {/* Print Job & Tax Profit Ledger */}
      <View style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Print Shop Profit & Tax Ledger</Text>
            <Text style={styles.sectionSub}>
              Track year-to-date gross sales, platform fee deductions, COGS, and filament consumed.
            </Text>
          </View>
          <TouchableOpacity style={styles.resetBtn} onPress={resetDemoData}>
            <Text style={styles.resetBtnText}>↻ Reset Demo</Text>
          </TouchableOpacity>
        </View>

        {hasLedger ? (
          <>
        <View style={styles.kpiGrid}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Gross Revenue</Text>
            <Text style={styles.kpiValue}>${ledgerTotals.grossRevenue.toFixed(2)}</Text>
            <Text style={styles.kpiSub}>{ledgerTotals.totalUnits} units sold</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Marketplace Fees</Text>
            <Text style={[styles.kpiValue, { color: '#F59E0B' }]}>
              -${ledgerTotals.platformFees.toFixed(2)}
            </Text>
            <Text style={styles.kpiSub}>Deductible expense</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Production COGS</Text>
            <Text style={[styles.kpiValue, { color: '#38BDF8' }]}>
              -${ledgerTotals.productionCost.toFixed(2)}
            </Text>
            <Text style={styles.kpiSub}>
              {(ledgerTotals.totalGrams / 1000).toFixed(2)} kg filament used
            </Text>
          </View>
          <View style={[styles.kpiBox, styles.kpiBoxHighlight]}>
            <Text style={styles.kpiLabel}>Net Take-Home Profit</Text>
            <Text style={[styles.kpiValue, { color: '#10B981' }]}>
              ${ledgerTotals.netProfit.toFixed(2)}
            </Text>
            <Text style={styles.kpiSub}>After all fees & costs</Text>
          </View>
        </View>

        {completedJobs.map((job) => (
          <View key={job.id} style={styles.jobRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.jobTitle}>
                {job.unitsSold}x {job.productName}
              </Text>
              <Text style={styles.jobSub}>
                {new Date(job.dateIso).toLocaleDateString()} • {job.marketplaceName} •{' '}
                {job.totalGramsDeducted}g deducted • Gross ${job.grossRevenue.toFixed(2)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.jobProfit}>+${job.netProfit.toFixed(2)} net</Text>
              <Text style={styles.jobFeeSub}>
                Fees: ${job.platformFees.toFixed(2)} | COGS: ${job.productionCost.toFixed(2)}
              </Text>
            </View>
          </View>
        ))}
          </>
        ) : (
          <Text style={styles.sectionSub}>
            The Tax & Net Profit Ledger is part of Studio Pass. Your logged jobs stay saved on this device and show again when Studio Pass is active.
          </Text>
        )}
      </View>

      {/* AI Marketplace Listing & Show Note Copywriter */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          AI Marketplace Listing & Live Show Copywriter
        </Text>
        <Text style={styles.sectionSub}>
          Automatically generated from your active quote ({currentQuote.productName}), materials, and 3-tier pricing.
        </Text>

        {hasCopywriter ? (
          <>
        {/* Etsy SEO Title */}
        <View style={styles.copyBlock}>
          <View style={styles.copyHeader}>
            <Text style={styles.copyLabel}>Etsy / Shopify 140-Char SEO Title</Text>
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={() => handleCopy('etsyTitle', listingCopy.etsyTitle)}
            >
              <Text style={styles.copyBtnText}>
                {copiedField === 'etsyTitle' ? '✓ Copied!' : '📋 Copy Title'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.copyContent}>{listingCopy.etsyTitle}</Text>
        </View>

        {/* Whatnot / PalmStreet Live Show Note */}
        <View style={styles.copyBlock}>
          <View style={styles.copyHeader}>
            <Text style={styles.copyLabel}>Whatnot / PalmStreet Pinned Show Note</Text>
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={() => handleCopy('whatnotNote', listingCopy.whatnotShowNote)}
            >
              <Text style={styles.copyBtnText}>
                {copiedField === 'whatnotNote' ? '✓ Copied!' : '📋 Copy Show Note'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.copyContent}>{listingCopy.whatnotShowNote}</Text>
        </View>

        {/* Full Product Description */}
        <View style={styles.copyBlock}>
          <View style={styles.copyHeader}>
            <Text style={styles.copyLabel}>Ready-to-Paste Product Description</Text>
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={() => handleCopy('desc', listingCopy.descriptionBody)}
            >
              <Text style={styles.copyBtnText}>
                {copiedField === 'desc' ? '✓ Copied!' : '📋 Copy Description'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.copyContent}>{listingCopy.descriptionBody}</Text>
        </View>

        {/* SEO Tags */}
        <View style={styles.copyBlock}>
          <View style={styles.copyHeader}>
            <Text style={styles.copyLabel}>1-Tap Marketplace Tags</Text>
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={() => handleCopy('tags', listingCopy.seoTags.join(', '))}
            >
              <Text style={styles.copyBtnText}>
                {copiedField === 'tags' ? '✓ Copied!' : '📋 Copy Comma Tags'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tagWrap}>
            {listingCopy.seoTags.map((t) => (
              <View key={t} style={styles.tagPill}>
                <Text style={styles.tagPillText}>#{t}</Text>
              </View>
            ))}
          </View>
        </View>
          </>
        ) : (
          <Text style={styles.sectionSub}>
            The AI listing copywriter is part of Studio Pass.
          </Text>
        )}
      </View>
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
  heroCard: {
    backgroundColor: '#131C31',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#38BDF8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  heroBadgeText: {
    color: '#090D16',
    fontSize: 11,
    fontWeight: '900',
  },
  heroPriceTag: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  heroDesc: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 18,
  },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  unlockBtnText: {
    color: '#090D16',
    fontSize: 13,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
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
  activeBatchBox: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  batchProductTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
  },
  batchMeta: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 3,
  },
  logBatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  logBatchBtnText: {
    color: '#090D16',
    fontSize: 12,
    fontWeight: '800',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  successBannerText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  resetBtnText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  kpiBox: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  kpiBoxHighlight: {
    borderColor: '#10B981',
  },
  kpiLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  kpiValue: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '900',
    marginVertical: 4,
  },
  kpiSub: {
    color: '#64748B',
    fontSize: 11,
  },
  jobRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  jobTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  jobSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  jobProfit: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '800',
  },
  jobFeeSub: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
  },
  copyBlock: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  copyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  copyLabel: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#38BDF8',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  copyBtnText: {
    color: '#090D16',
    fontSize: 11,
    fontWeight: '800',
  },
  copyContent: {
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 18,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagPill: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagPillText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
});
