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
}));

// Wire the chainable mocks: insert() → { values } → { onConflictDoNothing }
mocks.values.mockImplementation(() => ({ onConflictDoNothing: mocks.onConflictDoNothing }));
mocks.insert.mockImplementation(() => ({ values: mocks.values }));

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
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  }),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: mocks.trackServerEvent,
  AnalyticsEvent: { USER_REGISTERED: 'user_registered' },
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

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
      },
    });

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);

    expect(mocks.trackServerEvent).toHaveBeenCalledTimes(1);
    expect(mocks.trackServerEvent).toHaveBeenCalledWith(
      'user_2abc123',
      'user_registered',
      {
        source: 'clerk_webhook',
        email_domain: 'example.com',
        $insert_id: 'user_2abc123:user_registered',
      },
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

  it('handles email without @ gracefully (email_domain=null)', async () => {
    mocks.verify.mockReturnValue({
      type: 'user.created',
      data: {
        id: 'user_2no_email',
        email_addresses: [{ email_address: '' }],
      },
    });

    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    expect(mocks.trackServerEvent).toHaveBeenCalledWith(
      'user_2no_email',
      'user_registered',
      expect.objectContaining({ email_domain: null }),
    );
  });
});
