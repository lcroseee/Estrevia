// src/shared/components/__tests__/PaywallModal.currency.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const mockLocale = vi.fn<() => string>(() => 'es');

// Translator mock echoes namespaced keys so assertions can target them.
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const t = ((key: string, vars?: Record<string, unknown>) =>
      vars ? `${ns}.${key}:${JSON.stringify(vars)}` : `${ns}.${key}`) as ((
      k: string,
      v?: Record<string, unknown>,
    ) => string) & { has: (k: string) => boolean };
    t.has = () => false;
    return t;
  },
  useLocale: () => mockLocale(),
}));
vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));
vi.mock('@/shared/lib/utm-cookie', () => ({
  readUtmLastTouch: vi.fn().mockReturnValue({}),
}));

import { PaywallModal } from '../PaywallModal';

describe('PaywallModal — ES currency note (SP-B T3)', () => {
  it('renders equiv + billedInUsd for the selected plan when locale=es', () => {
    mockLocale.mockReturnValue('es');
    render(<PaywallModal open={true} onClose={vi.fn()} />);
    // Select monthly explicitly — assertion is then independent of the
    // component's default plan (pro_monthly post-Phase-0).
    fireEvent.click(screen.getByText('pricing.monthly'));
    expect(screen.getByText('pricing.monthlyPriceEquiv')).toBeTruthy();
    expect(screen.getByText('pricing.billedInUsd')).toBeTruthy();
    fireEvent.click(screen.getByText('pricing.annual'));
    expect(screen.getByText('pricing.annualPriceEquiv')).toBeTruthy();
  });

  it('renders neither for locale=en', () => {
    mockLocale.mockReturnValue('en');
    render(<PaywallModal open={true} onClose={vi.fn()} />);
    expect(screen.queryByText('pricing.monthlyPriceEquiv')).toBeNull();
    expect(screen.queryByText('pricing.annualPriceEquiv')).toBeNull();
    expect(screen.queryByText('pricing.billedInUsd')).toBeNull();
  });
});
