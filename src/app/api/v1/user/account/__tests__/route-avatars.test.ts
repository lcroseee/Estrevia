import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getRateLimiter: vi.fn(),
  batch: vi.fn(),
  del: vi.fn(),
  selectWhere: vi.fn(),
  selectFrom: vi.fn(),
  select: vi.fn(),
  getDb: vi.fn(),
  deleteFn: vi.fn(),
  stripeRetrieve: vi.fn(),
}));

// Each delete() returns a tagged marker so the batch array can be inspected.
mocks.deleteFn.mockImplementation((table: { __name?: string }) => ({
  where: () => ({ __table: table?.__name ?? 'unknown' }),
}));
mocks.selectWhere.mockImplementation(() => Promise.resolve([
  { blobPathname: 'avatars/user_1/a.jpg' },
  { blobPathname: 'avatars/user_1/b.jpg' },
]));
mocks.selectFrom.mockImplementation(() => ({ where: mocks.selectWhere }));
mocks.select.mockImplementation(() => ({ from: mocks.selectFrom }));
mocks.getDb.mockReturnValue({
  batch: mocks.batch,
  delete: mocks.deleteFn,
  select: mocks.select,
});

vi.mock('@/modules/auth/lib/helpers', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/shared/lib/rate-limit', () => ({ getRateLimiter: mocks.getRateLimiter }));
vi.mock('@/shared/lib/db', () => ({ getDb: mocks.getDb }));
vi.mock('@vercel/blob', () => ({ del: mocks.del }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn((c, v) => ({ c, v })) }));
vi.mock('@/shared/lib/schema', () => ({
  users: { __name: 'users', id: 'id' },
  natalCharts: { __name: 'natal_charts', userId: 'user_id' },
  synastryResults: { __name: 'synastry_results', userId: 'user_id' },
  usageCounters: { __name: 'usage_counters', userId: 'user_id' },
  avatars: { __name: 'avatars', userId: 'user_id', blobPathname: 'blob_pathname' },
}));
vi.mock('@/shared/lib/stripe', () => ({
  getStripe: vi.fn(() => ({
    subscriptions: { list: vi.fn().mockResolvedValue({ data: [] }), cancel: vi.fn() },
    customers: { del: vi.fn() },
  })),
}));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn().mockResolvedValue({ users: { deleteUser: vi.fn() } }),
}));
vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: vi.fn(),
  AnalyticsEvent: { ACCOUNT_DELETED: 'account_deleted' },
}));

import { DELETE } from '../route';

function makeRequest() {
  return new Request('http://localhost/api/v1/user/account', { method: 'DELETE' });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = 't';
  mocks.requireAuth.mockResolvedValue({ id: 'user_1' });
  mocks.getRateLimiter.mockReturnValue({ limit: vi.fn().mockResolvedValue({ success: true }) });
  mocks.batch.mockResolvedValue(undefined);
  mocks.del.mockResolvedValue(undefined);
  mocks.deleteFn.mockImplementation((table: { __name?: string }) => ({
    where: () => ({ __table: table?.__name ?? 'unknown' }),
  }));
  mocks.selectWhere.mockResolvedValue([
    { blobPathname: 'avatars/user_1/a.jpg' },
    { blobPathname: 'avatars/user_1/b.jpg' },
  ]);
});

describe('DELETE /api/v1/user/account — portraits', () => {
  it('includes avatars in the delete batch', async () => {
    await DELETE(makeRequest() as never);
    const batchArg = mocks.batch.mock.calls[0][0] as Array<{ __table: string }>;
    expect(batchArg.map((s) => s.__table)).toContain('avatars');
  });

  it('deletes avatars BEFORE users so the FK never blocks the purge', async () => {
    await DELETE(makeRequest() as never);
    const tables = (mocks.batch.mock.calls[0][0] as Array<{ __table: string }>).map((s) => s.__table);
    expect(tables.indexOf('avatars')).toBeGreaterThanOrEqual(0);
    expect(tables.indexOf('avatars')).toBeLessThan(tables.indexOf('users'));
  });

  it('removes the blobs so they do not outlive the account', async () => {
    await DELETE(makeRequest() as never);
    expect(mocks.del).toHaveBeenCalledTimes(1);
    const [paths, opts] = mocks.del.mock.calls[0];
    expect(paths).toEqual(['avatars/user_1/a.jpg', 'avatars/user_1/b.jpg']);
    expect(opts.token).toBe('t');
  });

  it('skips the blob call entirely when the user has no portraits', async () => {
    mocks.selectWhere.mockResolvedValue([]);
    await DELETE(makeRequest() as never);
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('still returns 200 when blob deletion fails — DB erasure is the primary contract', async () => {
    mocks.del.mockRejectedValue(new Error('blob store down'));
    const res = await DELETE(makeRequest() as never);
    expect(res.status).toBe(200);
  });

  it('does not delete blobs when the DB batch fails', async () => {
    mocks.batch.mockRejectedValue(new Error('db down'));
    const res = await DELETE(makeRequest() as never);
    expect(res.status).toBe(500);
    expect(mocks.del).not.toHaveBeenCalled();
  });
});
