'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import { readUtmLastTouch } from '@/shared/lib/utm-cookie';

/**
 * Client component — handles the checkout flow.
 * POSTs to /api/v1/stripe/checkout and redirects to the Stripe Checkout URL.
 * Prevents double-clicks with loading state.
 */
export function PricingUpgradeButton({
  plan = 'pro_annual',
}: {
  plan?: 'pro_monthly' | 'pro_annual';
}) {
  const t = useTranslations('pricing');
  const tPage = useTranslations('pricingPage');
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    if (loading) return;
    setLoading(true);
    setError(null);
    trackEvent(AnalyticsEvent.PAYWALL_TRIAL_CLICKED, { plan, source: 'pricing' });

    try {
      const utmFields = readUtmLastTouch();
      const res = await fetch('/api/v1/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, locale, ...utmFields }),
      });

      const contentType = res.headers.get('content-type') ?? '';
      // True auth-required failure: API explicitly returns 401, or response is not
      // JSON (auth wall HTML, edge error page). The `x-clerk-auth-status: signed-out`
      // header alone is NOT a failure — Clerk middleware sets it on every
      // unauthenticated request, including ones the API route serves anonymously.
      const isAuthFailure =
        res.status === 401 || !contentType.includes('application/json');

      if (isAuthFailure) {
        const checkoutStart = `/checkout/start?plan=${plan}&return=${encodeURIComponent('/pricing')}`;
        trackEvent(AnalyticsEvent.CHECKOUT_AUTH_REDIRECT, { plan, source: 'pricing' });
        window.location.href = `/sign-up?redirect_url=${encodeURIComponent(checkoutStart)}`;
        return;
      }

      let data: { success: boolean; data?: { url: string }; error?: string };
      try {
        data = await res.json();
      } catch {
        setError(tPage('errUnexpected'));
        return;
      }

      if (!data.success || !data.data?.url) {
        setError(tPage('errGeneric'));
        return;
      }

      // Redirect to Stripe Checkout
      trackEvent(AnalyticsEvent.CHECKOUT_STRIPE_REDIRECTED, { plan, source: 'pricing' });
      window.location.href = data.data.url;
    } catch {
      setError(tPage('errNetwork'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleUpgrade}
        disabled={loading}
        className="w-full py-3 px-6 rounded-xl text-sm font-semibold tracking-wide disabled:opacity-60 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD700]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]"
        style={{
          background: 'linear-gradient(135deg, #FFD700, #FFE033)',
          color: '#0A0A0F',
        }}
        aria-busy={loading}
      >
        {loading ? tPage('redirecting') : t('startTrial')}
      </button>
      {error && (
        <p className="text-xs text-red-400 text-center" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
