'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PricingUpgradeButton } from './PricingUpgradeButton';

const FREE_FEATURE_KEYS = [
  'natalChart',
  'cosmicPassport',
  'moonPhase',
  'planetaryHour',
  'dailyTarot',
  'treeOfLife',
  'oneSynastry',
  'oneAvatar',
  'essayPreview',
] as const;

const PRO_FEATURE_KEYS = [
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

export function PricingToggle() {
  const t = useTranslations('pricing');
  const [billing, setBilling] = useState<'monthly' | 'annual'>('annual');

  const plan = billing === 'monthly' ? 'pro_monthly' : 'pro_annual';

  function formatTrialEndDate(): string {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <>
      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-1 p-1 bg-white/5 rounded-xl mb-12 border border-white/6 max-w-xs mx-auto">
        <button
          onClick={() => setBilling('monthly')}
          className={[
            'flex-1 text-sm py-2.5 px-4 rounded-lg transition-all font-[var(--font-geist-sans)]',
            billing === 'monthly'
              ? 'bg-white/10 text-white font-medium shadow-sm'
              : 'text-white/40 hover:text-white/60',
          ].join(' ')}
        >
          {t('monthly')}
        </button>
        <button
          onClick={() => setBilling('annual')}
          className={[
            'flex-1 text-sm py-2.5 px-4 rounded-lg transition-all font-[var(--font-geist-sans)] relative',
            billing === 'annual'
              ? 'bg-white/10 text-white font-medium shadow-sm'
              : 'text-white/40 hover:text-white/60',
          ].join(' ')}
        >
          {t('annual')}
          <span className="absolute -top-2.5 -right-2 text-[9px] px-1.5 py-0.5 rounded-full bg-[#FFD700]/15 text-[#FFD700]/80 border border-[#FFD700]/20 tracking-wide font-medium">
            {t('saveBadge')}
          </span>
        </button>
      </div>

      {/* Pricing cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {/* Free tier */}
        <div
          className="flex flex-col rounded-2xl border border-white/8 p-8"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <div className="mb-6">
            <div className="text-xs tracking-[0.2em] uppercase text-white/40 mb-3">
              {t('freeTitle')}
            </div>
            <div className="flex items-end gap-1 mb-4">
              <span
                className="text-5xl font-light text-white"
                style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              >
                {t('freePrice')}
              </span>
              <span className="text-sm text-white/35 mb-2">/ {t('freeForever')}</span>
            </div>
            <p className="text-sm text-white/45 leading-relaxed">
              Full chart calculation and core tools. No account required for
              calculation.
            </p>
          </div>

          <ul className="space-y-3 flex-1 mb-8" role="list" aria-label="Free plan features">
            {FREE_FEATURE_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-3">
                <span className="text-white/30 mt-0.5 flex-shrink-0" aria-hidden="true">
                  {'\u2713'}
                </span>
                <span className="text-sm text-white/60">{t(`freeFeatures.${key}`)}</span>
              </li>
            ))}
          </ul>

          <div
            className="w-full py-3 px-6 rounded-xl border border-white/10 text-sm text-white/40 text-center"
            aria-label="Current plan"
          >
            {t('currentPlan')}
          </div>
        </div>

        {/* Pro tier */}
        <div
          className="flex flex-col rounded-2xl border border-[#FFD700]/25 p-8 relative overflow-hidden"
          style={{ background: 'rgba(255,215,0,0.03)' }}
        >
          {/* Glow */}
          <div
            className="absolute top-0 inset-x-0 h-px"
            style={{
              background:
                'linear-gradient(to right, transparent, rgba(255,215,0,0.4), transparent)',
            }}
            aria-hidden="true"
          />

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="text-xs tracking-[0.2em] uppercase text-[#FFD700]/70">
                {t('proTitle')}
              </div>
            </div>
            <div className="flex items-end gap-1 mb-1">
              <span
                className="text-5xl font-light text-[#FFD700]"
                style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              >
                {billing === 'monthly' ? t('monthlyPrice') : t('annualPrice')}
              </span>
              <span className="text-sm text-white/35 mb-2">
                {billing === 'monthly' ? t('monthlyLabel') : t('annualLabel')}
              </span>
            </div>
            {billing === 'annual' && (
              <p className="text-xs text-white/40 mb-3 font-[var(--font-geist-mono)]">
                {t('annualPerMonth')}
              </p>
            )}
            <p className="text-sm text-white/45 leading-relaxed">
              For serious practitioners. Unlimited access, deep analysis,
              and early access to every new feature.
            </p>
          </div>

          <ul
            className="space-y-3 flex-1 mb-8"
            role="list"
            aria-label="Pro plan features"
          >
            {PRO_FEATURE_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-3">
                <span
                  className="flex-shrink-0 mt-0.5"
                  style={{ color: 'rgba(255,215,0,0.6)' }}
                  aria-hidden="true"
                >
                  {'\u2713'}
                </span>
                <span className="text-sm text-white/70">{t(`proFeatures.${key}`)}</span>
              </li>
            ))}
          </ul>

          <PricingUpgradeButton plan={plan} />

          {/* Trial fine print */}
          <p className="text-xs text-white/25 text-center mt-3 leading-relaxed">
            {t('trialEndNote', { date: formatTrialEndDate() })}
          </p>
        </div>
      </div>
    </>
  );
}
