'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, X } from 'lucide-react';

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  returnUrl?: string;
}

const PRO_FEATURES = [
  'allEssays',
  'fullCalendar',
  'allHours',
  'allSpreads',
  'aiTarot',
  'unlimitedSynastry',
  'aiAnalysis',
  'treePersonal',
  'unlimitedAvatars',
  'prioritySupport',
] as const;

function formatTrialEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function PaywallModal({ open, onClose, returnUrl }: PaywallModalProps) {
  const t = useTranslations('paywall');
  const tp = useTranslations('pricing');
  const [plan, setPlan] = useState<'pro_monthly' | 'pro_annual'>('pro_annual');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const trialEndDate = formatTrialEndDate();

  async function handleCheckout() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, returnUrl }),
      });

      if (res.status === 401) {
        window.location.href = `/sign-in?redirect_url=${encodeURIComponent(returnUrl ?? window.location.pathname)}`;
        return;
      }

      const data = (await res.json()) as {
        success: boolean;
        data?: { url: string };
        error?: string;
      };

      if (!data.success || !data.data?.url) {
        setError('Something went wrong. Please try again.');
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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        className="relative z-10 w-full md:max-w-md md:rounded-2xl rounded-t-2xl bg-[#0F0F17] border border-white/8 shadow-2xl shadow-black/60 max-h-[90vh] overflow-y-auto"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="px-6 pt-8 pb-6">
          {/* Header */}
          <div className="text-center mb-6">
            <h2
              className="text-2xl font-light text-white mb-1"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
            >
              {t('title')}
            </h2>
            <p className="text-sm text-white/45">{t('subtitle')}</p>
          </div>

          {/* Monthly / Annual toggle */}
          <div className="flex items-center justify-center gap-1 p-1 bg-white/5 rounded-xl mb-6 border border-white/6">
            <button
              onClick={() => setPlan('pro_monthly')}
              className={[
                'flex-1 text-sm py-2 px-4 rounded-lg transition-all font-[var(--font-geist-sans)]',
                plan === 'pro_monthly'
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-white/40 hover:text-white/60',
              ].join(' ')}
            >
              {tp('monthly')}
            </button>
            <button
              onClick={() => setPlan('pro_annual')}
              className={[
                'flex-1 text-sm py-2 px-4 rounded-lg transition-all font-[var(--font-geist-sans)] relative',
                plan === 'pro_annual'
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-white/40 hover:text-white/60',
              ].join(' ')}
            >
              {tp('annual')}
              <span className="absolute -top-2.5 -right-1 text-[9px] px-1.5 py-0.5 rounded-full bg-[#FFD700]/15 text-[#FFD700]/80 border border-[#FFD700]/20 tracking-wide font-medium">
                {tp('saveBadge')}
              </span>
            </button>
          </div>

          {/* Price display */}
          <div className="text-center mb-6">
            <div className="flex items-end justify-center gap-1">
              <span
                className="text-4xl font-light text-[#FFD700]"
                style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              >
                {plan === 'pro_monthly' ? tp('monthlyPrice') : tp('annualPrice')}
              </span>
              <span className="text-sm text-white/35 mb-1.5">
                {plan === 'pro_monthly' ? tp('monthlyLabel') : tp('annualLabel')}
              </span>
            </div>
            {plan === 'pro_annual' && (
              <p className="text-xs text-white/40 mt-1 font-[var(--font-geist-mono)]">
                {tp('annualPerMonth')}
              </p>
            )}
          </div>

          {/* Features list */}
          <div className="mb-6">
            <p className="text-xs text-white/35 uppercase tracking-widest mb-3 font-[var(--font-geist-sans)]">
              {t('features')}
            </p>
            <ul className="space-y-2.5" role="list">
              {PRO_FEATURES.map((key) => (
                <li key={key} className="flex items-start gap-2.5">
                  <Check
                    size={14}
                    className="flex-shrink-0 mt-0.5"
                    style={{ color: 'rgba(255,215,0,0.6)' }}
                    aria-hidden="true"
                  />
                  <span className="text-sm text-white/65">
                    {tp(`proFeatures.${key}`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA button */}
          <button
            onClick={handleCheckout}
            disabled={loading}
            className="w-full py-3.5 px-6 rounded-xl text-sm font-semibold tracking-wide transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #FFD700, #FFE033)',
              color: '#0A0A0F',
            }}
            aria-busy={loading}
          >
            {loading ? 'Redirecting...' : t('trialCta')}
          </button>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 text-center mt-2" role="alert">
              {error}
            </p>
          )}

          {/* Fine print */}
          <p className="text-xs text-white/25 text-center mt-3 leading-relaxed">
            {t('noCharge', { date: trialEndDate })}
          </p>
        </div>
      </div>
    </div>
  );
}
