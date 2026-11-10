import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { useLayerCost } from '../store/useLayerCostStore';
import {
  APP_STORE_PRODUCTS,
  connectStore,
  describeStoreIssue,
  disconnectStore,
  fetchStoreProducts,
  readOwnedProductIds,
  resolveTier,
  restoreOwnedProductIds,
  startPurchase,
  subscribeToPurchaseEvents,
  type ProductId,
  type StoreProductInfo,
  type StoreUnavailableReason,
} from './iapService';
import { canUse, upgradeMessage, type Feature } from './tierGates';

/**
 * checking    the first answer from the App Store has not arrived yet (treated as Free)
 * verified    the App Store told us what this Apple ID owns; tier is real
 * unavailable the App Store could not be reached; tier stays Free, nothing is faked
 */
export type EntitlementStatus = 'checking' | 'verified' | 'unavailable';

interface EntitlementContextValue {
  status: EntitlementStatus;
  /** Why the store cannot be used, in plain words. Null when purchases can proceed. */
  storeNotice: string | null;
  purchasesEnabled: boolean;
  /** Restore needs a live store connection. */
  restoreEnabled: boolean;
  storePrices: Partial<Record<ProductId, StoreProductInfo>>;
  busy: boolean;
  /** Result of the last purchase or restore attempt, for the paywall to show. */
  message: string | null;
  paywallVisible: boolean;
  openPaywall: () => void;
  closePaywall: () => void;
  purchase: (productId: ProductId) => Promise<void>;
  restore: () => Promise<void>;
  /** Returns true when the feature is open. Otherwise shows the upgrade prompt and returns false. */
  requireFeature: (feature: Feature) => boolean;
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { membershipTier, applyVerifiedMembershipTier } = useLayerCost();
  const [status, setStatus] = useState<EntitlementStatus>('checking');
  const [issue, setIssue] = useState<{ reason: StoreUnavailableReason; detail?: string } | null>(null);
  const [storePrices, setStorePrices] = useState<Partial<Record<ProductId, StoreProductInfo>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const connected = useRef(false);

  const refreshEntitlements = useCallback(async (): Promise<ProductId[] | null> => {
    try {
      const owned = await readOwnedProductIds();
      applyVerifiedMembershipTier(resolveTier(owned));
      setStatus('verified');
      return owned;
    } catch (err) {
      setStatus('unavailable');
      setIssue((prev) => prev ?? { reason: 'connection_failed', detail: err instanceof Error ? err.message : undefined });
      return null;
    }
  }, [applyVerifiedMembershipTier]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      const result = await connectStore();
      if (cancelled) return;
      if (!result.ok) {
        applyVerifiedMembershipTier('free');
        setStatus('unavailable');
        setIssue({ reason: result.reason, detail: result.detail });
        return;
      }
      connected.current = true;
      unsubscribe = subscribeToPurchaseEvents({
        onPurchased: async (productId) => {
          const owned = await refreshEntitlements();
          const title = APP_STORE_PRODUCTS.find((p) => p.productId === productId)?.title ?? 'Purchase';
          setMessage(owned && owned.includes(productId) ? `${title} is active.` : `${title} was purchased. Confirming with the App Store.`);
          setBusy(false);
        },
        onPending: () => {
          setMessage('This purchase is waiting for approval. Nothing is unlocked until it is approved.');
          setBusy(false);
        },
        onCancelled: () => {
          setMessage('Purchase cancelled. You were not charged.');
          setBusy(false);
        },
        onError: (text) => {
          setMessage(`Purchase did not complete: ${text}`);
          setBusy(false);
        },
      });
      // Entitlements first (works from the on device store cache), prices second.
      await refreshEntitlements();
      try {
        const prices = await fetchStoreProducts();
        if (cancelled) return;
        setStorePrices(prices);
        if (Object.keys(prices).length === 0) {
          setIssue({ reason: 'no_products' });
        }
      } catch (err) {
        if (!cancelled) setIssue({ reason: 'connection_failed', detail: err instanceof Error ? err.message : undefined });
      }
    })();

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && connected.current) void refreshEntitlements();
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      appStateSub.remove();
      if (connected.current) void disconnectStore();
    };
  }, [applyVerifiedMembershipTier, refreshEntitlements]);

  const purchase = useCallback(async (productId: ProductId) => {
    setMessage(null);
    setBusy(true);
    try {
      await startPurchase(productId);
      // Outcome is delivered by the purchase listener, which clears busy.
    } catch (err) {
      setMessage(`Could not start the purchase: ${err instanceof Error ? err.message : 'unknown error'}`);
      setBusy(false);
    }
  }, []);

  const restore = useCallback(async () => {
    setMessage(null);
    setBusy(true);
    try {
      const owned = await restoreOwnedProductIds();
      applyVerifiedMembershipTier(resolveTier(owned));
      setStatus('verified');
      setMessage(
        owned.length > 0
          ? 'Restored. Your plan now matches what the App Store has for this Apple ID.'
          : 'The App Store has no LayerCost 3D purchases for this Apple ID.'
      );
    } catch (err) {
      setMessage(`Restore failed: ${err instanceof Error ? err.message : 'the App Store could not be reached'}. Your plan was not changed.`);
    } finally {
      setBusy(false);
    }
  }, [applyVerifiedMembershipTier]);

  const requireFeature = useCallback<EntitlementContextValue['requireFeature']>(
    (feature) => {
      if (canUse(membershipTier, feature)) return true;
      const m = upgradeMessage(feature);
      Alert.alert(m.title, m.body, [
        { text: 'Not now', style: 'cancel' },
        { text: 'See plans', onPress: () => setPaywallVisible(true) },
      ]);
      return false;
    },
    [membershipTier]
  );

  const storeNotice = issue ? describeStoreIssue(issue.reason, issue.detail) : null;
  const purchasesEnabled = status !== 'checking' && !issue && Object.keys(storePrices).length > 0;

  return (
    <EntitlementContext.Provider
      value={{
        status,
        storeNotice,
        purchasesEnabled,
        restoreEnabled: status === 'verified',
        storePrices,
        busy,
        message,
        paywallVisible,
        openPaywall: () => setPaywallVisible(true),
        closePaywall: () => setPaywallVisible(false),
        purchase,
        restore,
        requireFeature,
      }}
    >
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement() {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlement must be used inside EntitlementProvider');
  return ctx;
}
