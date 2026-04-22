'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';

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

    fetch('/api/v1/user/attribution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passportId }),
    }).catch(() => {
      // Non-fatal. Clear the flag so we retry next session if the request failed.
      sessionStorage.removeItem(sessionKey);
    });
  }, [isSignedIn, userId]);

  return null;
}
