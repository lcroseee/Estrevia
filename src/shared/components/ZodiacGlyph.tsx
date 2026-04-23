/**
 * Zodiac sign glyph.
 *
 * Explicit font stack: prefers system fonts with strong astrological coverage
 * and falls back to the app's UI stack. Without this, iOS/Android default to
 * emoji renderings that show colored symbols in square tiles.
 */

import type { Sign } from '@/shared/types';

export const SIGN_TO_GLYPH: Record<string, string> = {
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

// "Segoe UI Symbol" (Windows), "Apple Symbols" (macOS/iOS), "Noto Sans Symbols2"
// (Linux/Android) all render the block as monochrome glyphs rather than emoji.
export const SYMBOL_FONT_STACK =
  '"Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols2", "Noto Sans Symbols", var(--font-geist-sans, sans-serif)';

export interface ZodiacGlyphProps {
  /** Sign name (enum value or string). Null/undefined renders nothing. */
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
      style={{
        fontSize: size,
        lineHeight: 1,
        fontFamily: SYMBOL_FONT_STACK,
        // Suppress emoji presentation on platforms that honor variation selectors
        fontVariantEmoji: 'text',
      } as React.CSSProperties}
      role="img"
      aria-label={sign as string}
    >
      {glyph}
    </span>
  );
}
