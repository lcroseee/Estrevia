'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ChartResult } from '@/shared/types';
import type { PassportResponse } from '@/shared/types/api';
import { BirthDataForm } from './BirthDataForm';
import type { FormValues } from './BirthDataForm';
import dynamic from 'next/dynamic';

// Lazy-load ChartWheel — it's a large SVG component (~250 KB parsed) that's
// only needed on the 'wheel' tab after chart calculation. The skeleton div
// preserves layout space (aspect-ratio 1:1, maxWidth 520) to prevent CLS.
const ChartWheel = dynamic(
  () => import('./ChartWheel').then((m) => ({ default: m.ChartWheel })),
  {
    ssr: false,
    loading: () => (
      <div
        style={{ width: '100%', aspectRatio: '1 / 1', maxWidth: 520, margin: '0 auto' }}
        className="rounded-full animate-pulse bg-white/[0.04]"
        aria-hidden="true"
      />
    ),
  },
);
import { PositionTable } from './PositionTable';
import { PassportCard } from './PassportCard';
import { ShareButton } from './ShareButton';
import { AvatarSection } from './AvatarSection';
import { generatePassport } from '@/modules/astro-engine/passport';

type Tab = 'wheel' | 'table';

// ---------------------------------------------------------------------------
// Passport section — shown after chart is calculated
// ---------------------------------------------------------------------------
interface PassportSectionProps {
  chartId: string;
}

function PassportSection({ chartId }: PassportSectionProps) {
  const t = useTranslations('chartDisplay');
  const [passport, setPassport] = useState<PassportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreatePassport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/passport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId }),
      });
      const json = await response.json() as { success: boolean; data: PassportResponse | null; error: string | null };
      if (!json.success || !json.data) {
        setError(t('errCreate'));
        return;
      }
      setPassport(json.data);
    } catch {
      setError(t('errNetwork'));
    } finally {
      setIsLoading(false);
    }
  }, [chartId, t]);

  if (passport) {
    return (
      <section
        className="space-y-4"
        aria-label={t('passportSectionAria')}
        aria-live="polite"
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-sm font-semibold text-white/70 tracking-wide uppercase"
            style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
          >
            {t('passportSectionLabel')}
          </h2>
          <span
            className="text-xs text-white/30 font-mono"
            aria-label={t('rarityAria', { percent: passport.rarityPercent })}
          >
            {t('rarityDisplay', { percent: passport.rarityPercent })}
          </span>
        </div>
        <PassportCard passport={passport} />
        <ShareButton passportId={passport.id} passport={passport} />
      </section>
    );
  }

  return (
    <section aria-label={t('createPassportAria')}>
      <button
        type="button"
        onClick={handleCreatePassport}
        disabled={isLoading}
        className="flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: 'linear-gradient(135deg, rgba(255,215,0,0.12) 0%, rgba(255,165,0,0.08) 100%)',
          border: '1px solid rgba(255,215,0,0.2)',
          color: '#FFD700',
        }}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <>
            <SpinnerIcon />
            {t('creating')}
          </>
        ) : (
          <>
            <span aria-hidden="true" style={{ fontFamily: 'serif', fontSize: '1rem' }}>✦</span>
            {t('createButton')}
          </>
        )}
      </button>
      {error && (
        <p
          role="alert"
          className="mt-2 text-xs text-center text-red-400/80"
          style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
        >
          {error}
        </p>
      )}
      <p
        className="mt-2 text-[10px] text-center text-white/25"
        style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
      >
        {t('passportFooter')}
      </p>
    </section>
  );
}

function SpinnerIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function ChartDisplay() {
  const t = useTranslations('chartDisplay');
  const router = useRouter();
  const searchParams = useSearchParams();

  // Capture URL params at mount time — we read once for auto-calculation.
  // Storing in a ref keeps the useEffect dep array empty without eslint warnings.
  const mountParamsRef = useRef({
    bd: searchParams.get('bd'),
    bt: searchParams.get('bt'),
    ktb: searchParams.get('ktb'),
    lat: searchParams.get('lat'),
    lon: searchParams.get('lon'),
    place: searchParams.get('place'),
    tz: searchParams.get('tz'),
  });

  const hasInitialParams = !!(
    mountParamsRef.current.bd &&
    mountParamsRef.current.lat &&
    mountParamsRef.current.lon &&
    mountParamsRef.current.tz
  );

  const [chart, setChart] = useState<ChartResult | null>(null);
  const [chartId, setChartId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('wheel');
  const [showAspects, setShowAspects] = useState(true);
  const [showHouses, setShowHouses] = useState(true);
  // Start in loading state if URL params are present — avoids blank-form flash
  const [isAutoCalculating, setIsAutoCalculating] = useState(hasInitialParams);
  const [autoCalculateError, setAutoCalculateError] = useState<string | null>(null);

  // Auto-calculate from URL params on mount (enables reload persistence + share links).
  // Reads mountParamsRef so the effect dep array stays empty — intentionally mount-only.
  useEffect(() => {
    const { bd, bt, ktb, lat, lon, tz } = mountParamsRef.current;
    if (!bd || !lat || !lon || !tz) return;

    const knowsTime = ktb === '1' && !!bt;

    fetch('/api/v1/chart/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: bd,
        time: knowsTime ? bt : '12:00',
        latitude: parseFloat(lat),
        longitude: parseFloat(lon),
        timezone: tz,
        houseSystem: knowsTime ? 'Placidus' : null,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        return res.json() as Promise<{ success: boolean; data: { chartId: string; chart: ChartResult } }>;
      })
      .then((data) => {
        if (!data.success || !data.data?.chart || !data.data?.chartId) {
          throw new Error('Invalid response from server');
        }
        setChart(data.data.chart);
        setChartId(data.data.chartId);
        setActiveTab('wheel');
      })
      .catch(() => {
        setAutoCalculateError('Could not calculate chart. Please try again.');
      })
      .finally(() => {
        setIsAutoCalculating(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChartCalculated = useCallback(
    (result: ChartResult, id: string, formValues: FormValues) => {
      setChart(result);
      setChartId(id);
      setActiveTab('wheel');

      // Persist chart inputs in URL so the result survives page reload.
      // Also makes the chart shareable via URL (no PII in the database —
      // the URL stays in browser history only, not sent to any server).
      const params = new URLSearchParams();
      params.set('bd', formValues.date);
      if (formValues.knowsBirthTime && formValues.time) {
        params.set('bt', formValues.time);
        params.set('ktb', '1');
      }
      if (formValues.latitude !== null) params.set('lat', String(formValues.latitude));
      if (formValues.longitude !== null) params.set('lon', String(formValues.longitude));
      if (formValues.cityLabel) params.set('place', formValues.cityLabel);
      if (formValues.timezone) params.set('tz', formValues.timezone);

      router.replace(`/chart?${params.toString()}`, { scroll: false });

      // Scroll to chart on mobile
      setTimeout(() => {
        document.getElementById('chart-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    },
    [router],
  );

  const handleRecalculate = useCallback(() => {
    setChart(null);
    setChartId(null);
    setAutoCalculateError(null);
    // Clear URL params so the form shows blank on next render
    router.replace('/chart', { scroll: false });
  }, [router]);

  if (!chart) {
    // Show loading spinner while auto-calculating from URL params
    if (isAutoCalculating) {
      return (
        <div
          className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)]"
          aria-busy="true"
          aria-label="Calculating chart…"
        >
          <SpinnerIcon />
        </div>
      );
    }

    return (
      <section
        className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-10"
        aria-label={t('birthDataAria')}
      >
        {/* Decorative star field hint */}
        <div className="mb-8 text-center space-y-2">
          <div
            className="text-5xl text-[#FFD700]/20 font-serif leading-none select-none"
            aria-hidden="true"
          >
            ✦
          </div>
          <h1
            className="text-2xl font-semibold text-white/90 tracking-tight"
            style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
          >
            {t('h1')}
          </h1>
          <p className="text-sm text-white/40 max-w-xs mx-auto">
            {t('description')}
          </p>
        </div>
        {autoCalculateError && (
          <p
            role="alert"
            className="mb-4 text-sm text-red-400/80 text-center max-w-xs"
          >
            {autoCalculateError}
          </p>
        )}
        <BirthDataForm onChartCalculated={handleChartCalculated} />
      </section>
    );
  }

  const passport = useMemo(() => generatePassport(chart), [chart]);

  const tabs: [Tab, string][] = [
    ['wheel', t('tabWheel')],
    ['table', t('tabTable')],
  ];

  return (
    <section
      id="chart-result"
      data-testid="natal-chart-result"
      className="max-w-2xl mx-auto px-4 py-6 space-y-6"
      aria-label={t('resultAria')}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white/90">{t('headerTitle')}</h1>
          <p className="text-xs text-white/60 font-mono mt-0.5">
            {chart.system === 'sidereal' ? 'Sidereal' : 'Tropical'} · {chart.houseSystem}
            {!chart.houses && ` · ${t('noHouses')}`}
          </p>
        </div>
        <button
          type="button"
          data-testid="new-chart-btn"
          onClick={handleRecalculate}
          className="text-xs text-white/40 hover:text-white/70 transition-colors underline underline-offset-2"
        >
          {t('newChart')}
        </button>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label={t('tabsAria')}
        className="flex gap-1 p-1 rounded-xl bg-white/4 border border-white/6"
      >
        {tabs.map(([tab, label]) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`chart-panel-${tab}`}
            id={`chart-tab-${tab}`}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={[
              'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150',
              activeTab === tab
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-white/40 hover:text-white/70',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Wheel panel */}
      <div
        role="tabpanel"
        id="chart-panel-wheel"
        aria-labelledby="chart-tab-wheel"
        hidden={activeTab !== 'wheel'}
      >
        {/* Wheel controls */}
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-white/50 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAspects}
              onChange={(e) => setShowAspects(e.target.checked)}
              className="accent-[#FFD700] w-3.5 h-3.5 rounded cursor-pointer opacity-40 checked:opacity-100"
            />
            {t('aspects')}
          </label>
          {chart.houses && (
            <label className="flex items-center gap-2 text-xs text-white/50 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showHouses}
                onChange={(e) => setShowHouses(e.target.checked)}
                className="accent-[#FFD700] w-3.5 h-3.5 rounded cursor-pointer opacity-40 checked:opacity-100"
              />
              {t('houses')}
            </label>
          )}
        </div>

        <ChartWheel
          chart={chart}
          showAspects={showAspects}
          showHouses={showHouses}
        />
      </div>

      {/* Table panel */}
      <div
        role="tabpanel"
        id="chart-panel-table"
        aria-labelledby="chart-tab-table"
        hidden={activeTab !== 'table'}
      >
        <PositionTable chart={chart} />
      </div>

      {/* Passport section — shown after chart calculation */}
      {chartId && (
        <>
          <div
            className="h-px"
            style={{ background: 'rgba(255,255,255,0.06)' }}
            aria-hidden="true"
          />
          <PassportSection chartId={chartId} />
        </>
      )}

      {/* Avatar section — also requires a calculated chart */}
      <div
        className="h-px"
        style={{ background: 'rgba(255,255,255,0.06)' }}
        aria-hidden="true"
      />
      <AvatarSection passport={passport} />
    </section>
  );
}
