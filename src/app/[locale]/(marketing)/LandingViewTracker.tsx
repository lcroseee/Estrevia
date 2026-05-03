'use client';

import { useEffect } from 'react';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';

/**
 * Fires `landing_view` once when the marketing landing page mounts.
 *
 * Why a separate component: the marketing page is a Server Component
 * (uses getTranslations/getLocale). useEffect requires a Client Component,
 * so we mount this tracker as a child of the SC. Standard Next.js App
 * Router pattern.
 *
 * The PostHog SDK respects cookie consent — if the user has not accepted
 * cookies, `posthog.capture()` is a no-op (handled inside trackEvent →
 * window.posthog guard).
 */
interface LandingViewTrackerProps {
  locale: 'en' | 'es';
}

export function LandingViewTracker({ locale }: LandingViewTrackerProps) {
  useEffect(() => {
    trackEvent(AnalyticsEvent.LANDING_VIEW, { locale });
    // Empty deps array → fires once per mount. Re-renders won't re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
