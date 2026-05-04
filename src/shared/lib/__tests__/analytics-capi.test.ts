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
});
