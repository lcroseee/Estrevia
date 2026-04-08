'use client';

import { useState } from 'react';

interface SettingsPortalButtonProps {
  label?: string;
}

/**
 * Client component — opens the Stripe Billing Portal.
 * POSTs to /api/v1/stripe/portal and redirects to the portal URL.
 * Prevents double-clicks with loading state.
 */
export function SettingsPortalButton({ label = 'Manage subscription' }: SettingsPortalButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePortal() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/stripe/portal', { method: 'POST' });
      const data = (await res.json()) as {
        success: boolean;
        data?: { url: string };
        error?: string;
        message?: string;
      };

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
        className="inline-flex items-center px-5 py-2.5 rounded-xl border border-[#FFD700]/25 text-[#FFD700]/80 text-sm font-medium tracking-wide hover:border-[#FFD700]/50 hover:text-[#FFD700] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
