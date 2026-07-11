// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Translator mock echoes namespaced keys so assertions can target them.
// Interpolation values are appended to the output (rather than dropped) so
// tests can observe locale-aware values (e.g. the formatted trial-end date)
// that real next-intl would substitute into the message body.
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const t = ((key: string, values?: Record<string, unknown>) =>
      values ? `${ns}.${key}:${Object.values(values).join(',')}` : `${ns}.${key}`
    ) as ((k: string, v?: Record<string, unknown>) => string) & { has: (k: string) => boolean };
    t.has = () => false;
    return t;
  },
  useLocale: () => 'es',
}));
vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));
vi.mock('@/shared/lib/utm-cookie', () => ({
  readUtmLastTouch: vi.fn().mockReturnValue({}),
}));

import { PaywallModal } from '../PaywallModal';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('PaywallModal l10n (Track 6)', () => {
  it('close button uses the common.close key, not hardcoded English', () => {
    render(<PaywallModal open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'common.close' })).toBeTruthy();
  });

  it('trial-end date renders in Spanish for locale=es (+3 days)', () => {
    render(<PaywallModal open={true} onClose={vi.fn()} />);
    // 2026-07-13 in es-MX short-month format contains 'jul'
    expect(document.body.textContent).toMatch(/jul/i);
    expect(document.body.textContent).not.toMatch(/Jul 13, 2026/);
  });
});
