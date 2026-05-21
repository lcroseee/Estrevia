// @vitest-environment jsdom
//
// Regression: PricingUpgradeButton must trust the API response and NOT preempt
// a sign-up redirect based on the `x-clerk-auth-status: signed-out` header.
// Anonymous Stripe Checkout was shipped 2026-05-17 — API serves anon users
// successfully (200 + JSON + Stripe URL). Pre-fix the client-side button
// inspected the Clerk header and bounced anon users to /sign-up, breaking the
// LATAM (and any unauthenticated) /pricing → Stripe flow.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

const hoistedLocale = vi.hoisted(() => ({ value: 'en' as 'en' | 'es' }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => hoistedLocale.value,
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

vi.mock('@/shared/lib/utm-cookie', () => ({
  readUtmLastTouch: vi.fn().mockReturnValue({}),
}));

import { trackEvent } from '@/shared/lib/analytics';
import { PricingUpgradeButton } from '../PricingUpgradeButton';

const mockTrack = vi.mocked(trackEvent);

function makeAnonFetchMock(): ReturnType<typeof vi.fn> {
  // Simulates Clerk middleware on an anon request: API returns 200 + valid
  // JSON, but Clerk attaches `x-clerk-auth-status: signed-out` to the response.
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: {
      get: (h: string) => {
        if (h === 'content-type') return 'application/json';
        if (h === 'x-clerk-auth-status') return 'signed-out';
        return null;
      },
    },
    json: async () => ({
      success: true,
      data: { url: 'https://checkout.stripe.com/c/pay/cs_live_anon' },
      error: null,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hoistedLocale.value = 'en';
});

describe('PricingUpgradeButton — anonymous checkout flow', () => {
  it('does NOT redirect to /sign-up when API succeeds with signed-out header (anon path)', async () => {
    const mockFetch = makeAnonFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(<PricingUpgradeButton plan="pro_annual" />);
    await act(async () => {
      getByRole('button').click();
    });

    // The buggy code fired CHECKOUT_AUTH_REDIRECT here. Post-fix this must NOT happen.
    const authRedirect = mockTrack.mock.calls.find(
      ([name]) => name === 'CHECKOUT_AUTH_REDIRECT',
    );
    expect(authRedirect).toBeUndefined();

    // Instead, the user must be tracked as a Stripe redirect.
    const stripeRedirect = mockTrack.mock.calls.find(
      ([name]) => name === 'CHECKOUT_STRIPE_REDIRECTED',
    );
    expect(stripeRedirect).toBeDefined();
  });

  it('still redirects to /sign-up when API returns 401 (true auth-required failure)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: {
          get: (h: string) => (h === 'content-type' ? 'application/json' : null),
        },
        json: async () => ({ success: false, data: null, error: 'UNAUTHORIZED' }),
      }),
    );

    const { getByRole } = render(<PricingUpgradeButton plan="pro_annual" />);
    await act(async () => {
      getByRole('button').click();
    });

    const authRedirect = mockTrack.mock.calls.find(
      ([name]) => name === 'CHECKOUT_AUTH_REDIRECT',
    );
    expect(authRedirect).toBeDefined();
  });

  it('still redirects to /sign-up when response is non-JSON (edge auth wall)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (h: string) => (h === 'content-type' ? 'text/html; charset=utf-8' : null),
        },
        json: async () => {
          throw new Error('Unexpected token < in JSON');
        },
      }),
    );

    const { getByRole } = render(<PricingUpgradeButton plan="pro_annual" />);
    await act(async () => {
      getByRole('button').click();
    });

    const authRedirect = mockTrack.mock.calls.find(
      ([name]) => name === 'CHECKOUT_AUTH_REDIRECT',
    );
    expect(authRedirect).toBeDefined();
  });
});
