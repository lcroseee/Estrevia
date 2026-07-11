export type CorrespondenceKey =
  | 'detail.hebrewLetter'
  | 'detail.treeOfLifePath'
  | 'detail.connects'
  | 'detail.astrological'
  | 'detail.liber777Column';

export interface CorrespondenceRow {
  key: CorrespondenceKey;
  value: string;
}

export interface CardCorrespondences {
  hebrewLetter?: string | null;
  treeOfLifePath?: number | null;
  treeOfLifeConnects?: number[] | null;
  astrology: string;
  liber777Column?: string | null;
}

/**
 * Builds the "777 Correspondences" rows for a tarot card.
 *
 * The 22 Majors carry all five fields; the 56 Minors OMIT the path/Hebrew-letter
 * fields in cards.json (undefined — minors map to sephiroth, not paths). Rendering
 * card.treeOfLifeConnects.join() unconditionally threw during SSR for every
 * minor — this helper renders `astrology` always and the null-able fields only
 * when present (loose `!= null` catches both null and undefined), so minors get
 * a valid (shorter) block instead of a crash.
 */
export function buildCorrespondenceRows(card: CardCorrespondences): CorrespondenceRow[] {
  const rows: CorrespondenceRow[] = [];
  if (card.hebrewLetter) rows.push({ key: 'detail.hebrewLetter', value: card.hebrewLetter });
  if (card.treeOfLifePath != null) rows.push({ key: 'detail.treeOfLifePath', value: String(card.treeOfLifePath) });
  if (card.treeOfLifeConnects && card.treeOfLifeConnects.length > 0) {
    rows.push({ key: 'detail.connects', value: card.treeOfLifeConnects.join(' ↔ ') });
  }
  rows.push({ key: 'detail.astrological', value: card.astrology });
  if (card.liber777Column) rows.push({ key: 'detail.liber777Column', value: card.liber777Column });
  return rows;
}
