import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getTicketMock, limitMock } = vi.hoisted(() => ({
  getTicketMock: vi.fn(),
  limitMock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/shared/lib/checkout-ticket', () => ({ getCheckoutTicket: getTicketMock }));
vi.mock('@/shared/lib/rate-limit', () => ({ getRateLimiter: () => ({ limit: limitMock }) }));

import { GET } from '../route';

function makeRequest(id: string | null): Request {
  const url = new URL('http://localhost/api/v1/checkout/session-status');
  if (id) url.searchParams.set('id', id);
  return new Request(url.toString(), { method: 'GET', headers: { 'x-forwarded-for': '1.2.3.4' } });
}

beforeEach(() => {
  vi.clearAllMocks();
  limitMock.mockResolvedValue({ success: true });
});

describe('GET /api/v1/checkout/session-status', () => {
  it('returns ready=true with ticket when Redis has it', async () => {
    getTicketMock.mockResolvedValue('ticket_abc');
    const res = await GET(makeRequest('cs_test_1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { ready: true, ticket: 'ticket_abc' },
      error: null,
    });
  });

  it('returns ready=false when ticket not yet present', async () => {
    getTicketMock.mockResolvedValue(null);
    const res = await GET(makeRequest('cs_test_1'));
    expect((await res.json()).data).toEqual({ ready: false });
  });

  it('returns 400 when id missing', async () => {
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate-limited', async () => {
    limitMock.mockResolvedValueOnce({ success: false });
    const res = await GET(makeRequest('cs_test_1'));
    expect(res.status).toBe(429);
  });
});
