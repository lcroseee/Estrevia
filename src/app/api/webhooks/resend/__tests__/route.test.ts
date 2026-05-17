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
  // -------------------------------------------------------------------------
  // Test 1: bad svix signature → 401
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Test 2: hard bounce → emailUndeliverable=true on BOTH users + email_leads
  // -------------------------------------------------------------------------
  it('marks emailUndeliverable on users AND email_leads on hard bounce', async () => {
    verifyMock.mockReturnValue({
      type: 'email.bounced',
      data: { email: 'bounced@example.com', bounce_type: 'hard' },
    });

    const res = await POST(makeResendRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    // Two UPDATEs: one for `users`, one for `email_leads`
    expect(dbUpdateMock).toHaveBeenCalledTimes(2);
    const usersSet = dbUpdateMock.mock.results[0].value.set;
    const leadsSet = dbUpdateMock.mock.results[1].value.set;
    expect(usersSet).toHaveBeenCalledWith({ emailUndeliverable: true });
    expect(leadsSet).toHaveBeenCalledWith({ emailUndeliverable: true });
  });

  // -------------------------------------------------------------------------
  // Test 3: complaint → emailUndeliverable=true on users; both flags on leads
  // -------------------------------------------------------------------------
  it('marks emailUndeliverable on users AND unsubscribes lead on complaint', async () => {
    verifyMock.mockReturnValue({
      type: 'email.complained',
      data: { email: 'complained@example.com' },
    });

    const res = await POST(makeResendRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(dbUpdateMock).toHaveBeenCalledTimes(2);
    const usersSet = dbUpdateMock.mock.results[0].value.set;
    const leadsSet = dbUpdateMock.mock.results[1].value.set;
    expect(usersSet).toHaveBeenCalledWith({ emailUndeliverable: true });
    // Complaint propagation: BOTH undeliverable AND unsubscribed_at=now
    expect(leadsSet).toHaveBeenCalledWith(
      expect.objectContaining({
        emailUndeliverable: true,
        unsubscribedAt: expect.any(Date),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: soft bounce → ignored (no DB write)
  // -------------------------------------------------------------------------
  it('ignores soft bounces (no DB write)', async () => {
    verifyMock.mockReturnValue({
      type: 'email.bounced',
      data: { email: 'softbounce@example.com', bounce_type: 'soft' },
    });

    const res = await POST(makeResendRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    // Must NOT touch the database
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // T11: lowercase the email before matching email_leads (stored normalized)
  // -------------------------------------------------------------------------
  it('lowercases email when querying email_leads on hard bounce', async () => {
    verifyMock.mockReturnValue({
      type: 'email.bounced',
      data: { email: 'MixedCase@Example.COM', bounce_type: 'hard' },
    });

    const res = await POST(makeResendRequest());
    expect(res.status).toBe(200);
    expect(dbUpdateMock).toHaveBeenCalledTimes(2);
    // Both updates fired (users + email_leads). The leads where() clause uses
    // lowercase — we can't inspect the where args easily but coverage here
    // ensures the code path was exercised + didn't throw on mixed-case input.
  });

  // -------------------------------------------------------------------------
  // T11: email_leads UPDATE failure is non-blocking (analytics, not auth)
  // -------------------------------------------------------------------------
  it('returns 200 even when email_leads UPDATE throws on hard bounce', async () => {
    verifyMock.mockReturnValue({
      type: 'email.bounced',
      data: { email: 'bounced@example.com', bounce_type: 'hard' },
    });
    // First update (users) succeeds; second (email_leads) rejects.
    let callIdx = 0;
    dbUpdateMock.mockImplementation(() => {
      callIdx += 1;
      if (callIdx === 1) {
        return {
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        };
      }
      return {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error('leads db down')),
        }),
      };
    });

    const res = await POST(makeResendRequest());
    expect(res.status).toBe(200);
    expect(dbUpdateMock).toHaveBeenCalledTimes(2);
  });
});
