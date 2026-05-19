/**
 * Shared planet name translations. Single source of truth for ES localization
 * of Saturn/Mars/Venus/Mercury (planets used in curiosity-hook drip + future
 * Spanish surfaces). Keep in sync with PLANET_ES_NAMES if other locales added.
 */

export const PLANET_ES_NAMES: Record<'Saturn' | 'Mars' | 'Venus' | 'Mercury', string> = {
  Saturn: 'Saturno',
  Mars: 'Marte',
  Venus: 'Venus',
  Mercury: 'Mercurio',
};
