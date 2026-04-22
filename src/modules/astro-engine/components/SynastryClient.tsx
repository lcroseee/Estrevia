'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { BirthDataFormStandalone } from './BirthDataFormStandalone';
import { SynastryResult } from './SynastryResult';
import { useSubscription } from '@/shared/hooks/useSubscription';
import { postJson } from '@/shared/lib/apiFetch';
import type { SynastryScores } from '@/modules/astro-engine/synastry-scoring';
import type { SynastryAspect } from '@/modules/astro-engine/synastry';

interface ChartSummary {
  sunSign: string | null;
  moonSign: string | null;
  ascendant: string | null;
  name: string | null;
}

interface SynastryData {
  id: string;
  aspects: SynastryAspect[];
  scores: SynastryScores;
  chart1Summary: ChartSummary;
  chart2Summary: ChartSummary;
}

interface BirthDataValues {
  name: string;
  date: string;
  time: string;
  knowsBirthTime: boolean;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

export function SynastryClient() {
  const t = useTranslations('synastry');
  const { isPro } = useSubscription();
  const pathname = usePathname();

  const [person1, setPerson1] = useState<BirthDataValues>({
    name: '',
    date: '',
    time: '12:00',
    knowsBirthTime: false,
    latitude: null,
    longitude: null,
    timezone: null,
  });

  const [person2, setPerson2] = useState<BirthDataValues>({
    name: '',
    date: '',
    time: '12:00',
    knowsBirthTime: false,
    latitude: null,
    longitude: null,
    timezone: null,
  });

  const [result, setResult] = useState<SynastryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgradeCta, setShowUpgradeCta] = useState(false);

  // AI Analysis state (Pro only)
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const handleCalculate = useCallback(async () => {
    // Validate both forms
    if (!person1.date || person1.latitude === null || person1.longitude === null) {
      setError(t('errorPerson1Incomplete'));
      return;
    }
    if (!person2.date || person2.latitude === null || person2.longitude === null) {
      setError(t('errorPerson2Incomplete'));
      return;
    }

    setError(null);
    setShowUpgradeCta(false);
    setIsLoading(true);

    const result = await postJson<{ success: boolean; data: SynastryData; error?: string }>(
      '/api/v1/synastry/calculate',
      {
        birthData1: {
          name: person1.name || undefined,
          date: person1.date,
          time: person1.knowsBirthTime ? person1.time : null,
          latitude: person1.latitude,
          longitude: person1.longitude,
          timezone: person1.timezone,
          houseSystem: person1.knowsBirthTime ? 'Placidus' : null,
        },
        birthData2: {
          name: person2.name || undefined,
          date: person2.date,
          time: person2.knowsBirthTime ? person2.time : null,
          latitude: person2.latitude,
          longitude: person2.longitude,
          timezone: person2.timezone,
          houseSystem: person2.knowsBirthTime ? 'Placidus' : null,
        },
      },
    );

    setIsLoading(false);

    switch (result.kind) {
      case 'ok': {
        if (!result.data.data) {
          setError(t('errorCalculation'));
          return;
        }
        setResult(result.data.data);
        return;
      }
      case 'auth-required': {
        window.location.href = `/sign-in?redirect_url=${encodeURIComponent(pathname)}`;
        return;
      }
      case 'error': {
        const payload = result.payload as { error?: string } | undefined;
        const serverError = payload?.error;
        if (result.status === 429 || serverError === 'FREE_LIMIT_REACHED') {
          setError(t('limitReached'));
          setShowUpgradeCta(true);
          return;
        }
        setError(t('errorCalculation'));
        return;
      }
      case 'network-error': {
        setError(t('errorCalculation'));
        return;
      }
    }
  }, [person1, person2, t, pathname]);

  const handleReset = useCallback(() => {
    setResult(null);
    setError(null);
    setAiAnalysis(null);
    setAnalyzeError(null);
    setShowUpgradeCta(false);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!result?.id || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);

    const apiResult = await postJson<{ success: boolean; data?: { analysis: string } }>(
      `/api/v1/synastry/${result.id}/analyze`,
      {},
    );

    setIsAnalyzing(false);

    switch (apiResult.kind) {
      case 'ok': {
        if (apiResult.data.data?.analysis) {
          setAiAnalysis(apiResult.data.data.analysis);
        } else {
          setAnalyzeError(t('analysisError'));
        }
        return;
      }
      case 'auth-required': {
        // Covers both unauthenticated and non-Pro users (requirePremium throws → Clerk redirect).
        window.location.href = `/sign-in?redirect_url=${encodeURIComponent(pathname)}`;
        return;
      }
      case 'error': {
        const payload = apiResult.payload as { error?: string } | undefined;
        if (apiResult.status === 401 || apiResult.status === 403 || payload?.error === 'UNAUTHORIZED') {
          // Non-Pro user hit the premium gate — redirect to pricing.
          window.location.href = `/pricing`;
          return;
        }
        setAnalyzeError(t('analysisError'));
        return;
      }
      case 'network-error': {
        setAnalyzeError(t('analysisError'));
        return;
      }
    }
  }, [result, isAnalyzing, t, pathname]);

  if (result) {
    return (
      <div className="min-h-[calc(100vh-4rem)] px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <SynastryResult
            id={result.id}
            scores={result.scores}
            aspects={result.aspects}
            chart1Summary={result.chart1Summary}
            chart2Summary={result.chart2Summary}
            onReset={handleReset}
          />

          {/* AI Analysis section — Pro only; separate from error handling added by Task 3 */}
          <section aria-labelledby="ai-analysis-heading" className="space-y-3">
            <h3
              id="ai-analysis-heading"
              className="text-sm font-medium text-white/60 uppercase tracking-wider"
            >
              {t('aiAnalysis')}
            </h3>

            {!aiAnalysis && isPro && (
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[#A78BFA]/20 text-[#A78BFA] hover:bg-[#A78BFA]/30 transition-colors disabled:opacity-50"
              >
                {isAnalyzing ? t('analyzing') : t('generateAnalysis')}
              </button>
            )}

            {!isPro && (
              <p className="text-xs text-white/40">
                {t('aiAnalysis')} &mdash; Pro feature.{' '}
                <a href="/pricing" className="text-[#FFD700]/70 hover:text-[#FFD700]">
                  {t('upgradeCta')}
                </a>
              </p>
            )}

            {aiAnalysis && (
              <p
                className="text-sm text-white/70 leading-relaxed whitespace-pre-line"
                style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}
              >
                {aiAnalysis}
              </p>
            )}

            {analyzeError && (
              <p className="text-xs text-red-400" role="alert">
                {analyzeError}
              </p>
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1
            className="text-2xl font-semibold text-white/90 tracking-tight"
            style={{ fontFamily: 'var(--font-geist-sans)' }}
          >
            {t('title')}
          </h1>
          <p className="text-sm text-white/40">
            {t('subtitle')}
          </p>
        </div>

        {/* Two birth data forms */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider">
              {t('person1')}
            </h2>
            <BirthDataFormStandalone
              values={person1}
              onChange={setPerson1}
              disabled={isLoading}
              nameField
            />
          </div>
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider">
              {t('person2')}
            </h2>
            <BirthDataFormStandalone
              values={person2}
              onChange={setPerson2}
              disabled={isLoading}
              nameField
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300"
          >
            {error}
            {showUpgradeCta && (
              <a
                href="/pricing"
                className="mt-2 inline-block px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-br from-[#FFD700]/90 to-[#FF8C00]/80 text-black"
              >
                {t('upgradeCta')}
              </a>
            )}
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          onClick={handleCalculate}
          disabled={isLoading}
          className={[
            'w-full rounded-xl px-6 py-3.5 text-sm font-semibold transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-[#FFD700]/40 focus:ring-offset-2 focus:ring-offset-[#0A0A0F]',
            isLoading
              ? 'bg-white/10 text-white/40 cursor-not-allowed'
              : [
                  'bg-gradient-to-br from-[#FFD700]/90 to-[#FF8C00]/80 text-black',
                  'hover:from-[#FFD700] hover:to-[#FF8C00] hover:shadow-lg hover:shadow-[#FFD700]/20',
                  'active:scale-[0.98]',
                ].join(' '),
          ].join(' ')}
          aria-busy={isLoading}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t('calculating')}
            </span>
          ) : (
            t('calculateButton')
          )}
        </button>

        <p className="text-center text-xs text-white/25">
          {t('footer')}
        </p>
      </div>
    </div>
  );
}
