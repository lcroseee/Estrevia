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
  readUtmLastTouch: vi.fn(),
}));

import { readUtmLastTouch } from '@/shared/lib/utm-cookie';
import { PaywallModal } from '../PaywallModal';

const mockReadUtmLastTouch = vi.mocked(readUtmLastTouch);

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

describe('PaywallModal — UTM forwarding', () => {
  it('includes UTM fields in the fetch body when readUtmLastTouch returns data', async () => {
    mockReadUtmLastTouch.mockReturnValue({
      utm_source: 'meta',
      utm_click_timestamp: '2026-05-04T10:00:00.000Z',
    });

    const mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(
      <PaywallModal open={true} onClose={vi.fn()} returnUrl="/chart" />,
    );

    const ctaButton = getByRole('button', { name: /trialCta/i });
    await act(async () => {
      ctaButton.click();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.utm_source).toBe('meta');
    expect(body.utm_click_timestamp).toBe('2026-05-04T10:00:00.000Z');
  });

  it('omits UTM fields when readUtmLastTouch returns empty object', async () => {
    mockReadUtmLastTouch.mockReturnValue({});

    const mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(
      <PaywallModal open={true} onClose={vi.fn()} returnUrl="/chart" />,
    );

    const ctaButton = getByRole('button', { name: /trialCta/i });
    await act(async () => {
      ctaButton.click();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('utm_source');
    expect(body).not.toHaveProperty('utm_click_timestamp');
  });

  it('includes locale="en" in the fetch body by default', async () => {
    mockReadUtmLastTouch.mockReturnValue({});
    const mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(
      <PaywallModal open={true} onClose={vi.fn()} returnUrl="/chart" />,
    );

    const ctaButton = getByRole('button', { name: /trialCta/i });
    await act(async () => {
      ctaButton.click();
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.locale).toBe('en');
  });

  it('includes locale="es" in the fetch body when locale is es', async () => {
    hoistedLocale.value = 'es';
    mockReadUtmLastTouch.mockReturnValue({});
    const mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(
      <PaywallModal open={true} onClose={vi.fn()} returnUrl="/chart" />,
    );

    const ctaButton = getByRole('button', { name: /trialCta/i });
    await act(async () => {
      ctaButton.click();
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.locale).toBe('es');
  });

  it('passes URL-derived UTM (last-touch) to checkout body', async () => {
    // Simulates the case where the user lands on /chart via a drip-email
    // link (?utm_source=lead-nurture&utm_campaign=t72) — last-touch UTM
    // must override the cookie's first-touch utm_source=meta.
    mockReadUtmLastTouch.mockReturnValue({
      utm_source: 'lead-nurture',
      utm_campaign: 't72',
    });

    const mockFetch = makeFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(
      <PaywallModal open={true} onClose={vi.fn()} returnUrl="/chart" />,
    );

    const ctaButton = getByRole('button', { name: /trialCta/i });
    await act(async () => {
      ctaButton.click();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.utm_source).toBe('lead-nurture');
    expect(body.utm_campaign).toBe('t72');
  });
});
