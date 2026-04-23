'use client';

import { useEffect, useRef } from 'react';
import { MoonPhaseSVG } from './MoonPhaseSVG';
import { ZodiacGlyph } from '@/shared/components/ZodiacGlyph';
import type { DayData } from './moon-types';

interface DayDetailPanelProps {
  day: DayData | null;
  year: number;
  month: number;
  onClose: () => void;
}

export function DayDetailPanel({ day, year, month, onClose }: DayDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!day) return;
    closeButtonRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [day, onClose]);

  if (!day) return null;

  const dateStr = new Date(year, month - 1, day.day).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-up panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Moon details for ${dateStr}`}
        className="fixed bottom-0 inset-x-0 z-50 bg-[#0F0F17] border-t border-white/8 rounded-t-2xl shadow-2xl shadow-black/60 max-h-[60vh] overflow-y-auto"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/15" aria-hidden="true" />
        </div>

        <div className="px-6 pt-2 pb-8">
          {/* Header + close */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3
                className="text-lg font-medium text-white/90"
                style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              >
                {day.phaseName}
              </h3>
              <p
                className="text-xs text-white/60 mt-0.5"
                style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
              >
                {dateStr}
              </p>
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Moon visualization */}
          <div className="flex items-center gap-6 mb-6">
            <MoonPhaseSVG
              illumination={day.illumination / 100}
              phaseAngle={day.angle}
              size={80}
            />
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="flex-1 h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.1)' }}
                  role="progressbar"
                  aria-valuenow={Math.round(day.illumination)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Illumination ${Math.round(day.illumination)}%`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${day.illumination}%`,
                      background: 'linear-gradient(90deg, #C0A060, #F0D080)',
                    }}
                  />
                </div>
                <span
                  className="text-sm tabular-nums flex-shrink-0"
                  style={{ fontFamily: 'var(--font-geist-mono, monospace)', color: '#F0D080' }}
                >
                  {Math.round(day.illumination)}%
                </span>
              </div>
              <p className="text-xs text-white/35" style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}>
                Illumination
              </p>
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            <DetailItem label="Phase" value={day.phaseName} />
            <DetailItem
              label="Phase angle"
              value={`${Math.round(day.angle)}°`}
              mono
            />
            <DetailItem
              label="Illumination"
              value={`${Math.round(day.illumination)}%`}
              mono
            />
            {day.moonSign ? (
              <div
                className="px-3 py-2.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <p
                  className="text-[10px] uppercase tracking-widest mb-1"
                  style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-geist-sans, sans-serif)' }}
                >
                  Moon sign
                </p>
                <p
                  className="text-sm flex items-center gap-2"
                  style={{ fontFamily: 'var(--font-geist-sans, sans-serif)', color: 'rgba(255,255,255,0.7)' }}
                >
                  <ZodiacGlyph sign={day.moonSign} size={16} className="text-[#F0D080]" />
                  <span>
                    {typeof day.moonDegree === 'number'
                      ? `${Math.floor(day.moonDegree % 30)}° ${day.moonSign}`
                      : day.moonSign}
                  </span>
                </p>
              </div>
            ) : (
              <DetailItem label="Moon sign" value="—" muted />
            )}
          </div>

          {/* Void of Course */}
          <div
            className="mt-4 px-4 py-3 rounded-xl border text-xs"
            style={{
              background: day.isVoidOfCourse ? 'rgba(240, 208, 128, 0.06)' : 'rgba(255,255,255,0.02)',
              borderColor: day.isVoidOfCourse ? 'rgba(240, 208, 128, 0.18)' : 'rgba(255,255,255,0.06)',
              color: day.isVoidOfCourse ? 'rgba(240,208,128,0.8)' : 'rgba(255,255,255,0.35)',
              fontFamily: 'var(--font-geist-sans, sans-serif)',
            }}
          >
            {day.isVoidOfCourse === true && 'Moon is void of course for part of this day.'}
            {day.isVoidOfCourse === false && 'Moon is not void of course today.'}
            {day.isVoidOfCourse === null && 'Void of course data not available for this month.'}
            {day.isVoidOfCourse === undefined && 'Void of course data not available for this month.'}
          </div>
        </div>
      </div>
    </>
  );
}

export function DetailItem({
  label,
  value,
  mono = false,
  muted = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className="px-3 py-2.5 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <p
        className="text-[10px] uppercase tracking-widest mb-1"
        style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-geist-sans, sans-serif)' }}
      >
        {label}
      </p>
      <p
        className="text-sm"
        style={{
          fontFamily: mono ? 'var(--font-geist-mono, monospace)' : 'var(--font-geist-sans, sans-serif)',
          color: muted ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.7)',
        }}
      >
        {value}
      </p>
    </div>
  );
}
