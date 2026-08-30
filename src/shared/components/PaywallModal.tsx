'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations, useLocale } from 'next-intl';
import { Check, X } from 'lucide-react';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import { readUtmLastTouch } from '@/shared/lib/utm-cookie';
import {
  PAYWALL_EXIT_STORAGE_KEY,
  shouldShowPaywallExitSheet,
  type PaywallDismissMethod,
  type PaywallStage,
} from '@/shared/lib/paywall-exit';
import type { PaywallTrigger } from '@/shared/types/paywall';
import { CurrencyEquivNote } from './CurrencyEquivNote';

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  returnUrl?: string;
  triggerContext?: PaywallTrigger;
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

function triggerToKey(trigger: PaywallTrigger): string {
  return trigger
    .split('-')
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

function formatTrialEndDate(locale: string): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function readExitStoredAt(): string | null {
  return localStorage.getItem(PAYWALL_EXIT_STORAGE_KEY);
}

function persistExitShown(): void {
  try {
    localStorage.setItem(PAYWALL_EXIT_STORAGE_KEY, String(Date.now()));
  } catch {
    /* private mode / quota — ignore */
  }
}

export function PaywallModal({ open, onClose, returnUrl, triggerContext }: PaywallModalProps) {
  const t = useTranslations('paywall');
  const tp = useTranslations('pricing');
  const tPage = useTranslations('pricingPage');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [plan, setPlan] = useState<'pro_monthly' | 'pro_annual'>('pro_monthly');
  const [stage, setStage] = useState<PaywallStage>('offer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openedAtRef = useRef(0);

  const headline =
    triggerContext && triggerContext !== 'generic' && t.has(`contextualTitles.${triggerToKey(triggerContext)}`)
      ? t(`contextualTitles.${triggerToKey(triggerContext)}` as 'contextualTitles.essay')
      : t('title');

  // Track paywall open (conversion-funnel entry)
  useEffect(() => {
    if (open) {
      openedAtRef.current = Date.now();
      setStage('offer');
      trackEvent(AnalyticsEvent.PAYWALL_OPENED, {
        trigger: triggerContext ?? 'generic',
        returnUrl: returnUrl ?? null,
      });
    }
  }, [open, returnUrl, triggerContext]);

  const handleAttemptClose = useCallback(
    (method: PaywallDismissMethod): void => {
      const dwellMs = Date.now() - openedAtRef.current;
      const trigger = triggerContext ?? 'generic';
      if (stage === 'offer' && shouldShowPaywallExitSheet(dwellMs, Date.now(), readExitStoredAt)) {
        persistExitShown();
        setStage('exit');
        trackEvent(AnalyticsEvent.PAYWALL_EXIT_SHOWN, { trigger, dwell_ms: dwellMs, plan });
        closeButtonRef.current?.focus();
        return;
      }
      trackEvent(AnalyticsEvent.PAYWALL_DISMISSED, {
        trigger,
        method,
        stage,
        dwell_ms: dwellMs,
        plan,
        qualified: stage === 'exit',
      });
      onClose();
    },
    [stage, plan, onClose, triggerContext],
  );

  // Escape key closes the modal (WCAG 2.1.2)
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleAttemptClose('escape');
      // Focus trap: keep Tab / Shift+Tab inside the dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    // Move focus into the dialog on open
    closeButtonRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleAttemptClose]);

  if (!open) return null;

  const trialEndDate = formatTrialEndDate(locale);

  async function handleCheckout(planOverride?: 'pro_monthly' | 'pro_annual') {
    if (loading) return;
    const selected = planOverride ?? plan;
    setLoading(true);
    setError(null);
    trackEvent(AnalyticsEvent.PAYWALL_TRIAL_CLICKED, {
      plan: selected,
      trigger: triggerContext ?? 'generic',
      returnUrl: returnUrl ?? null,
    });

    try {
      const utmFields = readUtmLastTouch();
      const res = await fetch('/api/v1/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selected, returnUrl, locale, ...utmFields }),
      });

      let data: { success: boolean; data?: { url: string }; error?: string };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setError(tPage('errUnexpected'));
        return;
      }

      if (!data.success || !data.data?.url) {
        setError(tPage('errGeneric'));
        return;
      }

      trackEvent(AnalyticsEvent.CHECKOUT_STRIPE_REDIRECTED, {
        plan: selected,
        trigger: triggerContext ?? 'generic',
      });
      window.location.href = data.data.url;
    } catch {
      setError(tPage('errNetwork'));
    } finally {
      setLoading(false);
    }
  }

  // Portal to document.body (same pattern + rationale as EmailGateModal):
  // escapes ancestor stacking contexts, and z-[60] beats the cookie banner
  // (z-50, mounted after {children} in the root layout — DOM order would
  // otherwise put the banner on top of an inline-rendered modal).
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => handleAttemptClose('backdrop')}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={stage === 'exit' ? t('exit.title') : t('title')}
        className="relative z-10 w-full md:max-w-md md:rounded-2xl rounded-t-2xl bg-[#0F0F17] border border-white/8 shadow-2xl shadow-black/60 max-h-[90vh] overflow-y-auto"
      >
        {/* Close button */}
        <button
          ref={closeButtonRef}
          onClick={() => handleAttemptClose('close_button')}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          aria-label={tCommon('close')}
        >
          <X size={18} />
        </button>

        {stage === 'exit' ? (
          <div className="px-6 pt-8 pb-6 text-center">
            <h2
              className="text-2xl font-light text-white mb-2"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
            >
              {t('exit.title')}
            </h2>
            <p className="text-sm text-white/45 mb-8">{t('exit.body')}</p>
            {plan === 'pro_monthly' && (
              <button
                type="button"
                onClick={() => {
                  setPlan('pro_annual');
                  trackEvent(AnalyticsEvent.PAYWALL_EXIT_ANNUAL_CLICKED, {
                    trigger: triggerContext ?? 'generic',
                    dwell_ms: Date.now() - openedAtRef.current,
                  });
                  void handleCheckout('pro_annual');
                }}
                disabled={loading}
                className="w-full py-3.5 px-6 rounded-xl text-sm font-semibold tracking-wide mb-3 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #FFD700, #FFE033)', color: '#0A0A0F' }}
                aria-busy={loading}
              >
                {loading ? tPage('redirecting') : t('exit.tryAnnual')}
              </button>
            )}
            {plan === 'pro_monthly' && (
              <p className="text-xs text-white/25 mb-6">{t('noCharge', { date: trialEndDate })}</p>
            )}
            <button
              type="button"
              onClick={() => handleAttemptClose('keep_free')}
              className="w-full py-3 px-6 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/5 border border-white/10"
            >
              {t('exit.keepFree')}
            </button>
          </div>
        ) : (
        <div className="px-6 pt-8 pb-6">
          {/* Header */}
          <div className="text-center mb-6">
            <h2
              className="text-2xl font-light text-white mb-1"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
            >
              {headline}
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
              <span className="text-sm text-white/60 mb-1.5">
                {plan === 'pro_monthly' ? tp('monthlyLabel') : tp('annualLabel')}
              </span>
            </div>
            {plan === 'pro_annual' && (
              <p className="text-xs text-white/60 mt-1 font-[var(--font-geist-mono)]">
                {tp('annualPerMonth')}
              </p>
            )}
            {/* LATAM currency equivalents + billed-in-USD note — ES-only (renders null for en) */}
            <CurrencyEquivNote plan={plan} className="text-white/50 mt-2" />
          </div>

          {/* Features list */}
          <div className="mb-6">
            <p className="text-xs text-white/60 uppercase tracking-widest mb-3 font-[var(--font-geist-sans)]">
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
            onClick={() => void handleCheckout()}
            disabled={loading}
            className="w-full py-3.5 px-6 rounded-xl text-sm font-semibold tracking-wide transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #FFD700, #FFE033)',
              color: '#0A0A0F',
            }}
            aria-busy={loading}
          >
            {loading ? tPage('redirecting') : t('trialCta')}
          </button>

          {/* Trust row — card-decision reassurance, both locales (SP-B D3) */}
          <p className="text-xs text-white/35 text-center mt-3">
            {t('trustRow')}
          </p>

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
        )}
      </div>
    </div>,
    document.body,
  );
}
