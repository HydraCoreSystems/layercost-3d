import { describe, it, expect } from 'vitest';
import {
  APP_STORE_PRODUCTS,
  PRODUCT_IDS,
  PRIVACY_POLICY_TEXT,
  TERMS_OF_USE_TEXT,
  APPLE_SUBSCRIPTION_DISCLOSURE,
  describeStoreIssue,
  isProductId,
  ownedProductIds,
  resolveTier,
  tierForProductId,
} from '../iapService';

const NOW = Date.UTC(2026, 10, 8);
const DAY = 86_400_000;

describe('product catalog', () => {
  it('maps products to the tiers in the brief', () => {
    expect(tierForProductId(PRODUCT_IDS.proLifetime)).toBe('pro');
    expect(tierForProductId(PRODUCT_IDS.studioMonthly)).toBe('studio');
    expect(tierForProductId(PRODUCT_IDS.studioAnnual)).toBe('studio');
    expect(tierForProductId('not.a.product')).toBe('free');
  });

  it('keeps the advertised prices', () => {
    const price = (id: string) => APP_STORE_PRODUCTS.find((p) => p.productId === id)?.priceString;
    expect(price(PRODUCT_IDS.proLifetime)).toBe('$8.99');
    expect(price(PRODUCT_IDS.studioMonthly)).toBe('$3.99 / month');
    expect(price(PRODUCT_IDS.studioAnnual)).toBe('$29.99 / year');
  });

  it('recognizes only its own product IDs', () => {
    expect(isProductId(PRODUCT_IDS.studioAnnual)).toBe(true);
    expect(isProductId('anything.else')).toBe(false);
  });

  it('keeps the legal text', () => {
    expect(PRIVACY_POLICY_TEXT).toContain('LayerCost 3D Privacy Policy (Effective November 2026)');
    expect(PRIVACY_POLICY_TEXT).toContain('processed securely by Apple via StoreKit / App Store');
    expect(TERMS_OF_USE_TEXT).toContain('LayerCost 3D Terms of Use & EULA (Effective November 2026)');
    expect(TERMS_OF_USE_TEXT).toContain('LayerCost Pro ($8.99) is a one-time non-consumable lifetime unlock');
    expect(APPLE_SUBSCRIPTION_DISCLOSURE).toContain('Subscriptions automatically renew unless canceled at least 24 hours');
  });
});

describe('entitlement from store purchases', () => {
  it('is free with no purchases', () => {
    expect(resolveTier(ownedProductIds([], NOW))).toBe('free');
  });

  it('is pro for the lifetime unlock', () => {
    const owned = ownedProductIds([{ productId: PRODUCT_IDS.proLifetime, purchaseState: 'purchased' }], NOW);
    expect(resolveTier(owned)).toBe('pro');
  });

  it('is studio for an active subscription, and studio wins over pro', () => {
    const owned = ownedProductIds(
      [
        { productId: PRODUCT_IDS.proLifetime, purchaseState: 'purchased' },
        { productId: PRODUCT_IDS.studioMonthly, purchaseState: 'purchased', expirationDateIOS: NOW + 5 * DAY },
      ],
      NOW
    );
    expect(resolveTier(owned)).toBe('studio');
  });

  it('ignores an expired subscription and falls back to what else is owned', () => {
    const owned = ownedProductIds(
      [
        { productId: PRODUCT_IDS.studioAnnual, purchaseState: 'purchased', expirationDateIOS: NOW - DAY },
        { productId: PRODUCT_IDS.proLifetime, purchaseState: 'purchased' },
      ],
      NOW
    );
    expect(resolveTier(owned)).toBe('pro');
  });

  it('does not unlock anything for a pending purchase or an unknown product', () => {
    const owned = ownedProductIds(
      [
        { productId: PRODUCT_IDS.studioMonthly, purchaseState: 'pending' },
        { productId: 'some.other.app.product', purchaseState: 'purchased' },
      ],
      NOW
    );
    expect(owned).toEqual([]);
    expect(resolveTier(owned)).toBe('free');
  });
});

describe('honest store messages', () => {
  it('explains each way the store can be unreachable without claiming success', () => {
    for (const reason of ['unsupported_platform', 'module_missing', 'connection_failed', 'no_products'] as const) {
      const text = describeStoreIssue(reason);
      expect(text.length).toBeGreaterThan(40);
      expect(text.toLowerCase()).not.toContain('activated');
      expect(text.toLowerCase()).not.toContain('preview');
    }
    expect(describeStoreIssue('module_missing')).toContain('development build');
    expect(describeStoreIssue('connection_failed', 'timeout')).toContain('timeout');
  });
});
