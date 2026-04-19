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
        // z-50 keeps cookie banner above bottom nav (z-40)
        'fixed left-0 right-0 z-50 bottom-0',
        // Mobile: single compact row — text + actions on one line, tight padding
        // sm+: expand to full two-column layout with relaxed padding
        'flex flex-row items-center justify-between gap-2',
        'sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        'px-3 py-2 pb-[calc(0.5rem+60px)]',
        'sm:px-6 sm:pt-4 sm:pb-4',
        'bg-[#0F0F18]/97 border-t border-white/10',
        'shadow-[0_-4px_40px_rgba(0,0,0,0.7)]',
        'animate-in slide-in-from-bottom-4 duration-500',
        '[backdrop-filter:blur(12px)]',
      ].join(' ')}
      style={{ WebkitBackdropFilter: 'blur(12px)' }}
    >
      {/* Text — short on mobile, full on sm+ */}
      <p className="text-xs sm:text-sm text-white/70 leading-snug sm:leading-relaxed sm:max-w-prose truncate sm:whitespace-normal min-w-0">
        {/* Short copy visible only on mobile */}
        <span className="sm:hidden">
          Analytics cookies only.{' '}
          <a
            href="/privacy"
            className="text-[#C8A84B] underline underline-offset-2 hover:text-[#E0C06A] transition-colors"
            aria-label="Privacy Policy"
          >
            Privacy
          </a>
        </span>
        {/* Full copy visible on sm+ */}
        <span className="hidden sm:inline">
          We use analytics cookies to understand how you use Estrevia and improve
          the experience. No ads, no third-party tracking.{' '}
          <a
            href="/privacy"
            className="text-[#C8A84B] underline underline-offset-2 hover:text-[#E0C06A] transition-colors"
          >
            Privacy Policy
          </a>
        </span>
      </p>

      {/* Actions */}
      <div className="flex gap-1.5 sm:gap-2.5 shrink-0">
        <button
          type="button"
          onClick={() => handleConsent('declined')}
          className={[
            // Mobile: compact pill; sm+: standard button
            'px-2.5 py-1 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium',
            'text-white/45 hover:text-white/75',
            'border border-white/8 hover:border-white/18',
            'transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
            'active:scale-[0.97]',
          ].join(' ')}
        >
          Decline
        </button>

        <button
          type="button"
          onClick={() => handleConsent('accepted')}
          className={[
            'px-3 py-1 sm:px-5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold',
            'transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD700]/50',
            'active:scale-[0.97]',
          ].join(' ')}
          style={{
            background: 'linear-gradient(135deg, #C8A84B 0%, #E0C06A 100%)',
            color: '#0A0A0F',
          }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
