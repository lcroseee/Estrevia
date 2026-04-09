'use client';

import { useCallback, useId } from 'react';
import type { CitySearchResult } from '@/shared/types';
import { CityAutocomplete } from './CityAutocomplete';

interface BirthDataValues {
  name: string;
  date: string;
  time: string;
  knowsBirthTime: boolean;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

interface BirthDataFormStandaloneProps {
  values: BirthDataValues;
  onChange: (values: BirthDataValues) => void;
  disabled?: boolean;
  nameField?: boolean;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Controlled birth data form for synastry and other multi-form scenarios.
 * Unlike BirthDataForm, this does NOT submit to an API — it just manages form state.
 */
export function BirthDataFormStandalone({
  values,
  onChange,
  disabled = false,
  nameField = false,
}: BirthDataFormStandaloneProps) {
  const formId = useId();

  const update = useCallback(
    (patch: Partial<BirthDataValues>) => {
      onChange({ ...values, ...patch });
    },
    [values, onChange],
  );

  const handleCitySelect = useCallback(
    (city: CitySearchResult) => {
      onChange({
        ...values,
        latitude: city.latitude,
        longitude: city.longitude,
        timezone: city.timezone,
      });
    },
    [values, onChange],
  );

  const nameId = `${formId}-name`;
  const dateId = `${formId}-date`;
  const timeId = `${formId}-time`;
  const timeToggleId = `${formId}-time-toggle`;

  return (
    <div className="space-y-4">
      {/* Name (optional) */}
      {nameField && (
        <div className="space-y-1.5">
          <label htmlFor={nameId} className="block text-sm font-medium text-white/70">
            Name
          </label>
          <input
            id={nameId}
            type="text"
            value={values.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Optional"
            disabled={disabled}
            className="w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-colors"
          />
        </div>
      )}

      {/* Date */}
      <div className="space-y-1.5">
        <label htmlFor={dateId} className="block text-sm font-medium text-white/70">
          Date of birth <span className="text-red-400" aria-hidden="true">*</span>
          <span className="sr-only">(required)</span>
        </label>
        <input
          id={dateId}
          type="date"
          value={values.date}
          max={todayStr()}
          onChange={(e) => update({ date: e.target.value })}
          disabled={disabled}
          required
          aria-required="true"
          className="w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2.5 text-sm text-white [color-scheme:dark] focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-colors"
        />
      </div>

      {/* Birth time toggle + input */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            id={timeToggleId}
            role="switch"
            aria-checked={values.knowsBirthTime}
            onClick={() => update({ knowsBirthTime: !values.knowsBirthTime })}
            disabled={disabled}
            className={[
              'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent',
              'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-white/20',
              values.knowsBirthTime ? 'bg-[#FFD700]/70' : 'bg-white/15',
            ].join(' ')}
            aria-label="I know the birth time"
          >
            <span
              className={[
                'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow',
                'transition-transform duration-200 ease-in-out',
                values.knowsBirthTime ? 'translate-x-4' : 'translate-x-0',
              ].join(' ')}
            />
          </button>
          <label htmlFor={timeToggleId} className="text-sm text-white/70 cursor-pointer">
            I know the birth time
          </label>
        </div>

        {values.knowsBirthTime && (
          <input
            id={timeId}
            type="time"
            value={values.time}
            onChange={(e) => update({ time: e.target.value })}
            disabled={disabled}
            className="w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2.5 text-sm text-white [color-scheme:dark] focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-colors"
          />
        )}
      </div>

      {/* City autocomplete */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-white/70">
          Birth place <span className="text-red-400" aria-hidden="true">*</span>
          <span className="sr-only">(required)</span>
        </label>
        <CityAutocomplete
          value=""
          onCitySelect={handleCitySelect}
          onChange={() => {
            // Reset coordinates if user edits
            if (values.latitude !== null) {
              update({ latitude: null, longitude: null, timezone: null });
            }
          }}
          placeholder="Start typing city name..."
          disabled={disabled}
        />
        {values.latitude !== null && (
          <p className="text-xs text-white/30">
            Location set ({values.latitude.toFixed(2)}, {values.longitude?.toFixed(2)})
          </p>
        )}
      </div>
    </div>
  );
}
