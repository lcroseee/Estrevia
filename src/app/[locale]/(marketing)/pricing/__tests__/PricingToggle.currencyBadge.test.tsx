// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PricingToggle } from '../PricingToggle';

// Hoisted spy lets each test override the locale return value.
const mockLocale = vi.fn<() => string>(() => 'es');

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
  useLocale: () => mockLocale(),
}));

vi.mock('../PricingUpgradeButton', () => ({
  PricingUpgradeButton: () => <button>upgrade-stub</button>,
}));

describe('PricingToggle — ES currency badge', () => {
  it('renders annual equiv badge when locale=es (default toggle is annual)', () => {
    mockLocale.mockReturnValue('es');
    render(<PricingToggle />);
    // Mock returns the i18n key as literal text — assert the key, not the resolved value.
    expect(screen.getByText('annualPriceEquiv')).not.toBeNull();
  });

  it('switches to monthly equiv badge when toggle=monthly', () => {
    mockLocale.mockReturnValue('es');
    render(<PricingToggle />);
    fireEvent.click(screen.getByRole('radio', { name: 'monthly' }));
    expect(screen.getByText('monthlyPriceEquiv')).not.toBeNull();
    expect(screen.queryByText('annualPriceEquiv')).toBeNull();
  });

  it('renders NO badge when locale=en (gate active)', () => {
    mockLocale.mockReturnValue('en');
    render(<PricingToggle />);
    expect(screen.queryByText('annualPriceEquiv')).toBeNull();
    expect(screen.queryByText('monthlyPriceEquiv')).toBeNull();
  });
});
