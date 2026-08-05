// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { FrameDeltaPanel } from '../FrameDeltaPanel';
import { Planet, Sign } from '@/shared/types/astrology';
import type { FrameDelta } from '../../frame-delta';
import en from '../../../../../messages/en.json';
import es from '../../../../../messages/es.json';

const wrap = (ui: React.ReactNode, locale: 'en' | 'es' = 'en') =>
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : es}>
      {ui}
    </NextIntlClientProvider>,
  );

const moonDelta: FrameDelta = {
  planet: Planet.Moon,
  siderealSign: Sign.Aquarius,
  tropicalSign: Sign.Pisces,
};

describe('FrameDeltaPanel', () => {
  it('states each delta in the founder framing', () => {
    wrap(<FrameDeltaPanel deltas={[moonDelta]} />);
    expect(screen.getByText(/incarnational Moon is in Pisces/)).toBeTruthy();
    expect(screen.getByText(/essential Moon is in Aquarius/)).toBeTruthy();
  });

  it('renders a real message rather than a blank panel when nothing differs', () => {
    wrap(<FrameDeltaPanel deltas={[]} />);
    expect(screen.getByText(en.chart.frameDelta.identical)).toBeTruthy();
  });

  it('explains the omission when only some bodies differ', () => {
    wrap(<FrameDeltaPanel deltas={[moonDelta]} />);
    expect(screen.getByText(en.chart.frameDelta.partial)).toBeTruthy();
  });

  it('drops the omission note when all three bodies differ', () => {
    wrap(
      <FrameDeltaPanel
        deltas={[
          { planet: Planet.Sun, siderealSign: Sign.Gemini, tropicalSign: Sign.Cancer },
          moonDelta,
          { planet: Planet.Ascendant, siderealSign: Sign.Virgo, tropicalSign: Sign.Libra },
        ]}
      />,
    );
    expect(screen.queryByText(en.chart.frameDelta.partial)).toBeNull();
  });

  it('carries the tropical/sidereal framing as the panel intro', () => {
    wrap(<FrameDeltaPanel deltas={[moonDelta]} />);
    expect(screen.getByText(en.chart.frameDelta.intro)).toBeTruthy();
  });

  it('renders in Spanish with the sign names left untranslated', () => {
    wrap(<FrameDeltaPanel deltas={[moonDelta]} />, 'es');
    expect(screen.getByText(/Luna encarnad[oa] está en Pisces/)).toBeTruthy();
    expect(screen.getByText(/Pisces/)).toBeTruthy();
    expect(screen.getByText(/Aquarius/)).toBeTruthy();
  });

  it('names the Ascendant correctly rather than falling back to Sun', () => {
    wrap(
      <FrameDeltaPanel
        deltas={[{ planet: Planet.Ascendant, siderealSign: Sign.Virgo, tropicalSign: Sign.Libra }]}
      />,
    );
    expect(screen.getByText(/incarnational Ascendant is in Libra/)).toBeTruthy();
  });
});
