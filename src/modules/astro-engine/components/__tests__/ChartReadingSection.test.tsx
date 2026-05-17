// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import React from 'react';
import {
  Planet,
  Sign,
  HouseSystem,
  type ChartResult,
  type PlanetPosition,
  type HouseCusp,
} from '@/shared/types';

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------
function planetPos(
  planet: Planet,
  sign: Sign,
  longitude: number,
  signDegree: number,
  house: number | null,
  isRetrograde = false,
): PlanetPosition {
  return {
    planet,
    absoluteDegree: longitude,
    tropicalDegree: longitude + 24,
    sign,
    signDegree,
    minutes: 0,
    seconds: 0,
    isRetrograde,
    speed: 1,
    house,
  };
}

function houseCusp(num: number, degree: number, sign: Sign): HouseCusp {
  return { house: num, degree, sign, signDegree: degree % 30 };
}

const ASC: PlanetPosition = planetPos(Planet.Ascendant, Sign.Aries, 0, 0, 1);
const MC: PlanetPosition = planetPos(Planet.Midheaven, Sign.Capricorn, 270, 0, 10);

const CHART_WITH_HOUSES: ChartResult = {
  system: 'sidereal',
  houseSystem: HouseSystem.Placidus,
  ayanamsa: 24,
  planets: [
    planetPos(Planet.Sun, Sign.Aries, 12, 12, 1),
    planetPos(Planet.Moon, Sign.Cancer, 95, 5, 4),
    planetPos(Planet.Mercury, Sign.Pisces, 340, 10, 12, true),
    planetPos(Planet.Venus, Sign.Taurus, 45, 15, 2),
    planetPos(Planet.Mars, Sign.Leo, 130, 10, 5),
    planetPos(Planet.Jupiter, Sign.Sagittarius, 250, 10, 9),
    planetPos(Planet.Saturn, Sign.Capricorn, 290, 20, 10),
    planetPos(Planet.Uranus, Sign.Aquarius, 310, 10, 11),
    planetPos(Planet.Neptune, Sign.Pisces, 345, 15, 12),
    planetPos(Planet.Pluto, Sign.Scorpio, 220, 10, 8),
    planetPos(Planet.NorthNode, Sign.Cancer, 100, 10, 4, true),
    planetPos(Planet.Chiron, Sign.Virgo, 160, 10, 6),
  ],
  houses: [
    houseCusp(1, 0, Sign.Aries),
    houseCusp(2, 30, Sign.Taurus),
    houseCusp(3, 60, Sign.Gemini),
    houseCusp(4, 90, Sign.Cancer),
    houseCusp(5, 120, Sign.Leo),
    houseCusp(6, 150, Sign.Virgo),
    houseCusp(7, 180, Sign.Libra),
    houseCusp(8, 210, Sign.Scorpio),
    houseCusp(9, 240, Sign.Sagittarius),
    houseCusp(10, 270, Sign.Capricorn),
    houseCusp(11, 300, Sign.Aquarius),
    houseCusp(12, 330, Sign.Pisces),
  ],
  aspects: [],
  ascendant: ASC,
  midheaven: MC,
  nodeType: 'mean',
  calculatedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
};

const CHART_NO_HOUSES: ChartResult = {
  ...CHART_WITH_HOUSES,
  houses: null,
  ascendant: null,
  midheaven: null,
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/en/chart',
}));

const makeT = () => {
  const t: ((key: string, params?: Record<string, string>) => string) & { has?: (k: string) => boolean } =
    (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);
  t.has = () => true;
  return t;
};

vi.mock('next-intl', () => ({
  useTranslations: () => makeT(),
  useLocale: () => 'en',
}));

const mockUseSubscription = vi.fn();
vi.mock('@/shared/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}));

vi.mock('@/shared/lib/analytics', () => ({
  trackEvent: vi.fn(),
  AnalyticsEvent: new Proxy({}, { get: (_, k) => String(k) }),
}));

const mockPostJson = vi.fn();
vi.mock('@/shared/lib/apiFetch', () => ({
  postJson: (...args: unknown[]) => mockPostJson(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

import { ChartReadingSection } from '../ChartReadingSection';

describe('ChartReadingSection', () => {
  it('renders skeleton while subscription is loading', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: true });
    const { container } = render(
      <ChartReadingSection chartId="abc" chart={CHART_WITH_HOUSES} />,
    );
    expect(container.querySelector('[data-testid="chart-reading-skeleton"]')).not.toBeNull();
  });

  it('free user with houses: teaser + PaywallCta visible, no Generate button', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { container, queryByRole } = render(
      <ChartReadingSection chartId="abc" chart={CHART_WITH_HOUSES} />,
    );
    expect(container.querySelector('[data-variant="card"]')).not.toBeNull();
    expect(queryByRole('button', { name: /generateButton/i })).toBeNull();
    // Locked-label-with-houses string is referenced
    expect(container.textContent).toContain('lockedLabelWithHouses');
  });

  it('free user without houses: locked-label-no-houses shown, no Ascendant teaser', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { container } = render(
      <ChartReadingSection chartId="abc" chart={CHART_NO_HOUSES} />,
    );
    expect(container.textContent).toContain('lockedLabelNoHouses');
    expect(container.textContent).not.toContain('teaserAscendant');
  });

  it('Pro user, no reading yet: Generate button visible, no PaywallCta', () => {
    mockUseSubscription.mockReturnValue({ isPro: true, isLoading: false });
    const { container, getByRole } = render(
      <ChartReadingSection chartId="abc" chart={CHART_WITH_HOUSES} />,
    );
    expect(container.querySelector('[data-variant="card"]')).toBeNull();
    expect(getByRole('button', { name: /generateButton/i })).toBeTruthy();
  });

  it('Generate click fires POST and sets reading', async () => {
    mockUseSubscription.mockReturnValue({ isPro: true, isLoading: false });
    mockPostJson.mockResolvedValueOnce({
      kind: 'ok',
      data: { success: true, data: { reading: 'You are Aries Sun...', source: 'generated' }, error: null },
    });
    const { getByRole, findByTestId } = render(
      <ChartReadingSection chartId="abc" chart={CHART_WITH_HOUSES} />,
    );

    await act(async () => {
      fireEvent.click(getByRole('button', { name: /generateButton/i }));
    });

    const body = await findByTestId('reading-body');
    expect(body.textContent).toContain('You are Aries Sun...');
    expect(mockPostJson).toHaveBeenCalledWith(
      '/api/v1/chart/interpret',
      expect.objectContaining({ chartId: 'abc', locale: 'en' }),
    );
  });

  it('shows errorRateLimit on 429', async () => {
    mockUseSubscription.mockReturnValue({ isPro: true, isLoading: false });
    mockPostJson.mockResolvedValueOnce({
      kind: 'error',
      status: 429,
      payload: { error: 'RATE_LIMITED' },
      message: 'rate limited',
    });
    const { getByRole, findByRole } = render(
      <ChartReadingSection chartId="abc" chart={CHART_WITH_HOUSES} />,
    );
    await act(async () => {
      fireEvent.click(getByRole('button', { name: /generateButton/i }));
    });
    const alert = await findByRole('alert');
    expect(alert.textContent).toContain('errorRateLimit');
  });

  it('opens paywall modal when free user clicks CTA button', () => {
    mockUseSubscription.mockReturnValue({ isPro: false, isLoading: false });
    const { container, getAllByRole } = render(
      <ChartReadingSection chartId="abc" chart={CHART_WITH_HOUSES} />,
    );
    const ctaButton = container.querySelector('[data-variant="card"] button') as HTMLButtonElement;
    expect(ctaButton).not.toBeNull();
    fireEvent.click(ctaButton);
    // PaywallModal renders as a role=dialog when open
    const dialogs = getAllByRole('dialog', { hidden: true });
    expect(dialogs.length).toBeGreaterThan(0);
  });
});
