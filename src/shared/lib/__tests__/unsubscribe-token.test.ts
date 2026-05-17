import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signUnsubscribeToken, verifyUnsubscribeToken } from '../unsubscribe-token';

beforeEach(() => {
  vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', 'test-secret-32-chars-minimum-aaaa');
});

describe('unsubscribe-token', () => {
  it('signs and verifies a valid token', async () => {
    const token = await signUnsubscribeToken('user_abc');
    const result = await verifyUnsubscribeToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe('user');
      expect(result.id).toBe('user_abc');
    }
  });
  it('rejects bad signature', async () => {
    const token = await signUnsubscribeToken('user_abc');
    const tampered = token.slice(0, -2) + 'XX';
    const result = await verifyUnsubscribeToken(tampered);
    expect(result.ok).toBe(false);
  });
  it('rejects expired token', async () => {
    const token = await signUnsubscribeToken('user_abc', -1000);
    const result = await verifyUnsubscribeToken(token);
    expect(result.ok).toBe(false);
  });
  it('rejects malformed token', async () => {
    const result = await verifyUnsubscribeToken('not-a-token');
    expect(result.ok).toBe(false);
  });

  it('signs and verifies a lead token', async () => {
    const { signLeadUnsubscribeToken } = await import('../unsubscribe-token');
    const token = await signLeadUnsubscribeToken('lead_abc');
    const result = await verifyUnsubscribeToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe('lead');
      expect(result.id).toBe('lead_abc');
    }
  });

  it('verifies a user token with kind=user', async () => {
    const token = await signUnsubscribeToken('user_abc');
    const result = await verifyUnsubscribeToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe('user');
      expect(result.id).toBe('user_abc');
    }
  });

  it('cross-kind tokens both verify (kind is informational, not access control)', async () => {
    // Cross-kind separation is enforced by the caller (e.g. unsubscribe page
    // routes based on `result.kind`). The token itself just attests identity.
    const { signLeadUnsubscribeToken } = await import('../unsubscribe-token');
    const leadToken = await signLeadUnsubscribeToken('lead_x');
    const r = await verifyUnsubscribeToken(leadToken);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kind).toBe('lead');
  });
});
