'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useSubscription } from '@/shared/hooks/useSubscription';
import { TarotCard } from './TarotCard';
import type { TarotCardData } from './TarotCard';
import Link from 'next/link';

interface DrawnCard {
  cardId: string;
  reversed: boolean;
  positionId: number;
}

interface CelticCrossProps {
  allCards: TarotCardData[];
}

const POSITIONS = [
  { id: 1, label: 'Present' },
  { id: 2, label: 'Challenge' },
  { id: 3, label: 'Foundation' },
  { id: 4, label: 'Recent Past' },
  { id: 5, label: 'Crown' },
  { id: 6, label: 'Near Future' },
  { id: 7, label: 'Self' },
  { id: 8, label: 'Environment' },
  { id: 9, label: 'Hopes/Fears' },
  { id: 10, label: 'Outcome' },
];

// Grid position mapping for CSS Grid layout (row/col)
// The cross: positions 1-6 in a cross pattern, 7-10 in a column on the right
const GRID_POSITIONS: Record<number, { gridColumn: string; gridRow: string; rotate?: number }> = {
  1: { gridColumn: '2', gridRow: '2' },
  2: { gridColumn: '2', gridRow: '2', rotate: 90 },
  3: { gridColumn: '2', gridRow: '3' },
  4: { gridColumn: '1', gridRow: '2' },
  5: { gridColumn: '2', gridRow: '1' },
  6: { gridColumn: '3', gridRow: '2' },
  7: { gridColumn: '4', gridRow: '4' },
  8: { gridColumn: '4', gridRow: '3' },
  9: { gridColumn: '4', gridRow: '2' },
  10: { gridColumn: '4', gridRow: '1' },
};

export function CelticCross({ allCards }: CelticCrossProps) {
  const t = useTranslations('tarot');
  const { isPro, isLoading: subLoading } = useSubscription();
  const [drawnCards, setDrawnCards] = useState<DrawnCard[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedCard, setSelectedCard] = useState<DrawnCard | null>(null);

  const handleDraw = useCallback(() => {
    setIsDrawing(true);
    setRevealedCount(0);

    const randomBytes = new Uint32Array(20);
    crypto.getRandomValues(randomBytes);

    const usedIndices = new Set<number>();
    const cards: DrawnCard[] = [];

    for (let i = 0; i < 10; i++) {
      let idx = randomBytes[i * 2] % allCards.length;
      while (usedIndices.has(idx)) {
        idx = (idx + 1) % allCards.length;
      }
      usedIndices.add(idx);
      cards.push({
        cardId: allCards[idx].id,
        reversed: (randomBytes[i * 2 + 1] % 2) === 0,
        positionId: i + 1,
      });
    }

    setDrawnCards(cards);

    // Reveal sequentially
    for (let i = 1; i <= 10; i++) {
      setTimeout(() => {
        setRevealedCount(i);
        if (i === 10) setIsDrawing(false);
      }, 300 + i * 350);
    }
  }, [allCards]);

  if (subLoading) {
    return <div className="h-64 flex items-center justify-center"><div className="w-20 h-32 rounded-lg bg-white/4 animate-pulse" /></div>;
  }

  if (!isPro) {
    return (
      <div className="rounded-xl border border-white/8 p-6 text-center space-y-3" style={{ background: 'rgba(255,255,255,0.025)' }}>
        <p className="text-sm text-white/50">{t('proRequired')}</p>
        <Link
          href="/settings"
          className="inline-block px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-br from-[#FFD700]/90 to-[#FF8C00]/80 text-black hover:shadow-lg hover:shadow-[#FFD700]/20 transition-all"
        >
          {t('upgradeToPro')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Celtic Cross grid */}
      <div
        className="grid gap-2 mx-auto"
        style={{
          gridTemplateColumns: 'repeat(4, 5.5rem)',
          gridTemplateRows: 'repeat(4, 8.5rem)',
          maxWidth: 'fit-content',
        }}
      >
        {POSITIONS.map((pos) => {
          const drawn = drawnCards.find((dc) => dc.positionId === pos.id);
          const cardData = drawn ? allCards.find((c) => c.id === drawn.cardId) : null;
          const isRevealed = pos.id <= revealedCount;
          const gridPos = GRID_POSITIONS[pos.id];

          return (
            <div
              key={pos.id}
              className="flex flex-col items-center justify-center gap-1 relative"
              style={{
                gridColumn: gridPos.gridColumn,
                gridRow: gridPos.gridRow,
                zIndex: pos.id === 2 ? 10 : 1,
              }}
            >
              <AnimatePresence mode="wait">
                {isRevealed && cardData ? (
                  <motion.div
                    key="revealed"
                    initial={{ rotateY: -90, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    style={{
                      willChange: 'transform',
                      transform: gridPos.rotate ? `rotate(${gridPos.rotate}deg)` : undefined,
                    }}
                  >
                    <TarotCard
                      card={cardData}
                      size="sm"
                      reversed={drawn?.reversed ?? false}
                      onClick={() => setSelectedCard(drawn ?? null)}
                    />
                  </motion.div>
                ) : (
                  <div
                    className="w-20 h-32 rounded-lg border border-white/6 flex items-center justify-center"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      transform: gridPos.rotate ? `rotate(${gridPos.rotate}deg)` : undefined,
                    }}
                  >
                    <span className="text-[10px] text-white/15">{pos.id}</span>
                  </div>
                )}
              </AnimatePresence>
              {!gridPos.rotate && (
                <span className="text-[8px] text-white/20 uppercase tracking-wider absolute -bottom-1">
                  {pos.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Draw button */}
      <div className="flex justify-center gap-3">
        {drawnCards.length === 0 ? (
          <button
            type="button"
            onClick={handleDraw}
            disabled={isDrawing}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-br from-[#FFD700]/90 to-[#FF8C00]/80 text-black hover:shadow-lg hover:shadow-[#FFD700]/20 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {t('drawCelticCross')}
          </button>
        ) : revealedCount === 10 ? (
          <button
            type="button"
            onClick={() => { setDrawnCards([]); setRevealedCount(0); }}
            className="px-5 py-2 rounded-xl text-sm text-white/40 border border-white/10 hover:border-white/20 transition-colors"
          >
            {t('drawAgain')}
          </button>
        ) : null}
      </div>

      {/* Card detail modal */}
      <AnimatePresence>
        {selectedCard && (() => {
          const cardData = allCards.find((c) => c.id === selectedCard.cardId);
          const position = POSITIONS.find((p) => p.id === selectedCard.positionId);
          if (!cardData) return null;

          return (
            <motion.div
              key="modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
              onClick={() => setSelectedCard(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-sm rounded-xl border border-white/10 p-6 space-y-4"
                style={{ background: '#0F0F18' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start gap-4">
                  <TarotCard card={cardData} size="sm" reversed={selectedCard.reversed} interactive={false} />
                  <div className="space-y-1 flex-1">
                    <p className="text-xs text-white/40 uppercase tracking-wider">
                      {position?.label}
                    </p>
                    <h3 className="text-lg font-semibold text-white/90">
                      {cardData.name.en}
                      {selectedCard.reversed && <span className="text-xs text-red-400/70 ml-1.5">R</span>}
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {(selectedCard.reversed
                        ? cardData.keywords?.reversed?.en
                        : cardData.keywords?.upright?.en
                      )?.map((kw) => (
                        <span key={kw} className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-white/50">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                {cardData.description && (
                  <p className="text-sm text-white/60 leading-relaxed" style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}>
                    {cardData.description.en}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedCard(null)}
                  className="w-full py-2 rounded-lg text-sm text-white/40 hover:text-white/60 border border-white/8 hover:border-white/15 transition-colors"
                >
                  Close
                </button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
