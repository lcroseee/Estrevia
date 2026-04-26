import { NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Routes that require authentication — all others are public by default.
// Include-based list: only these paths trigger the auth check inside the handler.
// NOTE: cron routes are intentionally absent — they validate CRON_SECRET themselves.
const isProtectedRoute = createRouteMatcher([
  '/charts(.*)',
  '/settings(.*)',
  '/api/v1/chart/save(.*)',
  '/api/v1/chart/list(.*)',
  // Match UUIDs/nanoids only — exclude named sub-routes like /calculate
  '/api/v1/chart/:id([a-zA-Z0-9_-]{10,})',
  '/api/v1/stripe(.*)',
  '/api/v1/user(.*)',
  // Synastry write endpoints only — the GET /:id route is intentionally public
  // (share-link UX, returns no PII). The broad '(.*)' was blocking anonymous reads.
  '/api/v1/synastry/calculate(.*)',
  '/api/v1/synastry/:id([a-zA-Z0-9_-]+)/analyze(.*)',
  '/api/v1/avatar(.*)',
  '/api/v1/push(.*)',
  '/api/v1/tarot(.*)',
  '/api/v1/support(.*)',
  // Admin — all routes require Clerk auth (allowlist check happens inside handlers)
  '/admin(.*)',
  '/api/admin(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isProtectedRoute(req)) return;

  const { userId } = await auth();
  if (userId) return; // authenticated — pass through

  // Unauthenticated on a protected route: API routes get JSON 401, pages get redirect.
  // Clerk v6 auth.protect() uses a rewrite-to-/_not-found pattern that returns 200
  // with HTML for POST requests — clients cannot detect this as a 401. We short-circuit
  // that behavior here with explicit responses.
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, data: null, error: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  // Page route: redirect to sign-in preserving the return path.
  const signInUrl = new URL('/sign-in', req.url);
  signInUrl.searchParams.set('redirect_url', req.url);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  // Include-based matcher: only run Clerk middleware on routes that need auth.
  // Public routes (/, /s/[id], /essays/*, /signs/*, /pricing, etc.) are excluded
  // to avoid the Clerk cold-start cost on the viral-share critical path.
  //
  // IMPORTANT: every path listed in createRouteMatcher above must also appear here.
  // config.matcher controls WHETHER middleware runs; createRouteMatcher controls
  // WHETHER the auth check fires. Both must be kept in sync.
  matcher: [
    // Admin pages and API routes — Clerk auth required; allowlist checked inside handlers
    '/admin/:path*',
    '/api/admin/:path*',
    // Protected app pages
    '/charts/:path*',
    '/settings/:path*',
    // Auth-required API routes
    '/api/v1/chart/save',
    '/api/v1/chart/list',
    '/api/v1/chart/:id',
    '/api/v1/stripe/:path*',
    '/api/v1/user/:path*',
    '/api/v1/synastry/:path*',
    '/api/v1/avatar/:path*',
    '/api/v1/push/:path*',
    // /daily was missing — replaced single-path entry with wildcard covering both
    // /api/v1/tarot/daily and /api/v1/tarot/interpret
    '/api/v1/tarot/:path*',
    '/api/v1/support/:path*',
    // Hours and moon/calendar call auth() internally for Pro-gating but must remain
    // anonymous-accessible for the free path. Middleware must run so Clerk can
    // populate the auth context; without this entry auth() throws "clerkMiddleware()
    // was called but can't detect usage of clerkMiddleware()" → 500.
    // These paths are NOT in createRouteMatcher — unauthenticated requests pass through.
    '/api/v1/hours',
    '/api/v1/moon/calendar/:path*',
    // Cron — needs to run but NOT via Clerk auth (uses CRON_SECRET instead).
    // Include here so Next.js middleware runs; the route itself validates CRON_SECRET.
    '/api/cron/:path*',
  ],
};
