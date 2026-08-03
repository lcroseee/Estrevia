// src/modules/astro-engine/portrait-scale.ts

/**
 * How the subject is rendered. This is deliberately NOT a gender-identity
 * field: it is never stored, and it selects which of the four Golden Dawn
 * colour scales drives the palette.
 *
 * The four scales are the four worlds and the four letters of the
 * Tetragrammaton — Yod/Father → King (Atziluth), Heh/Mother → Queen (Briah),
 * Vav/Son → Prince (Yetzirah), Heh-final/Daughter → Princess (Assiah).
 */
export type Presentation = 'feminine' | 'masculine' | 'androgynous' | 'auto';

/** The four colour scales present in content/correspondences/777.json. */
export type ColourScale = 'king' | 'queen' | 'prince' | 'princess';

export const PRESENTATIONS = ['auto', 'feminine', 'masculine', 'androgynous'] as const;

/** Traditional diurnal (Fire + Air) signs — positive polarity. */
const DIURNAL_SIGNS = new Set([
  'Aries', 'Gemini', 'Leo', 'Libra', 'Sagittarius', 'Aquarius',
]);

/** Traditional nocturnal (Water + Earth) signs — negative polarity. */
const NOCTURNAL_SIGNS = new Set([
  'Taurus', 'Cancer', 'Virgo', 'Scorpio', 'Capricorn', 'Pisces',
]);

const EXPLICIT: Record<Exclude<Presentation, 'auto'>, ColourScale> = {
  feminine: 'queen',
  masculine: 'king',
  androgynous: 'prince',
};

/**
 * Resolves a presentation to a 777 colour scale.
 *
 * `auto` derives the scale from the solar sign's traditional polarity, so a
 * user who declines to choose still gets a doctrinally grounded palette rather
 * than a default. Unrecognised signs fall back to `king` — the scale the
 * shipped abstract prompt already uses — instead of throwing, because this
 * function sits on the generation path and must never be the reason a paid
 * request fails.
 */
export function presentationToScale(presentation: Presentation, sunSign: string): ColourScale {
  if (presentation !== 'auto') return EXPLICIT[presentation];
  if (DIURNAL_SIGNS.has(sunSign)) return 'king';
  if (NOCTURNAL_SIGNS.has(sunSign)) return 'queen';
  return 'king'; // unrecognised sign — never throw on a paid request path
}
