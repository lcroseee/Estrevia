// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { ChartResult } from '@/shared/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Heavy children are irrelevant to the hydration behavior — stub the real
// modules. NOTE: PassportSection is defined INLINE in ChartDisplay.tsx (not a
// separate module), so it cannot be module-mocked; we assert on the result
// section's testid instead of a passport stub.
vi.mock('../ChartReadingSection', () => ({
  ChartReadingSection: () => <div data-testid="reading-stub" />,
}));
vi.mock('../BirthDataForm', () => ({
  BirthDataForm: () => <div data-testid="birth-form-stub" />,
}));
vi.mock('../PositionTable', () => ({
  PositionTable: () => <div data-testid="table-stub" />,
}));
vi.mock('../ChartWheel', () => ({
  ChartWheel: () => <div data-testid="wheel-stub" />,
}));
vi.mock('../AvatarSection', () => ({
  AvatarSection: () => <div data-testid="avatar-stub" />,
}));
vi.mock('@/modules/astro-engine/passport', () => ({
  generatePassport: () => null,
}));

import { ChartDisplay } from '../ChartDisplay';

const chartFixture = {
  planets: [],
  houses: null,
  aspects: [],
  ascendant: null,
  midheaven: null,
  ayanamsa: 24.21,
  system: 'sidereal',
  houseSystem: null,
  nodeType: 'true',
  calculatedAt: '2026-07-10T00:00:00Z',
} as unknown as ChartResult;

describe('ChartDisplay server hydration (P0-3)', () => {
  it('renders the result view (not the form) when initialChart is provided', () => {
    render(<ChartDisplay initialChart={chartFixture} initialChartId="abc123" />);
    // Form must NOT render when we hydrate a chart server-side.
    expect(screen.queryByTestId('birth-form-stub')).toBeNull();
    // Result section renders...
    expect(screen.getByTestId('natal-chart-result')).toBeTruthy();
    // ...including the AI reading section (needs both chart + chartId).
    expect(screen.getByTestId('reading-stub')).toBeTruthy();
  });

  it('renders the birth form when no initial props (unchanged default)', () => {
    render(<ChartDisplay />);
    expect(screen.getByTestId('birth-form-stub')).toBeTruthy();
    expect(screen.queryByTestId('natal-chart-result')).toBeNull();
  });
});
