import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTarotCardTitle, isTarotEsRetitleEnabled } from '../tarot-title';
import { TITLE_SUFFIX, MAX_TITLE_LENGTH } from '../constants';

describe('buildTarotCardTitle', () => {
  it('EN is the unchanged control regardless of the flag', () => {
    expect(buildTarotCardTitle('The Fool', 'en', true)).toBe('The Fool — Thoth Tarot');
    expect(buildTarotCardTitle('The Fool', 'en', false)).toBe('The Fool — Thoth Tarot');
  });

  it('ES with the experiment OFF is the control title', () => {
    expect(buildTarotCardTitle('Nueve de Bastos', 'es', false)).toBe('Nueve de Bastos — Thoth Tarot');
  });

  it('ES with the experiment ON uses the significado cluster + (Thoth) when it fits', () => {
    expect(buildTarotCardTitle('Nueve de Bastos', 'es', true)).toBe(
      'Nueve de Bastos: significado en el tarot (Thoth)',
    );
  });

  it('ES ON drops " (Thoth)" (never mid-word truncates) for a long name', () => {
    const t = buildTarotCardTitle('Caballero de Espadas', 'es', true);
    expect(t).toBe('Caballero de Espadas: significado en el tarot');
    expect(t).not.toContain('(Thoth)');
    expect((t + TITLE_SUFFIX).length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
  });

  it('no ES card title exceeds 60 chars once the suffix is appended', () => {
    const cards = JSON.parse(
      readFileSync(join(process.cwd(), 'content/tarot/cards.json'), 'utf-8'),
    ).cards as Array<{ name: { es?: string; en: string } }>;
    for (const c of cards) {
      const name = c.name.es ?? c.name.en;
      const full = buildTarotCardTitle(name, 'es', true) + TITLE_SUFFIX;
      expect(full.length, `${name} -> ${full} (${full.length})`).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    }
  });
});

describe('isTarotEsRetitleEnabled', () => {
  const original = process.env.TAROT_ES_RETITLE_EXPERIMENT;
  afterEach(() => {
    if (original === undefined) delete process.env.TAROT_ES_RETITLE_EXPERIMENT;
    else process.env.TAROT_ES_RETITLE_EXPERIMENT = original;
  });

  it('defaults ON when unset', () => {
    delete process.env.TAROT_ES_RETITLE_EXPERIMENT;
    expect(isTarotEsRetitleEnabled()).toBe(true);
  });
  it('is OFF only for the literal "off"', () => {
    process.env.TAROT_ES_RETITLE_EXPERIMENT = 'off';
    expect(isTarotEsRetitleEnabled()).toBe(false);
    process.env.TAROT_ES_RETITLE_EXPERIMENT = 'on';
    expect(isTarotEsRetitleEnabled()).toBe(true);
  });
});
