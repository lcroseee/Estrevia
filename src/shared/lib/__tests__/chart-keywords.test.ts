import { describe, expect, it } from 'vitest';
import { getSignKeywords, type SignKey } from '../chart-keywords';

describe('getSignKeywords', () => {
  const SIGNS: SignKey[] = [
    'aries', 'taurus', 'gemini', 'cancer',
    'leo', 'virgo', 'libra', 'scorpio',
    'sagittarius', 'capricorn', 'aquarius', 'pisces',
  ];

  it.each(SIGNS)('returns non-empty Sun keyword for %s (EN)', (sign) => {
    expect(getSignKeywords('en', sign, 'sun')).toMatch(/^.+$/);
  });

  it.each(SIGNS)('returns non-empty Moon keyword for %s (EN)', (sign) => {
    expect(getSignKeywords('en', sign, 'moon')).toMatch(/^.+$/);
  });

  it.each(SIGNS)('returns non-empty Asc keyword for %s (EN)', (sign) => {
    expect(getSignKeywords('en', sign, 'asc')).toMatch(/^.+$/);
  });

  it.each(SIGNS)('returns non-empty Sun keyword for %s (ES)', (sign) => {
    expect(getSignKeywords('es', sign, 'sun')).toMatch(/^.+$/);
  });

  it.each(SIGNS)('returns non-empty Moon keyword for %s (ES)', (sign) => {
    expect(getSignKeywords('es', sign, 'moon')).toMatch(/^.+$/);
  });

  it.each(SIGNS)('returns non-empty Asc keyword for %s (ES)', (sign) => {
    expect(getSignKeywords('es', sign, 'asc')).toMatch(/^.+$/);
  });
});
