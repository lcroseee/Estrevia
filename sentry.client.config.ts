import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/shared/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  environment: process.env.NODE_ENV,

  // Session replay: disabled — replayIntegration() not added, so these options
  // have no effect and are removed to allow the Replay bundle to be tree-shaken.
  // Re-enable by adding replayIntegration() to `integrations` and restoring
  // replaysOnErrorSampleRate: 1.0 (errors only, free-tier safe).

  beforeSend: scrubSentryEvent,
});
