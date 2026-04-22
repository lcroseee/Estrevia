'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { postJson } from '@/shared/lib/apiFetch';

interface ReferralTrackerProps {
  passportId: string;
  /**
   * V08-3: session-scoped anonymous ID generated server-side from ph_device_id.
   * If provided and ph_device_id cookie is absent, we set it here on the client
   * so PostHog can stitch server and client events to the same identity.
   */
  deviceId?: string;
}

/**
 * Sets a referral cookie when a user visits a shared passport page.
 * Used for attribution — tracks which passport drove a new sign-up.
 * Cookie expires after 7 days. No PII stored.
 *
 * If the user is already signed in on mount OR becomes signed in within the
 * same visit (V08 refactor: reacts to isSignedIn changes, not just initial
 * mount), calls POST /api/v1/user/attribution to persist the referral in Redis
 * so it survives across sessions and devices.
 *
 * Uses sessionStorage flag to ensure the attribution API is only called once
 * per browser session per user.
 */
export function ReferralTracker({ passportId, deviceId }: ReferralTrackerProps) {
  const { isSignedIn, userId } = useAuth();
  // Track whether attribution was already sent this session to avoid duplicate
  // calls when isSignedIn/userId re-renders without an actual state change.
  const sentRef = useRef(false);

  // 1. Always set the referral cookie so attribution works for users who sign up later.
  useEffect(() => {
    const isSecure = window.location.protocol === 'https:';
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
    const secure = isSecure ? '; Secure' : '';
    document.cookie = `estrevia_passport_ref=${passportId}; path=/; expires=${expires}; SameSite=Lax${secure}`;
  }, [passportId]);

  // 2. V08-3: If server generated a new ph_device_id (no cookie found server-side),
  // persist it client-side so PostHog picks it up and funnel stitching works.
  useEffect(() => {
    if (!deviceId) return;
    // Only set if PostHog hasn't already written its own value.
    const existing = document.cookie
      .split(';')
      .find((c) => c.trim().startsWith('ph_device_id='));
    if (existing) return;

    const isSecure = window.location.protocol === 'https:';
    const secure = isSecure ? '; Secure' : '';
    // 1-year TTL matches PostHog's default for the device ID cookie.
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `ph_device_id=${deviceId}; path=/; expires=${expires}; SameSite=Lax${secure}`;
  }, [deviceId]);

  // 3. Persist referral via attribution API.
  //    Runs whenever isSignedIn or userId changes — this handles both:
  //    a) User was already signed in on page load (original behaviour).
  //    b) User signs in during the same visit without navigating away (V08 fix).
  useEffect(() => {
    if (!isSignedIn || !userId) return;

    const sessionKey = `estrevia_attr_sent:${userId}`;
    // Use both ref (instant) and sessionStorage (survives re-renders) as guards.
    if (sentRef.current || sessionStorage.getItem(sessionKey)) return;

    sentRef.current = true;
    sessionStorage.setItem(sessionKey, '1');

    postJson<{ success: boolean }>('/api/v1/user/attribution', { passportId }).then(
      (result) => {
        switch (result.kind) {
          case 'ok':
            // Attribution persisted — flags remain set, no retry needed.
            break;
          case 'auth-required':
            // User not authenticated; nothing to attribute. Silent no-op.
            console.debug('[ReferralTracker] attribution skipped: auth-required');
            break;
          case 'error':
            // Server rejected the request (4xx/5xx). Silent no-op — no retry.
            console.debug('[ReferralTracker] attribution error:', result.status, result.message);
            break;
          case 'network-error':
            // No response received — clear flags so we can retry next session.
            console.debug('[ReferralTracker] attribution network-error:', result.error);
            sentRef.current = false;
            sessionStorage.removeItem(sessionKey);
            break;
        }
      },
    );
  }, [isSignedIn, userId, passportId]);

  return null;
}
