import { describe, it, expect } from 'vitest';
import { mapEstreviaToMeta, MAPPING_TABLE } from '../event-mapper';

describe('mapEstreviaToMeta', () => {
  it('maps user_registered to Lead', () => {
    expect(mapEstreviaToMeta('user_registered')).toEqual({ pixel: 'Lead', capi: 'Lead' });
  });

  it('maps subscription_started to Subscribe (CAPI primary)', () => {
    expect(mapEstreviaToMeta('subscription_started')).toEqual({ pixel: null, capi: 'Subscribe' });
  });

  it('maps chart_calculated to ViewContent for both', () => {
    expect(mapEstreviaToMeta('chart_calculated')).toEqual({ pixel: 'ViewContent', capi: 'ViewContent' });
  });

  it('maps paywall_opened to InitiateCheckout for both', () => {
    expect(mapEstreviaToMeta('paywall_opened')).toEqual({ pixel: 'InitiateCheckout', capi: 'InitiateCheckout' });
  });

  it('maps passport_reshared to custom Share for both', () => {
    expect(mapEstreviaToMeta('passport_reshared')).toEqual({ pixel: 'Share', capi: 'Share' });
  });

  it('returns null entry for landing_view (Pixel auto-tracks PageView)', () => {
    expect(mapEstreviaToMeta('landing_view')).toEqual({ pixel: 'PageView', capi: null });
  });

  it('MAPPING_TABLE covers all EstreviaEvent values exhaustively', () => {
    const events = ['landing_view', 'chart_calculated', 'passport_reshared', 'user_registered', 'paywall_opened', 'subscription_started'] as const;
    for (const e of events) {
      expect(MAPPING_TABLE[e]).toBeDefined();
    }
  });
});
