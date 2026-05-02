/**
 * Next.js instrumentation entrypoint.
 *
 * Required for `@sentry/nextjs` 8+ on App Router (Next.js 13.4+). Without
 * this file, the server-side and edge Sentry SDKs are not initialised on
 * function cold starts, so:
 *
 *   • `Sentry.captureException` calls from API routes silently drop on
 *     the first invocation (then partially register on later requests
 *     once the build-time instrumentation injection wakes up).
 *   • Unhandled errors in route handlers don't reach Sentry at all.
 *   • The trace-context propagation Sentry adds to outgoing responses can
 *     fall into a half-initialised state — we observed HTTP 500 responses
 *     with the application logger reporting status=200 (handler returned
 *     200, post-handler instrumentation crashed the response).
 *
 * `onRequestError` is the Next 15+ hook Sentry uses to capture errors that
 * surface during render/route handling. Re-exporting it wires the SDK to
 * the platform without us writing the bridge ourselves.
 *
 * Three sentry.{client,server,edge}.config.ts files at the repo root
 * already call Sentry.init with the correct DSN, release, and PII
 * scrubber — we just import them on the right runtime here.
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
