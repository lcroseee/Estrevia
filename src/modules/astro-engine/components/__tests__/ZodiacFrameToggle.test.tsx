// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ZodiacFrameToggle, nextFrame, type FrameState } from '../ZodiacFrameToggle';
import en from '../../../../../messages/en.json';

function renderToggle(value: FrameState, onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ZodiacFrameToggle value={value} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe('nextFrame', () => {
  it('cycles sidereal to tropical to both and back in three presses', () => {
    expect(nextFrame('sidereal')).toBe('tropical');
    expect(nextFrame('tropical')).toBe('both');
    expect(nextFrame('both')).toBe('sidereal');
  });

  it('returns to the start after exactly three steps from any state', () => {
    for (const start of ['sidereal', 'tropical', 'both'] as const) {
      expect(nextFrame(nextFrame(nextFrame(start)))).toBe(start);
    }
  });
});

describe('ZodiacFrameToggle', () => {
  it('renders a real button so keyboard operation comes for free', () => {
    renderToggle('sidereal');
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('does not claim aria-pressed, which is binary and would be wrong here', () => {
    renderToggle('sidereal');
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBeNull();
  });

  it('names the current and next state in its accessible label', () => {
    renderToggle('sidereal');
    const label = screen.getByRole('button').getAttribute('aria-label') ?? '';
    expect(label).toContain('Sidereal');
    expect(label).toContain('Tropical');
  });

  it('announces the active frame in a polite live region', () => {
    renderToggle('tropical');
    const live = screen.getByRole('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toContain('Tropical');
  });

  it('shows the founder framing as a caption for each state', () => {
    renderToggle('tropical');
    expect(screen.getByText(en.chart.zodiacFrame.tropicalCaption)).toBeTruthy();
  });

  it('emits the next state on click', () => {
    const onChange = renderToggle('tropical');
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith('both');
  });

  it('wraps from both back to sidereal', () => {
    const onChange = renderToggle('both');
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith('sidereal');
  });

  it('is a focusable native button, so Enter and Space work without handlers', () => {
    // Using a real <button> is the whole reason no keydown handling is needed.
    // Asserting the element type is more honest than simulating a keypress
    // that jsdom would translate into a click regardless.
    renderToggle('sidereal');
    const btn = screen.getByRole('button');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.hasAttribute('disabled')).toBe(false);
  });
});
