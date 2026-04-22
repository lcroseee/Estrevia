import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/shared/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  environment: process.env.NODE_ENV,

  // Session replay: capture all replays only on errors, not on every session.
  // This keeps costs low on the free tier while preserving error context.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  beforeSend: scrubSentryEvent,
});
