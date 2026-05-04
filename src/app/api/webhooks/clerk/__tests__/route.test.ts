import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocks must come before route import. vi.mock() factories are hoisted by
// Vitest to the top of the file, so any variables they reference must also
// be hoisted via vi.hoisted() to exist before the factories run.

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  trackServerEvent: vi.fn(),
  onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  values: vi.fn(),
  insert: vi.fn(),
  // For select chains used in user.deleted + chart query
  selectLimit: vi.fn().mockResolvedValue([]),
  selectWhere: vi.fn(),
  selectFrom: vi.fn(),
  select: vi.fn(),
  deleteWhere: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn(),
  // Email helpers
  sendWelcomeEmail: vi.fn().mockResolvedValue({ sent: true }),
  sendAccountDeletionEmail: vi.fn().mockResolvedValue({ sent: true }),
}));

// Wire the chainable mocks: insert() → { values } → { onConflictDoNothing }
mocks.values.mockImplementation(() => ({ onConflictDoNothing: mocks.onConflictDoNothing }));
mocks.insert.mockImplementation(() => ({ values: mocks.values }));

// Wire select chain: select() → { from } → { where } → { limit }
mocks.selectLimit.mockResolvedValue([]);
mocks.selectWhere.mockImplementation(() => ({ limit: mocks.selectLimit }));
mocks.selectFrom.mockImplementation(() => ({ where: mocks.selectWhere }));
mocks.select.mockImplementation(() => ({ from: mocks.selectFrom }));

// Wire delete chain: delete() → { where }
mocks.deleteWhere.mockResolvedValue(undefined);
mocks.delete.mockImplementation(() => ({ where: mocks.deleteWhere }));

vi.mock('svix', () => ({
  // Regular function (not arrow) so `new Webhook()` works as a constructor
  Webhook: vi.fn(function MockWebhook() {
    return { verify: mocks.verify };
  }),
}));

vi.mock('next/headers', () => ({
  headers: async () => new Map([
    ['svix-id', 'msg_test_001'],
    ['svix-timestamp', '1700000000'],
    ['svix-signature', 'v1,sig_test'],
  ]),
}));

vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({
    insert: mocks.insert,
    update: vi.fn(() => ({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) })),
    delete: mocks.delete,
    select: mocks.select,
  }),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: mocks.trackServerEvent,
  AnalyticsEvent: { USER_REGISTERED: 'user_registered' },
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

// Email helpers — mocked so no real Resend calls happen in tests
vi.mock('@/shared/lib/email', () => ({
  sendWelcomeEmail: mocks.sendWelcomeEmail,
  sendAccountDeletionEmail: mocks.sendAccountDeletionEmail,
}));

import { POST } from '../route';

function makeReq(body: unknown): Request {
  return new Request('https://estrevia.app/api/webhooks/clerk', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.CLERK_WEBHOOK_SECRET = 'whsec_test_secret';
  mocks.verify.mockReset();
  mocks.trackServerEvent.mockReset();
  mocks.insert.mockClear();
  mocks.values.mockClear();
  mocks.onConflictDoNothing.mockClear();
  mocks.select.mockClear();
  mocks.selectFrom.mockClear();
  mocks.selectWhere.mockClear();
  mocks.selectLimit.mockClear();
  mocks.delete.mockClear();
  mocks.deleteWhere.mockClear();
  mocks.sendWelcomeEmail.mockReset();
  mocks.sendAccountDeletionEmail.mockReset();
  // Default: no saved charts, no user row
  mocks.selectLimit.mockResolvedValue([]);
  mocks.sendWelcomeEmail.mockResolvedValue({ sent: true });
  mocks.sendAccountDeletionEmail.mockResolvedValue({ sent: true });
});

afterEach(() => {
  delete process.env.CLERK_WEBHOOK_SECRET;
});

describe('POST /api/webhooks/clerk — user_registered firing', () => {
  it('fires user_registered to PostHog on user.created with $insert_id and email_domain', async () => {
    mocks.verify.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'user_2abc123',
        email_addresses: [{ email_address: 'alice@example.com' }],
        unsafe_metadata: {},
      },
    });

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);

    expect(mocks.trackServerEvent).toHaveBeenCalledTimes(1);
    // T18 (v3b): properties also include `email` so T11's analytics extension
    // can hash + forward it to Meta CAPI for Custom Audience matching.
    expect(mocks.trackServerEvent).toHaveBeenCalledWith(
      'user_2abc123',
      'user_registered',
      {
        source: 'clerk_webhook',
        email_domain: 'example.com',
        email: 'alice@example.com',
        $insert_id: 'user_2abc123:user_registered',
      },
    );
  });

  it('forwards CAPI-required fields ($insert_id + email) for T11 to fire CAPI Lead', async () => {
    // T18: This wire-up test asserts the CAPI-relevant inputs land in the
    // trackServerEvent properties bag. The actual Pixel/CAPI fire happens
    // inside trackServerEvent (extended in T11) and is covered by
    // src/shared/lib/__tests__/analytics-capi.test.ts. Here we lock in the
    // contract: webhook → trackServerEvent must include event_id (via
    // $insert_id) + plaintext email (hashed downstream at the CAPI boundary).
    mocks.verify.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'user_test_clerk_id',
        email_addresses: [{ email_address: 'capi-target@example.com' }],
        unsafe_metadata: {},
      },
    });

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);

    expect(mocks.trackServerEvent).toHaveBeenCalledWith(
      'user_test_clerk_id',
      'user_registered',
      expect.objectContaining({
        // event_id reused by T11 wrapper as the CAPI dedupe key (matches fbq)
        $insert_id: 'user_test_clerk_id:user_registered',
        // plaintext email forwarded for CAPI hashing — never logged here
        email: 'capi-target@example.com',
      }),
    );
  });

  it('does NOT fire user_registered on user.updated', async () => {
    mocks.verify.mockReturnValue({
      type: 'user.updated',
      data: {
        id: 'user_2abc123',
        email_addresses: [{ email_address: 'alice@example.com' }],
      },
    });

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    expect(mocks.trackServerEvent).not.toHaveBeenCalled();
  });

  it('returns 200 even when PostHog throws — Clerk must not retry', async () => {
    mocks.verify.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'user_2err',
        email_addresses: [{ email_address: 'bob@test.io' }],
        unsafe_metadata: {},
      },
    });
    mocks.trackServerEvent.mockImplementationOnce(() => {
      throw new Error('PostHog timeout');
    });

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    // DB insert still ran:
    expect(mocks.onConflictDoNothing).toHaveBeenCalled();
  });

  it('handles email without @ gracefully (email_domain=null, email=undefined)', async () => {
    mocks.verify.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'user_2no_email',
        email_addresses: [{ email_address: '' }],
        unsafe_metadata: {},
      },
    });

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    expect(mocks.trackServerEvent).toHaveBeenCalledWith(
      'user_2no_email',
      'user_registered',
      // T18: empty email coerces to undefined so T11's CAPI wrapper skips
      // the user_data.em hash rather than hashing an empty string.
      expect.objectContaining({ email_domain: null, email: undefined }),
    );
  });
});

// ---------------------------------------------------------------------------
// T3: Welcome email + account deletion email tests
// ---------------------------------------------------------------------------
describe('POST /api/webhooks/clerk — T3 email hookups', () => {
  it('user.created with unsafe_metadata.locale=es persists locale=es and sends welcome in ES', async () => {
    mocks.verify.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'user_es_001',
        email_addresses: [{ email_address: 'es-user@example.com' }],
        unsafe_metadata: { locale: 'es' },
      },
    });
    // No saved charts
    mocks.selectLimit.mockResolvedValue([]);

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);

    // DB insert must have been called with locale: 'es'
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user_es_001', locale: 'es' }),
    );

    // Welcome email must be sent with locale: 'es' and hasSavedChart: false
    expect(mocks.sendWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_es_001',
        email: 'es-user@example.com',
        locale: 'es',
        hasSavedChart: false,
      }),
    );
  });

  it('user.created without unsafe_metadata defaults locale to en', async () => {
    mocks.verify.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'user_en_default',
        email_addresses: [{ email_address: 'en-user@example.com' }],
        unsafe_metadata: null,
      },
    });
    mocks.selectLimit.mockResolvedValue([]);

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'en' }),
    );
    expect(mocks.sendWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'en' }),
    );
  });

  it('user.created with existing saved chart sets hasSavedChart=true', async () => {
    mocks.verify.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'user_has_chart',
        email_addresses: [{ email_address: 'chart-user@example.com' }],
        unsafe_metadata: {},
      },
    });
    // Mock: user has a saved chart
    mocks.selectLimit.mockResolvedValueOnce([{ id: 'chart_001' }]);

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);

    expect(mocks.sendWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ hasSavedChart: true }),
    );
  });

  it('welcome email failure does not fail the webhook — returns 200', async () => {
    mocks.verify.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'user_email_fail',
        email_addresses: [{ email_address: 'fail@example.com' }],
        unsafe_metadata: {},
      },
    });
    mocks.selectLimit.mockResolvedValue([]);
    mocks.sendWelcomeEmail.mockRejectedValueOnce(new Error('Resend timeout'));

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    // DB insert still completed
    expect(mocks.onConflictDoNothing).toHaveBeenCalled();
  });

  it('user.deleted sends account_deletion email BEFORE cascade delete', async () => {
    mocks.verify.mockReturnValue({
      type: 'user.deleted',
      data: { id: 'user_del_001' },
    });
    // Mock the SELECT for email + locale
    mocks.selectLimit.mockResolvedValueOnce([
      { email: 'del-user@example.com', locale: 'en' },
    ]);

    const callOrder: string[] = [];
    mocks.sendAccountDeletionEmail.mockImplementation(async () => {
      callOrder.push('email');
      return { sent: true };
    });
    mocks.deleteWhere.mockImplementation(async () => {
      callOrder.push('delete');
    });

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);

    expect(mocks.sendAccountDeletionEmail).toHaveBeenCalledWith({
      userId: 'user_del_001',
      email: 'del-user@example.com',
      locale: 'en',
    });
    // Email must fire before DB delete
    expect(callOrder).toEqual(['email', 'delete']);
  });
});
