import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCardDeckBridge } from '../tarotLocalize';

describe('getCardDeckBridge', () => {
  it('returns the locale-specific bridge when present', () => {
    const card = {
      name: { en: 'Nine of Wands', es: 'Nueve de Bastos' },
      deckBridge: { en: 'EN bridge', es: 'ES puente' },
    };
    expect(getCardDeckBridge(card, 'es')).toBe('ES puente');
    expect(getCardDeckBridge(card, 'en')).toBe('EN bridge');
  });

  it('falls back to EN when the es bridge is missing', () => {
    const card = { name: { en: 'X' }, deckBridge: { en: 'only en' } };
    expect(getCardDeckBridge(card, 'es')).toBe('only en');
  });

  it('returns "" when there is no deckBridge (renders nothing)', () => {
    const card = { name: { en: 'X' } };
    expect(getCardDeckBridge(card, 'es')).toBe('');
    expect(getCardDeckBridge(card, 'en')).toBe('');
  });
});

const PLACEHOLDER = /\b(TODO|TKTK|FIXME|lorem ipsum|placeholder|XXX)\b/i;
// Legal guard (CLAUDE.md): Book of Thoth (1944) prose + Harris imagery are
// copyright — the bridge may only NAME public-domain deck equivalents.
const BANNED = /(book of thoth|frieda harris|harris deck|thoth 1944)/i;

describe('cards.json deckBridge content quality (activates as founder authors)', () => {
  const cards = JSON.parse(
    readFileSync(join(process.cwd(), 'content/tarot/cards.json'), 'utf-8'),
  ).cards as Array<{ id: string; deckBridge?: { en?: string; es?: string } }>;
  const authored = cards.filter((c) => c.deckBridge);

  it('every authored deckBridge is bilingual and free of placeholders', () => {
    for (const c of authored) {
      const b = c.deckBridge!;
      expect(b.en?.trim(), `${c.id}.en empty`).toBeTruthy();
      expect(b.es?.trim(), `${c.id}.es empty (español neutro required)`).toBeTruthy();
      expect(PLACEHOLDER.test(b.en ?? ''), `${c.id}.en placeholder`).toBe(false);
      expect(PLACEHOLDER.test(b.es ?? ''), `${c.id}.es placeholder`).toBe(false);
    }
  });

  it('no authored deckBridge references copyrighted Thoth 1944 / Harris sources', () => {
    for (const c of authored) {
      expect(BANNED.test(c.deckBridge!.en ?? ''), `${c.id}.en legal`).toBe(false);
      expect(BANNED.test(c.deckBridge!.es ?? ''), `${c.id}.es legal`).toBe(false);
    }
  });
});
