/**
 * buildAvatarPrompt unit tests.
 *
 * Verifies that 777 correspondences from content/correspondences/777.json
 * are woven into the Gemini Imagen prompt for each Sun sign + ruling planet.
 *
 * Environment: Vitest (node, no jsdom). Pure-function tests — no React.
 */
import { describe, it, expect } from 'vitest';
import { buildAvatarPrompt } from '@/modules/astro-engine/avatar-prompt';

describe('buildAvatarPrompt — 777 enrichment', () => {
  it('weaves Aries correspondences (Emperor, Mars, Scarlet, Ram) into the prompt', () => {
    const prompt = buildAvatarPrompt({
      sunSign: 'Aries',
      moonSign: 'Cancer',
      ascendantSign: 'Scorpio',
      element: 'Fire',
      style: 'cosmic',
    });

    expect(prompt).toContain('The Emperor (Tarot of Aries)');
    expect(prompt).toContain('ruled by Mars');
    expect(prompt).toContain('Cancer lunar essence');
    expect(prompt).toContain('outer aura inspired by Scorpio');
    expect(prompt).toContain('scarlet'); // king-scale color
    expect(prompt).toContain('ram'); // animal silhouette
    expect(prompt).toContain('Square format');
    // Style-specific opening
    expect(prompt).toContain('Cosmic energy portrait');
  });

  it('weaves Leo correspondences (Lust, Sun, Yellow greenish, Lion)', () => {
    const prompt = buildAvatarPrompt({
      sunSign: 'Leo',
      moonSign: 'Virgo',
      element: 'Fire',
      style: 'tarot',
    });

    expect(prompt).toContain('Lust (Tarot of Leo)');
    expect(prompt).toContain('ruled by Sun');
    expect(prompt).toContain('lion');
    expect(prompt).toContain('yellow greenish');
    // Tarot style opening
    expect(prompt).toContain('Mystical tarot card art style');
  });

  it('weaves Pisces correspondences (The Moon, Jupiter, Crimson, Beetle)', () => {
    const prompt = buildAvatarPrompt({
      sunSign: 'Pisces',
      moonSign: 'Pisces',
      element: 'Water',
      style: 'nebula',
    });

    expect(prompt).toContain('The Moon (Tarot of Pisces)');
    expect(prompt).toContain('ruled by Jupiter');
    expect(prompt).toContain('beetle');
    // King color for Pisces is "Crimson (ultra violet)" — lowercased fully
    expect(prompt).toContain('crimson');
  });

  it('omits ascendant clause when ascendantSign is undefined', () => {
    const prompt = buildAvatarPrompt({
      sunSign: 'Taurus',
      moonSign: 'Pisces',
      element: 'Earth',
      style: 'tarot',
    });

    expect(prompt).not.toContain('outer aura');
    expect(prompt).toContain('The Hierophant (Tarot of Taurus)');
    expect(prompt).toContain('ruled by Venus');
  });

  it('falls back to simple prompt for an unknown sign (no 777 data)', () => {
    const prompt = buildAvatarPrompt({
      sunSign: 'NotARealSign',
      moonSign: 'Cancer',
      element: 'Fire',
      style: 'cosmic',
    });

    expect(prompt).toContain('NotARealSign solar energy');
    expect(prompt).toContain('Cancer lunar essence');
    expect(prompt).not.toContain('Tarot of');
    expect(prompt).not.toContain('ruled by');
    // Style + element palette still present
    expect(prompt).toContain('Cosmic energy portrait');
    expect(prompt).toContain('warm reds, oranges, and golds');
  });

  it('renders a different style opening for each AvatarStyle', () => {
    const base = {
      sunSign: 'Aries',
      moonSign: 'Aries',
      element: 'Fire',
    } as const;

    expect(buildAvatarPrompt({ ...base, style: 'cosmic' })).toContain(
      'Cosmic energy portrait',
    );
    expect(buildAvatarPrompt({ ...base, style: 'tarot' })).toContain(
      'Mystical tarot card art style',
    );
    expect(buildAvatarPrompt({ ...base, style: 'geometric' })).toContain(
      'Sacred geometry patterns',
    );
    expect(buildAvatarPrompt({ ...base, style: 'nebula' })).toContain(
      'Deep space nebula',
    );
  });

  it('always pins the prompt to no-text/no-face/dark-bg invariants', () => {
    const prompt = buildAvatarPrompt({
      sunSign: 'Gemini',
      moonSign: 'Sagittarius',
      element: 'Air',
      style: 'cosmic',
    });

    expect(prompt).toContain('No text');
    expect(prompt).toContain('no face');
    expect(prompt).toContain('Dark background (#0A0A0F)');
    expect(prompt).toContain('Square format');
  });

  it('produces distinct prompts for two different sun signs in the same element', () => {
    // Both Fire signs, same moon, same style — but different correspondences.
    const aries = buildAvatarPrompt({
      sunSign: 'Aries',
      moonSign: 'Cancer',
      element: 'Fire',
      style: 'cosmic',
    });
    const leo = buildAvatarPrompt({
      sunSign: 'Leo',
      moonSign: 'Cancer',
      element: 'Fire',
      style: 'cosmic',
    });

    expect(aries).not.toEqual(leo);
    expect(aries).toContain('Mars');
    expect(leo).toContain('Sun');
    expect(aries).toContain('scarlet');
    expect(leo).toContain('yellow greenish');
  });
});
