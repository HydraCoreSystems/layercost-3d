import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  DEFAULT_PRINTERS,
  MembershipTier,
  useLayerCost,
} from '../../src/store/useLayerCostStore';
import {
  APP_STORE_PRODUCTS,
  FREE_PLAN,
  APPLE_SUBSCRIPTION_DISCLOSURE,
  PRIVACY_POLICY_TEXT,
  TERMS_OF_USE_TEXT,
} from '../../src/services/iapService';
import { useEntitlement } from '../../src/services/EntitlementProvider';
import { canUse } from '../../src/services/tierGates';

const WIZARD_PRINTER_CATALOG = [
  ...DEFAULT_PRINTERS,
  {
    id: 'bambu-h2d',
    name: 'Bambu Lab H2D Dual-Nozzle + AMS',
    brand: 'Bambu Lab',
    powerWatts: 185,
    purchasePrice: 1999,
    lifespanHours: 5000,
    maintenancePerHour: 0.18,
    maxPlateCapacityHint: 14,
  },
  {
    id: 'creality-k1-max',
    name: 'Creality K1 Max / K2 Plus CFS',
    brand: 'Creality',
    powerWatts: 160,
    purchasePrice: 799,
    lifespanHours: 3500,
    maintenancePerHour: 0.14,
    maxPlateCapacityHint: 12,
  },
  {
    id: 'elegoo-neptune4',
    name: 'Elegoo Neptune 4 Plus / Max',
    brand: 'Elegoo',
    powerWatts: 145,
    purchasePrice: 369,
    lifespanHours: 3000,
    maintenancePerHour: 0.11,
    maxPlateCapacityHint: 12,
  },
];

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.6 }}>{symbol}</Text>
  );
}

export default function TabsLayout() {
  const {
    membershipTier,
    spools,
    printers,
    settings,
    updateSettings,
    setPrintersList,
    splashVisible,
    dismissSplash,
    wizardVisible,
    closeSetupWizard,
  } = useLayerCost();

  const {
    paywallVisible: tierModalVisible,
    openPaywall,
    closePaywall,
    status: entitlementStatus,
    storeNotice,
    purchasesEnabled,
    restoreEnabled,
    storePrices,
    busy: storeBusy,
    message: storeMessage,
    purchase,
    restore,
  } = useEntitlement();
  const [legalDocView, setLegalDocView] = useState<'none' | 'privacy' | 'terms'>('none');
  const [splashProgress, setSplashProgress] = useState(0);

  // Onboarding Wizard local state
  const [wizStep, setWizStep] = useState<1 | 2 | 3>(1);
  const [wizShopName, setWizShopName] = useState(settings.shopName);
  const [wizOwnerName, setWizOwnerName] = useState(settings.ownerName);
  const [wizLocation, setWizLocation] = useState(settings.locationRegion);
  const [wizKwh, setWizKwh] = useState(String(settings.defaultElectricityRate));
  const [wizLabor, setWizLabor] = useState(String(settings.defaultLaborRate));
  const [wizSelectedPrinterIds, setWizSelectedPrinterIds] = useState<string[]>(
    () => printers.map((p) => p.id)
  );

  useEffect(() => {
    if (!splashVisible) return;
    setSplashProgress(0);
    const interval = setInterval(() => {
      setSplashProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => dismissSplash(), 200);
          return 100;
        }
        return prev + 5;
      });
    }, 105);
    return () => clearInterval(interval);
  }, [splashVisible]);

  const toggleWizardPrinter = (id: string) => {
    setWizSelectedPrinterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleFinishWizard = () => {
    updateSettings({
      shopName: wizShopName.trim() || 'LayerCost 3D Studio',
      ownerName: wizOwnerName.trim() || 'Studio Maker',
      locationRegion: wizLocation,
      defaultElectricityRate: parseFloat(wizKwh) || 0.14,
      defaultLaborRate: parseFloat(wizLabor) || 22,
    });
    const chosen = WIZARD_PRINTER_CATALOG.filter((p) =>
      wizSelectedPrinterIds.includes(p.id)
    );
    if (chosen.length > 0) {
      setPrintersList(chosen);
    }
    closeSetupWizard();
  };

  const lowStockCount = !canUse(membershipTier, 'lowFilamentWarnings') ? 0 : spools.filter(
    (s) => s.remainingGrams <= s.lowStockThresholdGrams
  ).length;

  const isLight = settings.themeMode === 'light';

  const tierLabel =
    membershipTier === 'studio'
      ? '⚡ STUDIO PASS'
      : membershipTier === 'pro'
      ? '💎 PRO UNLOCKED'
      : 'FREE TIER';

  return (
    <>
      <Tabs
        screenOptions={{
          headerStyle: {
            backgroundColor: isLight ? '#FFFFFF' : '#090D16',
            borderBottomColor: isLight ? '#CBD5E1' : '#1E293B',
            borderBottomWidth: 1,
          },
          headerTintColor: isLight ? '#0F172A' : '#F8FAFC',
          headerTitleStyle: {
            fontWeight: '800',
            fontSize: 16,
            letterSpacing: -0.3,
          },
          tabBarStyle: {
            backgroundColor: isLight ? '#FFFFFF' : '#090D16',
            borderTopColor: isLight ? '#CBD5E1' : '#1E293B',
            borderTopWidth: 1,
            height: Platform.OS === 'ios' ? 84 : 64,
            paddingBottom: Platform.OS === 'ios' ? 24 : 8,
            paddingTop: 6,
          },
          tabBarActiveTintColor: '#10B981',
          tabBarInactiveTintColor: '#64748B',
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '700',
          },
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={() =>
                  updateSettings({
                    themeMode: isLight ? 'dark' : 'light',
                  })
                }
                style={styles.themeBtn}
              >
                <Text style={styles.themeBtnText}>
                  {isLight ? '🌙 Dark' : '☀️ Light'}
                </Text>
              </Pressable>
              <Pressable
                onPress={openPaywall}
                style={({ pressed }) => [
                  styles.tierPill,
                  membershipTier === 'studio' && styles.tierPillStudio,
                  membershipTier === 'pro' && styles.tierPillPro,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={styles.tierPillText}>{tierLabel}</Text>
              </Pressable>
            </View>
          ),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Calculator',
            headerTitle: `${settings.shopName} — Pricing`,
            tabBarIcon: ({ focused }) => <TabIcon symbol="🧮" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="catalog"
          options={{
            title: 'Catalog & Live',
            headerTitle: 'Product Catalog & Auction Floor',
            tabBarIcon: ({ focused }) => <TabIcon symbol="🏷️" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="garage"
          options={{
            title: 'Spools & Fleet',
            headerTitle: 'Printers, Spools & Hardware BOM',
            tabBarBadge: lowStockCount > 0 ? lowStockCount : undefined,
            tabBarBadgeStyle: {
              backgroundColor: '#F59E0B',
              color: '#090D16',
              fontWeight: '800',
            },
            tabBarIcon: ({ focused }) => <TabIcon symbol="🧵" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="studio"
          options={{
            title: 'Studio Pass',
            headerTitle: 'Studio Pass — Ledger & AI Tools',
            tabBarIcon: ({ focused }) => <TabIcon symbol="🚀" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            headerTitle: 'Shop Setup, Theme & Backup',
            tabBarIcon: ({ focused }) => <TabIcon symbol="⚙️" focused={focused} />,
          }}
        />
      </Tabs>

      {/* STARTUP TITLE SCREEN MODAL */}
      <Modal visible={splashVisible} transparent={false} animationType="fade">
        <View style={styles.splashContainer}>
          <View style={styles.splashEmblem}>
            <View style={styles.splashLayerBar1} />
            <View style={styles.splashLayerBar2} />
            <View style={styles.splashLayerBar3} />
            <View style={styles.splashLayerBar4} />
          </View>
          <Text style={styles.splashTitle}>LayerCost 3D</Text>
          <Text style={styles.splashSubtitle}>
            Precision 3D Print Costing, AMS Purge Optimizer & Live Show Pricing Studio
          </Text>

          <View style={styles.splashBadgesRow}>
            <View style={styles.splashBadge}>
              <Text style={styles.splashBadgeText}>AMS Purge & Batch Math</Text>
            </View>
            <View style={styles.splashBadge}>
              <Text style={styles.splashBadgeText}>Etsy • Whatnot • PalmStreet</Text>
            </View>
            <View style={styles.splashBadge}>
              <Text style={styles.splashBadgeText}>3-Tier Profit Solver</Text>
            </View>
          </View>

          <View style={styles.splashTrack}>
            <View style={[styles.splashFill, { width: `${splashProgress}%` }]} />
          </View>
          <Text style={styles.splashStatus}>
            {splashProgress < 40
              ? 'Loading printer fleet & filament locker...'
              : splashProgress < 80
              ? 'Calibrating AMS multicolor purge & marketplace fee tables...'
              : 'Ready! Entering LayerCost 3D Studio...'}
          </Text>

          <Pressable onPress={dismissSplash} style={styles.splashSkipBtn}>
            <Text style={styles.splashSkipText}>Skip Intro →</Text>
          </Pressable>
        </View>
      </Modal>

      {/* FIRST-RUN SHOP SETUP WIZARD MODAL */}
      <Modal
        visible={wizardVisible}
        transparent
        animationType="slide"
        onRequestClose={closeSetupWizard}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={{ color: '#38BDF8', fontSize: 11, fontWeight: '800' }}>
                  INITIAL STUDIO SETUP ({wizStep}/3)
                </Text>
                <Text style={styles.modalTitle}>Configure Your 3D Print Shop</Text>
              </View>
              <Pressable onPress={closeSetupWizard} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>Skip</Text>
              </Pressable>
            </View>

            {wizStep === 1 && (
              <ScrollView style={{ maxHeight: 420 }}>
                <Text style={styles.modalSubtitle}>
                  Step 1: Enter your studio name and local electricity rate so machine costs and PDF quotes match your location.
                </Text>
                <Text style={styles.wizLabel}>Shop / Studio Name</Text>
                <TextInput
                  style={styles.wizInput}
                  value={wizShopName}
                  onChangeText={setWizShopName}
                  placeholder="e.g. Precision Layer Works"
                  placeholderTextColor="#64748B"
                />
                <Text style={styles.wizLabel}>Owner / Maker Name</Text>
                <TextInput
                  style={styles.wizInput}
                  value={wizOwnerName}
                  onChangeText={setWizOwnerName}
                  placeholder="e.g. Studio Maker"
                  placeholderTextColor="#64748B"
                />
                <Text style={styles.wizLabel}>Region Preset (Sets Electricity $/kWh)</Text>
                <View style={styles.wizRegionRow}>
                  {[
                    { name: 'US Avg ($0.14)', rate: '0.14', loc: 'US National Avg' },
                    { name: 'Midwest/TX ($0.12)', rate: '0.12', loc: 'Midwest / South' },
                    { name: 'Northeast ($0.22)', rate: '0.22', loc: 'US Northeast' },
                    { name: 'CA / High ($0.29)', rate: '0.29', loc: 'California' },
                  ].map((r) => (
                    <Pressable
                      key={r.name}
                      style={[
                        styles.wizPill,
                        wizKwh === r.rate && styles.wizPillActive,
                      ]}
                      onPress={() => {
                        setWizKwh(r.rate);
                        setWizLocation(r.loc);
                      }}
                    >
                      <Text
                        style={[
                          styles.wizPillText,
                          wizKwh === r.rate && { color: '#090D16' },
                        ]}
                      >
                        {r.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.wizLabel}>Exact Electricity Rate ($/kWh)</Text>
                <TextInput
                  style={styles.wizInput}
                  value={wizKwh}
                  onChangeText={setWizKwh}
                  keyboardType="decimal-pad"
                />
                <Pressable
                  style={styles.wizPrimaryBtn}
                  onPress={() => setWizStep(2)}
                >
                  <Text style={styles.wizPrimaryBtnText}>
                    Next: Select Your 3D Printers →
                  </Text>
                </Pressable>
              </ScrollView>
            )}

            {wizStep === 2 && (
              <ScrollView style={{ maxHeight: 420 }}>
                <Text style={styles.modalSubtitle}>
                  Step 2: Tap the 3D printers you own so LayerCost pre-loads their wattage, depreciation, and hourly wear.
                </Text>
                {WIZARD_PRINTER_CATALOG.map((p) => {
                  const checked = wizSelectedPrinterIds.includes(p.id);
                  return (
                    <Pressable
                      key={p.id}
                      style={[
                        styles.tierCard,
                        checked && styles.tierCardActive,
                        { padding: 10 },
                      ]}
                      onPress={() => toggleWizardPrinter(p.id)}
                    >
                      <Text style={styles.tierCardTitle}>
                        {checked ? '☑️ ' : '⬜ '} {p.name}
                      </Text>
                      <Text style={styles.tierStatus}>
                        {p.powerWatts}W • ${p.purchasePrice} over {p.lifespanHours} hrs
                      </Text>
                    </Pressable>
                  );
                })}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  <Pressable
                    style={[styles.wizSecondaryBtn, { flex: 1 }]}
                    onPress={() => setWizStep(1)}
                  >
                    <Text style={styles.wizSecondaryBtnText}>← Back</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.wizPrimaryBtn, { flex: 2, marginTop: 0 }]}
                    onPress={() => setWizStep(3)}
                  >
                    <Text style={styles.wizPrimaryBtnText}>Next: Maker Wage →</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}

            {wizStep === 3 && (
              <View>
                <Text style={styles.modalSubtitle}>
                  Step 3: Set your hands-on maker wage ($/hr for plate prep, support removal & packing) and color theme.
                </Text>
                <Text style={styles.wizLabel}>Maker Hands-On Wage ($/hr)</Text>
                <TextInput
                  style={styles.wizInput}
                  value={wizLabor}
                  onChangeText={setWizLabor}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.wizLabel}>Color Theme</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  <Pressable
                    style={[
                      styles.wizPill,
                      settings.themeMode === 'dark' && styles.wizPillActive,
                    ]}
                    onPress={() => updateSettings({ themeMode: 'dark' })}
                  >
                    <Text
                      style={[
                        styles.wizPillText,
                        settings.themeMode === 'dark' && { color: '#090D16' },
                      ]}
                    >
                      🌙 Midnight Studio (Dark)
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.wizPill,
                      settings.themeMode === 'light' && styles.wizPillActive,
                    ]}
                    onPress={() => updateSettings({ themeMode: 'light' })}
                  >
                    <Text
                      style={[
                        styles.wizPillText,
                        settings.themeMode === 'light' && { color: '#090D16' },
                      ]}
                    >
                      ☀️ Daylight Workshop (Light)
                    </Text>
                  </Pressable>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    style={[styles.wizSecondaryBtn, { flex: 1 }]}
                    onPress={() => setWizStep(2)}
                  >
                    <Text style={styles.wizSecondaryBtnText}>← Back</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.wizPrimaryBtn,
                      { flex: 2, marginTop: 0, backgroundColor: '#10B981' },
                    ]}
                    onPress={handleFinishWizard}
                  >
                    <Text style={styles.wizPrimaryBtnText}>
                      ✓ Save Setup & Start Pricing
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* APP STORE TIER PREVIEW MODAL */}
      <Modal
        visible={tierModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closePaywall}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>LayerCost 3D — App Store Tiers</Text>
              <Pressable
                onPress={closePaywall}
                style={styles.closeBtn}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>
              Your plan comes from your Apple ID purchases. Choose a plan or restore an earlier purchase:
            </Text>

            <ScrollView style={{ maxHeight: 460 }}>
              {legalDocView !== 'none' ? (
                <View style={styles.tierCard}>
                  <View style={styles.tierCardTop}>
                    <Text style={styles.tierCardTitle}>
                      {legalDocView === 'privacy'
                        ? 'Privacy Policy'
                        : 'Terms of Use (EULA)'}
                    </Text>
                    <Pressable onPress={() => setLegalDocView('none')}>
                      <Text style={{ color: '#38BDF8', fontSize: 12, fontWeight: '800' }}>
                        ← Back to Plans
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.tierCardDesc}>
                    {legalDocView === 'privacy'
                      ? PRIVACY_POLICY_TEXT
                      : TERMS_OF_USE_TEXT}
                  </Text>
                </View>
              ) : (
                <>
                  {storeNotice ? (
                    <View style={[styles.tierCard, { borderColor: '#F59E0B' }]}>
                      <Text style={[styles.tierCardDesc, { color: '#FBBF24' }]}>{storeNotice}</Text>
                    </View>
                  ) : null}
                  {entitlementStatus === 'checking' ? (
                    <Text style={[styles.tierCardDesc, { textAlign: 'center', marginVertical: 6 }]}>
                      Checking with the App Store...
                    </Text>
                  ) : null}

                  <View
                    style={[styles.tierCard, membershipTier === 'free' && styles.tierCardActive]}
                  >
                    <View style={styles.tierCardTop}>
                      <Text style={styles.tierCardTitle}>{FREE_PLAN.title}</Text>
                      <Text style={styles.tierCardPrice}>{FREE_PLAN.priceString}</Text>
                    </View>
                    <Text style={styles.tierCardDesc}>{FREE_PLAN.headline}</Text>
                    <Text style={[styles.tierStatus, membershipTier === 'free' && { color: '#10B981' }]}>
                      {membershipTier === 'free' ? '✓ Current plan' : 'Included with every install'}
                    </Text>
                  </View>

                  {APP_STORE_PRODUCTS.map((p) => {
                    const active = membershipTier === p.tier;
                    const price = storePrices[p.productId]?.displayPrice;
                    const priceLabel = price
                      ? p.billingPeriod === 'monthly'
                        ? `${price} / month`
                        : p.billingPeriod === 'annual'
                          ? `${price} / year`
                          : price
                      : p.priceString;
                    return (
                      <Pressable
                        key={p.productId}
                        disabled={!purchasesEnabled || storeBusy || active}
                        onPress={() => purchase(p.productId)}
                        style={[
                          styles.tierCard,
                          active && styles.tierCardActive,
                          !purchasesEnabled && !active && { opacity: 0.55 },
                        ]}
                      >
                        <View style={styles.tierCardTop}>
                          <Text style={styles.tierCardTitle}>{p.title}</Text>
                          <Text style={styles.tierCardPrice}>{priceLabel}</Text>
                        </View>
                        <Text style={styles.tierCardDesc}>{p.headline}</Text>
                        <Text
                          style={[
                            styles.tierStatus,
                            active && { color: '#10B981' },
                          ]}
                        >
                          {active
                            ? '✓ Current plan'
                            : purchasesEnabled
                              ? storeBusy
                                ? 'Working with the App Store...'
                                : 'Tap to buy →'
                              : 'Not available right now'}
                        </Text>
                      </Pressable>
                    );
                  })}

                  {storeMessage && (
                    <Text
                      style={{
                        color: '#10B981',
                        fontSize: 12,
                        fontWeight: '800',
                        textAlign: 'center',
                        marginVertical: 6,
                      }}
                    >
                      {storeMessage}
                    </Text>
                  )}

                  {/* Mandatory Apple Guideline 3.1.2 Footer: Restore Purchases + Terms + Privacy + Auto-Renew Disclosure */}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 16,
                      marginVertical: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Pressable
                      disabled={!restoreEnabled || storeBusy}
                      onPress={restore}
                      style={(!restoreEnabled || storeBusy) && { opacity: 0.5 }}
                    >
                      <Text
                        style={{
                          color: '#38BDF8',
                          fontSize: 12,
                          fontWeight: '800',
                          textDecorationLine: 'underline',
                        }}
                      >
                        Restore Purchases
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => setLegalDocView('terms')}>
                      <Text
                        style={{
                          color: '#94A3B8',
                          fontSize: 12,
                          fontWeight: '700',
                          textDecorationLine: 'underline',
                        }}
                      >
                        Terms of Use (EULA)
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => setLegalDocView('privacy')}>
                      <Text
                        style={{
                          color: '#94A3B8',
                          fontSize: 12,
                          fontWeight: '700',
                          textDecorationLine: 'underline',
                        }}
                      >
                        Privacy Policy
                      </Text>
                    </Pressable>
                  </View>

                  <Text
                    style={{
                      color: '#64748B',
                      fontSize: 10,
                      lineHeight: 14,
                      textAlign: 'center',
                      marginTop: 4,
                    }}
                  >
                    {APPLE_SUBSCRIPTION_DISCLOSURE}
                  </Text>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#090D16',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  splashEmblem: {
    width: 92,
    height: 92,
    borderRadius: 24,
    backgroundColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    gap: 5,
  },
  splashLayerBar1: {
    width: 32,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#090D16',
  },
  splashLayerBar2: {
    width: 44,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#090D16',
  },
  splashLayerBar3: {
    width: 52,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#090D16',
  },
  splashLayerBar4: {
    width: 46,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#090D16',
  },
  splashTitle: {
    color: '#F8FAFC',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  splashSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 380,
    marginBottom: 20,
    lineHeight: 19,
  },
  splashBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  splashBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: '#38BDF8',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  splashBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
  },
  splashTrack: {
    width: 240,
    height: 6,
    backgroundColor: '#1E293B',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 10,
  },
  splashFill: {
    height: '100%',
    backgroundColor: '#10B981',
  },
  splashStatus: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 20,
  },
  splashSkipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  splashSkipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  themeBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  themeBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
  },
  tierPill: {
    marginRight: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tierPillStudio: {
    backgroundColor: '#064E3B',
    borderColor: '#10B981',
  },
  tierPillPro: {
    backgroundColor: '#1E1B4B',
    borderColor: '#6366F1',
  },
  tierPillText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#0F172A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  modalSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  wizLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  wizInput: {
    backgroundColor: '#090D16',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#F8FAFC',
    fontSize: 13,
    marginBottom: 10,
  },
  wizRegionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  wizPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#1E293B',
  },
  wizPillActive: {
    backgroundColor: '#38BDF8',
  },
  wizPillText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
  },
  wizPrimaryBtn: {
    backgroundColor: '#38BDF8',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  wizPrimaryBtnText: {
    color: '#090D16',
    fontSize: 13,
    fontWeight: '800',
  },
  wizSecondaryBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  wizSecondaryBtnText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
  },
  tierCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tierCardActive: {
    borderColor: '#10B981',
    backgroundColor: '#062C22',
  },
  tierCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  tierCardTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
    paddingRight: 8,
  },
  tierCardPrice: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '800',
  },
  tierCardDesc: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  tierStatus: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
});
