'use client';

import { useEffect } from 'react';
import { parseUtmFromSearch, readUtmCookie, writeUtmCookie } from '@/shared/lib/utm-cookie';

/**
 * Captures UTM parameters from the landing URL into a 30-day first-touch cookie.
 *
 * First-touch wins: if a cookie already exists (from a prior visit), we leave it
 * untouched so the original acquisition channel gets credit for attribution.
 *
 * Rendered in the locale layout so it fires on every page; the guard inside
 * writeUtmCookie skips the write if no UTM params are present.
 */
export function UtmCapture() {
  useEffect(() => {
    const parsed = parseUtmFromSearch(window.location.search);
    if (Object.keys(parsed).length === 0) return;

    // First-touch attribution: don't overwrite an existing cookie.
    if (readUtmCookie() !== null) return;

    writeUtmCookie({ ...parsed, utm_click_timestamp: new Date().toISOString() });
  }, []);

  return null;
}
