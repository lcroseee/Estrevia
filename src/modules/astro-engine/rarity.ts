import { Sign } from '@/shared/types/astrology';

// ---------------------------------------------------------------------------
// Sun × Moon rarity table — 12×12 matrix of percentages
//
// These values represent a relative weighting of Sun-Moon sign combinations
// used to produce a qualitative rarity tier label on the Cosmic Passport.
// They are NOT presented as statistical frequency claims.
//
// Relative weighting rationale:
//   - Same/adjacent sign combos (Sun-Moon in same or neighboring sign):
//     higher weight (~8-10) — these combos are more energetically unified
//   - Opposing sign combos: lower weight (~4-6) — polarity energy is rarer
//     in the sense of being more dramatically differentiated
//   - All other combos: mid weight (~6-9)
//
// The displayed output is a qualitative tier ("Rare", "Exceptional", etc.),
// not a frequency percentage. See getRarityTier() below.
//
// Column keys = Moon sign, Row keys = Sun sign.
// ---------------------------------------------------------------------------

const RARITY_TABLE: Record<Sign, Record<Sign, number>> = {
  [Sign.Aries]: {
    [Sign.Aries]: 8.1,
    [Sign.Taurus]: 8.3,
    [Sign.Gemini]: 7.4,
    [Sign.Cancer]: 7.1,
    [Sign.Leo]: 6.9,
    [Sign.Virgo]: 6.5,
    [Sign.Libra]: 5.2,
    [Sign.Scorpio]: 4.8,
    [Sign.Sagittarius]: 5.6,
    [Sign.Capricorn]: 6.1,
    [Sign.Aquarius]: 6.8,
    [Sign.Pisces]: 7.9,
  },
  [Sign.Taurus]: {
    [Sign.Aries]: 7.9,
    [Sign.Taurus]: 8.4,
    [Sign.Gemini]: 8.2,
    [Sign.Cancer]: 7.5,
    [Sign.Leo]: 7.0,
    [Sign.Virgo]: 6.8,
    [Sign.Libra]: 6.3,
    [Sign.Scorpio]: 5.1,
    [Sign.Sagittarius]: 4.7,
    [Sign.Capricorn]: 5.5,
    [Sign.Aquarius]: 6.2,
    [Sign.Pisces]: 6.9,
  },
  [Sign.Gemini]: {
    [Sign.Aries]: 7.1,
    [Sign.Taurus]: 7.8,
    [Sign.Gemini]: 8.5,
    [Sign.Cancer]: 8.1,
    [Sign.Leo]: 7.6,
    [Sign.Virgo]: 7.0,
    [Sign.Libra]: 6.7,
    [Sign.Scorpio]: 6.2,
    [Sign.Sagittarius]: 5.0,
    [Sign.Capricorn]: 4.6,
    [Sign.Aquarius]: 5.4,
    [Sign.Pisces]: 6.3,
  },
  [Sign.Cancer]: {
    [Sign.Aries]: 6.3,
    [Sign.Taurus]: 7.2,
    [Sign.Gemini]: 7.9,
    [Sign.Cancer]: 8.6,
    [Sign.Leo]: 8.2,
    [Sign.Virgo]: 7.5,
    [Sign.Libra]: 7.1,
    [Sign.Scorpio]: 6.6,
    [Sign.Sagittarius]: 6.1,
    [Sign.Capricorn]: 4.9,
    [Sign.Aquarius]: 4.5,
    [Sign.Pisces]: 5.8,
  },
  [Sign.Leo]: {
    [Sign.Aries]: 5.9,
    [Sign.Taurus]: 6.4,
    [Sign.Gemini]: 7.3,
    [Sign.Cancer]: 7.7,
    [Sign.Leo]: 8.8,
    [Sign.Virgo]: 8.3,
    [Sign.Libra]: 7.6,
    [Sign.Scorpio]: 7.0,
    [Sign.Sagittarius]: 6.5,
    [Sign.Capricorn]: 6.0,
    [Sign.Aquarius]: 4.7,
    [Sign.Pisces]: 4.4,
  },
  [Sign.Virgo]: {
    [Sign.Aries]: 4.5,
    [Sign.Taurus]: 5.8,
    [Sign.Gemini]: 6.3,
    [Sign.Cancer]: 7.4,
    [Sign.Leo]: 7.8,
    [Sign.Virgo]: 8.7,
    [Sign.Libra]: 8.4,
    [Sign.Scorpio]: 7.7,
    [Sign.Sagittarius]: 7.1,
    [Sign.Capricorn]: 6.6,
    [Sign.Aquarius]: 6.0,
    [Sign.Pisces]: 4.8,
  },
  [Sign.Libra]: {
    [Sign.Aries]: 4.9,
    [Sign.Taurus]: 4.6,
    [Sign.Gemini]: 5.7,
    [Sign.Cancer]: 6.2,
    [Sign.Leo]: 7.3,
    [Sign.Virgo]: 7.9,
    [Sign.Libra]: 8.9,
    [Sign.Scorpio]: 8.5,
    [Sign.Sagittarius]: 7.8,
    [Sign.Capricorn]: 7.2,
    [Sign.Aquarius]: 6.7,
    [Sign.Pisces]: 6.1,
  },
  [Sign.Scorpio]: {
    [Sign.Aries]: 5.5,
    [Sign.Taurus]: 4.8,
    [Sign.Gemini]: 4.4,
    [Sign.Cancer]: 5.6,
    [Sign.Leo]: 6.1,
    [Sign.Virgo]: 7.2,
    [Sign.Libra]: 7.8,
    [Sign.Scorpio]: 8.8,
    [Sign.Sagittarius]: 8.6,
    [Sign.Capricorn]: 7.9,
    [Sign.Aquarius]: 7.3,
    [Sign.Pisces]: 6.8,
  },
  [Sign.Sagittarius]: {
    [Sign.Aries]: 6.0,
    [Sign.Taurus]: 5.3,
    [Sign.Gemini]: 4.5,
    [Sign.Cancer]: 4.2,
    [Sign.Leo]: 5.4,
    [Sign.Virgo]: 5.9,
    [Sign.Libra]: 7.0,
    [Sign.Scorpio]: 7.6,
    [Sign.Sagittarius]: 9.0,
    [Sign.Capricorn]: 8.5,
    [Sign.Aquarius]: 7.8,
    [Sign.Pisces]: 7.2,
  },
  [Sign.Capricorn]: {
    [Sign.Aries]: 6.7,
    [Sign.Taurus]: 6.0,
    [Sign.Gemini]: 5.2,
    [Sign.Cancer]: 4.3,
    [Sign.Leo]: 4.1,
    [Sign.Virgo]: 5.3,
    [Sign.Libra]: 5.8,
    [Sign.Scorpio]: 6.9,
    [Sign.Sagittarius]: 7.5,
    [Sign.Capricorn]: 9.1,
    [Sign.Aquarius]: 8.6,
    [Sign.Pisces]: 7.9,
  },
  [Sign.Aquarius]: {
    [Sign.Aries]: 7.3,
    [Sign.Taurus]: 6.6,
    [Sign.Gemini]: 5.9,
    [Sign.Cancer]: 5.0,
    [Sign.Leo]: 4.2,
    [Sign.Virgo]: 4.0,
    [Sign.Libra]: 5.1,
    [Sign.Scorpio]: 5.7,
    [Sign.Sagittarius]: 6.8,
    [Sign.Capricorn]: 7.4,
    [Sign.Aquarius]: 9.2,
    [Sign.Pisces]: 8.7,
  },
  [Sign.Pisces]: {
    [Sign.Aries]: 7.8,
    [Sign.Taurus]: 7.2,
    [Sign.Gemini]: 6.4,
    [Sign.Cancer]: 5.7,
    [Sign.Leo]: 4.8,
    [Sign.Virgo]: 4.1,
    [Sign.Libra]: 4.3,
    [Sign.Scorpio]: 5.2,
    [Sign.Sagittarius]: 5.8,
    [Sign.Capricorn]: 6.9,
    [Sign.Aquarius]: 7.5,
    [Sign.Pisces]: 9.3,
  },
};

/**
 * Returns the relative rarity weight (arbitrary unit) for a given Sun-Moon
 * sign combination. Lower = rarer.
 *
 * Do NOT display this number directly as a frequency percentage — it is a
 * relative weight, not a statistical frequency. Use getRarityTier() for UI.
 */
export function getRarity(sunSign: Sign, moonSign: Sign): number {
  return RARITY_TABLE[sunSign]?.[moonSign] ?? 6.9;
}

// ---------------------------------------------------------------------------
// Qualitative rarity tiers
// ---------------------------------------------------------------------------

export type RarityTier = 'Exceptional' | 'Very Rare' | 'Rare' | 'Uncommon';

/**
 * Maps a rarity weight to a qualitative tier label.
 * Thresholds correspond to the lower end of the weight distribution (4.1)
 * and upper end (9.3):
 *
 *   weight < 5   → Exceptional   (~10% of the weight range)
 *   weight < 6   → Very Rare     (~next 15%)
 *   weight < 7.5 → Rare          (~next 35%)
 *   weight ≥ 7.5 → Uncommon      (~top 40%)
 *
 * These tiers are a qualitative description of relative uniqueness —
 * not a statistical claim about birth frequency.
 */
export function getRarityTier(weight: number): RarityTier {
  if (weight < 5) return 'Exceptional';
  if (weight < 6) return 'Very Rare';
  if (weight < 7.5) return 'Rare';
  return 'Uncommon';
}
