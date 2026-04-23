'use client';

import type { MoonPhaseResponse } from '@/shared/types';
import { MoonPhaseSVG } from './MoonPhaseSVG';

interface CurrentPhaseCardProps {
  data: MoonPhaseResponse;
}

export function CurrentPhaseCard({ data }: CurrentPhaseCardProps) {
  const nextNew = new Date(data.nextNewMoon);
  const nextFull = new Date(data.nextFullMoon);

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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
          {data.phase}
        </h2>

        {/* Illumination bar */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="flex-1 h-1.5 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.1)' }}
            role="progressbar"
            aria-valuenow={Math.round(data.illumination)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Illumination ${Math.round(data.illumination)}%`}
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

        {/* Next events */}
        <div className="flex flex-col sm:flex-row gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>Next New Moon: </span>
            <span
              style={{ fontFamily: 'var(--font-geist-mono, monospace)', color: 'rgba(255,255,255,0.65)' }}
            >
              {formatDate(nextNew)}
            </span>
          </span>
          <span className="hidden sm:inline" style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
          <span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>Next Full Moon: </span>
            <span
              style={{ fontFamily: 'var(--font-geist-mono, monospace)', color: '#F0D080' }}
            >
              {formatDate(nextFull)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
