'use client';

import { useState, useCallback, useId } from 'react';
import type { ChartResult, CitySearchResult, HouseSystem } from '@/shared/types';
import { CityAutocomplete } from './CityAutocomplete';
import { DateInput } from './DateInput';
import { TimeInput } from './TimeInput';

interface FormValues {
  date: string;
  time: string;
  knowsBirthTime: boolean;
  cityLabel: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  houseSystem: HouseSystem;
}

interface FormErrors {
  date?: string;
  city?: string;
  general?: string;
}

interface BirthDataFormProps {
  onChartCalculated: (chart: ChartResult, chartId: string) => void;
}

// Get today's date in YYYY-MM-DD for the date input max attribute
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BirthDataForm({ onChartCalculated }: BirthDataFormProps) {
  const formId = useId();

  const [values, setValues] = useState<FormValues>({
    date: '',
    time: '12:00',
    knowsBirthTime: false,
    cityLabel: '',
    latitude: null,
    longitude: null,
    timezone: null,
    houseSystem: 'Placidus' as HouseSystem,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    if (!values.date) {
      errs.date = 'Birth date is required';
    } else {
      const d = new Date(values.date);
      if (isNaN(d.getTime())) errs.date = 'Invalid date';
      else if (d > new Date()) errs.date = 'Date cannot be in the future';
    }
    if (values.latitude === null || values.longitude === null) {
      errs.city = 'Please select a city from the list';
    }
    return errs;
  }, [values]);

  const handleCitySelect = useCallback((city: CitySearchResult) => {
    setValues((v) => ({
      ...v,
      cityLabel: `${city.name}, ${city.country}`,
      latitude: city.latitude,
      longitude: city.longitude,
      timezone: city.timezone,
    }));
    setErrors((e) => ({ ...e, city: undefined }));
  }, []);

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
        const body = {
          date: values.date,
          time: values.knowsBirthTime ? values.time : '12:00',
          latitude: values.latitude,
          longitude: values.longitude,
          timezone: values.timezone,
          houseSystem: values.knowsBirthTime ? values.houseSystem : null,
        };

        const res = await fetch('/api/v1/chart/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(data.error ?? `Server error ${res.status}`);
        }

        const data = await res.json() as { success: boolean; data: { chartId: string; chart: ChartResult } };
        if (!data.success || !data.data?.chart || !data.data?.chartId) {
          throw new Error('Invalid response from server');
        }

        onChartCalculated(data.data.chart, data.data.chartId);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Calculation failed. Please try again.';
        setErrors({ general: message });
      } finally {
        setIsLoading(false);
      }
    },
    [values, validate, onChartCalculated]
  );

  const dateId = `${formId}-date`;
  const timeId = `${formId}-time`;
  const timeToggleId = `${formId}-time-toggle`;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Birth data form for natal chart calculation"
      className="w-full max-w-md space-y-5"
    >
      {/* Date */}
      <div className="space-y-1.5">
        <label htmlFor={dateId} className="block text-sm font-medium text-white/70">
          Date of birth <span className="text-red-400" aria-hidden="true">*</span>
          <span className="sr-only">(required)</span>
        </label>
        <DateInput
          id={dateId}
          value={values.date}
          max={todayStr()}
          onChange={(v) => {
            setValues((prev) => ({ ...prev, date: v }));
            if (errors.date) setErrors((e2) => ({ ...e2, date: undefined }));
          }}
          aria-required={true}
          aria-invalid={!!errors.date}
          aria-describedby={errors.date ? `${dateId}-error` : undefined}
          hasError={!!errors.date}
        />
        {errors.date && (
          <p id={`${dateId}-error`} role="alert" className="text-xs text-red-400">
            {errors.date}
          </p>
        )}
      </div>

      {/* Birth time toggle + input */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            id={timeToggleId}
            role="switch"
            aria-checked={values.knowsBirthTime}
            onClick={() =>
              setValues((v) => ({ ...v, knowsBirthTime: !v.knowsBirthTime }))
            }
            className={[
              'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent',
              'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-white/20',
              values.knowsBirthTime ? 'bg-[#FFD700]/70' : 'bg-white/15',
            ].join(' ')}
            aria-label="I know my birth time"
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
            I know my birth time
          </label>
        </div>

        {values.knowsBirthTime && (
          <div>
            <label htmlFor={timeId} className="block text-sm font-medium text-white/70 mb-1.5">
              Time of birth
            </label>
            <TimeInput
              id={timeId}
              value={values.time}
              onChange={(v) => setValues((prev) => ({ ...prev, time: v }))}
            />
            <p className="mt-1 text-xs text-white/30">
              Houses and Ascendant are only calculated when birth time is known.
            </p>
          </div>
        )}
      </div>

      {/* City autocomplete */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-white/70">
          Birth place <span className="text-red-400" aria-hidden="true">*</span>
          <span className="sr-only">(required)</span>
        </label>
        <CityAutocomplete
          value={values.cityLabel}
          onCitySelect={handleCitySelect}
          onChange={(val) => {
            // If user edits manually, reset coordinates
            if (val !== values.cityLabel) {
              setValues((v) => ({
                ...v,
                cityLabel: val,
                latitude: null,
                longitude: null,
                timezone: null,
              }));
            }
          }}
          placeholder="Start typing city name..."
          disabled={isLoading}
          error={errors.city}
        />
      </div>

      {/* General error */}
      {errors.general && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300"
        >
          {errors.general}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        className={[
          'w-full rounded-xl px-6 py-3.5 text-sm font-semibold transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-[#FFD700]/40 focus:ring-offset-2 focus:ring-offset-[#0A0A0F]',
          isLoading
            ? 'bg-white/10 text-white/40 cursor-not-allowed'
            : [
                'bg-gradient-to-br from-[#FFD700]/90 to-[#FF8C00]/80 text-black',
                'hover:from-[#FFD700] hover:to-[#FF8C00] hover:shadow-lg hover:shadow-[#FFD700]/20',
                'active:scale-[0.98]',
              ].join(' '),
        ].join(' ')}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Calculating chart...
          </span>
        ) : (
          'Calculate Chart'
        )}
      </button>

      <p className="text-center text-xs text-white/25">
        Using Lahiri ayanamsa · Sidereal zodiac · Placidus houses
      </p>
    </form>
  );
}
