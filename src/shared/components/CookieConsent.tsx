'use client';

/**
 * CookieConsent — GDPR-compliant cookie consent banner.
 *
 * Displays at the bottom of the screen on first visit.
 * Stores preference in localStorage under COOKIE_CONSENT_KEY.
 * Dispatches `estrevia:consent` custom event so PostHogProvider
 * can initialize immediately on acceptance without a full page reload.
 */

import { useState, useEffect } from 'react';
import { COOKIE_CONSENT_KEY, getCookieConsent } from './PostHogProvider';
import type { CookieConsentValue } from './PostHogProvider';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = getCookieConsent();
    if (consent === null) {
      // No decision yet — show banner after a short delay so it doesn't
      // flash during initial paint.
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  function handleConsent(value: CookieConsentValue) {
    if (!value) return;

    localStorage.setItem(COOKIE_CONSENT_KEY, value);
    setVisible(false);

    // Notify PostHogProvider about the decision.
    window.dispatchEvent(
      new CustomEvent('estrevia:consent', { detail: { consent: value } }),
    );

    // Track the consent action. On acceptance PostHogProvider will initialise
    // PostHog, so this event will be captured once PostHog is ready.
    if (value === 'accepted') {
      // Give PostHogProvider a tick to finish initialisation before tracking.
      setTimeout(() => {
        trackEvent(AnalyticsEvent.COOKIE_CONSENT_ACCEPTED);
      }, 200);
    } else {
      // No PostHog on decline — event is effectively a no-op.
      trackEvent(AnalyticsEvent.COOKIE_CONSENT_DECLINED);
    }
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className={[
        'fixed bottom-0 left-0 right-0 z-50',
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        'px-4 py-4 sm:px-6',
        'bg-[#0F0F18] border-t border-white/10',
        'shadow-[0_-4px_32px_rgba(0,0,0,0.6)]',
        'animate-in slide-in-from-bottom-4 duration-500',
      ].join(' ')}
    >
      {/* Text */}
      <p className="text-sm text-white/70 leading-relaxed max-w-prose">
        We use analytics cookies to understand how you use Estrevia and improve
        the experience. No ads, no third-party tracking.{' '}
        <a
          href="/privacy"
          className="text-[#C8A84B] underline underline-offset-2 hover:text-[#E0C06A] transition-colors"
        >
          Privacy Policy
        </a>
      </p>

      {/* Actions */}
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={() => handleConsent('declined')}
          className={[
            'px-4 py-2 rounded-md text-sm font-medium',
            'text-white/50 hover:text-white/80',
            'border border-white/10 hover:border-white/20',
            'transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
          ].join(' ')}
        >
          Decline
        </button>

        <button
          type="button"
          onClick={() => handleConsent('accepted')}
          className={[
            'px-4 py-2 rounded-md text-sm font-medium',
            'bg-[#C8A84B] text-[#0A0A0F]',
            'hover:bg-[#E0C06A]',
            'transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A84B]/60',
          ].join(' ')}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
