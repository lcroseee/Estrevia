// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const mockLocale = vi.fn<() => string>(() => 'es');

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

describe('PaywallModal — trust row (SP-B D3)', () => {
  it('renders the trust row for locale=es', () => {
    mockLocale.mockReturnValue('es');
    render(<PaywallModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('paywall.trustRow')).toBeTruthy();
  });

  it('renders the trust row for locale=en (both locales, unconditional)', () => {
    mockLocale.mockReturnValue('en');
    render(<PaywallModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('paywall.trustRow')).toBeTruthy();
  });
});
