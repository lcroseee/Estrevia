// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

const hoistedLocale = vi.hoisted(() => ({ value: 'en' as 'en' | 'es' }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => hoistedLocale.value,
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

vi.mock('@/shared/lib/utm-cookie', () => ({
  readUtmCookie: vi.fn(),
}));

import { readUtmCookie } from '@/shared/lib/utm-cookie';
import { PricingUpgradeButton } from '../PricingUpgradeButton';

const mockReadUtmCookie = vi.mocked(readUtmCookie);

function makeFetchMock() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: {
      get: (h: string) => (h === 'content-type' ? 'application/json' : null),
    },
    json: async () => ({ success: true, data: { url: 'https://stripe.com/pay' } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hoistedLocale.value = 'en';
});

describe('PricingUpgradeButton — UTM forwarding', () => {
  it('includes UTM fields in the fetch body when readUtmCookie returns data', async () => {
    mockReadUtmCookie.mockReturnValue({
      utm_source: 'meta',
      utm_click_timestamp: '2026-05-04T10:00:00.000Z',
    });

    const mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(<PricingUpgradeButton plan="pro_annual" />);

    await act(async () => {
      getByRole('button').click();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.utm_source).toBe('meta');
    expect(body.utm_click_timestamp).toBe('2026-05-04T10:00:00.000Z');
  });

  it('omits UTM fields when readUtmCookie returns null', async () => {
    mockReadUtmCookie.mockReturnValue(null);

    const mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(<PricingUpgradeButton plan="pro_annual" />);

    await act(async () => {
      getByRole('button').click();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('utm_source');
    expect(body).not.toHaveProperty('utm_click_timestamp');
  });

  it('includes locale="en" in the fetch body by default', async () => {
    mockReadUtmCookie.mockReturnValue(null);
    const mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(<PricingUpgradeButton plan="pro_annual" />);
    await act(async () => {
      getByRole('button').click();
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.locale).toBe('en');
  });

  it('includes locale="es" in the fetch body when rendered under /es', async () => {
    hoistedLocale.value = 'es';
    mockReadUtmCookie.mockReturnValue(null);
    const mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(<PricingUpgradeButton plan="pro_annual" />);
    await act(async () => {
      getByRole('button').click();
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.locale).toBe('es');
  });
});
