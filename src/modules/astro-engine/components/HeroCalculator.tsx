'use client';

/**
 * HeroCalculator — landing-page hero calculator.
 *
 * Previously used `framer-motion` for entrance animations on the result
 * card and form. That cost ~35-55 KB gzipped on EVERY landing-page visit
 * (the motion library is imported at module scope, so it's in the initial
 * JS bundle regardless of whether the user ever triggers an animation).
 *
 * The animations here are trivially expressible with CSS keyframes:
 *   - Fade + rise on mount (form)
 *   - Fade + rise + scale on reveal (result card)
 *   - Staggered child fades with delays (glyph, heading, meta, CTAs)
 *
 * Pattern mirrors `LandingAnimations.tsx` in `(marketing)/` — also zero-dep.
 *
 * `prefers-reduced-motion` is respected via a media query in the injected
 * `<style>` that zeroes animations out. No `useReducedMotion` hook needed
 * because CSS media queries evaluate at render time by the user agent.
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
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

// ── Zero-dep CSS animation styles ─────────────────────────────────────────────
// Keyframe names are prefixed with `hc-` (HeroCalculator) to avoid collisions
// with `LandingAnimations`, which uses its own `data-animate` attribute
// selectors for a different pattern.
const HERO_CALC_STYLES = `
  @keyframes hc-fade-rise {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes hc-fade-rise-scale {
    from { opacity: 0; transform: translateY(12px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes hc-pop {
    from { opacity: 0; transform: scale(0.8); }
    to   { opacity: 1; transform: scale(1); }
  }

  .hc-form {
    animation: hc-fade-rise 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .hc-result-card {
    animation: hc-fade-rise-scale 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  /* Staggered child reveals inside the result card.
     Each child starts hidden (opacity 0) and runs its animation after
     a short delay so the eye tracks through them one at a time. */
  .hc-result-glyph,
  .hc-result-heading,
  .hc-result-meta,
  .hc-result-ctas {
    opacity: 0;
    animation-fill-mode: both;
  }
  .hc-result-glyph {
    animation: hc-pop 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.15s forwards;
  }
  .hc-result-heading {
    animation: hc-fade-rise 0.4s ease-out 0.25s forwards;
  }
  .hc-result-meta {
    animation: hc-fade-rise 0.4s ease-out 0.35s forwards;
  }
  .hc-result-ctas {
    animation: hc-fade-rise 0.4s ease-out 0.45s forwards;
  }

  /* Respect user motion preferences — no animation, show content instantly. */
  @media (prefers-reduced-motion: reduce) {
    .hc-form,
    .hc-result-card,
    .hc-result-glyph,
    .hc-result-heading,
    .hc-result-meta,
    .hc-result-ctas {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
    }
  }
`;

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
      <>
        <style>{HERO_CALC_STYLES}</style>
        <div
          key="result"
          className="w-full hc-result-card"
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

              <div
                className="text-6xl mb-2 hc-result-glyph"
                aria-hidden="true"
              >
                {glyph}
              </div>

              <h3
                className="text-3xl sm:text-4xl font-light text-white mb-1 hc-result-heading"
                style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              >
                {result.sunSign}
              </h3>

              <p
                className="text-sm text-white/40 mb-1 hc-result-meta"
                style={{ fontFamily: 'var(--font-geist-mono, monospace)' }}
              >
                {t('elementSign', { degree: result.sunDegree, element: elementLabel })}
              </p>
            </div>
          </div>

          {/* CTAs */}
          <div className="mt-4 flex flex-col sm:flex-row items-center gap-3 hc-result-ctas">
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
          </div>
        </div>
      </>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{HERO_CALC_STYLES}</style>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="w-full space-y-3 hc-form"
        aria-label={t('formAria')}
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
      </form>
    </>
  );
}
