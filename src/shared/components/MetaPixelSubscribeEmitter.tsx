'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const STORAGE_PREFIX = 'subscribe_fired:';

type FbqGlobal = (
  command: 'track',
  event: 'Subscribe',
  data: Record<string, unknown>,
  options: { eventID: string },
) => void;

/**
 * Fires a browser-side `fbq('track','Subscribe')` exactly once per
 * Stripe success-redirect, gated on `?session_id=cs_...` in the URL.
 *
 * eventID matches the server-side CAPI Subscribe event_id
 * (`${session.id}:subscription_started`) emitted from
 * /api/webhooks/stripe. Meta deduplicates the pair and uses the browser
 * cookies (fbp/fbc) to lift Match Quality Score for value-based bidding.
 *
 * No `value`/`currency`/`predicted_ltv` in the browser payload — CAPI
 * already carries those server-side, and Meta merges deduped events
 * keeping the richer payload.
 *
 * Idempotency: localStorage flag `subscribe_fired:${sessionId}`.
 *
 * Failures are silent (analytics, not a critical path).
 */
export function MetaPixelSubscribeEmitter(): null {
  const params = useSearchParams();
  const sessionId = params.get('session_id');

  useEffect(() => {
    if (!sessionId) return;
    if (typeof window === 'undefined') return;

    const fbq = (window as unknown as { fbq?: FbqGlobal }).fbq;
    if (typeof fbq !== 'function') return;

    try {
      const key = `${STORAGE_PREFIX}${sessionId}`;
      if (window.localStorage.getItem(key)) return;

      fbq('track', 'Subscribe', {}, { eventID: `${sessionId}:subscription_started` });
      window.localStorage.setItem(key, '1');
    } catch {
      // Silent fail.
    }
  }, [sessionId]);

  return null;
}
