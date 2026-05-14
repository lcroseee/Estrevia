import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendCapiEvent, hashPII, _resetClientForTests } from '../index';
import type { CapiEventPayload } from '../types';

const mockSendEvent = vi.fn().mockResolvedValue({ events_received: 1 });

vi.mock('../client', () => ({
  CapiClient: class {
    sendEvent = mockSendEvent;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEvent.mockResolvedValue({ events_received: 1 });
  process.env.META_PIXEL_ID = 'PIX_T';
  process.env.META_CAPI_TOKEN = 'TOK';
  _resetClientForTests();
});

describe('sendCapiEvent', () => {
  it('hashes email and external_id before passing to CapiClient', async () => {
    await sendCapiEvent('Lead', { email: 'Alice@Example.com', external_id_raw: 'user_42' });
    expect(mockSendEvent).toHaveBeenCalledOnce();
    const payload = mockSendEvent.mock.calls[0][0] as CapiEventPayload;
    expect(payload.event_name).toBe('Lead');
    expect(payload.user_data.em).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.user_data.external_id).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(payload)).not.toContain('alice@example.com');
    expect(JSON.stringify(payload)).not.toContain('user_42');
  });

  it('uses provided event_id (does not regenerate)', async () => {
    await sendCapiEvent(
      'Lead',
      { email: 'a@x.com' },
      undefined,
      { event_id: 'evt_provided' },
    );
    const payload = mockSendEvent.mock.calls[0][0] as CapiEventPayload;
    expect(payload.event_id).toBe('evt_provided');
  });

  it('passes custom_data through unchanged (Subscribe with value/currency/predicted_ltv)', async () => {
    await sendCapiEvent('Subscribe', { external_id_raw: 'u1' }, {
      value: 4.99, currency: 'USD', predicted_ltv: 30,
    });
    const payload = mockSendEvent.mock.calls[0][0] as CapiEventPayload;
    expect(payload.custom_data).toEqual({ value: 4.99, currency: 'USD', predicted_ltv: 30 });
  });

  it('swallows CAPI errors silently (logs + Sentry, does not throw to caller)', async () => {
    mockSendEvent.mockRejectedValueOnce(new Error('CAPI down'));
    await expect(sendCapiEvent('Lead', { email: 'a@x.com' })).resolves.toBeUndefined();
  });

  it('returns silently (no client call) when META_PIXEL_ID / META_CAPI_TOKEN are missing', async () => {
    delete process.env.META_PIXEL_ID;
    delete process.env.META_CAPI_TOKEN;
    _resetClientForTests();
    await sendCapiEvent('Lead', { email: 'a@x.com' });
    expect(mockSendEvent).not.toHaveBeenCalled();
  });

  it('passes fbc + fbp through to user_data verbatim (no hashing)', async () => {
    await sendCapiEvent('Lead', {
      email: 'alice@example.com',
      external_id_raw: 'user_42',
      fbc: 'fb.1.1714867200.AbCdEf123',
      fbp: 'fb.1.1714867200.987654321',
      client_ip_address: '203.0.113.42',
      client_user_agent: 'Mozilla/5.0 test-ua',
    });
    const payload = mockSendEvent.mock.calls[0][0] as CapiEventPayload;
    expect(payload.user_data.fbc).toBe('fb.1.1714867200.AbCdEf123');
    expect(payload.user_data.fbp).toBe('fb.1.1714867200.987654321');
    expect(payload.user_data.client_ip_address).toBe('203.0.113.42');
    expect(payload.user_data.client_user_agent).toBe('Mozilla/5.0 test-ua');
  });

  it('omits fbc/fbp from user_data when caller does not supply them (backward-compat)', async () => {
    await sendCapiEvent('Lead', { email: 'a@x.com' });
    const payload = mockSendEvent.mock.calls[0][0] as CapiEventPayload;
    expect(payload.user_data.fbc).toBeUndefined();
    expect(payload.user_data.fbp).toBeUndefined();
  });
});

describe('hashPII', () => {
  it('lowercases + trims + sha256s', () => {
    expect(hashPII('  Alice@Example.com  ')).toBe(hashPII('alice@example.com'));
    expect(hashPII('Alice@Example.com')).toMatch(/^[a-f0-9]{64}$/);
  });
});
