import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  blobGet: vi.fn(),
  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
  selectFrom: vi.fn(),
  select: vi.fn(),
  getDb: vi.fn(),
}));

mocks.selectWhere.mockImplementation(() => ({ limit: mocks.selectLimit }));
mocks.selectFrom.mockImplementation(() => ({ where: mocks.selectWhere }));
mocks.select.mockImplementation(() => ({ from: mocks.selectFrom }));
mocks.getDb.mockReturnValue({ select: mocks.select });

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@vercel/blob', () => ({ get: mocks.blobGet }));
vi.mock('@/shared/lib/db', () => ({ getDb: mocks.getDb }));
vi.mock('@/shared/lib/schema', () => ({ avatars: { id: 'id' } }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn((c, v) => ({ c, v })) }));

import { GET } from '../route';

function ctx(id = 'av_1') {
  return { params: Promise.resolve({ id }) };
}

function streamOf(text: string) {
  return {
    statusCode: 200 as const,
    stream: new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); },
    }),
    headers: new Headers(),
    blob: { contentType: 'image/jpeg', size: text.length },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = 't';
  mocks.blobGet.mockResolvedValue(streamOf('bytes'));
});

describe('GET /api/v1/avatar/[id]/image', () => {
  it('serves the owner their own private portrait', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.selectLimit.mockResolvedValue([{ id: 'av_1', userId: 'user_1', blobPathname: 'p', isShared: false }]);

    const res = await GET(new Request('http://localhost/api/v1/avatar/av_1/image'), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(mocks.blobGet.mock.calls[0][1].access).toBe('private');
  });

  it('404s a non-owner when the portrait is not shared', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_2' });
    mocks.selectLimit.mockResolvedValue([{ id: 'av_1', userId: 'user_1', blobPathname: 'p', isShared: false }]);

    const res = await GET(new Request('http://localhost/api/v1/avatar/av_1/image'), ctx());
    expect(res.status).toBe(404);
    expect(mocks.blobGet).not.toHaveBeenCalled();
  });

  it('404s rather than 403 so existence is not disclosed', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_2' });
    mocks.selectLimit.mockResolvedValue([{ id: 'av_1', userId: 'user_1', blobPathname: 'p', isShared: false }]);
    const res = await GET(new Request('http://localhost/api/v1/avatar/av_1/image'), ctx());
    expect(res.status).not.toBe(403);
  });

  it('serves an anonymous visitor when the portrait IS shared', async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.selectLimit.mockResolvedValue([{ id: 'av_1', userId: 'user_1', blobPathname: 'p', isShared: true }]);

    const res = await GET(new Request('http://localhost/api/v1/avatar/av_1/image'), ctx());
    expect(res.status).toBe(200);
  });

  it('is private, no-store for an owner-only read', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.selectLimit.mockResolvedValue([{ id: 'av_1', userId: 'user_1', blobPathname: 'p', isShared: false }]);
    const res = await GET(new Request('http://localhost/api/v1/avatar/av_1/image'), ctx());
    expect(res.headers.get('cache-control')).toMatch(/private/);
  });

  it('404s an unknown id', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.selectLimit.mockResolvedValue([]);
    const res = await GET(new Request('http://localhost/api/v1/avatar/nope/image'), ctx('nope'));
    expect(res.status).toBe(404);
  });

  it('404s when the blob is gone', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.selectLimit.mockResolvedValue([{ id: 'av_1', userId: 'user_1', blobPathname: 'p', isShared: false }]);
    mocks.blobGet.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/v1/avatar/av_1/image'), ctx());
    expect(res.status).toBe(404);
  });
});
