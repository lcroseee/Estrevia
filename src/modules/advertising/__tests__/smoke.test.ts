import { describe, it, expect } from 'vitest';
import { mockAdMetric, mockFunnelSnapshot, mockStripeAttribution } from './fixtures';
import { mockMetaApi } from './mocks/meta-api';
import { mockPosthog } from './mocks/posthog';
import { mockStripe } from './mocks/stripe';
import { mockGeminiApi } from './mocks/gemini';
import { mockClaudeApi } from './mocks/claude';
import { mockTelegramBot } from './mocks/telegram';

describe('test infrastructure smoke test', () => {
  it('fixtures are constructible with overrides', () => {
    expect(mockAdMetric().ad_id).toBe('ad_test_001');
    expect(mockAdMetric({ ad_id: 'custom' }).ad_id).toBe('custom');
    expect(mockFunnelSnapshot().steps).toHaveLength(6);
    expect(mockStripeAttribution().amount_usd).toBe(9.99);
  });

  it('all 6 service mocks return ready-to-use vi.fn() shapes', async () => {
    const meta = mockMetaApi();
    expect(await meta.getInsights()).toHaveLength(1);
    expect(meta.pauseAd).toBeDefined();

    const ph = mockPosthog();
    expect((await ph.getFunnel()).steps).toHaveLength(6);

    const stripe = mockStripe();
    expect(await stripe.listSubscriptionsCreatedBetween()).toHaveLength(1);

    const gemini = mockGeminiApi();
    expect((await gemini.generateImage()).cost_usd).toBe(0.06);

    const claude = mockClaudeApi();
    expect((await claude.moderationCheck()).passed).toBe(true);

    const telegram = mockTelegramBot();
    expect((await telegram.sendMessage()).message_id).toBe(1);
  });
});
