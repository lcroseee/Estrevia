'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useSubscription } from '@/shared/hooks/useSubscription';
import { postJson } from '@/shared/lib/apiFetch';
import { PaywallCta } from '@/shared/components/PaywallCta';
import { PaywallModal } from '@/shared/components/PaywallModal';
import { TarotCard } from './TarotCard';
import type { TarotCardData } from './TarotCard';
import { getCardName, getCardDescription, getCardKeywords } from './tarotLocalize';

interface DrawnCard {
  cardId: string;
  reversed: boolean;
  positionId: number;
}

interface CelticCrossProps {
  allCards: TarotCardData[];
}

type CelticPositionKey =
  | 'present'
  | 'challenge'
  | 'foundation'
  | 'recentPast'
  | 'crown'
  | 'nearFuture'
  | 'self'
  | 'environment'
  | 'hopesFears'
  | 'outcome';

const POSITIONS: { id: number; key: CelticPositionKey }[] = [
  { id: 1, key: 'present' },
  { id: 2, key: 'challenge' },
  { id: 3, key: 'foundation' },
  { id: 4, key: 'recentPast' },
  { id: 5, key: 'crown' },
  { id: 6, key: 'nearFuture' },
  { id: 7, key: 'self' },
  { id: 8, key: 'environment' },
  { id: 9, key: 'hopesFears' },
  { id: 10, key: 'outcome' },
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
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const prefersReduced = useReducedMotion();
  const { isPro, isLoading: subLoading } = useSubscription();
  const pathname = usePathname();
  const [drawnCards, setDrawnCards] = useState<DrawnCard[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedCard, setSelectedCard] = useState<DrawnCard | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [interpretError, setInterpretError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isPro) return;
    if (drawnCards.length !== 10) return;
    if (revealedCount !== 10) return;
    if (interpretation) return;
    if (isInterpreting) return;

    setIsInterpreting(true);
    setInterpretError(null);

    const payload = {
      spreadType: 'celtic_cross',
      cards: drawnCards.map((dc) => {
        const cardData = allCards.find((c) => c.id === dc.cardId);
        const pos = POSITIONS.find((p) => p.id === dc.positionId);
        return {
          position: pos?.key ?? `position-${dc.positionId}`,
          cardId: dc.cardId,
          cardName: cardData ? getCardName(cardData, locale) : dc.cardId,
          reversed: dc.reversed,
        };
      }),
    };

    void postJson<{ success: boolean; data: { interpretation: string } | null }>(
      '/api/v1/tarot/interpret',
      payload,
    ).then((result) => {
      setIsInterpreting(false);
      switch (result.kind) {
        case 'ok':
          if (result.data.success && result.data.data?.interpretation) {
            setInterpretation(result.data.data.interpretation);
          }
          break;
        case 'auth-required':
          setInterpretError(t('interpretProRequired'));
          break;
        case 'error':
          if (result.status === 403) {
            setInterpretError(t('interpretProRequired'));
          } else {
            setInterpretError(t('interpretError'));
          }
          break;
        case 'network-error':
          setInterpretError(t('interpretNetworkError'));
          break;
      }
    });
  }, [isPro, drawnCards, revealedCount, interpretation, isInterpreting, allCards, locale, t]);

  if (subLoading) {
    return <div className="h-64 flex items-center justify-center"><div className="w-20 h-32 rounded-lg bg-white/4 animate-pulse" /></div>;
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
                    initial={prefersReduced ? false : { rotateY: -90, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    transition={prefersReduced ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
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
                  {t(`celticPositions.${pos.key}`)}
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

      {/* Interpretation (Pro) or PaywallCta (free) — shown after all 10 cards revealed */}
      {revealedCount === 10 && (
        <>
          {isPro ? (
            <section aria-labelledby="celtic-interpretation-heading" className="space-y-3 max-w-2xl mx-auto">
              <h3
                id="celtic-interpretation-heading"
                className="text-sm font-medium text-white/60 uppercase tracking-wider"
              >
                {t('interpretation')}
              </h3>
              {isInterpreting && (
                <p className="text-sm text-white/45">{t('interpreting')}</p>
              )}
              {interpretation && (
                <p
                  className="text-sm text-white/70 leading-relaxed whitespace-pre-line"
                  style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}
                >
                  {interpretation}
                </p>
              )}
              {interpretError && (
                <p className="text-xs text-red-400" role="alert">
                  {interpretError}
                </p>
              )}
            </section>
          ) : (
            <PaywallCta
              trigger="celtic-cross"
              variant="card"
              onClick={() => setPaywallOpen(true)}
            />
          )}
        </>
      )}

      {/* Card detail modal */}
      <AnimatePresence>
        {selectedCard && (() => {
          const cardData = allCards.find((c) => c.id === selectedCard.cardId);
          const position = POSITIONS.find((p) => p.id === selectedCard.positionId);
          if (!cardData) return null;

          return (
            <motion.div
              key="modal"
              initial={prefersReduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={prefersReduced ? {} : { opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
              onClick={() => setSelectedCard(null)}
            >
              <motion.div
                initial={prefersReduced ? false : { scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={prefersReduced ? {} : { scale: 0.9, opacity: 0 }}
                className="w-full max-w-sm rounded-xl border border-white/10 p-6 space-y-4"
                style={{ background: '#0F0F18' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start gap-4">
                  <TarotCard card={cardData} size="sm" reversed={selectedCard.reversed} interactive={false} />
                  <div className="space-y-1 flex-1">
                    <p className="text-xs text-white/40 uppercase tracking-wider">
                      {position ? t(`celticPositions.${position.key}`) : null}
                    </p>
                    <h3 className="text-lg font-semibold text-white/90">
                      {getCardName(cardData, locale)}
                      {selectedCard.reversed && <span className="text-xs text-red-400/70 ml-1.5">R</span>}
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {getCardKeywords(
                        cardData,
                        selectedCard.reversed ? 'reversed' : 'upright',
                        locale,
                      ).map((kw) => (
                        <span key={kw} className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-white/50">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                {cardData.description && (
                  <p className="text-sm text-white/60 leading-relaxed" style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}>
                    {getCardDescription(cardData, locale)}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedCard(null)}
                  className="w-full py-2 rounded-lg text-sm text-white/40 hover:text-white/60 border border-white/8 hover:border-white/15 transition-colors"
                >
                  {tCommon('close')}
                </button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        returnUrl={pathname}
        triggerContext="celtic-cross"
      />
    </div>
  );
}
