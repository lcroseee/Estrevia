'use client';

import { useEffect } from 'react';

interface ReferralTrackerProps {
  passportId: string;
}

/**
 * Sets a referral cookie when a user visits a shared passport page.
 * Used for attribution — tracks which passport drove a new sign-up.
 * Cookie expires after 7 days. No PII stored.
 */
export function ReferralTracker({ passportId }: ReferralTrackerProps) {
  useEffect(() => {
    const isSecure = window.location.protocol === 'https:';
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
    const secure = isSecure ? '; Secure' : '';
    document.cookie = `estrevia_passport_ref=${passportId}; path=/; expires=${expires}; SameSite=Lax${secure}`;
  }, [passportId]);

  return null;
}
