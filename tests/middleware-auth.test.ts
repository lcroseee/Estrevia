/**
 * Regression guard: Clerk v6 auth.protect() rewrite bug.
 *
 * Problem: Clerk v6 middleware's auth.protect() rewrites unauthenticated API
 * requests to /_not-found, returning HTTP 200 with Content-Type: text/html.
 * Clients that expect JSON see "Network error" instead of a 401.
 *
 * Fix: middleware short-circuits auth.protect() and returns an explicit
 * NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) for /api/ paths.
 *
 * These tests guard against two regressions:
 *   1. config.matcher gaps — middleware not running at all for a protected path.
 *   2. Behavioral regression — handler no longer returning JSON 401.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Part 1: config.matcher coverage
// ---------------------------------------------------------------------------
// Import only config (no Clerk runtime needed — it's a plain object).
import { config } from '@/middleware';

describe('middleware config.matcher — regression guards', () => {
  const matchers = config.matcher as readonly string[];

  /**
   * Convert a Next.js middleware matcher pattern to a RegExp.
   * Handles:
   *   :path*   → .* (zero-or-more path segments)
   *   :path+   → .+ (one-or-more)
   *   :param   → [^/]+ (single segment, no slash)
   *   Literal  → exact match
   */
  const covered = (path: string): boolean =>
    matchers.some((m) => {
      const pattern = m
        .replace(/:\w+\*/g, '.*')
        .replace(/:\w+\+/g, '.+')
        .replace(/:\w+/g, '[^/]+');
      return new RegExp(`^${pattern}$`).test(path);
    });

  // Tarot routes — the trigger for the original bug report.
  // /daily was previously missing from the matcher, causing Clerk auth() to
  // throw inside an unmatched route and surface as a 500.
  it('covers /api/v1/tarot/daily (regression: Clerk auth() errors when matcher misses)', () => {
    expect(covered('/api/v1/tarot/daily')).toBe(true);
  });

  it('covers /api/v1/tarot/interpret', () => {
    expect(covered('/api/v1/tarot/interpret')).toBe(true);
  });

  // Payment and user account routes must always be protected.
  it.each([
    '/api/v1/stripe/checkout',
    '/api/v1/stripe/portal',
    '/api/v1/user/subscription',
    '/api/v1/user/account',
    '/api/v1/chart/save',
    '/api/v1/synastry/calculate',
    '/api/v1/avatar/generate',
  ])('covers protected path %s', (p) => {
    expect(covered(p)).toBe(true);
  });

  // The viral-share and OG paths must not be in the matcher — Clerk cold-start
  // on those routes would hurt the public share loop.
  it.each([
    '/s/abc123',
    '/api/og/passport/abc123',
  ])('does not unnecessarily cover public path %s', (p) => {
    // These paths being in the matcher is not a hard error, but it wastes
    // Clerk cold-start budget on the viral-share critical path.
    expect(covered(p)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Part 2: behavioral test — unauthenticated API request returns JSON 401
// ---------------------------------------------------------------------------
// We mock @clerk/nextjs/server so the test has no Clerk runtime dependency.

vi.mock('@clerk/nextjs/server', () => {
  /**
   * createRouteMatcher returns a function that checks whether a request URL
   * matches any of the supplied patterns. We replicate the real behaviour with
   * a minimal implementation so isProtectedRoute() works correctly inside the
   * middleware handler under test.
   */
  const createRouteMatcher = (patterns: string[]) => {
    return (req: { nextUrl: { pathname: string } }) => {
      return patterns.some((p) => {
        const re = new RegExp(
          '^' +
            p
              .replace(/:\w+\*/g, '.*')
              .replace(/:\w+\+/g, '.+')
              // Custom segment pattern — e.g. :id([a-zA-Z0-9_-]{10,})
              .replace(/:\w+\([^)]+\)/g, '[^/]+')
              .replace(/:\w+/g, '[^/]+') +
            '$',
        );
        return re.test(req.nextUrl.pathname);
      });
    };
  };

  /**
   * clerkMiddleware(handler) — higher-order wrapper.
   * In tests we call the returned function directly with (auth, req).
   * We expose it as a transparent pass-through so our middleware handler runs.
   */
  const clerkMiddleware = (
    handler: (
      auth: () => Promise<{ userId: string | null }>,
      req: unknown,
    ) => unknown,
  ) => {
    // Return a callable that mimics the real clerkMiddleware signature.
    // The outer function is the Next.js middleware entry point; it receives
    // (req, event). We ignore event in tests.
    return async (req: unknown, _event?: unknown) => {
      // auth() — returns unauthenticated by default; tests override via vi.fn.
      const auth = () => Promise.resolve({ userId: null as string | null });
      return handler(auth, req);
    };
  };

  return { clerkMiddleware, createRouteMatcher };
});

// Import after mock registration.
// Use dynamic import so vi.mock hoisting takes effect before the module loads.
const getMiddleware = () => import('@/middleware').then((m) => m.default);

describe('middleware behavior — unauthenticated API request', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns JSON 401 with { error: "UNAUTHORIZED" } for unauthenticated POST /api/v1/stripe/checkout', async () => {
    // Re-import after resetModules so the mock is applied cleanly.
    const { default: middleware } = await import('@/middleware');

    // Build a minimal NextRequest-like object.
    const url = 'http://localhost:3000/api/v1/stripe/checkout';
    const req = new Request(url, { method: 'POST' });
    // Attach nextUrl as the middleware reads req.nextUrl.pathname
    Object.defineProperty(req, 'nextUrl', {
      value: new URL(url),
      writable: false,
    });

    const response = await (middleware as (req: unknown) => Promise<Response>)(req);

    // Must not be a Clerk rewrite-to-/_not-found (which returns 200 + HTML).
    expect(response).toBeDefined();
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toMatch(/application\/json/);

    const body = await response.json();
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('passes through an authenticated request without returning a response', async () => {
    // Override the Clerk auth mock to return a real userId for this test.
    vi.doMock('@clerk/nextjs/server', () => {
      const createRouteMatcher = (patterns: string[]) => {
        return (req: { nextUrl: { pathname: string } }) => {
          return patterns.some((p) => {
            const re = new RegExp(
              '^' +
                p
                  .replace(/:\w+\*/g, '.*')
                  .replace(/:\w+\+/g, '.+')
                  .replace(/:\w+\([^)]+\)/g, '[^/]+')
                  .replace(/:\w+/g, '[^/]+') +
                '$',
            );
            return re.test(req.nextUrl.pathname);
          });
        };
      };

      const clerkMiddleware = (
        handler: (
          auth: () => Promise<{ userId: string | null }>,
          req: unknown,
        ) => unknown,
      ) => {
        return async (req: unknown, _event?: unknown) => {
          // Authenticated user
          const auth = () => Promise.resolve({ userId: 'user_test123' });
          return handler(auth, req);
        };
      };

      return { clerkMiddleware, createRouteMatcher };
    });

    const { default: middleware } = await import('@/middleware');

    const url = 'http://localhost:3000/api/v1/stripe/checkout';
    const req = new Request(url, { method: 'POST' });
    Object.defineProperty(req, 'nextUrl', {
      value: new URL(url),
      writable: false,
    });

    const response = await (middleware as (req: unknown) => Promise<Response | undefined>)(req);

    // Authenticated requests return undefined (pass-through) from the handler.
    expect(response).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Part 3: lastSeenAt update (T4 — email-retention)
// ---------------------------------------------------------------------------
// These tests verify that the throttled lastSeenAt update fires for authed
// requests and never blocks the response on DB errors.
//
// Strategy: mock the dynamic imports inside updateLastSeenIfNeeded so we can
// spy on db.update calls without touching the actual DB.

describe('middleware — lastSeenAt update (T4)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // Test 1: authenticated request → db.update called with lastSeenAt
  // -------------------------------------------------------------------------
  it('calls db.update with lastSeenAt for an authenticated request', async () => {
    const updateSetWhereMock = vi.fn().mockResolvedValue(undefined);
    const updateSetMock = vi.fn().mockReturnValue({ where: updateSetWhereMock });
    const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

    vi.doMock('@/shared/lib/db', () => ({
      getDb: () => ({ update: updateMock }),
    }));
    vi.doMock('@/shared/lib/schema', () => ({
      users: { id: 'id', lastSeenAt: 'last_seen_at' },
    }));
    vi.doMock('drizzle-orm', () => ({
      eq: vi.fn((col: unknown, val: unknown) => ({ col, val, op: 'eq' })),
      and: vi.fn((...args: unknown[]) => ({ args, op: 'and' })),
      or: vi.fn((...args: unknown[]) => ({ args, op: 'or' })),
      isNull: vi.fn((col: unknown) => ({ col, op: 'isNull' })),
      lt: vi.fn((col: unknown, val: unknown) => ({ col, val, op: 'lt' })),
    }));

    // Auth mock: returns authenticated user for this test
    vi.doMock('@clerk/nextjs/server', () => {
      const createRouteMatcher = (patterns: string[]) =>
        (req: { nextUrl: { pathname: string } }) =>
          patterns.some((p) =>
            new RegExp(
              '^' +
                p
                  .replace(/:\w+\*/g, '.*')
                  .replace(/:\w+\+/g, '.+')
                  .replace(/:\w+\([^)]+\)/g, '[^/]+')
                  .replace(/:\w+/g, '[^/]+') +
                '$',
            ).test(req.nextUrl.pathname),
          );

      const clerkMiddleware = (
        handler: (
          auth: () => Promise<{ userId: string | null }>,
          req: unknown,
        ) => unknown,
      ) => async (req: unknown) => {
        const auth = () => Promise.resolve({ userId: 'user_lastseen_test' });
        return handler(auth, req);
      };

      return { clerkMiddleware, createRouteMatcher };
    });

    const { default: middleware } = await import('@/middleware');

    const url = 'http://localhost:3000/api/v1/stripe/checkout';
    const req = new Request(url, { method: 'GET' });
    Object.defineProperty(req, 'nextUrl', { value: new URL(url), writable: false });

    await (middleware as (req: unknown) => Promise<Response | undefined>)(req);

    // Fire-and-forget — give the promise a microtask tick to run
    await new Promise((r) => setTimeout(r, 10));

    expect(updateMock).toHaveBeenCalled();
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ lastSeenAt: expect.any(Date) }),
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: the WHERE clause ensures stale check (0 rows when fresh = correct)
  //   We only verify that the WHERE is constructed — no error expected
  // -------------------------------------------------------------------------
  it('constructs WHERE with isNull OR lt cutoff (throttle logic)', async () => {
    const updateSetWhereMock = vi.fn().mockResolvedValue(undefined);
    const updateSetMock = vi.fn().mockReturnValue({ where: updateSetWhereMock });
    const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

    const andMock = vi.fn((...args: unknown[]) => ({ args, op: 'and' }));
    const orMock = vi.fn((...args: unknown[]) => ({ args, op: 'or' }));
    const isNullMock = vi.fn((col: unknown) => ({ col, op: 'isNull' }));
    const ltMock = vi.fn((col: unknown, val: unknown) => ({ col, val, op: 'lt' }));

    vi.doMock('@/shared/lib/db', () => ({
      getDb: () => ({ update: updateMock }),
    }));
    vi.doMock('@/shared/lib/schema', () => ({
      users: { id: 'id', lastSeenAt: 'last_seen_at' },
    }));
    vi.doMock('drizzle-orm', () => ({
      eq: vi.fn((col: unknown, val: unknown) => ({ col, val, op: 'eq' })),
      and: andMock,
      or: orMock,
      isNull: isNullMock,
      lt: ltMock,
    }));

    vi.doMock('@clerk/nextjs/server', () => {
      const createRouteMatcher = (patterns: string[]) =>
        (req: { nextUrl: { pathname: string } }) =>
          patterns.some((p) =>
            new RegExp(
              '^' +
                p
                  .replace(/:\w+\*/g, '.*')
                  .replace(/:\w+\+/g, '.+')
                  .replace(/:\w+\([^)]+\)/g, '[^/]+')
                  .replace(/:\w+/g, '[^/]+') +
                '$',
            ).test(req.nextUrl.pathname),
          );
      const clerkMiddleware = (
        handler: (auth: () => Promise<{ userId: string | null }>, req: unknown) => unknown,
      ) => async (req: unknown) => {
        const auth = () => Promise.resolve({ userId: 'user_throttle_test' });
        return handler(auth, req);
      };
      return { clerkMiddleware, createRouteMatcher };
    });

    const { default: middleware } = await import('@/middleware');

    const url = 'http://localhost:3000/api/v1/stripe/portal';
    const req = new Request(url, { method: 'GET' });
    Object.defineProperty(req, 'nextUrl', { value: new URL(url), writable: false });

    await (middleware as (req: unknown) => Promise<Response | undefined>)(req);
    await new Promise((r) => setTimeout(r, 10));

    // The OR clause must be constructed with isNull + lt
    expect(isNullMock).toHaveBeenCalled();
    expect(ltMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Date),
    );
    expect(orMock).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 3: DB error in updateLastSeenIfNeeded MUST NOT block the response
  // -------------------------------------------------------------------------
  it('does not block or error the request when db.update throws', async () => {
    vi.doMock('@/shared/lib/db', () => ({
      getDb: () => ({
        update: vi.fn(() => {
          throw new Error('DB connection refused');
        }),
      }),
    }));
    vi.doMock('@/shared/lib/schema', () => ({
      users: { id: 'id', lastSeenAt: 'last_seen_at' },
    }));
    vi.doMock('drizzle-orm', () => ({
      eq: vi.fn(),
      and: vi.fn(),
      or: vi.fn(),
      isNull: vi.fn(),
      lt: vi.fn(),
    }));

    vi.doMock('@clerk/nextjs/server', () => {
      const createRouteMatcher = (patterns: string[]) =>
        (req: { nextUrl: { pathname: string } }) =>
          patterns.some((p) =>
            new RegExp(
              '^' +
                p
                  .replace(/:\w+\*/g, '.*')
                  .replace(/:\w+\+/g, '.+')
                  .replace(/:\w+\([^)]+\)/g, '[^/]+')
                  .replace(/:\w+/g, '[^/]+') +
                '$',
            ).test(req.nextUrl.pathname),
          );
      const clerkMiddleware = (
        handler: (auth: () => Promise<{ userId: string | null }>, req: unknown) => unknown,
      ) => async (req: unknown) => {
        const auth = () => Promise.resolve({ userId: 'user_dberror_test' });
        return handler(auth, req);
      };
      return { clerkMiddleware, createRouteMatcher };
    });

    const { default: middleware } = await import('@/middleware');

    const url = 'http://localhost:3000/api/v1/stripe/portal';
    const req = new Request(url, { method: 'GET' });
    Object.defineProperty(req, 'nextUrl', { value: new URL(url), writable: false });

    // Must not throw — DB error is swallowed inside updateLastSeenIfNeeded
    await expect(
      (middleware as (req: unknown) => Promise<Response | undefined>)(req),
    ).resolves.not.toThrow();

    // Give the fire-and-forget promise a tick to settle
    await new Promise((r) => setTimeout(r, 10));
    // If we reach here, the test passes (no unhandled rejection)
  });
});
