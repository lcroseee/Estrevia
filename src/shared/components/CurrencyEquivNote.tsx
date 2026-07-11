// src/shared/components/CurrencyEquivNote.tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ProPlan } from '@/shared/lib/currency-equiv';

interface CurrencyEquivNoteProps {
  plan: ProPlan;
  /** Layout-specific tint/spacing (modal vs pricing card), applied to the wrapper. */
  className?: string;
}

/**
 * LATAM currency-equivalence line + "billed in USD" note — ES-only.
 * Renders null for every other locale (same gate the two former inline
 * copies in PricingToggle/PaywallModal had, so missing en.json keys are safe).
 * Copy source: messages/es.json pricing.{monthlyPriceEquiv,annualPriceEquiv,billedInUsd},
 * kept byte-exact with src/shared/lib/currency-equiv.ts (sync-tested — see its header
 * for the quarterly FX refresh procedure).
 */
export function CurrencyEquivNote({ plan, className }: CurrencyEquivNoteProps) {
  const t = useTranslations('pricing');
  const tPage = useTranslations('pricingPage');
  const locale = useLocale();

  if (locale !== 'es') return null;

  return (
    <div className={className}>
      <p
        className="text-xs font-[var(--font-geist-mono)] leading-relaxed"
        aria-label={tPage('currencyEquivAria')}
      >
        {t(plan === 'pro_annual' ? 'annualPriceEquiv' : 'monthlyPriceEquiv')}
      </p>
      <p className="text-xs mt-0.5">{t('billedInUsd')}</p>
    </div>
  );
}
