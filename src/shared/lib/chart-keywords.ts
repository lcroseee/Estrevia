export type SignKey =
  | 'aries' | 'taurus' | 'gemini' | 'cancer'
  | 'leo' | 'virgo' | 'libra' | 'scorpio'
  | 'sagittarius' | 'capricorn' | 'aquarius' | 'pisces';

export type Locale = 'en' | 'es';

export interface SignKeywords {
  sun: string;
  moon: string;
  asc: string;
}

/**
 * Static keyword map for the T+14d mini-reading email template.
 *
 * Each entry is a short noun-phrase that fits into the template:
 *   "Your Sun in {sign} suggests {sun}."
 *   "Your Moon in {sign} reveals {moon}."
 *   "Your Ascendant in {sign} shapes how others see you: {asc}."
 *
 * Founder content commitment: 12 × 3 × 2 = 72 strings. Engineer placeholders
 * below pass tests but are intentionally generic; founder iterates content
 * with authentic Vedic-astrology phrasing before deploy.
 */
export const SIGN_KEYWORDS: Record<Locale, Record<SignKey, SignKeywords>> = {
  en: {
    aries: { sun: 'pioneer energy', moon: 'fiery emotional response', asc: 'forward-charging presence' },
    taurus: { sun: 'steady builder', moon: 'sensual grounded feeling', asc: 'calm rooted presence' },
    gemini: { sun: 'curious mind', moon: 'restless thoughtful mood', asc: 'quick conversational presence' },
    cancer: { sun: 'caring heart', moon: 'tidal protective feeling', asc: 'sensitive nurturing presence' },
    leo: { sun: 'radiant self', moon: 'warm theatrical emotion', asc: 'magnetic confident presence' },
    virgo: { sun: 'precise craftsman', moon: 'analytic measured feeling', asc: 'attentive composed presence' },
    libra: { sun: 'relational diplomat', moon: 'balanced harmonic emotion', asc: 'graceful poised presence' },
    scorpio: { sun: 'depth seeker', moon: 'intense undercurrent feeling', asc: 'still penetrating presence' },
    sagittarius: { sun: 'wide-sky explorer', moon: 'restless wandering feeling', asc: 'open optimistic presence' },
    capricorn: { sun: 'long-game architect', moon: 'reserved enduring feeling', asc: 'measured authoritative presence' },
    aquarius: { sun: 'systems thinker', moon: 'detached observant feeling', asc: 'individual unconventional presence' },
    pisces: { sun: 'oceanic dreamer', moon: 'fluid empathic feeling', asc: 'soft transparent presence' },
  },
  es: {
    aries: { sun: 'energía pionera', moon: 'reacción emocional ardiente', asc: 'presencia frontal y directa' },
    taurus: { sun: 'constructor firme', moon: 'sentimiento sensorial y arraigado', asc: 'presencia calma y enraizada' },
    gemini: { sun: 'mente curiosa', moon: 'ánimo inquieto y pensativo', asc: 'presencia rápida y conversadora' },
    cancer: { sun: 'corazón protector', moon: 'sentimiento de marea protectora', asc: 'presencia sensible y nutritiva' },
    leo: { sun: 'identidad radiante', moon: 'emoción cálida y teatral', asc: 'presencia magnética y segura' },
    virgo: { sun: 'artesano preciso', moon: 'sentimiento analítico y medido', asc: 'presencia atenta y compuesta' },
    libra: { sun: 'diplomático relacional', moon: 'emoción equilibrada y armónica', asc: 'presencia grácil y serena' },
    scorpio: { sun: 'buscador de profundidad', moon: 'sentimiento intenso subterráneo', asc: 'presencia quieta y penetrante' },
    sagittarius: { sun: 'explorador de horizontes', moon: 'sentimiento inquieto y errante', asc: 'presencia abierta y optimista' },
    capricorn: { sun: 'arquitecto de largo plazo', moon: 'sentimiento reservado y duradero', asc: 'presencia medida y autoritaria' },
    aquarius: { sun: 'pensador de sistemas', moon: 'sentimiento desapegado y observador', asc: 'presencia individual y poco convencional' },
    pisces: { sun: 'soñador oceánico', moon: 'sentimiento fluido y empático', asc: 'presencia suave y transparente' },
  },
};

export function getSignKeywords(
  locale: Locale,
  sign: SignKey,
  placement: keyof SignKeywords,
): string {
  return SIGN_KEYWORDS[locale][sign][placement];
}
