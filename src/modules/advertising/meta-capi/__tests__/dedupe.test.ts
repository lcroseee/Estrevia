import { describe, it, expect } from 'vitest';
import { generateEventId, minuteBucket } from '../dedupe';

describe('generateEventId', () => {
  it('produces deterministic ids for the same (distinctId, event, minute)', () => {
    const id1 = generateEventId('user_123', 'Lead', 1714867230);  // sec 30 of minute X
    const id2 = generateEventId('user_123', 'Lead', 1714867259);  // sec 59 of same minute X
    expect(id1).toBe(id2);
  });

  it('produces different ids for the same user + event in different minutes', () => {
    const id1 = generateEventId('user_123', 'Lead', 1714867230);
    const id2 = generateEventId('user_123', 'Lead', 1714867295);  // next minute
    expect(id1).not.toBe(id2);
  });

  it('produces different ids for different users', () => {
    const id1 = generateEventId('user_123', 'Lead', 1714867200);
    const id2 = generateEventId('user_456', 'Lead', 1714867200);
    expect(id1).not.toBe(id2);
  });

  it('produces different ids for different events', () => {
    const id1 = generateEventId('user_123', 'Lead', 1714867200);
    const id2 = generateEventId('user_123', 'Subscribe', 1714867200);
    expect(id1).not.toBe(id2);
  });

  it('returns a hex string (deterministic format)', () => {
    const id = generateEventId('u', 'Lead', 0);
    expect(id).toMatch(/^[a-f0-9]+$/);
    expect(id.length).toBeGreaterThan(20);
  });
});

describe('minuteBucket', () => {
  it('rounds Unix seconds down to the minute boundary', () => {
    expect(minuteBucket(1714867230)).toBe(28581120);  // 1714867230 / 60 floor
    expect(minuteBucket(1714867259)).toBe(28581120);
    expect(minuteBucket(1714867260)).toBe(28581121);
  });
});
