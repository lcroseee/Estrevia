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

  // Regression — same rationale as hooks-en: prompts mentioning UI
  // affordances (botón de compartir, prueba social, amigos comparando)
  // produce social-network app aesthetic instead of astrological imagery.
  it('no visual_mood contains social-app UI affordance phrasing', () => {
    const forbidden =
      /\bbot[oó]n\s+de\s+compartir|\bhoja\s+para\s+compartir|\bprueba\s+social|\benfoque\s+social|\bamigos?\s+comparando|\bglobo\s+de\s+di[aá]logo|\bburbuja\s+de\s+chat|\bemoji|\bmensajer[ií]a/i;
    for (const h of hooksEs) {
      expect(h.visual_mood, `${h.id} visual_mood leaks social-app UI`).not.toMatch(forbidden);
    }
  });

  it('contains the reciprocity archetype with at least 2 templates', () => {
    const reciprocityHooks = hooksEs.filter(h => h.archetype === 'reciprocity');
    expect(reciprocityHooks.length).toBeGreaterThanOrEqual(2);
  });

  it('reciprocity ES templates have non-empty policy_constraints', () => {
    const reciprocityHooks = hooksEs.filter(h => h.archetype === 'reciprocity');
    for (const h of reciprocityHooks) {
      expect(h.policy_constraints.length).toBeGreaterThan(0);
    }
  });

  it('contains the peer_discovery archetype with at least 2 templates', () => {
    const peerHooks = hooksEs.filter(h => h.archetype === 'peer_discovery');
    expect(peerHooks.length).toBeGreaterThanOrEqual(2);
  });

  it('peer_discovery ES templates declare env-gate in policy_constraints', () => {
    const peerHooks = hooksEs.filter(h => h.archetype === 'peer_discovery');
    for (const h of peerHooks) {
      const hasGateNote = h.policy_constraints.some(c =>
        c.includes('PEER_DISCOVERY_ENABLED'),
      );
      expect(hasGateNote, `${h.id} missing env-gate constraint`).toBe(true);
    }
  });

  it('contains the accuracy_gap archetype with at least 2 templates', () => {
    const gapHooks = hooksEs.filter(h => h.archetype === 'accuracy_gap');
    expect(gapHooks.length).toBeGreaterThanOrEqual(2);
  });

  it('accuracy_gap ES templates have non-empty policy_constraints', () => {
    const gapHooks = hooksEs.filter(h => h.archetype === 'accuracy_gap');
    for (const h of gapHooks) {
      expect(h.policy_constraints.length).toBeGreaterThan(0);
    }
  });
});

describe('Patch 02 — lead_magnet archetype + new templates (ES)', () => {
  it.each([
    'es-rarity-7',
    'es-lead-magnet-1',
    'es-lead-magnet-2',
    'es-lead-magnet-3',
  ])('contains %s', (id) => {
    const t = hooksEs.find(h => h.id === id);
    expect(t).toBeDefined();
    expect(t?.locale).toBe('es');
    expect(t?.policy_constraints.length).toBeGreaterThan(0);
  });

  it('es-lead-magnet templates use lead_magnet archetype', () => {
    for (const id of ['es-lead-magnet-1', 'es-lead-magnet-2', 'es-lead-magnet-3']) {
      const t = hooksEs.find(h => h.id === id);
      expect(t?.archetype).toBe('lead_magnet');
    }
  });

  it('es-rarity-7 uses rarity archetype', () => {
    const t = hooksEs.find(h => h.id === 'es-rarity-7');
    expect(t?.archetype).toBe('rarity');
  });

  it('new ES templates do not contain "usted"', () => {
    for (const id of ['es-rarity-7', 'es-lead-magnet-1', 'es-lead-magnet-2', 'es-lead-magnet-3']) {
      const t = hooksEs.find(h => h.id === id);
      expect(t?.copy_template).not.toMatch(/\busted\b/i);
    }
  });

  it('new ES templates do not contain translated sign names that diverge from Latin', () => {
    for (const id of ['es-rarity-7', 'es-lead-magnet-1', 'es-lead-magnet-2', 'es-lead-magnet-3']) {
      const t = hooksEs.find(h => h.id === id);
      expect(t?.copy_template).not.toMatch(
        /\b(tauro|géminis|escorpio|sagitario|capricornio|acuario|piscis)\b/i,
      );
    }
  });
});
