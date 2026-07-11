import { describe, it, expect } from 'vitest';
import { buildCorrespondenceRows, groupTarotCards, minorCorrespondences } from '../tarotCards';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const major = {
  hebrewLetter: 'א',
  treeOfLifePath: 11,
  treeOfLifeConnects: [1, 2],
  astrology: 'Uranus',
  liber777Column: 'Air',
};
// Real cards.json minors OMIT these keys entirely (undefined), not null —
// e.g. ace-of-wands has no `treeOfLifePath`. The guard must handle undefined.
const minor = {
  astrology: 'Mars in Aries',
};

describe('buildCorrespondenceRows', () => {
  it('returns all five rows in order for a Major', () => {
    const rows = buildCorrespondenceRows(major);
    expect(rows.map((r) => r.key)).toEqual([
      'detail.hebrewLetter',
      'detail.treeOfLifePath',
      'detail.connects',
      'detail.astrological',
      'detail.liber777Column',
    ]);
    expect(rows.find((r) => r.key === 'detail.connects')?.value).toBe('1 ↔ 2');
  });

  it('does not throw and returns only the astrology row for a Minor', () => {
    expect(() => buildCorrespondenceRows(minor)).not.toThrow();
    const rows = buildCorrespondenceRows(minor);
    expect(rows.map((r) => r.key)).toEqual(['detail.astrological']);
    expect(rows[0].value).toBe('Mars in Aries');
  });
});

const allCards = JSON.parse(
  readFileSync(join(process.cwd(), 'content/tarot/cards.json'), 'utf-8'),
).cards as Array<{ id: string; number: number; name: { en: string; es?: string }; suit: string }>;

describe('groupTarotCards', () => {
  it('groups all 78 cards into 5 ordered suits', () => {
    const groups = groupTarotCards(allCards, 'en');
    expect(groups.map((g) => g.suit)).toEqual(['major', 'wands', 'cups', 'swords', 'disks']);
    expect(groups.reduce((n, g) => n + g.cards.length, 0)).toBe(78);
    expect(groups.find((g) => g.suit === 'major')?.cards).toHaveLength(22);
    expect(groups.find((g) => g.suit === 'wands')?.cards).toHaveLength(14);
  });

  it('resolves localized names', () => {
    const groups = groupTarotCards(allCards, 'es');
    const fool = groups[0].cards.find((c) => c.id === 'the-fool');
    expect(typeof fool?.name).toBe('string');
    expect(fool?.name.length).toBeGreaterThan(0);
  });
});

describe('minorCorrespondences (deterministic 777)', () => {
  it('pip → sephirah + world (Ace of Wands = Kether in Atziluth)', () => {
    const rows = minorCorrespondences({ id: 'ace-of-wands', suit: 'wands', number: 1 });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(byKey['detail.sephirah']).toContain('Kether');
    expect(byKey['detail.world']).toContain('Atziluth');
  });
  it('pip number maps to the right sephirah (10 of Disks = Malkuth in Assiah)', () => {
    const byKey = Object.fromEntries(minorCorrespondences({ id: 'ten-of-disks', suit: 'disks', number: 10 }).map((r) => [r.key, r.value]));
    expect(byKey['detail.sephirah']).toContain('Malkuth');
    expect(byKey['detail.world']).toContain('Assiah');
  });
  it('court → element-of-element (Knight of Cups = Fire of Water)', () => {
    const byKey = Object.fromEntries(minorCorrespondences({ id: 'knight-of-cups', suit: 'cups', number: 11 }).map((r) => [r.key, r.value]));
    expect(byKey['detail.elementOfElement']).toBe('Fire of Water');
    expect(byKey['detail.world']).toContain('Briah');
  });
  it('major → [] (majors use path/Hebrew-letter rows instead)', () => {
    expect(minorCorrespondences({ id: 'the-fool', suit: 'major', number: 0 })).toEqual([]);
  });
});
