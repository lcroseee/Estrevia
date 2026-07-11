import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks before imports
// ---------------------------------------------------------------------------
const dbUpdateMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({ update: dbUpdateMock }),
}));

const verifyMock = vi.hoisted(() => vi.fn());
vi.mock('svix', () => ({
  // Regular function (not arrow) so `new Webhook()` works as a constructor
  Webhook: vi.fn(function MockWebhook() {
    return { verify: verifyMock };
  }),
}));

// next/headers mock — provide the svix headers the route reads
const headersMock = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  headers: headersMock,
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------
import { POST } from '../route';

// Helper: build a standard POST request with svix headers
function makeResendRequest(body = '{}'): Request {
  return new Request('http://localhost/api/webhooks/resend', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': 'msg_test_id',
      'svix-timestamp': '1234567890',
      'svix-signature': 'v1,test_signature',
    },
    body,
  });
}

// Configure headers() mock to return the expected svix headers
function mockHeaders() {
  const map = new Map([
    ['svix-id', 'msg_test_id'],
    ['svix-timestamp', '1234567890'],
    ['svix-signature', 'v1,test_signature'],
  ]);
  headersMock.mockResolvedValue({ get: (k: string) => map.get(k) ?? null });
}

// REAL Resend payload shape — matches resend@6.10.0 SDK types
// (node_modules/resend/dist/index.d.mts: BaseEmailEventData.to: string[],
// EmailBouncedEvent.data.bounce: { message, subType, type }). The pre-2026-07-10
// version of this file used a fictional { email, bounce_type } shape that made
// the handler a permanent no-op in prod (audit 04-resend.md R-2).
function bouncedEvent(to: string[], bounceType: string) {
  return {
    type: 'email.bounced',
    created_at: '2026-07-10T12:00:00.000Z',
    data: {
      created_at: '2026-07-10T12:00:00.000Z',
      email_id: 'ae2014de-c168-4c61-8f4b-1f4e2f3a1b2c',
      from: 'Estrevia <hello@estrevia.app>',
      to,
      subject: 'Your sidereal chart',
      bounce: {
        message: 'smtp; 550 5.1.1 user unknown',
        subType: 'General',
        type: bounceType,
      },
    },
  };
}

function complainedEvent(to: string[]) {
  return {
    type: 'email.complained',
    created_at: '2026-07-10T12:00:00.000Z',
    data: {
      created_at: '2026-07-10T12:00:00.000Z',
      email_id: 'ae2014de-c168-4c61-8f4b-1f4e2f3a1b2c',
      from: 'Estrevia <hello@estrevia.app>',
      to,
      subject: 'Your sidereal chart',
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('RESEND_WEBHOOK_SECRET', 'test-resend-secret');
  mockHeaders();
  // Default db.update chain: update().set().where() → resolves
  dbUpdateMock.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
});

describe('POST /api/webhooks/resend', () => {
  it('returns 401 on bad signature', async () => {
    verifyMock.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const res = await POST(makeResendRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('UNAUTHORIZED');
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('Permanent bounce flags users AND email_leads (single recipient)', async () => {
    verifyMock.mockReturnValue(bouncedEvent(['bounced@example.com'], 'Permanent'));

    const res = await POST(makeResendRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    // Two UPDATEs per recipient: users, then email_leads
    expect(dbUpdateMock).toHaveBeenCalledTimes(2);
    const usersSet = dbUpdateMock.mock.results[0].value.set;
    const leadsSet = dbUpdateMock.mock.results[1].value.set;
    expect(usersSet).toHaveBeenCalledWith({ emailUndeliverable: true });
    expect(leadsSet).toHaveBeenCalledWith({ emailUndeliverable: true });
  });

  it('Permanent bounce iterates data.to[] — every recipient gets flagged', async () => {
    verifyMock.mockReturnValue(
      bouncedEvent(['first@example.com', 'Second@Example.COM'], 'Permanent'),
    );

    const res = await POST(makeResendRequest());
    expect(res.status).toBe(200);
    // 2 recipients × (users + email_leads) = 4 UPDATEs
    expect(dbUpdateMock).toHaveBeenCalledTimes(4);
  });

  it('Transient bounce is log-only (no DB write)', async () => {
    verifyMock.mockReturnValue(bouncedEvent(['soft@example.com'], 'Transient'));

    const res = await POST(makeResendRequest());
    expect(res.status).toBe(200);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('Undetermined bounce is log-only (no DB write)', async () => {
    verifyMock.mockReturnValue(bouncedEvent(['maybe@example.com'], 'Undetermined'));

    const res = await POST(makeResendRequest());
    expect(res.status).toBe(200);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('REGRESSION: old fictional payload shape must NOT flag anything and must not 500', async () => {
    // The shape this handler (and its tests) wrongly assumed before 2026-07-10.
    verifyMock.mockReturnValue({
      type: 'email.bounced',
      data: { email: 'bounced@example.com', bounce_type: 'hard' },
    });

    const res = await POST(makeResendRequest());
    expect(res.status).toBe(200);
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('complaint flags users + unsubscribes lead for every recipient', async () => {
    verifyMock.mockReturnValue(complainedEvent(['complained@example.com']));

    const res = await POST(makeResendRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(dbUpdateMock).toHaveBeenCalledTimes(2);
    const usersSet = dbUpdateMock.mock.results[0].value.set;
    const leadsSet = dbUpdateMock.mock.results[1].value.set;
    expect(usersSet).toHaveBeenCalledWith({ emailUndeliverable: true });
    expect(leadsSet).toHaveBeenCalledWith(
      expect.objectContaining({
        emailUndeliverable: true,
        unsubscribedAt: expect.any(Date),
      }),
    );
  });

  it('per-address failure is isolated — other recipients still get flagged, 200', async () => {
    verifyMock.mockReturnValue(
      bouncedEvent(['dead-row@example.com', 'fine@example.com'], 'Permanent'),
    );
    // 1st update (users, recipient 1) rejects → its leads update is skipped;
    // recipient 2 proceeds (calls 2 and 3 succeed).
    let callIdx = 0;
    dbUpdateMock.mockImplementation(() => {
      callIdx += 1;
      const rejects = callIdx === 1;
      return {
        set: vi.fn().mockReturnValue({
          where: rejects
            ? vi.fn().mockRejectedValue(new Error('row lock timeout'))
            : vi.fn().mockResolvedValue(undefined),
        }),
      };
    });

    const res = await POST(makeResendRequest());
    expect(res.status).toBe(200);
    expect(dbUpdateMock).toHaveBeenCalledTimes(3);
  });

  it('ALL addresses failing returns 500 so Resend retries', async () => {
    verifyMock.mockReturnValue(
      bouncedEvent(['a@example.com', 'b@example.com'], 'Permanent'),
    );
    dbUpdateMock.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('db down')),
      }),
    });

    const res = await POST(makeResendRequest());
    expect(res.status).toBe(500);
  });
});
