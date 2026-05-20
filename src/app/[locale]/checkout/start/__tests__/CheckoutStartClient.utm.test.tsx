// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({
    get: (k: string) => {
      if (k === 'plan') return 'pro_annual';
      if (k === 'return') return '/';
      return null;
    },
  }),
}));

const hoistedLocale = vi.hoisted(() => ({ value: 'en' as 'en' | 'es' }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => hoistedLocale.value,
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

const mockPostJson = vi.fn();
vi.mock('@/shared/lib/apiFetch', () => ({
  postJson: (...args: unknown[]) => mockPostJson(...args),
}));

vi.mock('@/shared/lib/utm-cookie', () => ({
  readUtmLastTouch: vi.fn(),
}));

import { readUtmLastTouch } from '@/shared/lib/utm-cookie';
import { CheckoutStartClient } from '../CheckoutStartClient';

const mockReadUtmLastTouch = vi.mocked(readUtmLastTouch);

beforeEach(() => {
  vi.clearAllMocks();
  hoistedLocale.value = 'en';
  mockPostJson.mockResolvedValue({ kind: 'error', status: 500, message: 'test' });
});

describe('CheckoutStartClient — UTM forwarding', () => {
  it('includes UTM fields in the postJson body when readUtmLastTouch returns data', async () => {
    mockReadUtmLastTouch.mockReturnValue({
      utm_source: 'meta',
      utm_click_timestamp: '2026-05-04T10:00:00.000Z',
    });

    render(<CheckoutStartClient />);

    await waitFor(() => {
      expect(mockPostJson).toHaveBeenCalledTimes(1);
    });

    const [url, body] = mockPostJson.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/api/v1/stripe/checkout');
    expect(body.utm_source).toBe('meta');
    expect(body.utm_click_timestamp).toBe('2026-05-04T10:00:00.000Z');
  });

  it('omits UTM fields when readUtmLastTouch returns empty object', async () => {
    mockReadUtmLastTouch.mockReturnValue({});

    render(<CheckoutStartClient />);

    await waitFor(() => {
      expect(mockPostJson).toHaveBeenCalledTimes(1);
    });

    const [, body] = mockPostJson.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).not.toHaveProperty('utm_source');
    expect(body).not.toHaveProperty('utm_click_timestamp');
  });

  it('includes locale="en" in the postJson body by default', async () => {
    mockReadUtmLastTouch.mockReturnValue({});

    render(<CheckoutStartClient />);

    await waitFor(() => {
      expect(mockPostJson).toHaveBeenCalledTimes(1);
    });

    const [, body] = mockPostJson.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.locale).toBe('en');
  });

  it('includes locale="es" in the postJson body when rendered under /es', async () => {
    hoistedLocale.value = 'es';
    mockReadUtmLastTouch.mockReturnValue({});

    render(<CheckoutStartClient />);

    await waitFor(() => {
      expect(mockPostJson).toHaveBeenCalledTimes(1);
    });

    const [, body] = mockPostJson.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.locale).toBe('es');
  });

  it('passes URL-derived UTM (last-touch) when present', async () => {
    mockReadUtmLastTouch.mockReturnValue({
      utm_source: 'lead-nurture',
      utm_campaign: 't72',
    });

    render(<CheckoutStartClient />);

    await waitFor(() => {
      expect(mockPostJson).toHaveBeenCalledTimes(1);
    });

    const [, body] = mockPostJson.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.utm_source).toBe('lead-nurture');
    expect(body.utm_campaign).toBe('t72');
  });
});
