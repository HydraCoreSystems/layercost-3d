import type { MembershipTier } from '../store/useLayerCostStore';

export interface AppStoreProduct {
  productId: ProductId;
  tier: Exclude<MembershipTier, 'free'>;
  title: string;
  badge?: string;
  priceString: string;
  billingPeriod: 'one-time' | 'monthly' | 'annual';
  headline: string;
  features: string[];
}

/**
 * THE ONE PLACE product IDs are defined. Register exactly these in App Store Connect
 * (In-App Purchases and Subscriptions). Nothing else in the codebase may spell them out;
 * a test (productIds.test.ts) fails the build if one does. Everywhere else imports
 * PRODUCT_IDS or looks products up through APP_STORE_PRODUCTS.
 */
export const PRODUCT_IDS = {
  proLifetime: 'com.layercost3d.app.pro_lifetime',
  studioMonthly: 'com.layercost3d.app.studio_monthly',
  studioAnnual: 'com.layercost3d.app.studio_annual',
} as const;

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];

/** Non consumable one time unlock. */
export const IN_APP_PRODUCT_IDS: ProductId[] = [PRODUCT_IDS.proLifetime];
/** Auto renewing subscriptions (one subscription group in App Store Connect). */
export const SUBSCRIPTION_PRODUCT_IDS: ProductId[] = [
  PRODUCT_IDS.studioMonthly,
  PRODUCT_IDS.studioAnnual,
];
export const ALL_PRODUCT_IDS: ProductId[] = [...IN_APP_PRODUCT_IDS, ...SUBSCRIPTION_PRODUCT_IDS];

/** The free plan is not a store product, so it has no product ID and cannot be purchased. */
export const FREE_PLAN = {
  tier: 'free' as const,
  title: 'LayerCost Basic',
  priceString: 'Free',
  headline: 'Single-color 3D print cost calculator & basic retail markup.',
  features: [
    '1 filament slot cost calculator',
    '1 printer profile & electricity calculator',
    'Basic retail multiplier estimate',
  ],
};

export const APP_STORE_PRODUCTS: AppStoreProduct[] = [
  {
    productId: PRODUCT_IDS.proLifetime,
    tier: 'pro',
    title: 'LayerCost Pro (Lifetime)',
    badge: 'POPULAR • PAY ONCE',
    priceString: '$8.99',
    billingPeriod: 'one-time',
    headline: 'Complete 4-Slot AMS Batch Optimizer, Marketplace Fee Solver & PDF Price Sheets.',
    features: [
      '4-Slot AMS Multicolor Purge ("Poop") & Full-Plate Batch Optimizer',
      'Direct .gcode & .3mf Slicer File Auto-Import',
      'Reverse Fee Calculator (Etsy + Offsite Ads, Whatnot, PalmStreet, TikTok, eBay, Shopify)',
      '3-Tier Output: Live Auction Floor, Wholesale B2B & Retail Price',
      'Unlimited Product Catalog & Printable PDF Price Sheets',
      'Unlimited Printers, Filament Spools & Hardware BOM Library',
    ],
  },
  {
    productId: PRODUCT_IDS.studioMonthly,
    tier: 'studio',
    title: 'LayerCost Studio Pass (Monthly)',
    badge: 'FULL BUSINESS SUITE',
    priceString: '$3.99 / month',
    billingPeriod: 'monthly',
    headline: 'Everything in Pro + Automated Spool Depletion, Tax Profit Ledger & AI Listing Copy.',
    features: [
      'Includes ALL LayerCost Pro features',
      '1-Tap Print Batch Completion & Automatic Spool Gram Depletion',
      'Low-Filament Mid-Plate Runout Warnings',
      'Print Shop Tax & Net Profit Ledger (tracks COGS, deductible fees & kg used)',
      'AI Etsy 140-Char SEO Title, Whatnot Show Note & Tag Generator',
    ],
  },
  {
    productId: PRODUCT_IDS.studioAnnual,
    tier: 'studio',
    title: 'LayerCost Studio Pass (Annual)',
    badge: 'BEST VALUE • SAVE 37%',
    priceString: '$29.99 / year',
    billingPeriod: 'annual',
    headline: 'Full year of Studio Pass ($2.49/mo effective) for active 3D print sellers.',
    features: [
      'Includes ALL LayerCost Pro & Studio Pass features',
      'Save 37% compared to monthly billing',
      'Full year of Tax & Profit Ledger + Unlimited AI Listing Copy',
    ],
  },
];

export function isProductId(value: string): value is ProductId {
  return (ALL_PRODUCT_IDS as string[]).includes(value);
}

export function tierForProductId(productId: string): MembershipTier {
  const product = APP_STORE_PRODUCTS.find((p) => p.productId === productId);
  return product ? product.tier : 'free';
}

/** Highest tier among the products a user owns. Studio beats Pro beats free. */
export function resolveTier(ownedProductIds: readonly string[]): MembershipTier {
  let tier: MembershipTier = 'free';
  for (const id of ownedProductIds) {
    const t = tierForProductId(id);
    if (t === 'studio') return 'studio';
    if (t === 'pro') tier = 'pro';
  }
  return tier;
}

/** The slice of a StoreKit purchase this app reads. Matches expo-iap's Purchase fields. */
export interface PurchaseLike {
  productId: string;
  purchaseState?: string;
  expirationDateIOS?: number | null;
}

/**
 * Which of our products a list of store purchases actually entitles the user to right now.
 * Pending purchases (Ask to Buy) and expired subscriptions do not count.
 */
export function ownedProductIds(purchases: readonly PurchaseLike[], nowMs: number): ProductId[] {
  const owned = new Set<ProductId>();
  for (const p of purchases) {
    if (!isProductId(p.productId)) continue;
    if (p.purchaseState !== undefined && p.purchaseState !== 'purchased') continue;
    const isSub = (SUBSCRIPTION_PRODUCT_IDS as string[]).includes(p.productId);
    if (isSub && typeof p.expirationDateIOS === 'number' && p.expirationDateIOS <= nowMs) continue;
    owned.add(p.productId);
  }
  return [...owned];
}

export const APPLE_SUBSCRIPTION_DISCLOSURE =
  'Payment will be charged to your Apple ID account at the confirmation of purchase. Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period. You can manage and cancel your subscriptions in your App Store Account Settings after purchase.';

export const PRIVACY_POLICY_TEXT = `LayerCost 3D Privacy Policy (Effective November 2026)

1. Local-First Data Storage:
LayerCost 3D stores your printer profiles, filament spool inventory, product catalog, and profit ledger locally on your device. We do not sell, rent, or share your business or pricing data with third parties.

2. Slicer Files (.3mf / .gcode):
All .3mf and .gcode file parsing occurs directly on your device. Your proprietary 3D models and sliced files are never uploaded to external servers.

3. In-App Purchases:
All payment transactions and subscription management are processed securely by Apple via StoreKit / App Store. LayerCost 3D never receives or stores your credit card or Apple ID billing details.`;

export const TERMS_OF_USE_TEXT = `LayerCost 3D Terms of Use & EULA (Effective November 2026)

1. License:
LayerCost 3D grants you a personal, non-transferable license to use the application on any Apple-branded or compatible device that you own or control, subject to the Apple Standard End User License Agreement (EULA).

2. Subscriptions & Pro Unlock:
• LayerCost Pro ($8.99) is a one-time non-consumable lifetime unlock of core calculator and catalog features.
• LayerCost Studio Pass ($3.99/month or $29.99/year) is an optional auto-renewing subscription that unlocks automated spool inventory depletion, tax ledger tracking, and AI listing generation. You may cancel auto-renewal at any time in your device's App Store Settings.

3. Pricing Estimates Disclaimer:
LayerCost 3D provides cost and marketplace fee calculations based on user-supplied parameters and published platform fee schedules. Always verify final shipping labels and tax obligations for your jurisdiction.`;


// ---------------------------------------------------------------------------
// Store access (StoreKit 2 through expo-iap). Everything below touches the App Store.
// expo-iap is loaded lazily so this file imports cleanly in Node (tests) and in
// builds that do not include the native module (Expo Go).
// ---------------------------------------------------------------------------

export type StoreUnavailableReason =
  | 'unsupported_platform'
  | 'module_missing'
  | 'connection_failed'
  | 'no_products';

export type StoreConnectResult =
  | { ok: true }
  | { ok: false; reason: StoreUnavailableReason; detail?: string };

export interface StoreProductInfo {
  displayPrice: string;
}

type IapModule = typeof import('expo-iap');

let iapModule: IapModule | null | undefined;

function isIosRuntime(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native') as typeof import('react-native');
    return Platform.OS === 'ios';
  } catch {
    return false;
  }
}

function loadIap(): IapModule | null {
  if (iapModule !== undefined) return iapModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    iapModule = require('expo-iap') as IapModule;
  } catch {
    iapModule = null;
  }
  return iapModule;
}

/** Plain language explanation for the paywall. Never claims a purchase worked when it did not. */
export function describeStoreIssue(reason: StoreUnavailableReason, detail?: string): string {
  switch (reason) {
    case 'unsupported_platform':
      return 'Purchases are only available in the LayerCost 3D app for iPhone and iPad. Nothing can be bought or restored from here.';
    case 'module_missing':
      return 'This build does not include the App Store purchase module (for example Expo Go). Use a development build or a TestFlight build to buy or restore. Until then you stay on the Free plan.';
    case 'connection_failed':
      return `The App Store could not be reached, so buying and Restore Purchases are unavailable right now. Your plan stays as the App Store last confirmed it.${detail ? ` (${detail})` : ''}`;
    case 'no_products':
      return 'The App Store did not return the LayerCost 3D products. In a development build this is expected until the products exist in App Store Connect and you are signed in with a Sandbox or StoreKit test account. Buying is turned off until they load.';
  }
}

export async function connectStore(): Promise<StoreConnectResult> {
  if (!isIosRuntime()) return { ok: false, reason: 'unsupported_platform' };
  const iap = loadIap();
  if (!iap) return { ok: false, reason: 'module_missing' };
  try {
    const connected = await iap.initConnection();
    if (!connected) return { ok: false, reason: 'connection_failed' };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: 'connection_failed',
      detail: err instanceof Error ? err.message : undefined,
    };
  }
}

export async function disconnectStore(): Promise<void> {
  const iap = loadIap();
  if (!iap) return;
  try {
    await iap.endConnection();
  } catch {
    // nothing useful to do
  }
}

/** Localized prices straight from the App Store. Products the store does not know are absent. */
export async function fetchStoreProducts(): Promise<Partial<Record<ProductId, StoreProductInfo>>> {
  const iap = loadIap();
  if (!iap) return {};
  const found: Partial<Record<ProductId, StoreProductInfo>> = {};
  const [inApp, subs] = await Promise.all([
    iap.fetchProducts({ skus: IN_APP_PRODUCT_IDS, type: 'in-app' }),
    iap.fetchProducts({ skus: SUBSCRIPTION_PRODUCT_IDS, type: 'subs' }),
  ]);
  for (const list of [inApp, subs]) {
    for (const item of list ?? []) {
      if (isProductId(item.id)) found[item.id] = { displayPrice: item.displayPrice };
    }
  }
  return found;
}

/** What the App Store says this Apple ID owns right now. Throws if the store cannot answer. */
export async function readOwnedProductIds(): Promise<ProductId[]> {
  const iap = loadIap();
  if (!iap) throw new Error('Store module unavailable');
  const purchases = await iap.getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
  return ownedProductIds(purchases, Date.now());
}

/** Starts the Apple purchase sheet. The outcome arrives through subscribeToPurchaseEvents. */
export async function startPurchase(productId: ProductId): Promise<void> {
  const iap = loadIap();
  if (!iap) throw new Error('Store module unavailable');
  const isSub = (SUBSCRIPTION_PRODUCT_IDS as string[]).includes(productId);
  if (isSub) {
    await iap.requestPurchase({ type: 'subs', request: { apple: { sku: productId } } });
  } else {
    await iap.requestPurchase({ type: 'in-app', request: { apple: { sku: productId } } });
  }
}

/** Asks the App Store to sync this Apple ID's purchases, then returns what is owned. */
export async function restoreOwnedProductIds(): Promise<ProductId[]> {
  const iap = loadIap();
  if (!iap) throw new Error('Store module unavailable');
  await iap.restorePurchases();
  return readOwnedProductIds();
}

export interface PurchaseEvents {
  /** A purchase the store confirmed for one of our products, already finished with Apple. */
  onPurchased: (productId: ProductId) => void;
  /** A purchase waiting on approval (Ask to Buy). Nothing is unlocked yet. */
  onPending: (productId: ProductId) => void;
  onCancelled: () => void;
  onError: (message: string) => void;
}

export function subscribeToPurchaseEvents(events: PurchaseEvents): () => void {
  const iap = loadIap();
  if (!iap) return () => undefined;
  const updated = iap.purchaseUpdatedListener(async (purchase) => {
    if (!isProductId(purchase.productId)) return;
    if (purchase.purchaseState === 'pending') {
      events.onPending(purchase.productId);
      return;
    }
    if (purchase.purchaseState !== 'purchased') return;
    try {
      await iap.finishTransaction({ purchase, isConsumable: false });
      events.onPurchased(purchase.productId);
    } catch (err) {
      events.onError(err instanceof Error ? err.message : 'Could not finish the transaction.');
    }
  });
  const failed = iap.purchaseErrorListener((error) => {
    if (error.code === iap.ErrorCode.UserCancelled) {
      events.onCancelled();
      return;
    }
    events.onError(error.message || 'The purchase did not complete.');
  });
  return () => {
    updated.remove();
    failed.remove();
  };
}
