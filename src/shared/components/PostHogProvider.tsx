'use client';

/**
 * PostHogProvider — initializes PostHog browser client after cookie consent.
 *
 * Renders as a React context provider wrapping the app.
 * PostHog is only initialized when the user has accepted cookies.
 * On decline (or no answer yet), PostHog is never loaded.
 */

import { useEffect, useRef, createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PostHogContextValue {
  /** Whether PostHog has been initialized for this session. */
  isInitialized: boolean;
}

const PostHogContext = createContext<PostHogContextValue>({
  isInitialized: false,
});

export function usePostHog(): PostHogContextValue {
  return useContext(PostHogContext);
}

// ---------------------------------------------------------------------------
// Cookie consent key — shared with CookieConsent component
// ---------------------------------------------------------------------------

export const COOKIE_CONSENT_KEY = 'estrevia_cookie_consent';
export type CookieConsentValue = 'accepted' | 'declined' | null;

export function getCookieConsent(): CookieConsentValue {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
  if (stored === 'accepted' || stored === 'declined') return stored;
  return null;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface PostHogProviderProps {
  children: ReactNode;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const initAttempted = useRef(false);

  useEffect(() => {
    if (initAttempted.current) return;
    initAttempted.current = true;

    const consent = getCookieConsent();
    if (consent !== 'accepted') return;

    initPostHog().catch(() => {
      // Non-fatal — analytics failure must never break the app.
    });
  }, []);

  // Listen for consent changes dispatched by CookieConsent component.
  useEffect(() => {
    function handleConsentChange(event: Event) {
      const { detail } = event as CustomEvent<{ consent: CookieConsentValue }>;
      if (detail.consent === 'accepted' && !isInitialized) {
        initPostHog()
          .then(() => setIsInitialized(true))
          .catch(() => {});
      }
    }

    window.addEventListener('estrevia:consent', handleConsentChange);
    return () => {
      window.removeEventListener('estrevia:consent', handleConsentChange);
    };
  }, [isInitialized]);

  async function initPostHog() {
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host =
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

    if (!apiKey) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[PostHog] NEXT_PUBLIC_POSTHOG_KEY is not set. Analytics disabled.');
      }
      return;
    }

    const { default: posthog } = await import('posthog-js');

    posthog.init(apiKey, {
      api_host: host,
      // Capture page views automatically
      capture_pageview: true,
      // Respect user privacy — no session recording without explicit opt-in
      disable_session_recording: true,
      // Persist to localStorage (GDPR: consent already given at this point)
      persistence: 'localStorage',
      // Do not capture personal data in autocapture
      autocapture: false,
      // Bootstrap with Vercel deployment ID for feature flags
      bootstrap: {},
    });

    // Expose on window so analytics.ts helpers can access without re-importing
    (window as unknown as Record<string, unknown>).posthog = posthog;
    setIsInitialized(true);
  }

  return (
    <PostHogContext.Provider value={{ isInitialized }}>
      {children}
    </PostHogContext.Provider>
  );
}
