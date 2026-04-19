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
]);

export const proxy = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
