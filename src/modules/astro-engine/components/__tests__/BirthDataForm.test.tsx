// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BirthDataForm, type FormValues } from '../BirthDataForm';
import type { ChartResult } from '@/shared/types';

// ----- Module mocks ---------------------------------------------------------

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: {
    CHART_CALCULATED: 'chart_calculated',
  },
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isSignedIn: false }),
}));

// CityAutocomplete uses a server-side cities API; stub it out with a button
// that selects a fixed city, so the form can submit deterministically.
vi.mock('../CityAutocomplete', () => ({
  CityAutocomplete: ({
    onCitySelect,
  }: {
    onCitySelect: (city: {
      name: string;
      admin1?: string;
      country: string;
      latitude: number;
      longitude: number;
      timezone: string;
    }) => void;
  }) => (
    <button
      type="button"
      data-testid="select-city"
      onClick={() =>
        onCitySelect({
          name: 'London',
          admin1: 'England',
          country: 'United Kingdom',
          latitude: 51.5074,
          longitude: -0.1278,
          timezone: 'Europe/London',
        })
      }
    >
      Select London
    </button>
  ),
}));

vi.mock('../DateInput', () => ({
  DateInput: ({
    id,
    value,
    onChange,
  }: {
    id: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <input
      data-testid="date-input"
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('../TimePickerField', () => ({
  TimePickerField: ({
    id,
    value,
    onChange,
  }: {
    id: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <input
      data-testid="time-input"
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// ----- i18n messages --------------------------------------------------------

const enMessages = {
  birthDataForm: {
    formAria: 'Birth data form for natal chart calculation',
    dateLabel: 'Date of birth',
    dateRequired: 'Birth date is required',
    dateInvalid: 'Invalid date',
    dateFuture: 'Date cannot be in the future',
    knowsBirthTimeLabel: 'I know my birth time',
    timeLabel: 'Time of birth',
    timeHelper: 'Houses and Ascendant are only calculated when birth time is known.',
    cityLabel: 'Birth place',
    cityRequired: 'Please select a city from the list',
    cityPlaceholder: 'Start typing city name...',
    calcFailed: 'Calculation failed. Please try again.',
    submitting: 'Calculating chart...',
    submit: 'Calculate Chart',
    footer: 'Using Lahiri ayanamsa · Sidereal zodiac · Placidus houses',
    nameLabel: 'Name',
    nameOptional: 'Optional',
    requiredAria: '(required)',
    locationSet: 'Location set',
  },
};

// ----- Helpers --------------------------------------------------------------

function renderForm(onChartCalculated = vi.fn()) {
  return {
    onChartCalculated,
    ...render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <BirthDataForm onChartCalculated={onChartCalculated} />
      </NextIntlClientProvider>,
    ),
  };
}

function buildChartResult(): ChartResult {
  return {
    planets: [
      { planet: 'Sun', sign: 'Aries', longitude: 0, latitude: 0, speed: 1, isRetrograde: false, house: null },
      { planet: 'Moon', sign: 'Taurus', longitude: 30, latitude: 0, speed: 12, isRetrograde: false, house: null },
    ],
    houses: null,
    ascendant: null,
    midheaven: null,
    ayanamsa: 24,
    julianDay: 2450000,
    siderealTime: 0,
  } as unknown as ChartResult;
}

// Stub global fetch for /api/v1/chart/calculate
function stubFetchOk() {
  const chart = buildChartResult();
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ success: true, data: { chartId: 'chart-abc', chart } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function fillAndSubmit() {
  fireEvent.change(screen.getByTestId('date-input'), { target: { value: '1990-01-01' } });
  fireEvent.click(screen.getByTestId('select-city'));
  fireEvent.click(screen.getByRole('button', { name: 'Calculate Chart' }));
}

// ----- Tests ----------------------------------------------------------------

describe('BirthDataForm — Meta Pixel ViewContent companion', () => {
  beforeEach(() => {
    // Ensure window.fbq exists as a vi.fn() spy by default.
    (window as unknown as { fbq: ReturnType<typeof vi.fn> }).fbq = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as { fbq?: unknown }).fbq;
    vi.clearAllMocks();
  });

  it('fires fbq ViewContent on chart calculation', async () => {
    stubFetchOk();
    const onChartCalculated = vi.fn<(chart: ChartResult, id: string, vals: FormValues) => void>();
    renderForm(onChartCalculated);

    await fillAndSubmit();

    await waitFor(() => {
      expect(onChartCalculated).toHaveBeenCalled();
    });

    expect((window as unknown as { fbq: ReturnType<typeof vi.fn> }).fbq).toHaveBeenCalledWith(
      'track',
      'ViewContent',
      { content_type: 'natal_chart' },
    );
  });

  it('is a no-op when window.fbq is undefined (Pixel script not loaded)', async () => {
    stubFetchOk();
    // Simulate Pixel script not loaded (e.g. NEXT_PUBLIC_META_PIXEL_ID unset).
    delete (window as unknown as { fbq?: unknown }).fbq;

    const onChartCalculated = vi.fn<(chart: ChartResult, id: string, vals: FormValues) => void>();
    renderForm(onChartCalculated);

    await fillAndSubmit();

    await waitFor(() => {
      expect(onChartCalculated).toHaveBeenCalled();
    });

    // No throw, no fbq side effect.
    expect((window as unknown as { fbq?: unknown }).fbq).toBeUndefined();
  });
});
