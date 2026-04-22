import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/shared/lib/sentry-scrub';

Sentry.init({
  // Use private SENTRY_DSN on the server — falls back to the public var for
  // environments where only NEXT_PUBLIC_SENTRY_DSN is set.
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  environment: process.env.NODE_ENV,

  beforeSend: scrubSentryEvent,
});
