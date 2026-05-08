'use client';

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

const FRESH_SIGNUP_WINDOW_MS = 10 * 60 * 1000;
const STORAGE_PREFIX = 'lead_fired:';

type FbqGlobal = (
  command: 'track',
  event: 'Lead',
  data: Record<string, unknown>,
  options: { eventID: string },
) => void;

/**
 * Fires a browser-side `fbq('track','Lead')` exactly once per fresh Clerk
 * sign-up, with `eventID` matching the server-side CAPI Lead event_id
 * (`${userId}:user_registered`) emitted from /api/webhooks/clerk. Meta
 * deduplicates the pair and lifts Match Quality Score.
 *
 * Idempotency: localStorage flag `lead_fired:${userId}` plus a 10-minute
 * `user.createdAt` freshness window (defense-in-depth — flag wipes won't
 * cause re-fires for old users).
 *
 * Failures are silent (analytics, not a critical path).
 */
export function MetaPixelLeadEmitter(): null {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    if (typeof window === 'undefined') return;

    const fbq = (window as unknown as { fbq?: FbqGlobal }).fbq;
    if (typeof fbq !== 'function') return;

    try {
      const ageMs = Date.now() - new Date(user.createdAt).getTime();
      if (!Number.isFinite(ageMs) || ageMs > FRESH_SIGNUP_WINDOW_MS) return;

      const key = `${STORAGE_PREFIX}${user.id}`;
      if (window.localStorage.getItem(key)) return;

      fbq('track', 'Lead', {}, { eventID: `${user.id}:user_registered` });
      window.localStorage.setItem(key, '1');
    } catch {
      // localStorage may throw in private mode / restricted contexts.
      // Silent fail — better to skip than risk firing without idempotency.
    }
  }, [isLoaded, isSignedIn, user]);

  return null;
}
