'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { BirthDataFormStandalone } from './BirthDataFormStandalone';
import { SynastryResult } from './SynastryResult';
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
    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/synastry/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      const data = (await res.json()) as {
        success: boolean;
        data: SynastryData;
      };

      if (!data.success || !data.data) {
        throw new Error('Invalid response');
      }

      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorCalculation'));
    } finally {
      setIsLoading(false);
    }
  }, [person1, person2, t]);

  const handleReset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  if (result) {
    return (
      <div className="min-h-[calc(100vh-4rem)] px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <SynastryResult
            id={result.id}
            scores={result.scores}
            aspects={result.aspects}
            chart1Summary={result.chart1Summary}
            chart2Summary={result.chart2Summary}
            onReset={handleReset}
          />
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
