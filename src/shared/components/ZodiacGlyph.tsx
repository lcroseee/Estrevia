/**
 * Zodiac sign glyph.
 *
 * Stub component — agent 3 enhances with size variants, font-stack fallback,
 * color theming, and polished aria labels. Keep the public signature stable
 * so consumers (CurrentPhaseCard, MoonCalendarGrid, DayDetailPanel) can work
 * against it in parallel.
 */

import type { Sign } from '@/shared/types';

const SIGN_TO_GLYPH: Record<string, string> = {
  Aries: '♈',
  Taurus: '♉',
  Gemini: '♊',
  Cancer: '♋',
  Leo: '♌',
  Virgo: '♍',
  Libra: '♎',
  Scorpio: '♏',
  Sagittarius: '♐',
  Capricorn: '♑',
  Aquarius: '♒',
  Pisces: '♓',
};

export interface ZodiacGlyphProps {
  /** Sign name (enum value or string, e.g. "Cancer"). Null renders nothing. */
  sign: Sign | string | null | undefined;
  /** Glyph font-size in px. Default 14. */
  size?: number;
  /** Optional class for color / alignment overrides. */
  className?: string;
}

export function ZodiacGlyph({ sign, size = 14, className }: ZodiacGlyphProps) {
  if (!sign) return null;
  const glyph = SIGN_TO_GLYPH[sign as string];
  if (!glyph) return null;

  return (
    <span
      className={className}
      style={{ fontSize: size, lineHeight: 1 }}
      role="img"
      aria-label={sign as string}
    >
      {glyph}
    </span>
  );
}
