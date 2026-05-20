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
import { usePathname } from 'next/navigation';

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
  const pathname = usePathname();

  async function initPostHog() {
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

    if (!apiKey) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[PostHog] NEXT_PUBLIC_POSTHOG_KEY is not set. Analytics disabled.');
      }
      return;
    }

    const { default: posthog } = await import('posthog-js');

    // PII guard: strip birth-data query params from any URL property before
    // PostHog ships it to the server. bd/bt/lat/lon/place/tz/ktb must never
    // appear in analytics events (spec §PII, verified in chart-state.spec.ts).
    const PII_PARAMS = ['bd', 'bt', 'ktb', 'lat', 'lon', 'place', 'tz'];
    function stripPiiFromUrl(raw: unknown): unknown {
      if (typeof raw !== 'string' || !raw) return raw;
      try {
        const u = new URL(raw);
        PII_PARAMS.forEach((p) => u.searchParams.delete(p));
        return u.toString();
      } catch {
        return raw;
      }
    }

    posthog.init(apiKey, {
      // Same-origin reverse proxy bypasses ad blockers that block us.i.posthog.com
      // directly. Rewrites in next.config.ts forward /ingest/* → PostHog hosts.
      // ui_host keeps toolbar/recording links pointing at the real PostHog UI.
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      capture_pageview: true,
      disable_session_recording: true,
      persistence: 'localStorage',
      autocapture: false,
      // Heatmaps + rage clicks + scroll depth without enabling full autocapture.
      // PII guard via sanitize_properties continues to strip birth-data params.
      enable_heatmaps: true,
      // Core Web Vitals (LCP, INP, CLS) from real users — feeds PostHog
      // Web Vitals dashboard. Lightweight, runs in browser idle time.
      capture_performance: { web_vitals: true },
      bootstrap: {},
      sanitize_properties: (properties: Record<string, unknown>) => ({
        ...properties,
        $current_url: stripPiiFromUrl(properties.$current_url),
        $referrer: stripPiiFromUrl(properties.$referrer),
        $initial_referrer: stripPiiFromUrl(properties.$initial_referrer),
      }),
    });

    (window as unknown as Record<string, unknown>).posthog = posthog;
    setIsInitialized(true);
  }

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

  // Locale super-property: every subsequent posthog.capture() inherits
  // { locale: 'en' | 'es' }. Re-runs on pathname change (e.g. language
  // switcher) and on init completion so events fired right after consent
  // pick up the locale immediately.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const posthog = (window as unknown as {
      posthog?: { register?: (props: Record<string, unknown>) => void };
    }).posthog;
    if (!posthog?.register) return;
    const locale = pathname?.startsWith('/es') ? 'es' : 'en';
    posthog.register({ locale });
  }, [pathname, isInitialized]);

  return (
    <PostHogContext.Provider value={{ isInitialized }}>
      {children}
    </PostHogContext.Provider>
  );
}
