// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PricingToggle } from '../PricingToggle';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
  useLocale: () => 'en',
}));

vi.mock('../PricingUpgradeButton', () => ({
  PricingUpgradeButton: () => <button>upgrade-stub</button>,
}));

describe('PricingToggle', () => {
  it('shows the long-form savings text when Annual is selected', () => {
    render(<PricingToggle />);
    // Annual is default per `useState('annual')`
    expect(screen.getByText('saveBadgeLong')).not.toBeNull();
  });

  it('hides the long-form savings text when Monthly is selected', () => {
    render(<PricingToggle />);
    const monthlyButton = screen.getByRole('radio', { name: 'monthly' });
    fireEvent.click(monthlyButton);
    expect(screen.queryByText('saveBadgeLong')).toBeNull();
  });

  it('still renders the existing saveBadge chip on the Annual button', () => {
    render(<PricingToggle />);
    expect(screen.getByText('saveBadge')).not.toBeNull();
  });
});
