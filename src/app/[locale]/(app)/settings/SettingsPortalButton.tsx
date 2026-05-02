'use client';

import { useState } from 'react';

interface SettingsPortalButtonProps {
  label?: string;
  /**
   * 'default' — gold outline (manage billing, normal state)
   * 'danger'  — red outline (update payment method on past_due)
   */
  variant?: 'default' | 'danger';
}

/**
 * Client component — opens the Stripe Billing Portal.
 * POSTs to /api/v1/stripe/portal and redirects to the portal URL.
 * Prevents double-clicks with loading state.
 */
export function SettingsPortalButton({ label = 'Manage subscription', variant = 'default' }: SettingsPortalButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePortal() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/stripe/portal', { method: 'POST' });

      const contentType = res.headers.get('content-type') ?? '';
      const clerkAuthStatus = res.headers.get('x-clerk-auth-status');
      // Clerk v6 can rewrite unauthenticated requests to /_not-found (HTTP 200, text/html)
      // instead of returning 401, so we check all three signals.
      const isAuthFailure =
        res.status === 401 ||
        clerkAuthStatus === 'signed-out' ||
        !contentType.includes('application/json');

      if (isAuthFailure) {
        window.location.href = '/sign-in?redirect_url=/settings';
        return;
      }

      let data: { success: boolean; data?: { url: string }; error?: string; message?: string };
      try {
        data = await res.json();
      } catch {
        setError('Unexpected response from server. Please try again.');
        return;
      }

      if (!data.success || !data.data?.url) {
        const msg =
          data.error === 'NO_SUBSCRIPTION'
            ? 'No subscription found. Please upgrade first.'
            : 'Something went wrong. Please try again.';
        setError(msg);
        return;
      }

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
        onClick={handlePortal}
        disabled={loading}
        className={
          variant === 'danger'
            ? 'inline-flex items-center mt-2 px-4 py-2 rounded-lg border border-red-500/30 text-red-400/80 text-xs font-medium tracking-wide hover:border-red-500/60 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
            : 'inline-flex items-center px-5 py-2.5 rounded-xl border border-[#FFD700]/25 text-[#FFD700]/80 text-sm font-medium tracking-wide hover:border-[#FFD700]/50 hover:text-[#FFD700] disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
        }
        aria-busy={loading}
      >
        {loading ? 'Opening portal…' : label}
      </button>
      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
