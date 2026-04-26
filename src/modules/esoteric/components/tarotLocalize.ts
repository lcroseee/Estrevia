/**
 * Locale-aware getters for tarot card and Sephirah data.
 *
 * Cards in `content/tarot/cards.json` and Sephiroth in
 * `content/kabbalah/sephiroth.json` carry per-locale fields ({ en, es }).
 * These helpers resolve the right field for the active locale, with `en` as
 * the safe fallback. SEO/structured-data callers (metadata, JSON-LD,
 * AI prompts) keep using `card.name.en` directly so canonical English titles
 * stay stable across locales.
 */

interface LocalizedString {
  en: string;
  es?: string;
}

interface LocalizedStringArray {
  en: string[];
  es?: string[];
}

interface CardLike {
  name: LocalizedString;
  description?: LocalizedString;
  keywords?: {
    upright?: LocalizedStringArray;
    reversed?: LocalizedStringArray;
  };
}

interface SephirahLike {
  name: { hebrew: string; en: string; es?: string };
  meaning: { en: string; es?: string };
  description: { en: string; es?: string };
}

interface PathLike {
  description: { en: string; es?: string };
}

function pickString(field: LocalizedString | undefined, locale: string): string {
  if (!field) return '';
  if (locale === 'es' && field.es) return field.es;
  return field.en;
}

function pickStringArray(
  field: LocalizedStringArray | undefined,
  locale: string,
): string[] {
  if (!field) return [];
  if (locale === 'es' && field.es && field.es.length > 0) return field.es;
  return field.en;
}

export function getCardName(card: CardLike, locale: string): string {
  return pickString(card.name, locale);
}

export function getCardDescription(card: CardLike, locale: string): string {
  return pickString(card.description, locale);
}

export function getCardKeywords(
  card: CardLike,
  variant: 'upright' | 'reversed',
  locale: string,
): string[] {
  return pickStringArray(card.keywords?.[variant], locale);
}

export function getSephirahName(s: SephirahLike, locale: string): string {
  // Sephiroth names are Hebrew transliterations and stay original.
  // The data file repeats the same string for `es`, but we honour it for safety.
  if (locale === 'es' && s.name.es) return s.name.es;
  return s.name.en;
}

export function getSephirahMeaning(s: SephirahLike, locale: string): string {
  return pickString(s.meaning, locale);
}

export function getSephirahDescription(s: SephirahLike, locale: string): string {
  return pickString(s.description, locale);
}

export function getPathDescription(p: PathLike, locale: string): string {
  return pickString(p.description, locale);
}
