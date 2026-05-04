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
    if (result.ok) expect(result.userId).toBe('user_abc');
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
});
