import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  localizeElement,
  localizeModality,
  localizePlanet,
  spanishSignVariant,
  esEssaySignPhrase,
} from '../astro-i18n';

const esMessages = JSON.parse(
  readFileSync(join(process.cwd(), 'messages/es.json'), 'utf-8'),
) as {
  signDetail: {
    elements: Record<string, string>;
    modalities: Record<string, string>;
    planets: Record<string, string>;
  };
};

describe('localizeElement / localizeModality / localizePlanet', () => {
  it('EN is identity', () => {
    expect(localizeElement('Fire', 'en')).toBe('Fire');
    expect(localizeModality('Fixed', 'en')).toBe('Fixed');
    expect(localizePlanet('Moon', 'en')).toBe('Moon');
  });

  it('ES translates every element/modality token', () => {
    expect(localizeElement('Fire', 'es')).toBe('Fuego');
    expect(localizeElement('Earth', 'es')).toBe('Tierra');
    expect(localizeElement('Air', 'es')).toBe('Aire');
    expect(localizeElement('Water', 'es')).toBe('Agua');
    expect(localizeModality('Cardinal', 'es')).toBe('Cardinal');
    expect(localizeModality('Fixed', 'es')).toBe('Fijo');
    expect(localizeModality('Mutable', 'es')).toBe('Mutable');
  });

  it('ES translates planet enum values (incl. non-classical)', () => {
    expect(localizePlanet('Moon', 'es')).toBe('Luna');
    expect(localizePlanet('Saturn', 'es')).toBe('Saturno');
    expect(localizePlanet('Jupiter', 'es')).toBe('Júpiter');
    expect(localizePlanet('Pluto', 'es')).toBe('Plutón');
    expect(localizePlanet('NorthNode', 'es')).toBe('Nodo Norte');
    expect(localizePlanet('Chiron', 'es')).toBe('Quirón');
  });

  it('falls back to the input for unknown tokens', () => {
    expect(localizeElement('Plasma', 'es')).toBe('Plasma');
    expect(localizePlanet('Marte', 'es')).toBe('Marte'); // already-ES ruler passthrough
  });
});

describe('ES maps stay in sync with messages/es.json signDetail (single source of truth)', () => {
  it('elements match signDetail.elements', () => {
    for (const [token, expected] of Object.entries(esMessages.signDetail.elements)) {
      expect(localizeElement(token, 'es')).toBe(expected);
    }
  });
  it('modalities match signDetail.modalities', () => {
    for (const [token, expected] of Object.entries(esMessages.signDetail.modalities)) {
      expect(localizeModality(token, 'es')).toBe(expected);
    }
  });
  it('planets match signDetail.planets (lowercase-keyed)', () => {
    for (const [lowerKey, expected] of Object.entries(esMessages.signDetail.planets)) {
      const pascal = lowerKey.charAt(0).toUpperCase() + lowerKey.slice(1);
      expect(localizePlanet(pascal, 'es')).toBe(expected);
    }
  });
});

describe('spanishSignVariant / esEssaySignPhrase', () => {
  it('maps sign slugs to Spanish colloquial variants', () => {
    expect(spanishSignVariant('scorpio')).toBe('Escorpio');
    expect(spanishSignVariant('gemini')).toBe('Géminis');
    expect(spanishSignVariant('capricorn')).toBe('Capricornio');
    expect(spanishSignVariant('aries')).toBe('Aries');
    expect(spanishSignVariant('unknown')).toBe('unknown');
  });
  it('builds the ES planet-in-sign search phrase', () => {
    expect(esEssaySignPhrase('venus-in-scorpio')).toBe('venus en escorpio');
    expect(esEssaySignPhrase('moon-in-cancer')).toBe('luna en cáncer');
    expect(esEssaySignPhrase('saturn-in-capricorn')).toBe('saturno en capricornio');
  });
  it('returns null for non planet-in-sign slugs', () => {
    expect(esEssaySignPhrase('some-random-slug')).toBeNull();
    expect(esEssaySignPhrase('aries')).toBeNull();
  });
});
