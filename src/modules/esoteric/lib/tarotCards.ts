import { getCardName } from '@/modules/esoteric/components/tarotLocalize';

export type CorrespondenceKey =
  | 'detail.hebrewLetter'
  | 'detail.treeOfLifePath'
  | 'detail.connects'
  | 'detail.astrological'
  | 'detail.liber777Column'
  | 'detail.sephirah'
  | 'detail.world'
  | 'detail.elementOfElement';

export interface CorrespondenceRow {
  key: CorrespondenceKey;
  value: string;
}

export interface CardCorrespondences {
  id?: string;
  suit?: string;
  number?: number;
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
  // Minor arcana: the Golden Dawn / Thoth 777 correspondences are deterministic,
  // so derive them in code when the major path/Hebrew fields are absent (T18).
  if (card.hebrewLetter == null && card.treeOfLifePath == null && card.id && card.suit && card.number != null) {
    rows.push(...minorCorrespondences({ id: card.id, suit: card.suit, number: card.number }));
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

// ---------------------------------------------------------------------------
// Minor-arcana 777 correspondences (deterministic — Golden Dawn / Thoth) · T18
// ---------------------------------------------------------------------------

const SEPHIROTH: Record<number, string> = {
  1: 'Kether (Crown)', 2: 'Chokmah (Wisdom)', 3: 'Binah (Understanding)',
  4: 'Chesed (Mercy)', 5: 'Geburah (Severity)', 6: 'Tiphareth (Beauty)',
  7: 'Netzach (Victory)', 8: 'Hod (Splendour)', 9: 'Yesod (Foundation)',
  10: 'Malkuth (Kingdom)',
};
const SUIT_WORLD: Record<string, string> = {
  wands: 'Atziluth (Emanation / Fire)', cups: 'Briah (Creation / Water)',
  swords: 'Yetzirah (Formation / Air)', disks: 'Assiah (Action / Earth)',
};
const SUIT_ELEMENT: Record<string, string> = { wands: 'Fire', cups: 'Water', swords: 'Air', disks: 'Earth' };
// Thoth court→element: Knight=Fire, Queen=Water, Prince=Air, Princess=Earth.
const COURT_ELEMENT: Record<string, string> = { knight: 'Fire', queen: 'Water', prince: 'Air', princess: 'Earth' };

/**
 * Deterministic minor-arcana 777 rows: the 40 pips map to sephirah (pip number)
 * + world (suit); the 16 courts map to element-of-element (rank × suit) + world.
 * Majors return [] — they carry path/Hebrew-letter rows instead.
 */
export function minorCorrespondences(card: { id: string; suit: string; number: number }): CorrespondenceRow[] {
  if (card.suit === 'major') return [];
  const rows: CorrespondenceRow[] = [];
  const world = SUIT_WORLD[card.suit];
  const rank = card.id.split('-of-')[0]!;
  if (rank in COURT_ELEMENT) {
    rows.push({ key: 'detail.elementOfElement', value: `${COURT_ELEMENT[rank]} of ${SUIT_ELEMENT[card.suit]}` });
  } else if (SEPHIROTH[card.number]) {
    rows.push({ key: 'detail.sephirah', value: SEPHIROTH[card.number]! });
  }
  if (world) rows.push({ key: 'detail.world', value: world });
  return rows;
}
