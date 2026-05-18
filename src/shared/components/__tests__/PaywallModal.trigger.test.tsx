// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

// Capture which i18n key was requested so we can assert headline resolution.
const requestedKeys: string[] = [];

type TranslatorFn = ((key: string) => string) & { has: (key: string) => boolean };

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = ((key: string) => {
      requestedKeys.push(key);
      // Return distinct sentinel for `title` vs contextual keys.
      if (key === 'title') return 'GENERIC_TITLE';
      if (key === 'contextualTitles.celticCross') return 'CELTIC_TITLE';
      if (key === 'contextualTitles.threeCard') return 'THREECARD_TITLE';
      if (key === 'contextualTitles.synastryAi') return 'SYNASTRY_TITLE';
      if (key === 'contextualTitles.essay') return 'ESSAY_TITLE';
      return key;
    }) as TranslatorFn;
    t.has = (key: string) => key.startsWith('contextualTitles.') || key === 'title';
    return t;
  },
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

vi.mock('@/shared/lib/utm-cookie', () => ({
  readUtmCookie: vi.fn().mockReturnValue(null),
}));

import { trackEvent } from '@/shared/lib/analytics';
import { PaywallModal } from '../PaywallModal';

const mockTrackEvent = vi.mocked(trackEvent);

const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  requestedKeys.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Restore window.location for tests that stubbed it via setter spy.
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

describe('PaywallModal — triggerContext', () => {
  it('renders generic title when triggerContext is omitted (backwards-compat)', () => {
    const { getByText } = render(<PaywallModal open={true} onClose={vi.fn()} />);
    expect(getByText('GENERIC_TITLE')).toBeTruthy();
  });

  it('renders contextual title when triggerContext="celtic-cross"', () => {
    const { getByText } = render(
      <PaywallModal open={true} onClose={vi.fn()} triggerContext="celtic-cross" />,
    );
    expect(getByText('CELTIC_TITLE')).toBeTruthy();
  });

  it('renders contextual title when triggerContext="synastry-ai"', () => {
    const { getByText } = render(
      <PaywallModal open={true} onClose={vi.fn()} triggerContext="synastry-ai" />,
    );
    expect(getByText('SYNASTRY_TITLE')).toBeTruthy();
  });

  it('falls back to generic title when triggerContext="generic"', () => {
    const { getByText } = render(
      <PaywallModal open={true} onClose={vi.fn()} triggerContext="generic" />,
    );
    expect(getByText('GENERIC_TITLE')).toBeTruthy();
  });

  it('PAYWALL_OPENED event payload includes the trigger dimension', () => {
    render(
      <PaywallModal
        open={true}
        onClose={vi.fn()}
        triggerContext="three-card"
        returnUrl="/tarot/three-card"
      />,
    );
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'PAYWALL_OPENED',
      expect.objectContaining({ trigger: 'three-card', returnUrl: '/tarot/three-card' }),
    );
  });

  it('PAYWALL_OPENED event uses "generic" when triggerContext is omitted', () => {
    render(<PaywallModal open={true} onClose={vi.fn()} returnUrl="/foo" />);
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'PAYWALL_OPENED',
      expect.objectContaining({ trigger: 'generic' }),
    );
  });
});

/**
 * Checkout-flow assertions encode the post-T4 server contract: the
 * `/api/v1/stripe/checkout` endpoint now always returns
 * `{ success: true, data: { url }, error: null }` for both anonymous and
 * authenticated callers. The client must trust that body and redirect — the
 * legacy `/sign-up` bounce on 401/non-JSON has been retired.
 */
describe('PaywallModal — checkout flow', () => {
  function stubLocation(): ReturnType<typeof vi.fn> {
    const setHref = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        set href(v: string) {
          setHref(v);
        },
        get href() {
          return '';
        },
        pathname: '/chart',
      },
    });
    return setHref;
  }

  it('redirects to Stripe URL on successful checkout (anonymous server contract)', async () => {
    const setHref = stubLocation();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) => (h === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({
        success: true,
        data: { url: 'https://stripe.com/test-checkout-url' },
        error: null,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(
      <PaywallModal open={true} onClose={vi.fn()} returnUrl="/chart" />,
    );
    const ctaButton = getByRole('button', { name: /trialCta/i });
    await act(async () => {
      ctaButton.click();
    });

    expect(setHref).toHaveBeenCalledWith('https://stripe.com/test-checkout-url');
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'CHECKOUT_STRIPE_REDIRECTED',
      expect.objectContaining({ plan: 'pro_annual' }),
    );
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      'CHECKOUT_AUTH_REDIRECT',
      expect.anything(),
    );
  });

  it('redirects to Stripe URL even when response omits content-type header (no /sign-up bounce)', async () => {
    // Regression guard: the retired client logic treated a missing
    // `content-type: application/json` header as auth failure and bounced
    // the user to /sign-up. The new client trusts the JSON body alone.
    const setHref = stubLocation();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        success: true,
        data: { url: 'https://stripe.com/test-checkout-url' },
        error: null,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { getByRole } = render(
      <PaywallModal open={true} onClose={vi.fn()} returnUrl="/chart" />,
    );
    const ctaButton = getByRole('button', { name: /trialCta/i });
    await act(async () => {
      ctaButton.click();
    });

    expect(setHref).toHaveBeenCalledWith('https://stripe.com/test-checkout-url');
    // Crucially: never bounce to /sign-up, never fire auth-redirect.
    const allHrefs = setHref.mock.calls.map((c) => c[0] as string);
    expect(allHrefs.some((h) => h.includes('/sign-up'))).toBe(false);
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      'CHECKOUT_AUTH_REDIRECT',
      expect.anything(),
    );
  });
});
