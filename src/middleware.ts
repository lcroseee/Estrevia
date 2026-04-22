import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Routes that require authentication — all others are public by default.
// clerkMiddleware (Core 3) is async and uses auth.protect() for redirects.
const isProtectedRoute = createRouteMatcher([
  '/charts(.*)',
  '/settings(.*)',
  '/api/v1/chart/save(.*)',
  '/api/v1/chart/list(.*)',
  // Match UUIDs/nanoids only — exclude named sub-routes like /calculate
  '/api/v1/chart/:id([a-zA-Z0-9_-]{10,})',
  '/api/v1/stripe(.*)',
  '/api/v1/user(.*)',
  '/api/v1/synastry(.*)',
  '/api/v1/avatar(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  // Include-based matcher: only run Clerk middleware on routes that need auth.
  // Public routes (/, /s/[id], /essays/*, /signs/*, /pricing, etc.) are excluded
  // to avoid the Clerk cold-start cost on the viral-share critical path.
  matcher: [
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
    '/api/v1/tarot/interpret',
    '/api/v1/support/:path*',
    // Cron — needs to run but NOT via Clerk auth (uses CRON_SECRET instead).
    // Include here so Next.js middleware runs; the route itself validates CRON_SECRET.
    '/api/cron/:path*',
  ],
};
