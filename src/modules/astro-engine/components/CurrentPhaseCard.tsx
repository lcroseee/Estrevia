'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { MoonPhaseResponse } from '@/shared/types';
import { MoonPhaseSVG } from './MoonPhaseSVG';
import { ZodiacGlyph } from '@/shared/components/ZodiacGlyph';
import { phaseIdFromName } from './moon-types';

interface CurrentPhaseCardProps {
  data: MoonPhaseResponse;
}

/**
 * Format ISO date as "Apr 27, 2026" (en) or "27 abr 2026" (es).
 * Uses translated short month names so we don't depend on browser ICU
 * data for Spanish (which would yield "27 abr 2026" with a period).
 */
function formatShortDate(iso: string, locale: string, monthShort: (m: number) => string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = monthShort(d.getMonth() + 1);
  const year = d.getFullYear();
  if (locale === 'es') return `${day} ${month} ${year}`;
  return `${month} ${day}, ${year}`;
}

/**
 * Format ISO timestamp as "Apr 27, 06:06 PM" (en) or "27 abr, 18:06" (es).
 * 24h for Spanish (LATAM convention), 12h for English.
 */
function formatExitTime(iso: string, locale: string, monthShort: (m: number) => string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = monthShort(d.getMonth() + 1);
  if (locale === 'es') {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month}, ${hh}:${mm}`;
  }
  // English: 12h with AM/PM
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  const hh = String(h).padStart(2, '0');
  return `${month} ${day}, ${hh}:${mm} ${ampm}`;
}

export function CurrentPhaseCard({ data }: CurrentPhaseCardProps) {
  const t = useTranslations('moonPage');
  const locale = useLocale();
  const monthShort = (m: number) => t(`months.short.${m}`);
  const phaseLocalized = t(`phases.${phaseIdFromName(data.phase)}`);
  const hasSign = Boolean(data.moonSign);
  const hasExit = Boolean(data.signExitTime);

  return (
    <div
      className="rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-center gap-6"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Large SVG moon visualization */}
      <div className="flex-shrink-0">
        <MoonPhaseSVG
          illumination={data.illumination / 100}
          phaseAngle={data.angle}
          size={72}
        />
      </div>

      <div className="flex-1 text-center sm:text-left">
        {/* Phase name */}
        <h2
          className="text-2xl font-medium mb-1"
          style={{ fontFamily: 'var(--font-crimson-pro, serif)', color: '#E8E0D0' }}
        >
          {phaseLocalized}
        </h2>

        {/* Illumination bar */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="flex-1 h-1.5 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.1)' }}
            role="progressbar"
            aria-valuenow={Math.round(data.illumination)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('current.illuminationAria', { percent: Math.round(data.illumination) })}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${data.illumination}%`,
                background: 'linear-gradient(90deg, #C0A060, #F0D080)',
              }}
            />
          </div>
          <span
            className="text-sm tabular-nums flex-shrink-0"
            style={{ fontFamily: 'var(--font-geist-mono, monospace)', color: '#F0D080' }}
          >
            {Math.round(data.illumination)}%
          </span>
        </div>

        {/* Moon sign line — "Moon in ♋ Cancer · until Apr 24, 15:32" */}
        {hasSign && (
          <p
            aria-live="polite"
            className="text-sm mb-3 flex items-center justify-center sm:justify-start gap-1.5 flex-wrap"
            style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-geist-sans, sans-serif)' }}
          >
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>{t('current.moonIn')}</span>
            <ZodiacGlyph sign={data.moonSign} size={15} className="text-[#F0D080]" />
            <span style={{ color: '#E8E0D0' }}>{data.moonSign}</span>
            {hasExit && (
              <>
                <span aria-hidden="true" style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                <span style={{ color: 'rgba(255,255,255,0.35)' }}>{t('current.until')}</span>
                <span style={{ fontFamily: 'var(--font-geist-mono, monospace)', color: 'rgba(255,255,255,0.55)' }}>
                  {formatExitTime(data.signExitTime as string, locale, monthShort)}
                </span>
              </>
            )}
          </p>
        )}

        {/* Next events */}
        <div className="flex flex-col sm:flex-row gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>{t('current.nextNewMoon')} </span>
            <span style={{ fontFamily: 'var(--font-geist-mono, monospace)', color: 'rgba(255,255,255,0.65)' }}>
              {formatShortDate(data.nextNewMoon, locale, monthShort)}
            </span>
          </span>
          <span className="hidden sm:inline" style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
          <span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>{t('current.nextFullMoon')} </span>
            <span style={{ fontFamily: 'var(--font-geist-mono, monospace)', color: '#F0D080' }}>
              {formatShortDate(data.nextFullMoon, locale, monthShort)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
