/**
 * Tests for GET and PUT /api/v1/user/account
 *
 * Covers:
 *   - PUT marketingEmailOptIn=true/false → 200 updated
 *   - PUT with invalid body → 400
 *   - PUT with no fields → 400
 *   - GET returns marketingEmailOptIn for authenticated user
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  updateWhere: vi.fn().mockResolvedValue(undefined),
  updateSet: vi.fn(),
  update: vi.fn(),
  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
  selectFrom: vi.fn(),
  select: vi.fn(),
  getDb: vi.fn(),
  getRateLimiter: vi.fn(),
}));

// Wire update chain: update() → { set } → { where }
mocks.updateWhere.mockResolvedValue(undefined);
mocks.updateSet.mockImplementation(() => ({ where: mocks.updateWhere }));
mocks.update.mockImplementation(() => ({ set: mocks.updateSet }));

// Wire select chain: select() → { from } → { where } → { limit }
mocks.selectLimit.mockResolvedValue([{ marketingEmailOptIn: true }]);
mocks.selectWhere.mockImplementation(() => ({ limit: mocks.selectLimit }));
mocks.selectFrom.mockImplementation(() => ({ where: mocks.selectWhere }));
mocks.select.mockImplementation(() => ({ from: mocks.selectFrom }));

mocks.getDb.mockReturnValue({
  update: mocks.update,
  select: mocks.select,
});

// Rate limiter stub (always allow)
mocks.getRateLimiter.mockReturnValue({ limit: vi.fn().mockResolvedValue({ success: true }) });

vi.mock('@/modules/auth/lib/helpers', () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock('@/shared/lib/db', () => ({
  getDb: mocks.getDb,
}));

vi.mock('@/shared/lib/schema', () => ({
  users: { id: 'id', marketingEmailOptIn: 'marketing_email_opt_in' },
  natalCharts: {},
  synastryResults: {},
  usageCounters: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
}));

vi.mock('@/shared/lib/rate-limit', () => ({
  getRateLimiter: mocks.getRateLimiter,
}));

vi.mock('@/shared/lib/stripe', () => ({
  getStripe: vi.fn(),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: vi.fn(),
  AnalyticsEvent: { ACCOUNT_DELETED: 'ACCOUNT_DELETED' },
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn().mockResolvedValue({ users: { deleteUser: vi.fn() } }),
}));

// ---------------------------------------------------------------------------
// Import handlers after mocks
// ---------------------------------------------------------------------------

import { PUT, GET } from '../route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/user/account', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PUT /api/v1/user/account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.updateSet.mockImplementation(() => ({ where: mocks.updateWhere }));
    mocks.update.mockImplementation(() => ({ set: mocks.updateSet }));
    mocks.getDb.mockReturnValue({ update: mocks.update, select: mocks.select });
    mocks.requireAuth.mockResolvedValue({ userId: 'user_test_1', email: 'test@example.com' });
  });

  it('returns 200 and updated=true when marketingEmailOptIn=false is sent', async () => {
    const req = makeRequest({ marketingEmailOptIn: false });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.updated).toBe(true);
    expect(mocks.update).toHaveBeenCalled();
  });

  it('returns 200 and updated=true when marketingEmailOptIn=true is sent', async () => {
    const req = makeRequest({ marketingEmailOptIn: true });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.updated).toBe(true);
  });

  it('returns 400 when body is invalid JSON shape', async () => {
    const req = makeRequest({ marketingEmailOptIn: 'not-a-boolean' });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when no updatable fields are provided', async () => {
    const req = makeRequest({});
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('NO_FIELDS_TO_UPDATE');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.requireAuth.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 }),
    );
    const req = makeRequest({ marketingEmailOptIn: true });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/user/account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectLimit.mockResolvedValue([{ marketingEmailOptIn: true }]);
    mocks.selectWhere.mockImplementation(() => ({ limit: mocks.selectLimit }));
    mocks.selectFrom.mockImplementation(() => ({ where: mocks.selectWhere }));
    mocks.select.mockImplementation(() => ({ from: mocks.selectFrom }));
    mocks.getDb.mockReturnValue({ update: mocks.update, select: mocks.select });
    mocks.requireAuth.mockResolvedValue({ userId: 'user_test_1', email: 'test@example.com' });
  });

  it('returns 200 with marketingEmailOptIn for authenticated user', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.marketingEmailOptIn).toBe('boolean');
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.requireAuth.mockRejectedValueOnce(
      new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 }),
    );
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
