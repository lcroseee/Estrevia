// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PricingPage from '../page';

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (namespace: string) =>
    (key: string) => `${namespace}.${key}`,
}));

vi.mock('@/shared/seo', () => ({
  createMetadata: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  JsonLdScript: (_props: { schema: unknown }) => <script data-testid="json-ld" />,
  faqSchema: () => ({}),
  breadcrumbSchema: () => ({}),
  productSchema: () => ({}),
}));

vi.mock('@/shared/seo/constants', () => ({
  SITE_URL: 'https://estrevia.app',
}));

vi.mock('../PricingToggle', () => ({
  PricingToggle: () => <div>pricing-toggle-stub</div>,
}));

describe('PricingPage', () => {
  it('renders the guarantee block', async () => {
    const ui = await PricingPage();
    render(ui);
    expect(screen.getByText('pricing.guaranteeHeading')).toBeTruthy();
    expect(screen.getByText('pricing.guaranteeSubcopy')).toBeTruthy();
  });

  it('renders refreshed trust footer items', async () => {
    const ui = await PricingPage();
    render(ui);
    expect(screen.getByText('pricing.trustLahiri')).toBeTruthy();
    expect(screen.getByText('pricing.trustAstrologers')).toBeTruthy();
    expect(screen.getByText('pricing.trustCancel')).toBeTruthy();
  });

  it('renders refined hero copy', async () => {
    const ui = await PricingPage();
    render(ui);
    expect(screen.getByText('pricing.heading')).toBeTruthy();
    expect(screen.getByText('pricing.subheading')).toBeTruthy();
  });
});
