// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { ChartResult } from '@/shared/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

let searchParamsValue = new URLSearchParams();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => searchParamsValue,
}));

// next/dynamic drives the lazy ChartWheel import — stub it so the test never
// touches the ~250 KB SVG module.
vi.mock('next/dynamic', () => ({ default: () => () => null }));

vi.mock('../BirthDataForm', () => ({
  BirthDataForm: () => <div data-testid="birth-form-stub" />,
}));
vi.mock('../PositionTable', () => ({
  PositionTable: () => <div data-testid="position-table-stub" />,
}));
vi.mock('../PassportCard', () => ({ PassportCard: () => null }));
vi.mock('../ShareButton', () => ({ ShareButton: () => null }));
vi.mock('../AvatarSection', () => ({ AvatarSection: () => null }));
vi.mock('../ChartReadingSection', () => ({
  ChartReadingSection: () => <div data-testid="reading-stub" />,
}));
vi.mock('@/modules/astro-engine/passport', () => ({ generatePassport: () => null }));

import { ChartDisplay } from '../ChartDisplay';

function noHousesChart(): ChartResult {
  return {
    planets: [],
    houses: null,
    aspects: [],
    ascendant: null,
    midheaven: null,
    ayanamsa: 24.21,
    system: 'sidereal',
    houseSystem: 'Placidus', // schema transform persists Placidus even with no houses
    nodeType: 'mean',
    calculatedAt: '2026-07-11T00:00:00Z',
  } as unknown as ChartResult;
}

function stubCalcOk(chart: ChartResult) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ success: true, data: { chartId: 'c1', chart } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  replaceMock.mockClear();
  // ktb absent → time unknown
  searchParamsValue = new URLSearchParams(
    'bd=1990-06-15&lat=40.7128&lon=-74.006&place=New+York&tz=America/New_York',
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChartDisplay URL-param auto-calc (time unknown → time:null)', () => {
  it('sends time:null + houseSystem:null when ktb is absent', async () => {
    const fetchMock = stubCalcOk(noHousesChart());
    render(<ChartDisplay />);
    await waitFor(() => expect(screen.getByTestId('natal-chart-result')).toBeTruthy());

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.time).toBeNull();
    expect(body.houseSystem).toBeNull();
  });

  it('sends the real time + Placidus when ktb=1 and bt are present', async () => {
    searchParamsValue = new URLSearchParams(
      'bd=1990-06-15&bt=14:30&ktb=1&lat=40.7128&lon=-74.006&tz=America/New_York',
    );
    const fetchMock = stubCalcOk(noHousesChart());
    render(<ChartDisplay />);
    await waitFor(() => expect(screen.getByTestId('natal-chart-result')).toBeTruthy());

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.time).toBe('14:30');
    expect(body.houseSystem).toBe('Placidus');
  });

  it('houses:null → header shows noHouses WITHOUT the house-system name; houses checkbox absent', async () => {
    stubCalcOk(noHousesChart());
    render(<ChartDisplay />);
    await waitFor(() => expect(screen.getByTestId('natal-chart-result')).toBeTruthy());

    // Header <p> reads "Sidereal · noHouses" (t() echoes keys in this mock)
    expect(screen.getByText(/noHouses/)).toBeTruthy();
    expect(screen.queryByText(/Placidus/)).toBeNull();
    // Houses checkbox only renders when chart.houses exists (dormant path)
    expect(screen.queryByText('houses')).toBeNull();
    expect(screen.getByText('aspects')).toBeTruthy();
  });
});
