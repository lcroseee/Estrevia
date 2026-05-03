'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

interface SunSignResult {
  sign: string;
  startDate: string;
  endDate: string;
  year: number;
  ayanamsa: string;
}

interface SunSignWidgetProps {
  /** The sign this page is about — used to decide whether to show cross-link. */
  currentSign: string;
  /** Intl locale string for date formatting (e.g. "en-US" or "es-419"). */
  localeStr: string;
}

/**
 * SunSignWidget — interactive date picker.
 * User enters their birth date; the widget calls /api/v1/sidereal/sun-sign
 * and displays the resulting sidereal sun sign with date range.
 * If the result differs from the current page's sign, it offers a cross-link.
 */
export function SunSignWidget({ currentSign, localeStr }: SunSignWidgetProps) {
  const t = useTranslations('siderealDates.common');
  const [date, setDate] = useState('');
  const [result, setResult] = useState<SunSignResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fmt = new Intl.DateTimeFormat(localeStr, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/v1/sidereal/sun-sign?date=${encodeURIComponent(date)}&ayanamsa=lahiri`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        if (res.status === 429) {
          setError(t('widgetRateLimited'));
        } else {
          setError(t('widgetError'));
          console.error('sun-sign API error:', body.error);
        }
      } else {
        const body = await res.json() as { success: boolean; data: SunSignResult; error: string | null };
        if (!body.success || !body.data) {
          setError(t('widgetError'));
          return;
        }
        setResult(body.data);
      }
    } catch {
      setError(t('widgetError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      aria-labelledby="sun-sign-widget-h2"
      className="my-8 rounded-lg border border-white/10 bg-white/[0.03] p-6"
    >
      <h2
        id="sun-sign-widget-h2"
        className="text-xl font-semibold text-white/90 mb-2"
        style={{ fontFamily: 'var(--font-geist-sans)' }}
      >
        {t('widgetH2')}
      </h2>
      <p className="text-sm text-white/55 mb-4">{t('widgetIntro')}</p>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50 uppercase tracking-wide">{t('widgetLabel')}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="rounded border border-white/15 bg-white/5 px-3 py-2 text-white/85 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !date}
          className="rounded bg-amber-600 px-5 py-2 text-sm font-medium text-zinc-950 transition hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? t('widgetLoading') : t('widgetSubmit')}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-400">
          {error}
        </p>
      )}

      {result && (
        <p className="mt-4 text-white/80">
          {t('widgetResult', {
            sign: t(`signs.${result.sign}`),
            startDate: fmt.format(new Date(result.startDate)),
            endDate: fmt.format(new Date(result.endDate)),
          })}
          {result.sign !== currentSign && (
            <>
              {' '}
              <Link
                href={`/sidereal-${result.sign}-dates`}
                className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
              >
                {t('widgetReadOther', { sign: t(`signs.${result.sign}`) })}
              </Link>
            </>
          )}
        </p>
      )}
    </section>
  );
}
