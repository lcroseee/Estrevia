import { Sign } from '@/shared/types';

/**
 * Zodiac ring constants and the one geometry helper both ChartWheel and
 * ZodiacRing need.
 *
 * Extracted from ChartWheel when SP-A made it necessary to draw two rings at
 * once. Shared rather than duplicated: two copies of a colour table drift.
 */

export const ZODIAC_SIGNS: Sign[] = [
  Sign.Aries, Sign.Taurus, Sign.Gemini, Sign.Cancer,
  Sign.Leo, Sign.Virgo, Sign.Libra, Sign.Scorpio,
  Sign.Sagittarius, Sign.Capricorn, Sign.Aquarius, Sign.Pisces,
];

export const SIGN_GLYPHS: Record<Sign, string> = {
  [Sign.Aries]: '♈', [Sign.Taurus]: '♉', [Sign.Gemini]: '♊',
  [Sign.Cancer]: '♋', [Sign.Leo]: '♌', [Sign.Virgo]: '♍',
  [Sign.Libra]: '♎', [Sign.Scorpio]: '♏', [Sign.Sagittarius]: '♐',
  [Sign.Capricorn]: '♑', [Sign.Aquarius]: '♒', [Sign.Pisces]: '♓',
};

// Element colors for zodiac ring sectors
export const SIGN_COLORS: Record<Sign, string> = {
  [Sign.Aries]: '#8B2500',      // Fire
  [Sign.Taurus]: '#1A4A1A',     // Earth
  [Sign.Gemini]: '#1A2A5E',     // Air
  [Sign.Cancer]: '#0D3B3B',     // Water
  [Sign.Leo]: '#7A2000',        // Fire
  [Sign.Virgo]: '#163416',      // Earth
  [Sign.Libra]: '#162050',      // Air
  [Sign.Scorpio]: '#0A3030',    // Water
  [Sign.Sagittarius]: '#6B1E00', // Fire
  [Sign.Capricorn]: '#122A12',  // Earth
  [Sign.Aquarius]: '#101840',   // Air
  [Sign.Pisces]: '#082828',     // Water
};

export const SIGN_TEXT_COLORS: Record<Sign, string> = {
  [Sign.Aries]: '#FF6B3D', [Sign.Taurus]: '#5DBB5D', [Sign.Gemini]: '#6B9AFF',
  [Sign.Cancer]: '#5ECECE', [Sign.Leo]: '#FF8C42', [Sign.Virgo]: '#4CAF50',
  [Sign.Libra]: '#7BA7FF', [Sign.Scorpio]: '#4ECECE', [Sign.Sagittarius]: '#FF7A30',
  [Sign.Capricorn]: '#66BB6A', [Sign.Aquarius]: '#82AAFF', [Sign.Pisces]: '#80DEEA',
};

export function polarToCart(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}
