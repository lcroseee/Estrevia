import { Element, Modality, Planet } from '@/shared/types/astrology';
import { parseEssaySlug } from '@/shared/seo/internal-links';

/**
 * Astrology token → localized display string (pure, no next-intl).
 *
 * The astro engine + sign data speak canonical English enum tokens
 * (Planet='Moon', Element='Fire', Modality='Cardinal'). These maps render them
 * in the active locale for UI surfaces — the ES compatibility + planetary-hours
 * tables (SEO §T10 / finding #14).
 *
 * Project rules: PLANET names ARE translated (Luna/Saturno); SIGN names are NOT
 * (Aries/Leo…) and never pass through localizePlanet/localizeElement. The ES
 * strings are single-sourced from messages/es.json `signDetail.{elements,
 * modalities,planets}` — astro-i18n.test.ts asserts these maps equal that
 * namespace so they cannot drift.
 *
 * NOTE: distinct from src/shared/lib/planet-i18n.ts `PLANET_ES_NAMES`, which is
 * the narrow 4-planet map used only by the lead-nurture email templates and is
 * intentionally left independent (email-render blast radius). Unify later if the
 * email path is refactored.
 */

export type ElementToken = `${Element}`; // 'Fire' | 'Earth' | 'Air' | 'Water'
export type ModalityToken = `${Modality}`; // 'Cardinal' | 'Fixed' | 'Mutable'
export type PlanetToken = `${Planet}`; // 'Sun' | 'Moon' | … | 'Midheaven'

// Exhaustive Record<> — adding a Planet/Element/Modality enum member becomes a
// compile error here until its ES string is supplied.
const ELEMENT_ES: Record<ElementToken, string> = {
  Fire: 'Fuego',
  Earth: 'Tierra',
  Air: 'Aire',
  Water: 'Agua',
};

const MODALITY_ES: Record<ModalityToken, string> = {
  Cardinal: 'Cardinal',
  Fixed: 'Fijo',
  Mutable: 'Mutable',
};

const PLANET_ES: Record<PlanetToken, string> = {
  Sun: 'Sol',
  Moon: 'Luna',
  Mercury: 'Mercurio',
  Venus: 'Venus',
  Mars: 'Marte',
  Jupiter: 'Júpiter',
  Saturn: 'Saturno',
  Uranus: 'Urano',
  Neptune: 'Neptuno',
  Pluto: 'Plutón',
  NorthNode: 'Nodo Norte',
  Chiron: 'Quirón',
  Ascendant: 'Ascendente',
  Midheaven: 'Medio Cielo',
};

export function localizeElement(element: string, locale: string): string {
  if (locale !== 'es') return element;
  return (ELEMENT_ES as Record<string, string>)[element] ?? element;
}

export function localizeModality(modality: string, locale: string): string {
  if (locale !== 'es') return modality;
  return (MODALITY_ES as Record<string, string>)[modality] ?? modality;
}

export function localizePlanet(planet: string, locale: string): string {
  if (locale !== 'es') return planet;
  return (PLANET_ES as Record<string, string>)[planet] ?? planet;
}

/**
 * Spanish colloquial sign-name variants (español neutro).
 *
 * Sign names stay UNTRANSLATED in page bodies (Aries/Leo…). This map exists
 * ONLY for ES search-relevance in essay metadata — Spanish speakers search
 * "venus en escorpio", not "venus in scorpio". Never render these in the body.
 */
export const SIGN_ES_VARIANTS: Record<string, string> = {
  aries: 'Aries',
  taurus: 'Tauro',
  gemini: 'Géminis',
  cancer: 'Cáncer',
  leo: 'Leo',
  virgo: 'Virgo',
  libra: 'Libra',
  scorpio: 'Escorpio',
  sagittarius: 'Sagitario',
  capricorn: 'Capricornio',
  aquarius: 'Acuario',
  pisces: 'Piscis',
};

export function spanishSignVariant(signSlug: string): string {
  return SIGN_ES_VARIANTS[signSlug] ?? signSlug;
}

/**
 * ES search phrase for a planet-in-sign essay, lowercased for keyword use:
 * esEssaySignPhrase('venus-in-scorpio') === 'venus en escorpio'.
 * Returns null for non-planet-in-sign slugs.
 */
export function esEssaySignPhrase(slug: string): string | null {
  const parsed = parseEssaySlug(slug);
  if (!parsed) return null;
  const planetPascal =
    parsed.planet.charAt(0).toUpperCase() + parsed.planet.slice(1);
  const planetEs = localizePlanet(planetPascal, 'es').toLowerCase();
  const signEs = spanishSignVariant(parsed.sign).toLowerCase();
  return `${planetEs} en ${signEs}`;
}
