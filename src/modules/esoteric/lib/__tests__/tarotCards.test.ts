import { describe, it, expect } from 'vitest';
import { buildCorrespondenceRows } from '../tarotCards';

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
