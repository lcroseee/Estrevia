import type { CookieConsentValue } from '@/shared/components/PostHogProvider';

/**
 * Pure consent-gate predicates. Shared by the cookie banner (which shows only
 * when no decision exists) and the Meta Pixel gate (which loads only after
 * analytics consent). Kept React-free so it unit-tests without a render.
 */
export function hasAnalyticsConsent(consent: CookieConsentValue): boolean {
  return consent === 'accepted';
}

export function shouldShowConsentBanner(consent: CookieConsentValue): boolean {
  return consent === null;
}
