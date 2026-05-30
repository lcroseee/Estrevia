import { describe, it, expect } from 'vitest';
import { extractClerkUserId } from '../route';

describe('extractClerkUserId', () => {
  it('returns metadata.clerkUserId when present', () => {
    expect(
      extractClerkUserId({ metadata: { clerkUserId: 'user_abc' }, client_reference_id: 'anything' }),
    ).toBe('user_abc');
  });

  it('treats client_reference_id as a Clerk id only when it has the user_ prefix', () => {
    expect(extractClerkUserId({ metadata: {}, client_reference_id: 'user_xyz' })).toBe('user_xyz');
  });

  it('returns null for an anonymousId in client_reference_id (the bug)', () => {
    // anonymous checkouts set client_reference_id to a UUID anonymous_id
    expect(
      extractClerkUserId({
        metadata: { anonymous_id: 'a1b2' },
        client_reference_id: '7f3e9c2a-1b4d-4e5f-8a9b-0c1d2e3f4a5b',
      }),
    ).toBeNull();
  });

  it('returns null for null input', () => {
    expect(extractClerkUserId(null)).toBeNull();
  });
});
