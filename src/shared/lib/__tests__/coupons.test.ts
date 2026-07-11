import { describe, it, expect } from 'vitest';
import {
  ALLOWED_COUPON_CODES,
  COUPON_CONFIG,
  isAllowedCouponCode,
  resolveCouponId,
} from '../coupons';

describe('coupons registry', () => {
  describe('isAllowedCouponCode', () => {
    it('accepts known codes', () => {
      expect(isAllowedCouponCode('TEASER20')).toBe(true);
      expect(isAllowedCouponCode('HALF50')).toBe(true);
      expect(isAllowedCouponCode('SAVE50')).toBe(true);
    });
    it('rejects unknown / nullish', () => {
      expect(isAllowedCouponCode('NOPE')).toBe(false);
      expect(isAllowedCouponCode('')).toBe(false);
      expect(isAllowedCouponCode(null)).toBe(false);
      expect(isAllowedCouponCode(undefined)).toBe(false);
    });
    it('every allowed code has a config entry', () => {
      for (const code of ALLOWED_COUPON_CODES) {
        expect(COUPON_CONFIG[code]).toBeDefined();
        expect(COUPON_CONFIG[code].envVar).toMatch(/^STRIPE_COUPON_/);
      }
    });
  });

  describe('resolveCouponId', () => {
    const envBoth: Record<string, string | undefined> = {
      STRIPE_COUPON_TEASER20: 'co_teaser',
      STRIPE_COUPON_HALF50: 'co_half',
      STRIPE_COUPON_SAVE50: 'co_save',
    };

    it('TEASER20 stays annual-only (regression)', () => {
      expect(resolveCouponId('TEASER20', 'pro_annual', envBoth)).toBe('co_teaser');
      expect(resolveCouponId('TEASER20', 'pro_monthly', envBoth)).toBeNull();
    });

    it('HALF50 applies to BOTH plans', () => {
      expect(resolveCouponId('HALF50', 'pro_monthly', envBoth)).toBe('co_half');
      expect(resolveCouponId('HALF50', 'pro_annual', envBoth)).toBe('co_half');
    });

    it('SAVE50 applies to BOTH plans (trial-end save offer)', () => {
      expect(resolveCouponId('SAVE50', 'pro_monthly', envBoth)).toBe('co_save');
      expect(resolveCouponId('SAVE50', 'pro_annual', envBoth)).toBe('co_save');
    });

    it('SAVE50 returns null when env unset (save offer fully disabled)', () => {
      expect(resolveCouponId('SAVE50', 'pro_monthly', {})).toBeNull();
    });

    it('returns null when the env var is unset (degrade to promo codes)', () => {
      expect(resolveCouponId('HALF50', 'pro_monthly', {})).toBeNull();
      expect(resolveCouponId('TEASER20', 'pro_annual', {})).toBeNull();
    });

    it('returns null for no coupon', () => {
      expect(resolveCouponId(undefined, 'pro_annual', envBoth)).toBeNull();
    });
  });
});
