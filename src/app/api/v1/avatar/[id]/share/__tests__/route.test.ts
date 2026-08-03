import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  updateWhere: vi.fn(),
  updateSet: vi.fn(),
  update: vi.fn(),
  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
  selectFrom: vi.fn(),
  select: vi.fn(),
  getDb: vi.fn(),
}));

mocks.updateWhere.mockResolvedValue(undefined);
mocks.updateSet.mockImplementation(() => ({ where: mocks.updateWhere }));
mocks.update.mockImplementation(() => ({ set: mocks.updateSet }));
mocks.selectWhere.mockImplementation(() => ({ limit: mocks.selectLimit }));
mocks.selectFrom.mockImplementation(() => ({ where: mocks.selectWhere }));
mocks.select.mockImplementation(() => ({ from: mocks.selectFrom }));
mocks.getDb.mockReturnValue({ update: mocks.update, select: mocks.select });

vi.mock('@/modules/auth/lib/helpers', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/shared/lib/db', () => ({ getDb: mocks.getDb }));
vi.mock('@/shared/lib/schema', () => ({ avatars: { id: 'id', userId: 'user_id', isShared: 'is_shared' } }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn((c, v) => ({ c, v })) }));
vi.mock('@/shared/lib/analytics', () => ({
  trackServerEvent: vi.fn(), AnalyticsEvent: { AVATAR_PORTRAIT_SHARED: 'avatar_portrait_shared' },
}));

import { PATCH } from '../route';

function req(body: unknown) {
  return new Request('http://localhost/api/v1/avatar/av_1/share', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: 'av_1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  // Real `requireAuth()` (src/modules/auth/lib/helpers.ts) resolves an
  // `AuthUser` shaped `{ userId, email }` — every other route in the repo
  // destructures `.userId`. The brief's mock returned `{ id }`, which does
  // not model that API; fixed here rather than reshaping the route to read
  // a `.id` field that production `requireAuth()` never produces.
  mocks.requireAuth.mockResolvedValue({ userId: 'user_1' });
  mocks.selectLimit.mockResolvedValue([{ id: 'av_1', userId: 'user_1', isShared: false }]);
  mocks.updateWhere.mockResolvedValue(undefined);
});

describe('PATCH /api/v1/avatar/[id]/share', () => {
  it('lets the owner share', async () => {
    const res = await PATCH(req({ isShared: true }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ isShared: true }));
  });

  it('lets the owner unshare', async () => {
    const res = await PATCH(req({ isShared: false }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ isShared: false }));
  });

  it('404s a non-owner and writes nothing', async () => {
    mocks.requireAuth.mockResolvedValue({ userId: 'user_2' });
    const res = await PATCH(req({ isShared: true }), ctx);
    expect(res.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('400s a malformed body', async () => {
    const res = await PATCH(req({ isShared: 'yes' }), ctx);
    expect(res.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
