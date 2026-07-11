// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PricingToggle } from '../PricingToggle';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
  useLocale: () => 'en',
}));

// Capture the plan prop — the monthly default must reach the checkout button.
const upgradeProps = vi.hoisted(() => ({ plan: undefined as string | undefined }));
vi.mock('../PricingUpgradeButton', () => ({
  PricingUpgradeButton: ({ plan }: { plan: string }) => {
    upgradeProps.plan = plan;
    return <button>upgrade-stub</button>;
  },
}));

beforeEach(() => {
  upgradeProps.plan = undefined;
});

describe('PricingToggle', () => {
  it('defaults to Monthly billing (SP-E D3: annual trials 0/6 converted vs monthly 4/9)', () => {
    render(<PricingToggle />);
    expect(screen.getByRole('radio', { name: 'monthly' }).getAttribute('aria-checked')).toBe('true');
    expect(upgradeProps.plan).toBe('pro_monthly');
    expect(screen.queryByText('saveBadgeLong')).toBeNull();
  });

  it('shows the long-form savings text when Annual is selected', () => {
    render(<PricingToggle />);
    fireEvent.click(screen.getByRole('radio', { name: /annual/ }));
    expect(screen.getByText('saveBadgeLong')).not.toBeNull();
    expect(upgradeProps.plan).toBe('pro_annual');
  });

  it('hides the long-form savings text when Monthly is re-selected', () => {
    render(<PricingToggle />);
    fireEvent.click(screen.getByRole('radio', { name: /annual/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'monthly' }));
    expect(screen.queryByText('saveBadgeLong')).toBeNull();
  });

  it('still renders the existing saveBadge chip on the Annual button', () => {
    render(<PricingToggle />);
    expect(screen.getByText('saveBadge')).not.toBeNull();
  });

  it('orders Pro before Free on mobile, Free-left on desktop (order utilities)', () => {
    render(<PricingToggle />);
    const freeCard = screen.getByText('freeTitle').closest('.rounded-2xl');
    const proCard = screen.getByText('proTitle').closest('.rounded-2xl');
    expect(freeCard?.className).toContain('order-2 md:order-1');
    expect(proCard?.className).toContain('order-1 md:order-2');
  });
});
