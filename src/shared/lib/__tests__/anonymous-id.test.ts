import { describe, it, expect, vi } from 'vitest';
import { ensureAnonymousIdCookie, ANONYMOUS_ID_COOKIE } from '../anonymous-id';

function fakeReq(existing?: string) {
  return {
    cookies: {
      get: (k: string) =>
        existing && k === ANONYMOUS_ID_COOKIE ? { value: existing } : undefined,
    },
  };
}

function fakeRes() {
  return { cookies: { set: vi.fn() } };
}

describe('ensureAnonymousIdCookie', () => {
  it('mints an httpOnly, lax, root-path anonymous_id cookie (a UUID) when none is present', () => {
    const res = fakeRes();
    ensureAnonymousIdCookie(fakeReq() as never, res as never);

    expect(res.cookies.set).toHaveBeenCalledTimes(1);
    const [name, value, opts] = res.cookies.set.mock.calls[0];
    expect(name).toBe('anonymous_id');
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    expect(opts.maxAge).toBeGreaterThan(0);
  });

  it('does NOT set the cookie when one already exists (stable id across requests)', () => {
    const res = fakeRes();
    ensureAnonymousIdCookie(fakeReq('existing-uuid') as never, res as never);
    expect(res.cookies.set).not.toHaveBeenCalled();
  });

  it('returns the same response object for chaining', () => {
    const res = fakeRes();
    expect(ensureAnonymousIdCookie(fakeReq() as never, res as never)).toBe(res as never);
  });
});
