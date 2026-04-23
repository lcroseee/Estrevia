import { describe, it, expect } from 'vitest';
import { computeIsPremium, deriveSubscriptionDetails } from '../premium';

const FUTURE = new Date(Date.now() + 86_400_000);  // +1 day
const PAST   = new Date(Date.now() - 86_400_000);  // -1 day

describe('computeIsPremium', () => {
  // --- active / trialing ---------------------------------------------------

  it('returns true for active premium with future expiry', () => {
    expect(computeIsPremium('premium', 'active', FUTURE)).toBe(true);
  });

  it('returns true for trialing premium with future expiry', () => {
    expect(computeIsPremium('premium', 'trialing', FUTURE)).toBe(true);
  });

  it('returns true for premium with null expiry (indefinite)', () => {
    expect(computeIsPremium('premium', 'active', null)).toBe(true);
  });

  // --- past_due grace period -----------------------------------------------

  it('returns true for past_due even when expiresAt has passed', () => {
    // This is the critical grace-period case: Stripe is retrying payment,
    // user should retain access.
    expect(computeIsPremium('premium', 'past_due', PAST)).toBe(true);
  });

  it('returns true for past_due with null expiresAt', () => {
    expect(computeIsPremium('premium', 'past_due', null)).toBe(true);
  });

  it('returns true for past_due even with free tier (webhook may not have run yet)', () => {
    // subscriptionStatus alone drives the grace-period check.
    expect(computeIsPremium('free', 'past_due', null)).toBe(true);
  });

  // --- expired / free -------------------------------------------------------

  it('returns false for premium tier with past expiry and active status', () => {
    expect(computeIsPremium('premium', 'active', PAST)).toBe(false);
  });

  it('returns false for canceled subscription', () => {
    expect(computeIsPremium('premium', 'canceled', PAST)).toBe(false);
  });

  it('returns false for free tier with active status', () => {
    expect(computeIsPremium('free', 'active', null)).toBe(false);
  });

  it('returns false for null tier and null status', () => {
    expect(computeIsPremium(null, null, null)).toBe(false);
  });

  // --- previously-divergent states that the client /api/v1/user/subscription
  // used to report as "not pro" even though server guards allowed access.
  // These cover the "paywall flashes for a paying user" regression fixed in
  // the unified isPro path. See src/app/api/v1/user/subscription/route.ts.

  it('returns true for "incomplete" status with premium tier and future expiry', () => {
    // Transient state immediately after checkout before payment confirms.
    // Server webhook writes tier='premium' + status='incomplete' briefly.
    expect(computeIsPremium('premium', 'incomplete', FUTURE)).toBe(true);
  });

  it('returns true for canceled subscription still in paid period', () => {
    // User cancels via Customer Portal; Stripe keeps it active until period end.
    // status transitions to 'canceled' only after customer.subscription.deleted
    // fires at period end — until then tier stays premium and expiry is in future.
    expect(computeIsPremium('premium', 'canceled', FUTURE)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deriveSubscriptionDetails — alignment between getSubscriptionDetails output
// and computeIsPremium / the settings UI contract
// ---------------------------------------------------------------------------

describe('deriveSubscriptionDetails', () => {
  const FUTURE = new Date(Date.now() + 86_400_000);
  const PAST   = new Date(Date.now() - 86_400_000);

  // Helper: minimal row fixture
  function row(overrides: Partial<Parameters<typeof deriveSubscriptionDetails>[0]> = {}) {
    return {
      subscriptionTier: null,
      subscriptionStatus: null,
      subscriptionExpiresAt: null,
      plan: null,
      trialEnd: null,
      currentPeriodEnd: null,
      ...overrides,
    };
  }

  it('active premium → tier=premium, needsPaymentUpdate=false', () => {
    const result = deriveSubscriptionDetails(
      row({ subscriptionTier: 'premium', subscriptionStatus: 'active', subscriptionExpiresAt: FUTURE }),
    );
    expect(result.tier).toBe('premium');
    expect(result.isPremium).toBe(true);
    expect(result.needsPaymentUpdate).toBe(false);
    expect(result.gracePeriodEndsAt).toBeNull();
  });

  it('trialing premium → tier=premium, needsPaymentUpdate=false', () => {
    const result = deriveSubscriptionDetails(
      row({ subscriptionTier: 'premium', subscriptionStatus: 'trialing', subscriptionExpiresAt: FUTURE }),
    );
    expect(result.tier).toBe('premium');
    expect(result.isPremium).toBe(true);
    expect(result.needsPaymentUpdate).toBe(false);
  });

  it('past_due → tier=premium, needsPaymentUpdate=true, gracePeriodEndsAt=currentPeriodEnd', () => {
    // This is the core regression case: was returning tier='free' before the fix.
    const grace = new Date(Date.now() + 3 * 86_400_000);
    const result = deriveSubscriptionDetails(
      row({
        subscriptionTier: 'premium',
        subscriptionStatus: 'past_due',
        subscriptionExpiresAt: PAST,   // expired — old code would return free
        currentPeriodEnd: grace,
      }),
    );
    expect(result.tier).toBe('premium');
    expect(result.isPremium).toBe(true);
    expect(result.needsPaymentUpdate).toBe(true);
    expect(result.gracePeriodEndsAt).toBe(grace);
  });

  it('past_due with null expiresAt → still premium', () => {
    const result = deriveSubscriptionDetails(
      row({ subscriptionTier: 'premium', subscriptionStatus: 'past_due', subscriptionExpiresAt: null }),
    );
    expect(result.tier).toBe('premium');
    expect(result.isPremium).toBe(true);
    expect(result.needsPaymentUpdate).toBe(true);
  });

  it('canceled → tier=free, needsPaymentUpdate=false', () => {
    const result = deriveSubscriptionDetails(
      row({ subscriptionTier: 'premium', subscriptionStatus: 'canceled', subscriptionExpiresAt: PAST }),
    );
    expect(result.tier).toBe('free');
    expect(result.isPremium).toBe(false);
    expect(result.needsPaymentUpdate).toBe(false);
    expect(result.gracePeriodEndsAt).toBeNull();
  });

  it('free tier → tier=free, needsPaymentUpdate=false', () => {
    const result = deriveSubscriptionDetails(
      row({ subscriptionTier: 'free', subscriptionStatus: 'active' }),
    );
    expect(result.tier).toBe('free');
    expect(result.isPremium).toBe(false);
    expect(result.needsPaymentUpdate).toBe(false);
  });

  it('expired premium → tier=free', () => {
    const result = deriveSubscriptionDetails(
      row({ subscriptionTier: 'premium', subscriptionStatus: 'active', subscriptionExpiresAt: PAST }),
    );
    expect(result.tier).toBe('free');
    expect(result.isPremium).toBe(false);
  });

  it('propagates plan, trialEnd, currentPeriodEnd, expiresAt', () => {
    const trialEnd = new Date('2026-05-01');
    const periodEnd = new Date('2026-06-01');
    const result = deriveSubscriptionDetails(
      row({
        subscriptionTier: 'premium',
        subscriptionStatus: 'trialing',
        subscriptionExpiresAt: FUTURE,
        plan: 'pro_annual',
        trialEnd,
        currentPeriodEnd: periodEnd,
      }),
    );
    expect(result.plan).toBe('pro_annual');
    expect(result.trialEnd).toBe(trialEnd);
    expect(result.currentPeriodEnd).toBe(periodEnd);
    expect(result.expiresAt).toBe(FUTURE);
  });
});
