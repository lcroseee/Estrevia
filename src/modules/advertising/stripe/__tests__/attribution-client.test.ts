import { describe, it, expect, vi } from 'vitest';
import { StripeAttributionClient } from '../attribution-client';

/**
 * Builds an async-iterable list of Stripe-shaped subscription objects.
 * StripeAttributionClient consumes `for await ... of stripe.subscriptions.list(...)`.
 */
function asyncList<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item;
    },
  };
}

function sub(overrides: {
  id: string;
  created?: number;
  user_id?: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_content?: string;
  unit_amount?: number;
  currency?: string;
  first_touch_source?: string;
}): Record<string, unknown> {
  return {
    id: overrides.id,
    object: 'subscription',
    created: overrides.created ?? Math.floor(new Date('2026-04-25T15:30:00Z').getTime() / 1000),
    metadata: {
      ...(overrides.user_id !== undefined ? { user_id: overrides.user_id } : {}),
      ...(overrides.utm_source !== undefined ? { utm_source: overrides.utm_source } : {}),
      ...(overrides.utm_campaign !== undefined ? { utm_campaign: overrides.utm_campaign } : {}),
      ...(overrides.utm_content !== undefined ? { utm_content: overrides.utm_content } : {}),
      ...(overrides.first_touch_source !== undefined ? { first_touch_source: overrides.first_touch_source } : {}),
    },
    items: {
      data: [
        {
          price: {
            unit_amount: overrides.unit_amount ?? 999,
            currency: overrides.currency ?? 'usd',
          },
        },
      ],
    },
  };
}

describe('StripeAttributionClient', () => {
  it('passes created window in unix seconds and limit=100', async () => {
    const list = vi.fn(() => asyncList([] as unknown[]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = { subscriptions: { list } } as any;
    const client = new StripeAttributionClient({ stripe });

    await client.listSubscriptionsCreatedBetween({
      created_gte: new Date('2026-04-25T00:00:00Z'),
      created_lt: new Date('2026-04-26T00:00:00Z'),
    });

    expect(list).toHaveBeenCalledWith({
      created: { gte: 1777075200, lt: 1777161600 },
      limit: 100,
    });
  });

  it('maps subscription metadata into StripeAttribution', async () => {
    const list = vi.fn(() => asyncList([
      sub({
        id: 'sub_001',
        user_id: 'user_42',
        utm_source: 'meta',
        utm_campaign: 'estrevia_launch_en',
        utm_content: 'ad_test_001',
        first_touch_source: 'meta',
        unit_amount: 999,
        currency: 'usd',
      }),
    ]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = { subscriptions: { list } } as any;
    const client = new StripeAttributionClient({ stripe });

    const records = await client.listSubscriptionsCreatedBetween({
      created_gte: new Date('2026-04-25T00:00:00Z'),
      created_lt: new Date('2026-04-26T00:00:00Z'),
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      subscription_id: 'sub_001',
      user_id: 'user_42',
      amount_usd: 9.99,
      utm_source: 'meta',
      utm_campaign: 'estrevia_launch_en',
      utm_content: 'ad_test_001',
      first_touch_source: 'meta',
    });
    expect(records[0].created_at).toBeInstanceOf(Date);
  });

  it('skips subscriptions without user_id metadata (unattributable)', async () => {
    const list = vi.fn(() => asyncList([
      sub({ id: 'sub_orphan', utm_source: 'meta' }),
      sub({ id: 'sub_ok', user_id: 'user_1', utm_source: 'meta' }),
    ]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = { subscriptions: { list } } as any;
    const client = new StripeAttributionClient({ stripe });

    const records = await client.listSubscriptionsCreatedBetween({
      created_gte: new Date('2026-04-25T00:00:00Z'),
      created_lt: new Date('2026-04-26T00:00:00Z'),
    });

    expect(records).toHaveLength(1);
    expect(records[0].subscription_id).toBe('sub_ok');
  });

  it('zeros amount_usd for non-USD subscriptions', async () => {
    const list = vi.fn(() => asyncList([
      sub({ id: 'sub_eur', user_id: 'user_1', unit_amount: 990, currency: 'eur' }),
    ]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = { subscriptions: { list } } as any;
    const client = new StripeAttributionClient({ stripe });

    const records = await client.listSubscriptionsCreatedBetween({
      created_gte: new Date('2026-04-25T00:00:00Z'),
      created_lt: new Date('2026-04-26T00:00:00Z'),
    });

    expect(records[0].amount_usd).toBe(0);
  });
});
