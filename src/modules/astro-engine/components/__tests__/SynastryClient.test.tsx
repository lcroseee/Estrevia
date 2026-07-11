// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useEffect } from 'react';

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

// Capture PaywallCta props — SP-E D5 asserts the CARD variant is used
// (the inline variant had 0/9 lifetime opens).
vi.mock('@/shared/components/PaywallCta', () => ({
  PaywallCta: ({ trigger, variant }: { trigger: string; variant?: string }) => (
    <div data-testid="paywall-cta-stub" data-trigger={trigger} data-variant={variant} />
  ),
}));

vi.mock('@/shared/components/PaywallModal', () => ({
  PaywallModal: () => null,
}));

vi.mock('../SynastryResult', () => ({
  SynastryResult: () => <div data-testid="synastry-result-stub" />,
}));

// Auto-fill both birth-data forms on mount so handleCalculate passes validation.
vi.mock('../BirthDataFormStandalone', () => ({
  BirthDataFormStandalone: ({ onChange }: { onChange: (v: unknown) => void }) => {
    useEffect(() => {
      onChange({
        name: 'Test',
        date: '1990-06-15',
        time: '12:00',
        knowsBirthTime: false,
        latitude: 40.7128,
        longitude: -74.006,
        timezone: 'America/New_York',
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="form-stub" />;
  },
}));

const mockPostJson = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/apiFetch', () => ({
  postJson: mockPostJson,
}));

// IntersectionObserver polyfill (PaywallCta is stubbed; kept for safety).
beforeEach(() => {
  vi.clearAllMocks();
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

const RESULT_FIXTURE = {
  id: 'syn_test1',
  aspects: [],
  scores: { overall: 50, emotional: 50, intellectual: 50, physical: 50, karmic: 50 },
  chart1Summary: { sunSign: 'Aries', moonSign: 'Taurus', ascendant: null, name: null },
  chart2Summary: { sunSign: 'Leo', moonSign: null, ascendant: null, name: null },
};

describe('SynastryClient — paywall surface', () => {
  it('renders no /pricing link for a free user in the initial tree', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { container } = render(<SynastryClient />);
    expect(container.querySelector('a[href="/pricing"]')).toBeNull();
  });

  it('free user with a calculated result sees the CARD paywall variant (D5 — inline had 0/9 opens)', async () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    mockPostJson.mockResolvedValue({
      kind: 'ok',
      data: { success: true, data: RESULT_FIXTURE },
    });
    render(<SynastryClient />);
    fireEvent.click(screen.getByRole('button', { name: 'calculateButton' }));
    const cta = await screen.findByTestId('paywall-cta-stub');
    expect(cta.getAttribute('data-variant')).toBe('card');
    expect(cta.getAttribute('data-trigger')).toBe('synastry-ai');
  });
});
