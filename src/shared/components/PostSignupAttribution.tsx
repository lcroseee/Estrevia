'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { postJson } from '@/shared/lib/apiFetch';

/**
 * V08-2: Post-signup attribution hook.
 *
 * Mounted in (app)/layout.tsx. On the first authenticated load after signup,
 * reads the `estrevia_passport_ref` cookie (set by ReferralTracker on a share page)
 * and POSTs to /api/v1/user/attribution once. Guards against duplicate calls with
 * a sessionStorage flag so the request fires at most once per browser session per user.
 *
 * This closes the gap where a user visits /s/[id] anonymously, clicks the CTA,
 * calculates their chart, and signs up — at which point no ReferralTracker is
 * rendered, so the cookie would otherwise never be consumed.
 *
 * No PII is transmitted: passportId is a server-generated nanoid(8).
 */
export function PostSignupAttribution() {
  const { isSignedIn, userId } = useAuth();

  useEffect(() => {
    if (!isSignedIn || !userId) return;

    // Guard: only fire once per browser session per user.
    const sessionKey = `attr_processed:${userId}`;
    if (sessionStorage.getItem(sessionKey)) return;

    // Read the referral cookie set by ReferralTracker on the share page.
    const passportId = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('estrevia_passport_ref='))
      ?.split('=')[1];

    if (!passportId) return;

    // Mark as processed immediately to prevent concurrent calls from multiple
    // re-renders before the fetch completes.
    sessionStorage.setItem(sessionKey, '1');

    postJson<{ success: boolean; data: null; error: string | null }>(
      '/api/v1/user/attribution',
      { passportId },
    ).then((result) => {
      switch (result.kind) {
        case 'ok':
          // Attribution recorded. Flag remains set — no further action needed.
          break;
        case 'auth-required':
          // Race condition: Clerk session not yet established. Provider will
          // re-trigger on next visibility change once the session is ready.
          console.debug('[PostSignupAttribution] auth-required — session not ready yet');
          sessionStorage.removeItem(sessionKey);
          break;
        case 'error':
          // Non-fatal server error. Clear flag so we retry next session.
          console.debug('[PostSignupAttribution] server error', result.status, result.message);
          sessionStorage.removeItem(sessionKey);
          break;
        case 'network-error':
          // Offline or DNS failure. Clear flag so we retry next session.
          console.debug('[PostSignupAttribution] network error', result.error);
          sessionStorage.removeItem(sessionKey);
          break;
      }
    });
  }, [isSignedIn, userId]);

  return null;
}
