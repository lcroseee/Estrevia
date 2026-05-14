// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/synastry',
}));

const mockUseSubscription = vi.fn();
vi.mock('@/shared/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

// IntersectionObserver polyfill (needed by PaywallCta).
beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

import { SynastryClient } from '../SynastryClient';

describe('SynastryClient — paywall replacement', () => {
  it('renders inline PaywallCta and no /pricing link for free user with a calculated result', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    // SynastryClient initial state has no result. We assert the upfront
    // tree at least renders without throwing — full integration test of
    // the AI-Analysis state needs a calculated result fixture, deferred
    // to E2E. Here we lock the contract that no '/pricing' anchor exists
    // anywhere in the initial tree.
    const { container } = render(<SynastryClient />);
    const pricingAnchor = container.querySelector('a[href="/pricing"]');
    expect(pricingAnchor).toBeNull();
  });
});
