// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { SynastryResult } from '../SynastryResult';
import type { SynastryPersonSummary } from '@/shared/types/synastry';
import en from '../../../../../messages/en.json';

const summary1: SynastryPersonSummary = {
  name: 'A',
  sunSign: 'Gemini', moonSign: 'Aquarius', ascendant: 'Virgo',
  tropicalSunSign: 'Cancer', tropicalMoonSign: 'Pisces', tropicalAscendant: 'Libra',
};
const summary2: SynastryPersonSummary = {
  name: 'B',
  sunSign: 'Leo', moonSign: 'Taurus', ascendant: 'Scorpio',
  tropicalSunSign: 'Virgo', tropicalMoonSign: 'Gemini', tropicalAscendant: 'Sagittarius',
};

const scores = {
  overall: 72,
  categories: [
    { category: 'emotional', score: 80, label: 'Emotional' },
    { category: 'communication', score: 65, label: 'Communication' },
  ],
} as never;

const aspects = [
  { planet1: 'Sun', planet2: 'Moon', type: 'Trine', orb: 1.2, score: 5 },
] as never;

function renderResult() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SynastryResult
        id="syn1"
        scores={scores}
        aspects={aspects}
        chart1Summary={summary1}
        chart2Summary={summary2}
        onReset={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

const toggle = () => screen.getByRole('button', { name: /Zodiac:/ });

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/synastry');
});

describe('SynastryResult zodiac frames', () => {
  it('shows sidereal Sun signs by default', () => {
    renderResult();
    expect(screen.getByText(/☉ Gemini/)).toBeTruthy();
    expect(screen.getByText(/☉ Leo/)).toBeTruthy();
  });

  it('shows tropical Sun signs after one press', () => {
    renderResult();
    fireEvent.click(toggle());
    expect(screen.getByText(/☉ Cancer/)).toBeTruthy();
    expect(screen.getByText(/☉ Virgo/)).toBeTruthy();
  });

  it('shows the pair in both mode', () => {
    renderResult();
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(screen.getByText(/Gemini \/ Cancer/)).toBeTruthy();
    expect(screen.getByText(/Leo \/ Virgo/)).toBeTruthy();
  });

  it('leaves the compatibility score untouched across all three states', () => {
    // The invariant this whole sub-project rests on: angular separation does
    // not change under a constant offset, so a moving score would be a bug.
    const { container } = renderResult();
    const score = () => container.querySelector('[data-testid="overall-score"]')?.textContent;
    const before = score();
    expect(before).toContain('72');

    for (let i = 0; i < 3; i++) {
      fireEvent.click(toggle());
      expect(score()).toBe(before);
    }
  });

  it('explains in both mode why the score did not move', () => {
    renderResult();
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(screen.getByText(en.synastry.zodiacFrame.invariantNote)).toBeTruthy();
  });

  it('does not show the invariance note outside both mode', () => {
    renderResult();
    expect(screen.queryByText(en.synastry.zodiacFrame.invariantNote)).toBeNull();
  });

  it('honours a frame chosen on /chart via localStorage', () => {
    window.localStorage.setItem('estrevia.zodiacFrame', 'tropical');
    renderResult();
    expect(screen.getByText(/☉ Cancer/)).toBeTruthy();
  });

  it('lets ?z win over localStorage', () => {
    window.localStorage.setItem('estrevia.zodiacFrame', 'tropical');
    window.history.replaceState({}, '', '/synastry?z=sid');
    renderResult();
    expect(screen.getByText(/☉ Gemini/)).toBeTruthy();
  });

  it('falls back to the sidereal label when a payload predates SP-B', () => {
    // Older cached responses carry no tropical fields; rendering a blank
    // would look like a bug rather than an old payload.
    const legacy = { ...summary1, tropicalSunSign: null, tropicalMoonSign: null };
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <SynastryResult
          id="syn2"
          scores={scores}
          aspects={aspects}
          chart1Summary={legacy}
          chart2Summary={summary2}
          onReset={() => {}}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: /Zodiac:/ })[0]!);
    expect(screen.getAllByText(/☉ Gemini/).length).toBeGreaterThan(0);
  });
});
