// src/modules/astro-engine/__tests__/portrait-scale.test.ts
import { describe, it, expect } from 'vitest';
import { presentationToScale, PRESENTATIONS } from '../portrait-scale';
import type { Presentation, ColourScale } from '../portrait-scale';

describe('presentationToScale', () => {
  const explicit: Array<[Presentation, ColourScale]> = [
    ['feminine', 'queen'],
    ['masculine', 'king'],
    ['androgynous', 'prince'],
  ];

  it.each(explicit)('maps %s to the %s scale regardless of sign', (presentation, scale) => {
    expect(presentationToScale(presentation, 'Aries')).toBe(scale);
    expect(presentationToScale(presentation, 'Pisces')).toBe(scale);
  });

  // Traditional polarity: Fire and Air are diurnal/positive, Water and Earth nocturnal/negative.
  const diurnal = ['Aries', 'Gemini', 'Leo', 'Libra', 'Sagittarius', 'Aquarius'];
  const nocturnal = ['Taurus', 'Cancer', 'Virgo', 'Scorpio', 'Capricorn', 'Pisces'];

  it.each(diurnal)('auto resolves %s to king via Fire/Air polarity', (sign) => {
    expect(presentationToScale('auto', sign)).toBe('king');
  });

  it.each(nocturnal)('auto resolves %s to queen via Water/Earth polarity', (sign) => {
    expect(presentationToScale('auto', sign)).toBe('queen');
  });

  it('covers all twelve signs under auto', () => {
    expect(new Set([...diurnal, ...nocturnal]).size).toBe(12);
  });

  it('falls back to king for an unrecognised sign rather than throwing', () => {
    expect(presentationToScale('auto', 'Ophiuchus')).toBe('king');
  });

  it('PRESENTATIONS lists exactly the four supported values', () => {
    expect([...PRESENTATIONS]).toEqual(['auto', 'feminine', 'masculine', 'androgynous']);
  });
});
