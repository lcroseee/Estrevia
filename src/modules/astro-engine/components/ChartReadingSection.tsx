'use client';

import { useCallback, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useSubscription } from '@/shared/hooks/useSubscription';
import { postJson } from '@/shared/lib/apiFetch';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import { PaywallCta } from '@/shared/components/PaywallCta';
import { PaywallModal } from '@/shared/components/PaywallModal';
import { Planet, type ChartResult } from '@/shared/types';

interface ChartReadingSectionProps {
  chartId: string;
  chart: ChartResult;
}

interface InterpretResponse {
  success: boolean;
  data: { reading: string; source: 'cache' | 'generated' } | null;
  error: string | null;
}

export function ChartReadingSection({ chartId, chart }: ChartReadingSectionProps) {
  const t = useTranslations('chartReading');
  const locale = useLocale() as 'en' | 'es';
  const pathname = usePathname();
  const { isPro, isLoading: subLoading } = useSubscription();

  const [reading, setReading] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const sun = chart.planets.find((p) => p.planet === Planet.Sun);
  const moon = chart.planets.find((p) => p.planet === Planet.Moon);
  // Derive Ascendant sign from the 1st house cusp (when houses are present).
  // HouseCusp already carries the resolved sign, so no longitude->sign mapping
  // is needed here.
  const hasHouses = Array.isArray(chart.houses) && chart.houses.length > 0;
  const ascSign = hasHouses ? chart.houses![0].sign : null;

  const handleGenerate = useCallback(async () => {
    if (!isPro) return;
    setIsGenerating(true);
    setError(null);

    const result = await postJson<InterpretResponse>(
      '/api/v1/chart/interpret',
      { chartId, locale },
    );
    setIsGenerating(false);

    switch (result.kind) {
      case 'ok':
        if (result.data?.success && result.data.data?.reading) {
          setReading(result.data.data.reading);
          trackEvent(AnalyticsEvent.CHART_READING_GENERATED, {
            chartId,
            source: result.data.data.source,
            locale,
          });
        } else {
          setError(t('errorGeneric'));
        }
        break;
      case 'error':
        if (result.status === 429) setError(t('errorRateLimit'));
        else if (result.status === 404) setError(t('errorNotFound'));
        else setError(t('errorGeneric'));
        break;
      case 'network-error':
        setError(t('errorNetwork'));
        break;
      case 'auth-required':
        // Should never happen for Pro user, but be defensive
        setError(t('errorGeneric'));
        break;
    }
  }, [isPro, chartId, locale, t]);

  if (subLoading) {
    return (
      <section
        data-testid="chart-reading-skeleton"
        className="rounded-xl border border-white/8 p-6"
        style={{ background: 'rgba(255,255,255,0.02)' }}
        aria-busy="true"
      >
        <div className="h-4 w-32 rounded bg-white/8 animate-pulse mb-3" />
        <div className="h-3 w-48 rounded bg-white/6 animate-pulse mb-2" />
        <div className="h-3 w-40 rounded bg-white/6 animate-pulse" />
      </section>
    );
  }

  return (
    <section
      data-testid="chart-reading-section"
      className="space-y-4"
      aria-labelledby="chart-reading-heading"
    >
      {/* Header */}
      <div className="space-y-1">
        <p className="text-[11px] tracking-[0.2em] uppercase text-[#FFD700]/60">
          {t('eyebrow')}
        </p>
        <h2
          id="chart-reading-heading"
          className="text-xl font-light text-white/95"
          style={{ fontFamily: "var(--font-crimson-pro, Georgia, serif)" }}
        >
          {t('heading')}
        </h2>
      </div>

      {/* Teaser — visible for all */}
      <div className="space-y-1.5">
        <p className="text-xs text-white/40 uppercase tracking-wider">
          {t('teaserSub')}
        </p>
        {sun && (
          <p className="text-sm text-white/80">
            <span aria-hidden="true" className="text-[#FFD700]/60">✦ </span>
            <strong className="font-semibold">{t('teaserSun', { sign: sun.sign })}</strong>
            {' — '}
            <span className="text-white/60">{t(`signOneLiners.${sun.sign}` as 'signOneLiners.Aries')}</span>
          </p>
        )}
        {moon && (
          <p className="text-sm text-white/80">
            <span aria-hidden="true" className="text-[#FFD700]/60">✦ </span>
            <strong className="font-semibold">{t('teaserMoon', { sign: moon.sign })}</strong>
            {' — '}
            <span className="text-white/60">{t(`signOneLiners.${moon.sign}` as 'signOneLiners.Aries')}</span>
          </p>
        )}
        {ascSign && (
          <p className="text-sm text-white/80">
            <span aria-hidden="true" className="text-[#FFD700]/60">✦ </span>
            <strong className="font-semibold">{t('teaserAscendant', { sign: ascSign })}</strong>
            {' — '}
            <span className="text-white/60">{t(`signOneLiners.${ascSign}` as 'signOneLiners.Aries')}</span>
          </p>
        )}
      </div>

      {/* State A: free user — locked preview + PaywallCta */}
      {!isPro && (
        <>
          <div
            aria-hidden="true"
            className="rounded-lg border border-white/6 p-4 text-sm text-white/70 select-none"
            style={{ background: 'rgba(255,255,255,0.02)', filter: 'blur(3px)' }}
          >
            Mercury · Venus · Mars · Jupiter · Saturn · Uranus · Neptune · Pluto · N. Node · Chiron
            {hasHouses ? ' + 12 houses' : ''} + top 3 aspects woven into a personal synthesis…
          </div>
          <p className="text-xs text-white/40 text-center">
            {hasHouses ? t('lockedLabelWithHouses') : t('lockedLabelNoHouses')}
          </p>
          <PaywallCta
            trigger="natal-chart"
            variant="card"
            onClick={() => setPaywallOpen(true)}
          />
        </>
      )}

      {/* State B: Pro, no reading yet — Generate button */}
      {isPro && !reading && (
        <button
          type="button"
          data-testid="generate-reading-btn"
          onClick={handleGenerate}
          disabled={isGenerating}
          aria-busy={isGenerating}
          className="w-full max-w-xs mx-auto block py-3 px-6 rounded-xl text-sm font-semibold tracking-wide transition-all disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          style={{
            background: 'linear-gradient(135deg, #FFD700, #FFE033)',
            color: '#0A0A0F',
          }}
        >
          {isGenerating ? t('generating') : t('generateButton')}
        </button>
      )}

      {/* State C: Pro, reading present */}
      {isPro && reading && (
        <div
          data-testid="reading-body"
          aria-live="polite"
          className="rounded-xl border border-[#FFD700]/15 p-5"
          style={{ background: 'rgba(255,215,0,0.04)' }}
        >
          <p
            className="text-sm text-white/80 leading-relaxed whitespace-pre-line"
            style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}
          >
            {reading}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p
          role="alert"
          className="text-xs text-red-400/80 text-center"
        >
          {error}
        </p>
      )}

      {/* Paywall modal (mounted only when needed) */}
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        returnUrl={pathname ?? '/chart'}
        triggerContext="natal-chart"
      />
    </section>
  );
}
