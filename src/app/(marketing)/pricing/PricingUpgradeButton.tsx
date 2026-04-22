'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      if (res.status === 401) {
        // Not signed in — redirect to sign-in with return URL
        window.location.href = '/sign-in?redirect_url=/pricing';
        return;
      }

      const data = (await res.json()) as { success: boolean; data?: { url: string }; error?: string };

      if (!data.success || !data.data?.url) {
        setError('Something went wrong. Please try again.');
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.data.url;
    } catch {
      setError('Network error. Please check your connection and try again.');
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
        {loading ? 'Redirecting to checkout...' : t('startTrial')}
      </button>
      {error && (
        <p className="text-xs text-red-400 text-center" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
