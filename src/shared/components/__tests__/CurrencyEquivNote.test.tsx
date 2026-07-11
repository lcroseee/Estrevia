// src/shared/components/__tests__/CurrencyEquivNote.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

// Hoisted spy lets each test override the locale return value
// (same pattern as PricingToggle.currencyBadge.test.tsx).
const mockLocale = vi.fn<() => string>(() => 'es');

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
  useLocale: () => mockLocale(),
}));

import { CurrencyEquivNote } from '../CurrencyEquivNote';

describe('CurrencyEquivNote', () => {
  it('es + pro_annual renders the annual equiv, the billedInUsd note and the aria label', () => {
    mockLocale.mockReturnValue('es');
    render(<CurrencyEquivNote plan="pro_annual" className="mb-3" />);
    expect(screen.getByText('pricing.annualPriceEquiv')).toBeTruthy();
    expect(screen.getByText('pricing.billedInUsd')).toBeTruthy();
    expect(screen.getByLabelText('pricingPage.currencyEquivAria')).toBeTruthy();
  });

  it('es + pro_monthly renders the monthly equiv', () => {
    mockLocale.mockReturnValue('es');
    render(<CurrencyEquivNote plan="pro_monthly" />);
    expect(screen.getByText('pricing.monthlyPriceEquiv')).toBeTruthy();
  });

  it('en renders nothing at all (locale gate)', () => {
    mockLocale.mockReturnValue('en');
    const { container } = render(<CurrencyEquivNote plan="pro_annual" />);
    expect(container.firstChild).toBeNull();
  });
});
