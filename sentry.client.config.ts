import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,

  // Session replay: capture all replays only on errors, not on every session.
  // This keeps costs low on the free tier while preserving error context.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
});
