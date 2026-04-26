import { describe, it, expect } from 'vitest';
import { hooksEn, getHookTemplate } from '../hooks-en';

describe('hooks-en', () => {
  it('contains 3 archetypes: identity_reveal, authority, rarity', () => {
    const archetypes = new Set(hooksEn.map(h => h.archetype));
    expect(archetypes).toContain('identity_reveal');
    expect(archetypes).toContain('authority');
    expect(archetypes).toContain('rarity');
  });

  it('has at least 4 variations per archetype (12 total minimum)', () => {
    const byArchetype = hooksEn.reduce<Record<string, number>>((acc, h) => {
      acc[h.archetype] = (acc[h.archetype] ?? 0) + 1;
      return acc;
    }, {});
    expect(byArchetype['identity_reveal']).toBeGreaterThanOrEqual(4);
    expect(byArchetype['authority']).toBeGreaterThanOrEqual(4);
    expect(byArchetype['rarity']).toBeGreaterThanOrEqual(4);
    expect(hooksEn.length).toBeGreaterThanOrEqual(12);
  });

  it('all hooks use third-person framing (no "you are not" or "you\'re not")', () => {
    for (const h of hooksEn) {
      expect(h.copy_template.toLowerCase()).not.toMatch(/you are not|you're not/);
    }
  });

  it('all hooks are in English locale', () => {
    for (const h of hooksEn) {
      expect(h.locale).toBe('en');
    }
  });

  it('all hooks have at least one policy_constraint documented', () => {
    for (const h of hooksEn) {
      expect(h.policy_constraints.length).toBeGreaterThan(0);
    }
  });

  it('all hooks have valid aspect_ratios', () => {
    const validRatios = new Set(['9:16', '1:1', '4:5']);
    for (const h of hooksEn) {
      expect(h.aspect_ratios.length).toBeGreaterThan(0);
      for (const ratio of h.aspect_ratios) {
        expect(validRatios).toContain(ratio);
      }
    }
  });

  it('all hook IDs follow format: en-{archetype-slug}-{number}', () => {
    for (const h of hooksEn) {
      expect(h.id).toMatch(/^en-[a-z_-]+-\d+$/);
    }
  });

  it('hook IDs are unique', () => {
    const ids = hooksEn.map(h => h.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all hooks have no predictive or fortune-telling language', () => {
    const forbidden = /\byou will\b|\byou'll\b|\byour future\b|\bpredicts?\b|\bfortune\b/i;
    for (const h of hooksEn) {
      expect(h.copy_template).not.toMatch(forbidden);
    }
  });

  it('getHookTemplate returns correct hook by id', () => {
    const t = getHookTemplate('en-identity-reveal-1');
    expect(t).toBeDefined();
    expect(t?.locale).toBe('en');
    expect(t?.archetype).toBe('identity_reveal');
  });

  it('getHookTemplate returns undefined for unknown id', () => {
    expect(getHookTemplate('does-not-exist')).toBeUndefined();
  });
});
