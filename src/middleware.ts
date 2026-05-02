import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

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

/**
 * Redirects any *.vercel.app deployment URL to the canonical estrevia.app domain.
 * Gated on VERCEL_ENV==='production' so preview deploys remain accessible on their
 * vercel.app URL (preview deploys also have NODE_ENV=production — use VERCEL_ENV).
 */
function redirectVercelHostToCanonical(req: NextRequest): NextResponse | null {
  const host = req.headers.get('host') ?? '';
  if (host.endsWith('.vercel.app') && process.env.VERCEL_ENV === 'production') {
    const url = new URL(req.url);
    url.host = 'estrevia.app';
    url.protocol = 'https:';
    return NextResponse.redirect(url, 301);
  }
  return null;
}

export default clerkMiddleware(async (auth, req) => {
  // 1) Canonical-host redirect first — short-circuits before i18n/auth.
  const hostRedirect = redirectVercelHostToCanonical(req);
  if (hostRedirect) return hostRedirect;

  // 2) Auth gate for protected routes (preserves existing behaviour verbatim).
  //    Calling auth() inside the wrapper avoids the Clerk v6 auth.protect() rewrite
  //    pattern that returns 200 HTML for POST requests (clients cannot detect 401).
  if (isProtectedRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
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
    }
  }

  // 3) Run intl middleware on page routes — handles rewrite/redirect for /es.
  //    Skip API routes (no locale segment for API paths).
  if (req.nextUrl.pathname.startsWith('/api/')) return;
  return intlMiddleware(req);
});

export const config = {
  // Include-based matcher: controls WHETHER middleware runs on a given path.
  // Two layers:
  //   • Page routes — let intl middleware handle locale resolution.
  //     Excludes _next, _vercel, public static files, and API routes
  //     (API routes have their own auth-only matchers below).
  //   • Auth-required API routes — preserved verbatim from previous middleware.
  //     config.matcher and createRouteMatcher above must stay in sync:
  //     every path in createRouteMatcher must also be matched here.
  matcher: [
    // Page routes — intl + optional Clerk auth
    // Excludes: _next internals, _vercel, static files (any path with extension), api paths
    '/((?!_next|_vercel|api|.*\\..*).*)',
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
