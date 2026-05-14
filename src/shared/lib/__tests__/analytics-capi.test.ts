import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock() factories run BEFORE imports, so mock vars must use vi.hoisted()
// to be available at factory-evaluation time.
const { mockSendCapi, mockWaitUntil } = vi.hoisted(() => ({
  mockSendCapi: vi.fn().mockResolvedValue(undefined),
  mockWaitUntil: vi.fn((p: Promise<unknown>) => {
    void p.catch(() => undefined);
  }),
}));

vi.mock('@/modules/advertising/meta-capi/index', () => ({
  sendCapiEvent: mockSendCapi,
}));

vi.mock('@/modules/advertising/meta-capi/event-mapper', () => ({
  mapEstreviaToMeta: (e: string) => {
    const map: Record<string, { pixel: string | null; capi: string | null }> = {
      user_registered: { pixel: 'Lead', capi: 'Lead' },
      email_lead_submitted: { pixel: 'Lead', capi: 'Lead' },
      subscription_started: { pixel: null, capi: 'Subscribe' },
      landing_view: { pixel: 'PageView', capi: null },
      paywall_opened: { pixel: 'InitiateCheckout', capi: 'InitiateCheckout' },
    };
    return map[e] ?? { pixel: null, capi: null };
  },
}));

// Stub posthog-node so the dynamic require() in analytics.ts doesn't try to
// load the real package (and so PostHog capture is a no-op in tests).
vi.mock('posthog-node', () => ({
  PostHog: class {
    capture(): void {}
    async shutdown(): Promise<void> {}
  },
}));

vi.mock('@vercel/functions', () => ({
  waitUntil: mockWaitUntil,
}));

import { trackServerEvent, AnalyticsEvent } from '../analytics';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_POSTHOG_KEY = 'k';
  process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com';
});

describe('trackServerEvent — CAPI integration', () => {
  it('fires CAPI Lead event for user_registered', () => {
    trackServerEvent('user_42', AnalyticsEvent.USER_REGISTERED, {
      email: 'alice@example.com',
      $insert_id: 'evt_dedup_123',
    });
    expect(mockSendCapi).toHaveBeenCalledWith(
      'Lead',
      expect.objectContaining({ external_id_raw: 'user_42', email: 'alice@example.com' }),
      undefined,
      expect.objectContaining({ event_id: 'evt_dedup_123' }),
    );
  });

  it('does NOT fire CAPI for landing_view (Pixel auto-tracks PageView)', () => {
    trackServerEvent('user_42', AnalyticsEvent.LANDING_VIEW, {});
    expect(mockSendCapi).not.toHaveBeenCalled();
  });

  it('fires CAPI Subscribe with value + currency + predicted_ltv', () => {
    trackServerEvent('user_42', AnalyticsEvent.SUBSCRIPTION_STARTED, {
      value: 4.99,
      currency: 'USD',
      predicted_ltv: 30,
      $insert_id: 'sub_evt_1',
    });
    expect(mockSendCapi).toHaveBeenCalledWith(
      'Subscribe',
      expect.objectContaining({ external_id_raw: 'user_42' }),
      { value: 4.99, currency: 'USD', predicted_ltv: 30 },
      expect.objectContaining({ event_id: 'sub_evt_1' }),
    );
  });

  it('fires CAPI InitiateCheckout for paywall_opened (no $insert_id → empty opts)', () => {
    trackServerEvent('user_42', AnalyticsEvent.PAYWALL_OPENED, {});
    expect(mockSendCapi).toHaveBeenCalledWith(
      'InitiateCheckout',
      expect.objectContaining({ external_id_raw: 'user_42' }),
      undefined,
      {},
    );
  });

  it('extracts fbc/fbp/client_ip_address/client_user_agent/event_source_url from properties into CAPI user-args + opts', () => {
    trackServerEvent('user_42', AnalyticsEvent.EMAIL_LEAD_SUBMITTED, {
      email: 'alice@example.com',
      $insert_id: 'evt_lead_1',
      fbc: 'fb.1.1714867200.AbCdEf123',
      fbp: 'fb.1.1714867200.987654321',
      client_ip_address: '203.0.113.42',
      client_user_agent: 'Mozilla/5.0 test-ua',
      event_source_url: 'https://estrevia.app/es',
      // unrelated PostHog properties — must NOT leak into user_data
      utm_source: 'meta',
      locale: 'es',
    });
    expect(mockSendCapi).toHaveBeenCalledWith(
      'Lead',
      expect.objectContaining({
        external_id_raw: 'user_42',
        email: 'alice@example.com',
        fbc: 'fb.1.1714867200.AbCdEf123',
        fbp: 'fb.1.1714867200.987654321',
        client_ip_address: '203.0.113.42',
        client_user_agent: 'Mozilla/5.0 test-ua',
      }),
      undefined,
      expect.objectContaining({
        event_id: 'evt_lead_1',
        event_source_url: 'https://estrevia.app/es',
      }),
    );
    // user_data should NOT contain utm_source or locale
    const userArg = mockSendCapi.mock.calls[0][1] as Record<string, unknown>;
    expect(userArg.utm_source).toBeUndefined();
    expect(userArg.locale).toBeUndefined();
  });

  it('handles missing fbc/fbp/IP/UA gracefully (backward-compat path)', () => {
    trackServerEvent('user_42', AnalyticsEvent.USER_REGISTERED, {
      email: 'a@x.com',
      $insert_id: 'evt_x',
    });
    expect(mockSendCapi).toHaveBeenCalledWith(
      'Lead',
      expect.objectContaining({ external_id_raw: 'user_42', email: 'a@x.com' }),
      undefined,
      expect.objectContaining({ event_id: 'evt_x' }),
    );
    const userArg = mockSendCapi.mock.calls[0][1] as Record<string, unknown>;
    expect(userArg.fbc).toBeUndefined();
    expect(userArg.fbp).toBeUndefined();
  });
});
