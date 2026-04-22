'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * Global error boundary — catches errors in the root layout and the top of the
 * React server component tree. Must render its own <html>/<body> tags because
 * the root layout is unavailable when this component mounts.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error#global-errorjs
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          role="alert"
          style={{
            padding: '4rem 2rem',
            fontFamily: 'system-ui, sans-serif',
            background: '#0A0A0F',
            color: '#ffffff',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.5rem',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
            An error occurred. Our team has been notified.
            {error.digest ? ` (${error.digest})` : ''}
          </p>
          <button
            onClick={reset}
            style={{
              padding: '0.625rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#0A0A0F',
              background: '#C8A84B',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
