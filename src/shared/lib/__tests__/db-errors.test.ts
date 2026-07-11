import { describe, it, expect } from 'vitest';
import { isUniqueViolation } from '../db-errors';

describe('isUniqueViolation', () => {
  it('detects a direct code property', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });
  it('detects a nested cause.code (drizzle/neon wrapping)', () => {
    const err = new Error('duplicate key value violates unique constraint "users_email_unique"');
    (err as Error & { cause?: unknown }).cause = { code: '23505' };
    expect(isUniqueViolation(err)).toBe(true);
  });
  it('rejects other codes and non-objects', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});
