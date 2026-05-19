import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inspect } from 'node:util';

const constructEventMock = vi.fn();
const subsRetrieveMock = vi.fn();
const sessionsUpdateMock = vi.fn();
const getUserListMock = vi.fn();
const createUserMock = vi.fn();
const createTokenMock = vi.fn();
const dbInsertMock = vi.fn();
const dbUpdateMock = vi.fn();
const dbDeleteMock = vi.fn();
const sendEmailMock = vi.fn();

// Captures every db.update().set().where()[.returning()] invocation in order.
// Tests assert on .length, .setArgs, .whereArgs, and .returningCalled.
type UpdateCall = {
  setArgs: unknown;
  whereArgs: unknown;
  returningCalled: boolean;
};
const dbUpdateCalls: UpdateCall[] = [];
// Result returned when the link UPDATE chains .returning(). Empty array = "no rows linked".
let dbUpdateReturningRows: Array<{ id: string }> = [];

vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: constructEventMock },
    subscriptions: { retrieve: subsRetrieveMock },
    checkout: { sessions: { update: sessionsUpdateMock } },
  }),
}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    users: { getUserList: getUserListMock, createUser: createUserMock },
    signInTokens: { createSignInToken: createTokenMock },
  }),
}));
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: () => Promise.resolve(dbInsertMock()) }),
        onConflictDoUpdate: () => Promise.resolve(undefined),
      }),
    }),
    update: () => ({
      set: (setArgs: unknown) => ({
        where: (whereArgs: unknown) => {
          const call: UpdateCall = { setArgs, whereArgs, returningCalled: false };
          dbUpdateCalls.push(call);
          dbUpdateMock();
          // The fallback path awaits .where() directly (thenable resolves to undefined).
          // The link path calls .returning() first, which resolves to dbUpdateReturningRows.
          const thenable: PromiseLike<undefined> & { returning: () => Promise<Array<{ id: string }>> } = {
            then: (resolve) => Promise.resolve(undefined).then(resolve),
            returning: () => {
              call.returningCalled = true;
              return Promise.resolve(dbUpdateReturningRows);
            },
          };
          return thenable;
        },
      }),
    }),
    delete: () => ({ where: () => Promise.resolve(dbDeleteMock()) }),
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
  }),
}));
vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => 'sig_test' }),
}));
vi.mock('@/shared/lib/email', () => ({
  sendPurchaseConfirmationEmail: sendEmailMock,
}));
vi.mock('@/shared/lib/analytics', () => ({
  AnalyticsEvent: {
    SUBSCRIPTION_STARTED: 'subscription_started',
    ANONYMOUS_USER_MATERIALIZED: 'anonymous_user_materialized',
    CHECKOUT_TICKET_READY: 'checkout_ticket_ready',
  },
  trackServerEvent: vi.fn(),
}));

import { POST } from '../route';

function makeSessionCompletedEvent(opts: { metadata?: Record<string, string>; email?: string }): Request {
  const event = {
    id: 'evt_test_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_xyz',
        mode: 'subscription',
        customer: 'cus_anonymous_1',
        subscription: 'sub_test_1',
        metadata: opts.metadata ?? {},
        customer_details: { email: opts.email ?? 'paid@example.com' },
        amount_total: 0,
        currency: 'usd',
      },
    },
  };
  constructEventMock.mockReturnValue(event);
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig_test' },
    body: JSON.stringify(event),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dbUpdateCalls.length = 0;
  dbUpdateReturningRows = [{ id: 'lead-default' }]; // default: link succeeds → fallback skipped
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.STRIPE_PRICE_ID_PRO_ANNUAL = 'price_annual_test';
  dbInsertMock.mockReturnValue([{ eventId: 'evt_test_1' }]);
  subsRetrieveMock.mockResolvedValue({
    id: 'sub_test_1',
    status: 'trialing',
    items: { data: [{ price: { id: 'price_annual_test' }, current_period_end: 9999999999 }] },
    trial_end: 9999990000,
  });
  createTokenMock.mockResolvedValue({ token: 'ticket_abc123' });
  sessionsUpdateMock.mockResolvedValue({});
});

describe('webhook checkout.session.completed — anonymous branch', () => {
  it('reuses existing Clerk user when email matches', async () => {
    getUserListMock.mockResolvedValue({ totalCount: 1, data: [{ id: 'user_existing' }] });

    const res = await POST(makeSessionCompletedEvent({
      metadata: { anonymous_id: 'anon-xyz', utm_source: 'meta' },
      email: 'paid@example.com',
    }));

    expect(res.status).toBe(200);
    expect(getUserListMock).toHaveBeenCalledWith({ emailAddress: ['paid@example.com'] });
    expect(createUserMock).not.toHaveBeenCalled();
    expect(createTokenMock).toHaveBeenCalledWith({ userId: 'user_existing', expiresInSeconds: 600 });
  });

  it('creates new Clerk user when email is not found', async () => {
    getUserListMock.mockResolvedValue({ totalCount: 0, data: [] });
    createUserMock.mockResolvedValue({ id: 'user_new_xyz' });

    await POST(makeSessionCompletedEvent({
      metadata: { anonymous_id: 'anon-xyz' },
      email: 'new@example.com',
    }));

    expect(createUserMock).toHaveBeenCalledWith({
      emailAddress: ['new@example.com'],
      skipPasswordChecks: true,
      skipPasswordRequirement: true,
      externalId: 'stripe:cs_test_xyz',
    });
    expect(createTokenMock).toHaveBeenCalledWith({ userId: 'user_new_xyz', expiresInSeconds: 600 });
  });

  it('writes signInTicket back to Stripe session metadata', async () => {
    getUserListMock.mockResolvedValue({ totalCount: 0, data: [] });
    createUserMock.mockResolvedValue({ id: 'user_new' });

    await POST(makeSessionCompletedEvent({
      metadata: { anonymous_id: 'anon-xyz', utm_source: 'meta' },
      email: 'new@example.com',
    }));

    expect(sessionsUpdateMock).toHaveBeenCalledWith('cs_test_xyz', {
      metadata: expect.objectContaining({
        signInTicket: 'ticket_abc123',
        anonymous_id: 'anon-xyz',
        utm_source: 'meta',
      }),
    });
  });

  it('recovers from createUser race via retry getUserList', async () => {
    getUserListMock
      .mockResolvedValueOnce({ totalCount: 0, data: [] })
      .mockResolvedValueOnce({ totalCount: 1, data: [{ id: 'user_race_winner' }] });
    createUserMock.mockRejectedValue({ errors: [{ code: 'form_identifier_exists' }] });

    await POST(makeSessionCompletedEvent({
      metadata: { anonymous_id: 'anon-xyz' },
      email: 'race@example.com',
    }));

    expect(getUserListMock).toHaveBeenCalledTimes(2);
    expect(createTokenMock).toHaveBeenCalledWith({ userId: 'user_race_winner', expiresInSeconds: 600 });
  });

  it('deletes dedup row on Clerk failure to enable Stripe retry', async () => {
    getUserListMock.mockRejectedValue(new Error('Clerk API down'));

    const res = await POST(makeSessionCompletedEvent({
      metadata: { anonymous_id: 'anon-xyz' },
      email: 'paid@example.com',
    }));

    expect(dbDeleteMock).toHaveBeenCalled();
    expect(res.status).toBe(500);
  });

  it('preserves signed-in path when metadata.clerkUserId is present', async () => {
    await POST(makeSessionCompletedEvent({
      metadata: { clerkUserId: 'user_signed_in_abc' },
      email: 'signed@example.com',
    }));

    expect(getUserListMock).not.toHaveBeenCalled();
    expect(createUserMock).not.toHaveBeenCalled();
    expect(sessionsUpdateMock).not.toHaveBeenCalled();
  });

  it('linksByEmail_thenSkipsUtmFallback', async () => {
    // Lead-link UPDATE returns 1 row → fallback must NOT fire even with valid utm_content.
    dbUpdateReturningRows = [{ id: 'lead-matched-by-email' }];
    getUserListMock.mockResolvedValue({ totalCount: 1, data: [{ id: 'user_existing' }] });

    await POST(makeSessionCompletedEvent({
      metadata: {
        anonymous_id: 'anon-xyz',
        utm_content: 'qnU9lsC9dkhb8XUTXF4wZ', // valid 21-char lead id
      },
      email: 'paid@example.com',
    }));

    // Exactly one UPDATE: the link itself. No fallback UPDATE.
    expect(dbUpdateCalls).toHaveLength(1);
    expect(dbUpdateCalls[0].returningCalled).toBe(true);
  });

  it('emailMismatch_utmFallbackSetsUnsubscribed', async () => {
    // Lead-link UPDATE returns 0 rows (lead-email ≠ checkout-email, no anonymous_id cookie).
    dbUpdateReturningRows = [];
    getUserListMock.mockResolvedValue({ totalCount: 0, data: [] });
    createUserMock.mockResolvedValue({ id: 'user_new_mismatch' });

    await POST(makeSessionCompletedEvent({
      metadata: { utm_content: 'qnU9lsC9dkhb8XUTXF4wZ' },
      email: 'destinig7996@example.com',
    }));

    expect(dbUpdateCalls).toHaveLength(2);
    expect(dbUpdateCalls[0].returningCalled).toBe(true); // link UPDATE
    expect(dbUpdateCalls[1].returningCalled).toBe(false); // fallback UPDATE (no .returning())
    expect(dbUpdateCalls[1].setArgs).toMatchObject({ unsubscribedAt: expect.any(Date) });
  });

  it('utmFallback_invalidFormatNoOp', async () => {
    // utm_content like a legacy ad_id (not a 21-char nanoid) → fallback must NOT fire.
    dbUpdateReturningRows = []; // link matched zero rows
    getUserListMock.mockResolvedValue({ totalCount: 0, data: [] });
    createUserMock.mockResolvedValue({ id: 'user_invalid_utm' });

    await POST(makeSessionCompletedEvent({
      metadata: { utm_content: 'ad_123' },
      email: 'paid@example.com',
    }));

    expect(dbUpdateCalls).toHaveLength(1); // only link UPDATE; no fallback
  });

  it('utmFallback_idempotentOnRetry', async () => {
    // The fallback UPDATE's where clause must include an isNull(unsubscribed_at)
    // guard so a Stripe retry on the same checkout (or a future code path with
    // overlapping intent) does not overwrite the timestamp.
    //
    // util.inspect() on a Drizzle SQL object renders column references and
    // operator names (including "IsNull"). This is more stable than peeking
    // at .queryChunks internals across drizzle versions.
    dbUpdateReturningRows = [];
    getUserListMock.mockResolvedValue({ totalCount: 0, data: [] });
    createUserMock.mockResolvedValue({ id: 'user_retry' });

    await POST(makeSessionCompletedEvent({
      metadata: { utm_content: 'qnU9lsC9dkhb8XUTXF4wZ' },
      email: 'paid@example.com',
    }));

    expect(dbUpdateCalls).toHaveLength(2);
    const fallbackWhere = inspect(dbUpdateCalls[1].whereArgs, { depth: 12 });
    // drizzle-orm renders isNull() as the SQL text ' is null' inside a StringChunk
    expect(fallbackWhere).toMatch(/is null/i);
    expect(fallbackWhere).toMatch(/unsubscribed_at/i);
  });
});
