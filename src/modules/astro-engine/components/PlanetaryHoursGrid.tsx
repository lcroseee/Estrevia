'use client';

import { useEffect, useState, useCallback, useTransition } from 'react';
import { Planet } from '@/shared/types';
import type { PlanetaryHour, PlanetaryHoursResponse, ApiResponse } from '@/shared/types';
import { PLANET_COLORS } from './PlanetGlyph';

// Unicode glyphs for the seven Chaldean planets
const PLANET_GLYPHS: Partial<Record<Planet, string>> = {
  Sun: '☉',
  Moon: '☽',
  Mercury: '☿',
  Venus: '♀',
  Mars: '♂',
  Jupiter: '♃',
  Saturn: '♄',
};

const PLANET_NAMES: Partial<Record<Planet, string>> = {
  Sun: 'Sun',
  Moon: 'Moon',
  Mercury: 'Mercury',
  Venus: 'Venus',
  Mars: 'Mars',
  Jupiter: 'Jupiter',
  Saturn: 'Saturn',
};

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDuration(startIso: string, endIso: string): string {
  const diffMin = Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000,
  );
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

type GeolocationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'error'; message: string }
  | { status: 'ready'; latitude: number; longitude: number; timezone: string };

interface HoursData {
  hours: PlanetaryHour[];
  currentHour: PlanetaryHour | null;
  sunrise: string;
  sunset: string;
}

export function PlanetaryHoursGrid() {
  const [geoState, setGeoState] = useState<GeolocationState>({ status: 'idle' });
  const [selectedDate, setSelectedDate] = useState<string>(
    toDateInputValue(new Date()),
  );
  const [hoursData, setHoursData] = useState<HoursData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Live tick so the "current hour" highlight stays in sync
  const [, setTick] = useState(0);

  const fetchHours = useCallback(
    async (latitude: number, longitude: number, timezone: string, date: string) => {
      setFetchError(null);
      try {
        const params = new URLSearchParams({
          latitude: String(latitude),
          longitude: String(longitude),
          timezone,
          date,
        });
        const res = await fetch(`/api/v1/hours?${params.toString()}`);
        if (!res.ok) {
          setFetchError('Could not load planetary hours. Please try again.');
          return;
        }
        const json: ApiResponse<PlanetaryHoursResponse> = await res.json();
        if (json.success && json.data) {
          setHoursData({
            hours: json.data.hours,
            currentHour: json.data.currentHour,
            sunrise: json.data.sunrise,
            sunset: json.data.sunset,
          });
        } else {
          setFetchError(json.error ?? 'Unknown error');
        }
      } catch {
        setFetchError('Network error. Check your connection and retry.');
      }
    },
    [],
  );

  // Request geolocation once on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoState({ status: 'denied' });
      return;
    }

    setGeoState({ status: 'loading' });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const state = { status: 'ready' as const, latitude, longitude, timezone };
        setGeoState(state);
        fetchHours(latitude, longitude, timezone, selectedDate);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when date changes (after geo is ready)
  useEffect(() => {
    if (geoState.status !== 'ready') return;
    fetchHours(geoState.latitude, geoState.longitude, geoState.timezone, selectedDate);
  }, [selectedDate, geoState, fetchHours]);

  // Minute-level tick to keep current-hour highlight live
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    startTransition(() => {
      setSelectedDate(e.target.value);
    });
  };

  // ── Geolocation denied ────────────────────────────────────────────────────
  if (geoState.status === 'denied') {
    return (
      <section
        aria-label="Planetary hours — location required"
        className="flex flex-col items-center justify-center py-16 text-center gap-4"
      >
        <span className="text-4xl" aria-hidden="true">🔒</span>
        <h2 className="text-lg font-medium text-white/80">Location access required</h2>
        <p className="text-sm text-white/50 max-w-xs leading-relaxed">
          Planetary hours are calculated for your exact location. Enable location access
          in your browser settings and refresh the page.
        </p>
      </section>
    );
  }

  // ── Loading geolocation ───────────────────────────────────────────────────
  if (geoState.status === 'loading' || geoState.status === 'idle') {
    return (
      <section
        aria-label="Loading planetary hours"
        aria-busy="true"
        className="flex flex-col items-center justify-center py-16 gap-4"
      >
        <div
          className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm text-white/40">Detecting location…</p>
      </section>
    );
  }

  // ── Geo error ────────────────────────────────────────────────────────────
  if (geoState.status === 'error') {
    return (
      <section
        aria-label="Location error"
        className="flex flex-col items-center justify-center py-16 text-center gap-4"
      >
        <span className="text-4xl" aria-hidden="true">⚠</span>
        <p className="text-sm text-white/50 max-w-xs">
          Could not determine your location. {geoState.message}
        </p>
      </section>
    );
  }

  const now = new Date();
  const isToday = selectedDate === toDateInputValue(now);

  return (
    <section aria-label="Planetary hours schedule">
      {/* ── Header & date picker ── */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-base font-medium text-white/90 font-[var(--font-geist-sans)]">
            Planetary Hours
          </h2>
          {hoursData && (
            <p className="text-xs text-white/40 font-[var(--font-geist-mono)] mt-0.5">
              Sunrise {formatTime(hoursData.sunrise)} · Sunset {formatTime(hoursData.sunset)}
            </p>
          )}
        </div>
        <label className="flex flex-col gap-0.5">
          <span className="sr-only">Select date</span>
          <input
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            max={toDateInputValue(new Date(now.getFullYear() + 1, 11, 31))}
            className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white/80 font-[var(--font-geist-mono)] focus:outline-none focus:ring-2 focus:ring-white/20 cursor-pointer transition-colors hover:bg-white/10"
            aria-label="Select date for planetary hours"
          />
        </label>
      </div>

      {/* ── Fetch error ── */}
      {fetchError && (
        <div
          role="alert"
          className="mb-4 px-4 py-3 rounded-md bg-red-900/20 border border-red-500/20 text-sm text-red-300"
        >
          {fetchError}
        </div>
      )}

      {/* ── Loading hours data ── */}
      {(isPending || (!hoursData && !fetchError)) && (
        <div
          aria-busy="true"
          aria-label="Loading hours"
          className="flex flex-col gap-2"
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-lg bg-white/5 animate-pulse"
              style={{ opacity: 1 - i * 0.04 }}
            />
          ))}
        </div>
      )}

      {/* ── Hours grid ── */}
      {hoursData && !isPending && (
        <div
          role="list"
          aria-label="24 planetary hours"
          className="flex flex-col gap-1.5"
        >
          {/* Sunrise marker */}
          <SunriseMarker time={hoursData.sunrise} label="Sunrise" />

          {hoursData.hours.map((hour, index) => {
            const isCurrent =
              isToday &&
              !!hoursData.currentHour &&
              hour.startTime === hoursData.currentHour.startTime;

            // Insert sunset marker before the first night hour
            const prevHour = hoursData.hours[index - 1];
            const showSunset =
              index > 0 && !hour.isDay && (prevHour?.isDay ?? false);

            return (
              <div key={`${hour.planet}-${hour.startTime}`}>
                {showSunset && (
                  <SunsetMarker time={hoursData.sunset} label="Sunset" />
                )}
                <HourRow hour={hour} isCurrent={isCurrent} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function HourRow({
  hour,
  isCurrent,
}: {
  hour: PlanetaryHour;
  isCurrent: boolean;
}) {
  const planet = hour.planet;
  const color = PLANET_COLORS[planet] ?? '#FFFFFF';
  const glyph = PLANET_GLYPHS[planet] ?? '★';
  const name = PLANET_NAMES[planet] ?? planet;
  const duration = formatDuration(hour.startTime, hour.endTime);

  return (
    <div
      role="listitem"
      aria-current={isCurrent ? 'true' : undefined}
      className={[
        'relative flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300',
        hour.isDay
          ? 'bg-amber-950/20 border border-amber-900/15'
          : 'bg-indigo-950/20 border border-indigo-900/15',
        isCurrent
          ? 'ring-1 shadow-lg'
          : 'hover:bg-white/5',
      ].join(' ')}
      style={
        isCurrent
          ? {
              boxShadow: `0 0 16px ${color}22, 0 0 0 1px ${color}44`,
              borderColor: `${color}44`,
            }
          : undefined
      }
      aria-label={`${name} hour — ${formatTime(hour.startTime)} to ${formatTime(hour.endTime)}, ${duration}${isCurrent ? ', current hour' : ''}`}
    >
      {/* Current hour glow strip */}
      {isCurrent && (
        <span
          className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full"
          style={{ background: color }}
          aria-hidden="true"
        />
      )}

      {/* Planet glyph */}
      <span
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full font-serif text-lg leading-none"
        style={{
          color,
          background: `${color}18`,
          border: `1px solid ${color}33`,
          boxShadow: isCurrent ? `0 0 8px ${color}44` : 'none',
        }}
        aria-hidden="true"
      >
        {glyph}
      </span>

      {/* Name */}
      <span
        className="w-20 text-sm font-medium font-[var(--font-geist-sans)] truncate"
        style={{ color: isCurrent ? color : `${color}CC` }}
      >
        {name}
      </span>

      {/* Time range */}
      <span className="flex-1 text-xs text-white/50 font-[var(--font-geist-mono)] tabular-nums">
        {formatTime(hour.startTime)}
        <span className="mx-1 text-white/25">–</span>
        {formatTime(hour.endTime)}
      </span>

      {/* Duration */}
      <span className="text-xs text-white/30 font-[var(--font-geist-mono)] tabular-nums w-12 text-right">
        {duration}
      </span>

      {/* Day/night badge */}
      <span
        className="text-[11px] w-4 text-center text-white/25"
        aria-hidden="true"
        title={hour.isDay ? 'Day hour' : 'Night hour'}
      >
        {hour.isDay ? '☀' : '☾'}
      </span>
    </div>
  );
}

function SunriseMarker({ time, label }: { time: string; label: string }) {
  return (
    <div
      className="flex items-center gap-2 py-1 my-1"
      aria-label={`${label} at ${formatTime(time)}`}
      role="separator"
    >
      <div className="flex-1 h-px bg-amber-500/20" />
      <span className="text-[11px] text-amber-400/60 font-[var(--font-geist-mono)] tracking-wider">
        ↑ {label} {formatTime(time)}
      </span>
      <div className="flex-1 h-px bg-amber-500/20" />
    </div>
  );
}

function SunsetMarker({ time, label }: { time: string; label: string }) {
  return (
    <div
      className="flex items-center gap-2 py-1 my-1"
      aria-label={`${label} at ${formatTime(time)}`}
      role="separator"
    >
      <div className="flex-1 h-px bg-indigo-500/20" />
      <span className="text-[11px] text-indigo-400/60 font-[var(--font-geist-mono)] tracking-wider">
        ↓ {label} {formatTime(time)}
      </span>
      <div className="flex-1 h-px bg-indigo-500/20" />
    </div>
  );
}
