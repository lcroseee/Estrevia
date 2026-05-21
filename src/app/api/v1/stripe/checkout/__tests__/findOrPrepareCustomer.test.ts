import { describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import { findOrPrepareCustomer, utcDayBucket } from '../findOrPrepareCustomer';

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
