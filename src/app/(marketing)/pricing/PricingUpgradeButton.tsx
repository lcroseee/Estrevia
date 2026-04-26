'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    if (loading) return;
    setLoading(true);
    setError(null);
    trackEvent(AnalyticsEvent.PAYWALL_TRIAL_CLICKED, { plan, source: 'pricing' });

    try {
      const res = await fetch('/api/v1/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      const contentType = res.headers.get('content-type') ?? '';
      const clerkAuthStatus = res.headers.get('x-clerk-auth-status');
      const isAuthFailure =
        res.status === 401 ||
        clerkAuthStatus === 'signed-out' ||
        !contentType.includes('application/json');

      if (isAuthFailure) {
        // Seamless funnel: after sign-up, Clerk lands the user on
        // /checkout/start which auto-creates the Stripe session and
        // redirects to Stripe without another click.
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
