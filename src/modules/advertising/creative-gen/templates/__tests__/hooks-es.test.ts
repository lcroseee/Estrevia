import { describe, it, expect } from 'vitest';
import { hooksEs, getHookTemplateEs } from '../hooks-es';

// Sign names that must NOT be translated (per feedback_spanish_style memory)
const UNTRANSLATED_SIGN_NAMES = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

// Translated variants that should NOT appear (Spanish-language forms)
const FORBIDDEN_SIGN_TRANSLATIONS = [
  'Tauro', 'Géminis', 'Cáncer', 'Escorpio', 'Sagitario', 'Capricornio',
  'Acuario', 'Piscis',
];

describe('hooks-es', () => {
  it('contains 3 archetypes: identity_reveal, authority, rarity', () => {
    const archetypes = new Set(hooksEs.map(h => h.archetype));
    expect(archetypes).toContain('identity_reveal');
    expect(archetypes).toContain('authority');
    expect(archetypes).toContain('rarity');
  });

  it('has at least 4 variations per archetype (12 total minimum)', () => {
    const byArchetype = hooksEs.reduce<Record<string, number>>((acc, h) => {
      acc[h.archetype] = (acc[h.archetype] ?? 0) + 1;
      return acc;
    }, {});
    expect(byArchetype['identity_reveal']).toBeGreaterThanOrEqual(4);
    expect(byArchetype['authority']).toBeGreaterThanOrEqual(4);
    expect(byArchetype['rarity']).toBeGreaterThanOrEqual(4);
    expect(hooksEs.length).toBeGreaterThanOrEqual(12);
  });

  it('all hooks are in Spanish locale', () => {
    for (const h of hooksEs) {
      expect(h.locale).toBe('es');
    }
  });

  it('all hooks use third-person or impersonal framing (no "no eres", "no sos")', () => {
    for (const h of hooksEs) {
      // Spanish equivalents of "you are not" personal claims
      expect(h.copy_template.toLowerCase()).not.toMatch(/no eres|no sos/);
    }
  });

  it('all hooks have at least one policy_constraint documented', () => {
    for (const h of hooksEs) {
      expect(h.policy_constraints.length).toBeGreaterThan(0);
    }
  });

  it('all hooks have valid aspect_ratios', () => {
    const validRatios = new Set(['9:16', '1:1', '4:5']);
    for (const h of hooksEs) {
      expect(h.aspect_ratios.length).toBeGreaterThan(0);
      for (const ratio of h.aspect_ratios) {
        expect(validRatios).toContain(ratio);
      }
    }
  });

  it('all hook IDs follow format: es-{archetype-slug}-{number}', () => {
    for (const h of hooksEs) {
      expect(h.id).toMatch(/^es-[a-z_-]+-\d+$/);
    }
  });

  it('hook IDs are unique', () => {
    const ids = hooksEs.map(h => h.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('sign names are NOT translated (Aries stays Aries, not Tauro)', () => {
    const allCopy = hooksEs.map(h => h.copy_template).join(' ');
    // If any forbidden translation appears, the test fails
    for (const forbidden of FORBIDDEN_SIGN_TRANSLATIONS) {
      expect(allCopy).not.toContain(forbidden);
    }
  });

  it('uses tú form imperatives when present (Calcula, Descubre — not Calcule, Descubra)', () => {
    const allCopy = hooksEs.map(h => h.copy_template).join(' ');
    // Usted-form imperatives should not appear
    expect(allCopy).not.toMatch(/\bCalcule\b|\bDescubra\b|\bComprenda\b|\bConozca\b/);
  });

  it('does not contain English copy (sanity check — all Spanish)', () => {
    // Each template should have at least one Spanish word (article, connector, or common verb)
    const spanishPatterns = /\b(de|la|el|los|las|un|una|en|con|por|para|que|del|su|más|una|apps?|sidereo|zodíaco|sideral|tropical|signo|planeta|cósmico|combinación)\b/i;
    for (const h of hooksEs) {
      expect(h.copy_template).toMatch(spanishPatterns);
    }
  });

  it('all hooks have no predictive or fortune-telling language', () => {
    const forbidden = /\bserás\b|\bte pasará\b|\btu futuro\b|\bpredice\b|\bfortuna\b/i;
    for (const h of hooksEs) {
      expect(h.copy_template).not.toMatch(forbidden);
    }
  });

  it('getHookTemplateEs returns correct hook by id', () => {
    const t = getHookTemplateEs('es-identity-reveal-1');
    expect(t).toBeDefined();
    expect(t?.locale).toBe('es');
    expect(t?.archetype).toBe('identity_reveal');
  });

  it('getHookTemplateEs returns undefined for unknown id', () => {
    expect(getHookTemplateEs('does-not-exist')).toBeUndefined();
  });
});
