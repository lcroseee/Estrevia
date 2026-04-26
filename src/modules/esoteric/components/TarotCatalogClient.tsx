'use client';

import { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { TarotCard } from './TarotCard';
import { DailyCard } from './DailyCard';
import type { TarotCardData } from './TarotCard';
import { getCardName } from './tarotLocalize';

const SUITS = ['major', 'wands', 'cups', 'swords', 'disks'] as const;

interface TarotCatalogClientProps {
  cards: TarotCardData[];
}

export function TarotCatalogClient({ cards }: TarotCatalogClientProps) {
  const t = useTranslations('tarot');
  const tPage = useTranslations('tarotPage');
  const locale = useLocale();
  const [activeSuit, setActiveSuit] = useState<string>('major');

  const filteredCards = useMemo(
    () => cards.filter((c) => c.suit === activeSuit).sort((a, b) => a.number - b.number),
    [cards, activeSuit],
  );

  return (
    <div className="space-y-8">
      {/* Daily card section */}
      <section className="space-y-3">
        <h2
          className="text-sm font-medium text-white/50 uppercase tracking-wider"
          style={{ fontFamily: 'var(--font-geist-sans)' }}
        >
          {t('dailyCardTitle')}
        </h2>
        <DailyCard allCards={cards} />
      </section>

      {/* Suit tabs */}
      <div>
        <nav
          className="flex gap-1 overflow-x-auto pb-2 scrollbar-none"
          aria-label={tPage('cardSuitsAriaLabel')}
        >
          {SUITS.map((suit) => (
            <button
              key={suit}
              type="button"
              onClick={() => setActiveSuit(suit)}
              className={[
                'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
                activeSuit === suit
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/60 hover:bg-white/5',
              ].join(' ')}
              aria-current={activeSuit === suit ? 'true' : undefined}
            >
              {tPage(`suits.${suit}`)}
            </button>
          ))}
        </nav>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {filteredCards.map((card) => (
          <Link
            key={card.id}
            href={`/tarot/${card.id}`}
            className="block"
            aria-label={tPage('viewCardAriaLabel', { name: getCardName(card, locale) })}
          >
            <TarotCard card={card} size="sm" interactive={false} />
          </Link>
        ))}
      </div>

      {filteredCards.length === 0 && (
        <p className="text-sm text-white/30 text-center py-8">
          {tPage('noCardsFound')}
        </p>
      )}
    </div>
  );
}
