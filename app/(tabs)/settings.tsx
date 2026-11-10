import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLayerCost } from '../../src/store/useLayerCostStore';

const REGION_ELECTRICITY_PRESETS = [
  { label: '🇺🇸 US National Avg ($0.14/kWh)', rate: 0.14, region: 'US National Average' },
  { label: '🇺🇸 Midwest / South / TX ($0.12/kWh)', rate: 0.12, region: 'US Midwest / South' },
  { label: '🇺🇸 Pacific NW ($0.10/kWh)', rate: 0.10, region: 'Pacific Northwest' },
  { label: '🇺🇸 Northeast / Mid-Atl ($0.22/kWh)', rate: 0.22, region: 'US Northeast' },
  { label: '🇺🇸 California / High-Tier ($0.29/kWh)', rate: 0.29, region: 'California / High-Tier' },
  { label: '🇨🇦 Canada Avg ($0.15/kWh)', rate: 0.15, region: 'Canada' },
  { label: '🇬🇧🇪🇺 UK / Europe ($0.32/kWh)', rate: 0.32, region: 'UK / Europe' },
  { label: '🇦🇺 Australia / NZ ($0.25/kWh)', rate: 0.25, region: 'Australia / NZ' },
];

export default function SettingsScreen() {
  const {
    settings,
    updateSettings,
    replaySplash,
    openSetupWizard,
    resetDemoData,
    printers,
    spools,
    hardware,
    catalog,
    completedJobs,
  } = useLayerCost();

  const isLight = settings.themeMode === 'light';

  const handleExportBackupWeb = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const payload = {
        exportedAt: new Date().toISOString(),
        settings,
        printers,
        spools,
        hardware,
        catalog,
        completedJobs,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LayerCost-3D-Backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <ScrollView
      style={[styles.container, isLight && styles.containerLight]}
      contentContainerStyle={styles.content}
    >
      {/* Appearance & Startup Title Screen */}
      <View style={[styles.card, isLight && styles.cardLight]}>
        <Text style={[styles.sectionTitle, isLight && styles.textDark]}>
          🎨 Theme, Appearance & Startup Title Screen
        </Text>
        <Text style={styles.sectionSub}>
          Switch between Midnight Studio (Dark Mode) and Daylight Workshop (Light Mode), or replay the animated LayerCost 3D launch screen.
        </Text>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[
              styles.modeBtn,
              settings.themeMode === 'dark' && styles.modeBtnActive,
            ]}
            onPress={() => updateSettings({ themeMode: 'dark' })}
          >
            <Text
              style={[
                styles.modeBtnText,
                settings.themeMode === 'dark' && styles.modeBtnTextActive,
              ]}
            >
              🌙 Midnight Studio (Dark)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modeBtn,
              settings.themeMode === 'light' && styles.modeBtnActive,
            ]}
            onPress={() => updateSettings({ themeMode: 'light' })}
          >
            <Text
              style={[
                styles.modeBtnText,
                settings.themeMode === 'light' && styles.modeBtnTextActive,
              ]}
            >
              ☀️ Daylight Workshop (Light)
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.switchTitle, isLight && styles.textDark]}>
              Show Title Screen on Every Launch
            </Text>
            <Text style={styles.switchSub}>
              Displays the animated LayerCost 3D emblem for ~2.4 seconds when opening the app.
            </Text>
          </View>
          <Switch
            value={settings.showSplashOnStart}
            onValueChange={(val) => updateSettings({ showSplashOnStart: val })}
          />
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={replaySplash}>
            <Text style={styles.secondaryBtnText}>🎬 Replay Startup Title Screen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={openSetupWizard}>
            <Text style={styles.secondaryBtnText}>🧭 Re-Run Initial Setup Wizard</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Shop Profile & Location / Utility Presets */}
      <View style={[styles.card, isLight && styles.cardLight]}>
        <Text style={[styles.sectionTitle, isLight && styles.textDark]}>
          🏪 Shop Identity, Location & Utility Defaults
        </Text>
        <Text style={styles.sectionSub}>
          Printed on your exported Client Quotes and Craft Show / Live Auction price sheets.
        </Text>

        <View style={styles.formGrid}>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>Shop / Studio Name</Text>
            <TextInput
              style={[styles.input, isLight && styles.inputLight]}
              value={settings.shopName}
              onChangeText={(v) => updateSettings({ shopName: v })}
              placeholder="LayerCost 3D Studio"
              placeholderTextColor="#64748B"
            />
          </View>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>Owner / Maker Name</Text>
            <TextInput
              style={[styles.input, isLight && styles.inputLight]}
              value={settings.ownerName}
              onChangeText={(v) => updateSettings({ ownerName: v })}
              placeholder="Studio Maker"
              placeholderTextColor="#64748B"
            />
          </View>
        </View>

        <Text style={[styles.label, { marginTop: 12 }]}>
          Quick Regional Electricity Preset
        </Text>
        <View style={styles.pillRow}>
          {REGION_ELECTRICITY_PRESETS.map((preset) => {
            const active =
              Math.abs(settings.defaultElectricityRate - preset.rate) < 0.005 &&
              settings.locationRegion === preset.region;
            return (
              <TouchableOpacity
                key={preset.label}
                style={[styles.pill, active && styles.pillActive]}
                onPress={() =>
                  updateSettings({
                    defaultElectricityRate: preset.rate,
                    locationRegion: preset.region,
                  })
                }
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {preset.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.formGrid}>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>Exact Electricity Rate ($/kWh)</Text>
            <TextInput
              style={[styles.input, isLight && styles.inputLight]}
              value={String(settings.defaultElectricityRate)}
              onChangeText={(v) => {
                const n = parseFloat(v);
                if (Number.isFinite(n)) updateSettings({ defaultElectricityRate: n });
              }}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>Default Maker Wage ($/hr)</Text>
            <TextInput
              style={[styles.input, isLight && styles.inputLight]}
              value={String(settings.defaultLaborRate)}
              onChangeText={(v) => {
                const n = parseFloat(v);
                if (Number.isFinite(n)) updateSettings({ defaultLaborRate: n });
              }}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>Default Scrap Buffer (%)</Text>
            <TextInput
              style={[styles.input, isLight && styles.inputLight]}
              value={String(settings.defaultScrapRate)}
              onChangeText={(v) => {
                const n = parseFloat(v);
                if (Number.isFinite(n)) updateSettings({ defaultScrapRate: n });
              }}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>Default Retail Multiplier (x)</Text>
            <TextInput
              style={[styles.input, isLight && styles.inputLight]}
              value={String(settings.defaultRetailMultiplier)}
              onChangeText={(v) => {
                const n = parseFloat(v);
                if (Number.isFinite(n)) updateSettings({ defaultRetailMultiplier: n });
              }}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={{ marginTop: 10 }}>
          <Text style={styles.label}>Custom PDF Quote Footer Note</Text>
          <TextInput
            style={[styles.input, isLight && styles.inputLight]}
            value={settings.quoteFooterNote}
            onChangeText={(v) => updateSettings({ quoteFooterNote: v })}
          />
        </View>
      </View>

      {/* Data Backup & Reset */}
      <View style={[styles.card, isLight && styles.cardLight]}>
        <Text style={[styles.sectionTitle, isLight && styles.textDark]}>
          💾 Crash-Proof Shop Backup & Restore
        </Text>
        <Text style={styles.sectionSub}>
          Export all printers ({printers.length}), spools ({spools.length}), hardware BOM ({hardware.length}), catalog products ({catalog.length}), and ledger jobs ({completedJobs.length}).
        </Text>

        <View style={styles.buttonRow}>
          {Platform.OS === 'web' && (
            <TouchableOpacity style={styles.greenBtn} onPress={handleExportBackupWeb}>
              <Text style={styles.greenBtnText}>⬇️ Export Full Shop Backup (.json)</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.dangerBtn} onPress={resetDemoData}>
            <Text style={styles.dangerBtnText}>↺ Reset to Factory Demo Data</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  containerLight: {
    backgroundColor: '#F1F5F9',
  },
  content: {
    padding: 16,
    paddingBottom: 44,
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  textDark: {
    color: '#0F172A',
  },
  sectionSub: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  modeBtn: {
    flex: 1,
    minWidth: 160,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  modeBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
  },
  modeBtnTextActive: {
    color: '#090D16',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1E293B',
  },
  switchTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  switchSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  secondaryBtn: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  fieldHalf: {
    flex: 1,
    minWidth: 160,
  },
  label: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
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
  inputLight: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    color: '#0F172A',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#0F172A',
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
  greenBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  greenBtnText: {
    color: '#090D16',
    fontSize: 12,
    fontWeight: '800',
  },
  dangerBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  dangerBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800',
  },
});

