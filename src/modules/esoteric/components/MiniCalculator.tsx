'use client';

/**
 * MiniCalculator — inline widget: "Is YOUR Sun in sidereal {sign}?"
 *
 * Client Component. Accepts a birth date, calls /api/chart/calculate
 * for just the Sun position, and shows whether the user's sidereal Sun
 * is in the target sign. Renders a CTA to the full chart on match.
 *
 * Intentionally minimal — no time/location required for Sun-only calculation.
 * The API endpoint handles this with a noon birth time for the given date.
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface SunResult {
  sign: string;
  degree: number;
  minutes: number;
}

type Status = 'idle' | 'loading' | 'match' | 'no-match' | 'error';

interface MiniCalculatorProps {
  sign: string;
}

export function MiniCalculator({ sign }: MiniCalculatorProps) {
  const t = useTranslations('essayDetail.calc');
  const [birthDate, setBirthDate] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<SunResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleCalculate = useCallback(async () => {
    if (!birthDate) return;

    setStatus('loading');
    setResult(null);
    setErrorMsg('');

    try {
      const response = await fetch('/api/chart/sun-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: birthDate }),
      });

      if (!response.ok) {
        if (response.status === 503) {
          throw new Error(t('errService'));
        }
        throw new Error(t('errCalc'));
      }

      const data = (await response.json()) as SunResult;
      setResult(data);
      setStatus(data.sign === sign ? 'match' : 'no-match');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : t('errGeneric'));
    }
  }, [birthDate, sign, t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') void handleCalculate();
    },
    [handleCalculate],
  );

  const handleReset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setBirthDate('');
    setErrorMsg('');
  }, []);

  return (
    <section
      aria-labelledby="mini-calc-heading"
      className="rounded-xl border border-white/10 px-5 py-5"
      style={{ background: 'rgba(255,255,255,0.03)' }}
    >
      <h2
        id="mini-calc-heading"
        className="text-sm font-semibold text-white/90 mb-1 font-[var(--font-geist-sans)]"
      >
        {t('heading', { sign })}
      </h2>
      <p className="text-xs text-white/40 mb-4 font-[var(--font-geist-sans)]">
        {t('subheading')}
      </p>

      {(status === 'idle' || status === 'error') && (
        <div className="flex flex-col sm:flex-row gap-2">
          <label htmlFor="mini-calc-date" className="sr-only">
            {t('birthDateLabel')}
          </label>
          <input
            id="mini-calc-date"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            onKeyDown={handleKeyDown}
            max={new Date().toISOString().split('T')[0]}
            className="flex-1 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm text-white/85 font-[var(--font-geist-mono)] placeholder:text-white/30 focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/15 transition-colors"
            aria-describedby={status === 'error' ? 'mini-calc-error' : undefined}
          />
          <button
            type="button"
            onClick={() => void handleCalculate()}
            disabled={!birthDate}
            className="shrink-0 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white/85 font-[var(--font-geist-sans)] transition-colors"
          >
            {t('submit')}
          </button>
        </div>
      )}

      {status === 'error' && (
        <p
          id="mini-calc-error"
          role="alert"
          className="mt-2 text-xs text-red-400/80 font-[var(--font-geist-sans)]"
        >
          {errorMsg}
        </p>
      )}

      {status === 'loading' && (
        <div
          role="status"
          aria-live="polite"
          aria-label={t('calculatingAria')}
          className="flex items-center gap-2 text-sm text-white/45 font-[var(--font-geist-sans)]"
        >
          <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
          {t('calculating')}
        </div>
      )}

      {status === 'match' && result && (
        <div role="status" aria-live="polite" className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-amber-400 text-lg leading-none mt-0.5" aria-hidden="true">
              ●
            </span>
            <div>
              <p className="text-sm font-medium text-white/90 font-[var(--font-geist-sans)]">
                {t.rich('matchHeading', {
                  sign: result.sign,
                  strong: (chunks) => <strong className="text-amber-400">{chunks}</strong>,
                })}
                <span className="ml-2 text-xs text-white/40 font-[var(--font-geist-mono)]">
                  {result.degree}°{result.minutes.toString().padStart(2, '0')}′
                </span>
              </p>
              <p className="mt-0.5 text-xs text-white/45 font-[var(--font-geist-sans)]">
                {t('matchSubtext')}
              </p>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Link
              href="/chart"
              className="rounded-lg bg-white/90 hover:bg-white text-[#0A0A0F] px-4 py-2 text-sm font-semibold font-[var(--font-geist-sans)] transition-colors"
            >
              {t('matchCta')}
            </Link>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-white/10 hover:border-white/20 px-4 py-2 text-sm text-white/50 hover:text-white/70 font-[var(--font-geist-sans)] transition-colors"
            >
              {t('tryAnother')}
            </button>
          </div>
        </div>
      )}

      {status === 'no-match' && result && (
        <div role="status" aria-live="polite" className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-white/30 text-lg leading-none mt-0.5" aria-hidden="true">
              ○
            </span>
            <div>
              <p className="text-sm text-white/70 font-[var(--font-geist-sans)]">
                {t.rich('noMatchHeading', {
                  actualSign: result.sign,
                  expectedSign: sign,
                  strong: (chunks) => <strong className="text-white/85">{chunks}</strong>,
                })}
                <span className="ml-2 text-xs text-white/35 font-[var(--font-geist-mono)]">
                  {result.degree}°{result.minutes.toString().padStart(2, '0')}′
                </span>
              </p>
              <p className="mt-0.5 text-xs text-white/40 font-[var(--font-geist-sans)]">
                {t('noMatchSubtext')}
              </p>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Link
              href="/chart"
              className="rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2 text-sm font-medium text-white/85 font-[var(--font-geist-sans)] transition-colors"
            >
              {t('noMatchCta')}
            </Link>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-white/10 hover:border-white/20 px-4 py-2 text-sm text-white/50 hover:text-white/70 font-[var(--font-geist-sans)] transition-colors"
            >
              {t('tryAnother')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
