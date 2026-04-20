'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { CityAutocomplete } from './CityAutocomplete';
import { DateInput } from './DateInput';
import type { CitySearchResult } from '@/shared/types';

// ── Sign glyphs & colors ──────────────────────────────────────────────────────
const SIGN_GLYPHS: Record<string, string> = {
  Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋',
  Leo: '♌', Virgo: '♍', Libra: '♎', Scorpio: '♏',
  Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓',
};

type ElementKey = 'Fire' | 'Earth' | 'Air' | 'Water';

const SIGN_ELEMENTS: Record<string, { element: ElementKey; color: string }> = {
  Aries:       { element: 'Fire',  color: '#FF6B35' },
  Leo:         { element: 'Fire',  color: '#FF6B35' },
  Sagittarius: { element: 'Fire',  color: '#FF6B35' },
  Taurus:      { element: 'Earth', color: '#8FBC8F' },
  Virgo:       { element: 'Earth', color: '#8FBC8F' },
  Capricorn:   { element: 'Earth', color: '#8FBC8F' },
  Gemini:      { element: 'Air',   color: '#87CEEB' },
  Libra:       { element: 'Air',   color: '#87CEEB' },
  Aquarius:    { element: 'Air',   color: '#87CEEB' },
  Cancer:      { element: 'Water', color: '#6495ED' },
  Scorpio:     { element: 'Water', color: '#6495ED' },
  Pisces:      { element: 'Water', color: '#6495ED' },
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface HeroResult {
  sunSign: string;
  sunDegree: number;
  chartId: string;
}

interface FormState {
  date: string;
  cityLabel: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

interface FormErrors {
  date?: string;
  city?: string;
  general?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Component ─────────────────────────────────────────────────────────────────
export function HeroCalculator() {
  const t = useTranslations('heroCalc');
  const [form, setForm] = useState<FormState>({
    date: '',
    cityLabel: '',
    latitude: null,
    longitude: null,
    timezone: null,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<HeroResult | null>(null);

  const handleCitySelect = useCallback((city: CitySearchResult) => {
    setForm((prev) => ({
      ...prev,
      cityLabel: city.name,
      latitude: city.latitude,
      longitude: city.longitude,
      timezone: city.timezone,
    }));
    setErrors((prev) => ({ ...prev, city: undefined }));
  }, []);

  const handleCityChange = useCallback((value: string) => {
    setForm((prev) => ({ ...prev, cityLabel: value }));
  }, []);

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    if (!form.date) {
      errs.date = t('errDateRequired');
    } else {
      const d = new Date(form.date);
      if (isNaN(d.getTime())) errs.date = t('errDateInvalid');
      else if (d > new Date()) errs.date = t('errDateFuture');
    }
    if (form.latitude === null || form.longitude === null) {
      errs.city = t('errCityRequired');
    }
    return errs;
  }, [form, t]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const errs = validate();
      if (Object.keys(errs).length > 0) {
        setErrors(errs);
        return;
      }
      setErrors({});
      setIsLoading(true);

      try {
        const res = await fetch('/api/v1/chart/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: form.date,
            // Use noon when time is unknown — midday Sun position for quick preview
            time: '12:00',
            knowsBirthTime: false,
            latitude: form.latitude,
            longitude: form.longitude,
            timezone: form.timezone,
            houseSystem: 'Placidus',
            ayanamsa: 'lahiri',
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErrors({ general: (data as { error?: string }).error ?? t('errCalcFailed') });
          return;
        }

        const json = await res.json() as { success: boolean; data: { chartId: string; chart: { planets: Array<{ planet: string; sign: string; signDegree: number }> } } | null };
        const sunPlanet = json.data?.chart?.planets?.find((p) => p.planet === 'Sun');

        if (!json.data || !sunPlanet) {
          setErrors({ general: t('errNoSunSign') });
          return;
        }

        setResult({
          sunSign: sunPlanet.sign,
          sunDegree: sunPlanet.signDegree,
          chartId: json.data.chartId,
        });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[HeroCalculator] submit failed:', err);
        }
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setErrors({
          general: offline ? t('errOffline') : t('errGeneric'),
        });
      } finally {
        setIsLoading(false);
      }
    },
    [form, validate, t]
  );

  // ── Result card ──────────────────────────────────────────────────────────
  if (result) {
    const signInfo = SIGN_ELEMENTS[result.sunSign];
    const glyph = SIGN_GLYPHS[result.sunSign] ?? '';
    const elementLabel = signInfo ? t(`elements.${signInfo.element}`) : '';

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="result"
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="w-full"
          role="region"
          aria-label={t('resultAria')}
          aria-live="polite"
        >
          {/* Result display */}
          <div
            className="relative rounded-2xl border border-white/8 overflow-hidden p-6 sm:p-8 text-center"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            {/* Subtle element-colored glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(ellipse 60% 40% at 50% 0%, ${signInfo?.color ?? '#FFD700'}18 0%, transparent 70%)`,
              }}
              aria-hidden="true"
            />

            <div className="relative">
              <p className="text-xs tracking-[0.2em] uppercase text-white/40 mb-3">
                {t('resultEyebrow')}
              </p>

              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="text-6xl mb-2"
                aria-hidden="true"
              >
                {glyph}
              </motion.div>

              <motion.h3
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.4 }}
                className="text-3xl sm:text-4xl font-light text-white mb-1"
                style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              >
                {result.sunSign}
              </motion.h3>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.4 }}
                className="text-sm text-white/40 mb-1"
                style={{ fontFamily: 'var(--font-geist-mono, monospace)' }}
              >
                {t('elementSign', { degree: result.sunDegree, element: elementLabel })}
              </motion.p>
            </div>
          </div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.4 }}
            className="mt-4 flex flex-col sm:flex-row items-center gap-3"
          >
            <Link
              href={`/chart?chartId=${result.chartId}`}
              className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#FFD700] text-[#0A0A0F] text-sm font-semibold tracking-wide hover:bg-[#FFE033] transition-colors"
            >
              {t('seeFullChart')}
              <span aria-hidden="true">→</span>
            </Link>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="w-full sm:w-auto px-6 py-3 rounded-xl border border-white/12 text-sm text-white/50 hover:text-white/80 hover:border-white/25 transition-colors"
            >
              {t('tryAnother')}
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <motion.form
      onSubmit={handleSubmit}
      noValidate
      className="w-full space-y-3"
      aria-label={t('formAria')}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {/* Date input */}
      <div>
        <label htmlFor="hero-date" className="sr-only">
          {t('dateLabel')}
        </label>
        <DateInput
          id="hero-date"
          value={form.date}
          max={todayStr()}
          onChange={(v) => {
            setForm((prev) => ({ ...prev, date: v }));
            setErrors((prev) => ({ ...prev, date: undefined }));
          }}
          aria-describedby={errors.date ? 'hero-date-error' : undefined}
          aria-invalid={!!errors.date}
          hasError={!!errors.date}
        />
        {errors.date && (
          <p id="hero-date-error" className="mt-1.5 text-xs text-red-400" role="alert">
            {errors.date}
          </p>
        )}
      </div>

      {/* City input */}
      <div>
        <CityAutocomplete
          value={form.cityLabel}
          onCitySelect={handleCitySelect}
          onChange={handleCityChange}
          placeholder={t('cityPlaceholder')}
          error={errors.city}
        />
      </div>

      {/* General error */}
      {errors.general && (
        <p className="text-xs text-red-400 text-center" role="alert">
          {errors.general}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#FFD700] text-[#0A0A0F] text-sm font-semibold tracking-wide hover:bg-[#FFE033] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        aria-busy={isLoading}
      >
        {isLoading ? (
          <>
            <span
              className="inline-block w-4 h-4 border-2 border-[#0A0A0F]/30 border-t-[#0A0A0F] rounded-full animate-spin"
              aria-hidden="true"
            />
            {t('submitting')}
          </>
        ) : (
          <>
            <span aria-hidden="true">☉</span>
            {t('submit')}
          </>
        )}
      </button>

      <p className="text-center text-[11px] text-white/25 leading-relaxed">
        {t('footer')}
      </p>
    </motion.form>
  );
}
