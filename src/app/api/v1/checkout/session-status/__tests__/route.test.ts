import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionsRetrieveMock = vi.fn();
const limitMock = vi.fn().mockResolvedValue({ success: true });

vi.mock('@/shared/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve: sessionsRetrieveMock } } }),
}));
vi.mock('@/shared/lib/rate-limit', () => ({
  getRateLimiter: () => ({ limit: limitMock }),
}));

import { GET } from '../route';

function makeRequest(id: string | null): Request {
  const url = new URL('http://localhost/api/v1/checkout/session-status');
  if (id) url.searchParams.set('id', id);
  return new Request(url.toString(), { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/checkout/session-status', () => {
  it('returns ready=true with ticket when metadata has signInTicket', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: { signInTicket: 'ticket_abc', anonymous_id: 'xyz' },
    });

    const res = await GET(makeRequest('cs_test_1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, data: { ready: true, ticket: 'ticket_abc' }, error: null });
  });

  it('returns ready=false when ticket not yet present', async () => {
    sessionsRetrieveMock.mockResolvedValue({
      id: 'cs_test_1',
      metadata: { anonymous_id: 'xyz' },
    });

    const res = await GET(makeRequest('cs_test_1'));
    const json = await res.json();
    expect(json.data).toEqual({ ready: false });
  });

  it('returns 400 when id missing', async () => {
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it('returns 404 when Stripe session not found', async () => {
    sessionsRetrieveMock.mockRejectedValue({ type: 'StripeInvalidRequestError', code: 'resource_missing' });

    const res = await GET(makeRequest('cs_nonexistent'));
    expect(res.status).toBe(404);
  });
});
