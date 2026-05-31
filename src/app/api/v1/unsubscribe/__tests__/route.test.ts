import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyMock = vi.fn();
const updateWhereMock = vi.fn();
const setMock = vi.fn(() => ({ where: updateWhereMock }));
const updateMock = vi.fn(() => ({ set: setMock }));

vi.mock('@/shared/lib/unsubscribe-token', () => ({
  verifyUnsubscribeToken: (t: string) => verifyMock(t),
}));
vi.mock('@/shared/lib/db', () => ({
  getDb: () => ({ update: updateMock }),
}));

import { POST, GET } from '../route';

function req(token?: string): Request {
  const url = token ? `http://localhost/api/v1/unsubscribe?token=${token}` : 'http://localhost/api/v1/unsubscribe';
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/v1/unsubscribe (RFC 8058 one-click)', () => {
  it('flips suppression for a valid lead token → 200', async () => {
    verifyMock.mockResolvedValue({ ok: true, kind: 'lead', id: 'lead_1' });
    const res = await POST(req('valid'));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateWhereMock).toHaveBeenCalledTimes(1);
  });

  it('flips opt-in for a valid user token → 200', async () => {
    verifyMock.mockResolvedValue({ ok: true, kind: 'user', id: 'user_1' });
    const res = await POST(req('valid'));
    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ marketingEmailOptIn: false });
  });

  it('returns 400 and writes nothing for an invalid token', async () => {
    verifyMock.mockResolvedValue({ ok: false, reason: 'invalid_signature' });
    const res = await POST(req('bad'));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when token is missing', async () => {
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('GET is 405 (prefetch must not false-unsubscribe)', () => {
    expect(GET().status).toBe(405);
  });
});
