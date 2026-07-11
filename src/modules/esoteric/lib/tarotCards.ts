import { getCardName } from '@/modules/esoteric/components/tarotLocalize';

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

export interface TarotGridCard {
  id: string;
  name: string;
  suit: string;
  number: number;
}

export interface TarotGridGroup {
  suit: string;
  cards: TarotGridCard[];
}

const SUIT_ORDER = ['major', 'wands', 'cups', 'swords', 'disks'] as const;

/**
 * Groups tarot cards by suit in canonical order for the server-rendered hub
 * grid. Every card becomes a crawlable anchor in the initial HTML (fixes the
 * minor-arcana orphan problem — see audit §2b).
 */
export function groupTarotCards(
  cards: Array<{ id: string; number: number; name: { en: string; es?: string }; suit: string }>,
  locale: string,
): TarotGridGroup[] {
  return SUIT_ORDER.map((suit) => ({
    suit,
    cards: cards
      .filter((c) => c.suit === suit)
      .sort((a, b) => a.number - b.number)
      .map((c) => ({ id: c.id, name: getCardName(c, locale), suit: c.suit, number: c.number })),
  })).filter((g) => g.cards.length > 0);
}
