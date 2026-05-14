'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import type { PaywallTrigger } from '@/shared/types/paywall';

interface PaywallCtaProps {
  trigger: PaywallTrigger;
  onClick: () => void;
  variant?: 'card' | 'inline';
}

// kebab-case trigger -> camelCase i18n key segment.
function triggerToKey(trigger: PaywallTrigger): string {
  return trigger
    .split('-')
    .map((part, i) =>
      i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
}

export function PaywallCta({
  trigger,
  onClick,
  variant = 'card',
}: PaywallCtaProps) {
  const t = useTranslations('paywall');
  const ref = useRef<HTMLDivElement>(null);
  const fired = useRef(false);

  // Fire-once-per-mount impression event on first viewport entry.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!ref.current) return;
    if (fired.current) return;
    const target = ref.current;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !fired.current) {
          fired.current = true;
          trackEvent(AnalyticsEvent.PAYWALL_CTA_VIEWED, { trigger, variant });
          obs.disconnect();
          break;
        }
      }
    });
    obs.observe(target);
    return () => obs.disconnect();
  }, [trigger, variant]);

  const triggerKey = triggerToKey(trigger);
  const title =
    trigger === 'generic'
      ? t('title')
      : t(`contextualTitles.${triggerKey}` as 'contextualTitles.essay');
  const subline =
    trigger === 'generic'
      ? t('subtitle')
      : t(`cta.subline.${triggerKey}` as 'cta.subline.celticCross');
  const ctaLabel = t('cta.ctaLabel');
  const eyebrow = t('cta.eyebrow');

  if (variant === 'inline') {
    return (
      <div
        ref={ref}
        data-variant="inline"
        className="flex flex-wrap items-center gap-3 rounded-lg border border-white/8 px-4 py-3"
        style={{ background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="flex-1 min-w-0">
          <p
            className="text-sm text-white/80"
            style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}
          >
            {title}
          </p>
          <p className="text-xs text-white/45 mt-0.5">{subline}</p>
        </div>
        <button
          type="button"
          onClick={onClick}
          aria-haspopup="dialog"
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          style={{
            background: 'linear-gradient(135deg, #FFD700, #FFE033)',
            color: '#0A0A0F',
          }}
        >
          {ctaLabel}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-variant="card"
      className="rounded-xl border border-white/8 p-6 text-center space-y-3"
      style={{ background: 'rgba(255,255,255,0.025)' }}
    >
      <p className="text-[11px] tracking-[0.2em] uppercase text-[#FFD700]/60">
        {eyebrow}
      </p>
      <h3
        className="text-xl font-light text-white"
        style={{ fontFamily: "var(--font-crimson-pro, Georgia, serif)" }}
      >
        {title}
      </h3>
      <p className="text-sm text-white/65 leading-relaxed max-w-sm mx-auto">
        {subline}
      </p>
      <button
        type="button"
        onClick={onClick}
        aria-haspopup="dialog"
        className="mt-2 w-full max-w-xs mx-auto block py-3 px-6 rounded-xl text-sm font-semibold tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        style={{
          background: 'linear-gradient(135deg, #FFD700, #FFE033)',
          color: '#0A0A0F',
        }}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
