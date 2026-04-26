'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { PlanetaryHour } from '@/shared/types';
import type { PlanetaryHoursResponse, ApiResponse } from '@/shared/types';
import { PLANET_COLORS } from './PlanetGlyph';
import { Planet } from '@/shared/types';

// Unicode glyphs for Chaldean planets only (non-SVG bar context)
const PLANET_GLYPHS: Partial<Record<Planet, string>> = {
  Sun: '☉',
  Moon: '☽',
  Mercury: '☿',
  Venus: '♀',
  Mars: '♂',
  Jupiter: '♃',
  Saturn: '♄',
};

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

type GeolocationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'error'; message: string }
  | { status: 'ready'; latitude: number; longitude: number; timezone: string };

export function PlanetaryHourBar() {
  const router = useRouter();
  const t = useTranslations('hourBar');
  const [geoState, setGeoState] = useState<GeolocationState>({ status: 'idle' });
  const [currentHour, setCurrentHour] = useState<PlanetaryHour | null>(null);
  const [, setTick] = useState(0);

  const formatTimeRemaining = useCallback(
    (endTime: string): string => {
      const end = new Date(endTime).getTime();
      const now = Date.now();
      const diffMs = end - now;

      if (diffMs <= 0) return t('ending');

      const totalMinutes = Math.floor(diffMs / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      if (hours > 0) {
        return t('hoursLeft', { hours, minutes });
      }
      return t('minutesLeft', { count: minutes });
    },
    [t],
  );

  const fetchHours = useCallback(
    async (latitude: number, longitude: number, timezone: string) => {
      try {
        const now = new Date();
        const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const params = new URLSearchParams({
          latitude: String(latitude),
          longitude: String(longitude),
          timezone,
          date,
        });
        const res = await fetch(`/api/v1/hours?${params.toString()}`);
        if (!res.ok) return;
        const json: ApiResponse<PlanetaryHoursResponse> = await res.json();
        if (json.success && json.data?.currentHour) {
          setCurrentHour(json.data.currentHour);
        }
      } catch {
        // Silent failure — bar hides gracefully
      }
    },
    [],
  );

  // Request geolocation on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoState({ status: 'denied' });
      return;
    }

    setGeoState({ status: 'loading' });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        // Best-effort timezone from browser
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        setGeoState({ status: 'ready', latitude, longitude, timezone });
        fetchHours(latitude, longitude, timezone);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeoState({ status: 'denied' });
        } else {
          setGeoState({ status: 'error', message: err.message });
        }
      },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  }, [fetchHours]);

  // Progress through current hour (0-1)
  const [progress, setProgress] = useState(0);

  // Re-fetch when current hour expires; update countdown every minute
  useEffect(() => {
    if (!currentHour) return;

    const endTime = new Date(currentHour.endTime).getTime();

    // Check how long until the hour ends — re-fetch slightly after
    const msUntilExpiry = endTime - Date.now() + 5000;

    const expiryTimer = setTimeout(() => {
      if (geoState.status === 'ready') {
        fetchHours(geoState.latitude, geoState.longitude, geoState.timezone);
      }
    }, msUntilExpiry);

    // Minute-level tick for countdown display
    const minuteTick = setInterval(() => {
      setTick((t) => t + 1);
    }, 60_000);

    return () => {
      clearTimeout(expiryTimer);
      clearInterval(minuteTick);
    };
  }, [currentHour, geoState, fetchHours]);

  // Progress bar tick — updates every second
  useEffect(() => {
    if (!currentHour) return;

    function updateProgress() {
      const start = new Date(currentHour!.startTime).getTime();
      const end = new Date(currentHour!.endTime).getTime();
      const now = Date.now();
      const elapsed = Math.max(0, Math.min(1, (now - start) / (end - start)));
      setProgress(elapsed);
    }

    updateProgress();
    const interval = setInterval(updateProgress, 1000);
    return () => clearInterval(interval);
  }, [currentHour]);

  const handleClick = () => {
    router.push('/hours');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  // Denied state
  if (geoState.status === 'denied') {
    return (
      <button
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-white/40 hover:text-white/60 transition-colors cursor-pointer"
        aria-label={t('enableLocationAria')}
        title={t('enableLocationTitle')}
      >
        {/* Clock icon — visible on all viewports */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 15 15" />
        </svg>
        {/* Label hidden on mobile, visible on sm+ */}
        <span className="hidden sm:inline font-[var(--font-geist-sans)] tracking-wide whitespace-nowrap">
          {t('label')}
        </span>
        {/* Tiny hint dot visible only on mobile so the button reads as interactive */}
        <span className="sm:hidden text-white/25 text-[10px] leading-none" aria-hidden="true">
          ?
        </span>
      </button>
    );
  }

  // Loading / idle / error
  if (!currentHour) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-md"
        aria-busy="true"
        aria-label={t('loadingAria')}
      >
        <span
          className="inline-block w-3.5 h-3.5 rounded-full border border-white/20 border-t-white/60 animate-spin"
          aria-hidden="true"
        />
        <span className="text-xs text-white/30 font-[var(--font-geist-sans)] tracking-wide">
          {t('label')}
        </span>
      </div>
    );
  }

  const planet = currentHour.planet;
  const color = PLANET_COLORS[planet] ?? '#FFFFFF';
  const glyph = PLANET_GLYPHS[planet] ?? '★';
  const timeLeft = formatTimeRemaining(currentHour.endTime);
  const startFmt = formatTime(currentHour.startTime);
  const endFmt = formatTime(currentHour.endTime);
  const planetName = t(`planets.${planet}` as 'planets.Sun');

  return (
    <button
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="group flex flex-col gap-0 rounded-md transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 overflow-hidden"
      style={{
        background: `${color}1A`, // 10% opacity background
        border: `1px solid ${color}33`,
      }}
      aria-label={t('ariaHour', { planet: planetName, timeLeft })}
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        {/* Planet glyph with subtle pulse on active hour */}
        <span
          className="font-serif text-base leading-none tabular-nums"
          style={{ color }}
          aria-hidden="true"
        >
          {glyph}
        </span>

        {/* Planet name + time remaining */}
        <span className="flex items-baseline gap-1.5 min-w-0">
          <span
            className="text-xs font-medium font-[var(--font-geist-sans)] tracking-wide shrink-0"
            style={{ color }}
          >
            {planetName}
          </span>
          {/* Time-range: hidden on mobile to save space */}
          <span className="hidden sm:inline text-xs text-white/50 font-[var(--font-geist-mono)] whitespace-nowrap">
            {startFmt}–{endFmt}
          </span>
          {/* Time remaining: compact on mobile ("42m"), fuller on sm+ */}
          <span
            className="text-xs text-white/35 font-[var(--font-geist-mono)] whitespace-nowrap hidden sm:inline"
            aria-hidden="true"
          >
            · {timeLeft}
          </span>
          {/* Mobile-only: just the compact time-left, no range */}
          <span
            className="sm:hidden text-xs text-white/35 font-[var(--font-geist-mono)] whitespace-nowrap"
            aria-hidden="true"
          >
            {timeLeft}
          </span>
        </span>

        {/* Day/night indicator */}
        <span
          className="text-[10px] text-white/30 hidden md:inline"
          aria-hidden="true"
        >
          {currentHour.isDay ? '☀' : '☾'}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="w-full h-[2px]"
        style={{ background: `${color}15` }}
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('ariaProgress', { percent: Math.round(progress * 100) })}
      >
        <div
          className="h-full transition-[width] duration-1000 ease-linear"
          style={{
            width: `${progress * 100}%`,
            background: color,
          }}
        />
      </div>
    </button>
  );
}
