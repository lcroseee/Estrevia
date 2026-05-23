import { describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import {
  findOrPrepareCustomer,
  utcDayBucket,
  buildCheckoutIdempotencyKey,
} from '../findOrPrepareCustomer';

type CustomersList = Stripe.Customer[];
type SubsList = Pick<Stripe.Subscription, 'status'>[];

function makeStripeMock(opts: {
  customers?: CustomersList;
  subscriptions?: SubsList;
  customersListThrows?: Error;
  subscriptionsListThrows?: Error;
}) {
  return {
    customers: {
      list: vi.fn().mockImplementation(() => {
        if (opts.customersListThrows) throw opts.customersListThrows;
        return Promise.resolve({ data: opts.customers ?? [] });
      }),
    },
    subscriptions: {
      list: vi.fn().mockImplementation(() => {
        if (opts.subscriptionsListThrows) throw opts.subscriptionsListThrows;
        return Promise.resolve({ data: opts.subscriptions ?? [] });
      }),
    },
  } as unknown as Stripe;
}

describe('findOrPrepareCustomer', () => {
  it('returns kind="create" when customers.list returns empty', async () => {
    const stripe = makeStripeMock({ customers: [] });
    const result = await findOrPrepareCustomer(stripe, 'new@example.com');
    expect(result).toEqual({ kind: 'create' });
  });

  it('returns kind="reuse" when customer exists with no subscriptions', async () => {
    const stripe = makeStripeMock({
      customers: [{ id: 'cus_existing' } as Stripe.Customer],
      subscriptions: [],
    });
    const result = await findOrPrepareCustomer(stripe, 'old@example.com');
    expect(result).toEqual({ kind: 'reuse', customerId: 'cus_existing' });
  });

  it('returns kind="reuse" when customer has only canceled subscriptions', async () => {
    const stripe = makeStripeMock({
      customers: [{ id: 'cus_canceled' } as Stripe.Customer],
      subscriptions: [{ status: 'canceled' }, { status: 'incomplete_expired' }],
    });
    const result = await findOrPrepareCustomer(stripe, 'former@example.com');
    expect(result).toEqual({ kind: 'reuse', customerId: 'cus_canceled' });
  });

  it('returns kind="block" when customer has an active subscription', async () => {
    const stripe = makeStripeMock({
      customers: [{ id: 'cus_active' } as Stripe.Customer],
      subscriptions: [{ status: 'active' }],
    });
    const result = await findOrPrepareCustomer(stripe, 'active@example.com');
    expect(result).toEqual({ kind: 'block', reason: 'already_subscribed' });
  });

  it('returns kind="block" when customer has a trialing subscription', async () => {
    const stripe = makeStripeMock({
      customers: [{ id: 'cus_trialing' } as Stripe.Customer],
      subscriptions: [{ status: 'trialing' }],
    });
    const result = await findOrPrepareCustomer(stripe, 'trial@example.com');
    expect(result).toEqual({ kind: 'block', reason: 'already_subscribed' });
  });

  it('returns kind="block" when customer has a past_due subscription', async () => {
    const stripe = makeStripeMock({
      customers: [{ id: 'cus_pastdue' } as Stripe.Customer],
      subscriptions: [{ status: 'past_due' }],
    });
    const result = await findOrPrepareCustomer(stripe, 'pastdue@example.com');
    expect(result).toEqual({ kind: 'block', reason: 'already_subscribed' });
  });

  it('returns kind="create" when customers.list throws (fail-open, do not block checkout)', async () => {
    const stripe = makeStripeMock({ customersListThrows: new Error('stripe-down') });
    const result = await findOrPrepareCustomer(stripe, 'x@example.com');
    expect(result).toEqual({ kind: 'create' });
  });

  it('returns kind="block" when subscriptions.list throws (fail-closed, safer to deny)', async () => {
    const stripe = makeStripeMock({
      customers: [{ id: 'cus_q' } as Stripe.Customer],
      subscriptionsListThrows: new Error('stripe-down'),
    });
    const result = await findOrPrepareCustomer(stripe, 'q@example.com');
    expect(result).toEqual({ kind: 'block', reason: 'already_subscribed' });
  });
});

describe('utcDayBucket', () => {
  it('returns ISO date string YYYY-MM-DD', () => {
    const out = utcDayBucket();
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns the UTC calendar date regardless of local timezone', () => {
    const fixed = new Date('2026-05-21T23:30:00Z');
    expect(utcDayBucket(fixed)).toBe('2026-05-21');
  });
});

describe('buildCheckoutIdempotencyKey', () => {
  const base = {
    identity: 'anon-xyz',
    plan: 'pro_annual',
    day: '2026-05-23',
    stripeLocale: 'es' as const,
    localeFromBody: 'es' as const,
    utm: {} as Record<string, string>,
    customer: 'new',
  };

  it('is stable for identical params (true double-clicks dedup correctly)', () => {
    expect(buildCheckoutIdempotencyKey(base)).toBe(buildCheckoutIdempotencyKey({ ...base }));
  });

  it('differs when ONLY the locale differs (the prod collision bug)', () => {
    const es = buildCheckoutIdempotencyKey({ ...base, stripeLocale: 'es', localeFromBody: 'es' });
    const auto = buildCheckoutIdempotencyKey({ ...base, stripeLocale: 'auto', localeFromBody: null });
    expect(es).not.toBe(auto);
  });

  it('differs when ONLY a utm value differs', () => {
    const a = buildCheckoutIdempotencyKey({ ...base, utm: { utm_campaign: 'a' } });
    const b = buildCheckoutIdempotencyKey({ ...base, utm: { utm_campaign: 'b' } });
    expect(a).not.toBe(b);
  });

  it('is independent of utm key insertion order (canonical hashing)', () => {
    const a = buildCheckoutIdempotencyKey({ ...base, utm: { utm_source: 's', utm_campaign: 'c' } });
    const b = buildCheckoutIdempotencyKey({ ...base, utm: { utm_campaign: 'c', utm_source: 's' } });
    expect(a).toBe(b);
  });

  it('differs when ONLY the resolved customer differs', () => {
    const neu = buildCheckoutIdempotencyKey({ ...base, customer: 'new' });
    const reuse = buildCheckoutIdempotencyKey({ ...base, customer: 'cus_123' });
    expect(neu).not.toBe(reuse);
  });

  it('differs per identity so distinct anonymous users never collide', () => {
    const u1 = buildCheckoutIdempotencyKey({ ...base, identity: 'anon-1' });
    const u2 = buildCheckoutIdempotencyKey({ ...base, identity: 'anon-2' });
    expect(u1).not.toBe(u2);
  });

  it('is a readable, bounded key: checkout:<identity>:<plan>:<day>:<hash> and <=255 chars', () => {
    const key = buildCheckoutIdempotencyKey(base);
    expect(key).toMatch(/^checkout:anon-xyz:pro_annual:2026-05-23:[0-9a-f]{16,}$/);
    expect(key.length).toBeLessThanOrEqual(255);
  });
});
