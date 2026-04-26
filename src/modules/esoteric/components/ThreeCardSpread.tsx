'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useSubscription } from '@/shared/hooks/useSubscription';
import { postJson } from '@/shared/lib/apiFetch';
import { TarotCard } from './TarotCard';
import type { TarotCardData } from './TarotCard';
import Link from 'next/link';
import { getCardName, getCardDescription, getCardKeywords } from './tarotLocalize';

interface DrawnCard {
  cardId: string;
  reversed: boolean;
  positionId: number;
}

interface ThreeCardSpreadProps {
  allCards: TarotCardData[];
}

const POSITIONS: { id: number; key: 'pastPosition' | 'presentPosition' | 'futurePosition' }[] = [
  { id: 1, key: 'pastPosition' },
  { id: 2, key: 'presentPosition' },
  { id: 3, key: 'futurePosition' },
];

export function ThreeCardSpread({ allCards }: ThreeCardSpreadProps) {
  const t = useTranslations('tarot');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const prefersReduced = useReducedMotion();
  const { isPro, isLoading: subLoading } = useSubscription();
  const [drawnCards, setDrawnCards] = useState<DrawnCard[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedCard, setSelectedCard] = useState<DrawnCard | null>(null);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [interpretError, setInterpretError] = useState<string | null>(null);
  const router = useRouter();

  const handleDraw = useCallback(() => {
    setIsDrawing(true);
    setRevealedCount(0);
    setInterpretation(null);
    setInterpretError(null);

    const randomBytes = new Uint32Array(6);
    crypto.getRandomValues(randomBytes);

    // Pick 3 unique cards
    const usedIndices = new Set<number>();
    const cards: DrawnCard[] = [];

    for (let i = 0; i < 3; i++) {
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

    // Reveal cards sequentially
    setTimeout(() => setRevealedCount(1), 400);
    setTimeout(() => setRevealedCount(2), 900);
    setTimeout(() => {
      setRevealedCount(3);
      setIsDrawing(false);
    }, 1400);

    // Fire-and-forget: save reading. postJson used for consistency; result ignored.
    void postJson('/api/v1/tarot/daily', { spreadType: 'three_card', cards });
  }, [allCards]);

  const handleInterpret = useCallback(async () => {
    if (!isPro || drawnCards.length === 0) return;
    setIsInterpreting(true);
    setInterpretError(null);

    const result = await postJson<{ success: boolean; data: { interpretation: string } | null }>(
      '/api/v1/tarot/interpret',
      {
        spreadType: 'three_card',
        cards: drawnCards.map((dc) => ({
          // Position sent to API stays English ("Past"/"Present"/"Future") so
          // the AI prompt is locale-stable. UI labels are localised via t() below.
          position: ['Past', 'Present', 'Future'][dc.positionId - 1],
          cardId: dc.cardId,
          cardName: allCards.find((c) => c.id === dc.cardId)?.name.en,
          reversed: dc.reversed,
        })),
      },
    );

    setIsInterpreting(false);

    switch (result.kind) {
      case 'ok':
        if (result.data.success && result.data.data?.interpretation) {
          setInterpretation(result.data.data.interpretation);
        }
        break;
      case 'auth-required':
        router.push(`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`);
        break;
      case 'error':
        // 403 FORBIDDEN = authenticated user without an active Pro subscription.
        if (result.status === 403 && (result.payload as Record<string, unknown>)?.error === 'FORBIDDEN') {
          setInterpretError(t('interpretProRequired'));
        } else {
          setInterpretError(t('interpretError'));
        }
        break;
      case 'network-error':
        setInterpretError(t('interpretNetworkError'));
        break;
    }
  }, [isPro, drawnCards, allCards, router, t]);

  if (subLoading) {
    return <div className="h-52 flex items-center justify-center"><div className="w-28 h-44 rounded-lg bg-white/4 animate-pulse" /></div>;
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
      {/* Card positions */}
      <div className="flex items-center justify-center gap-4 sm:gap-6">
        {POSITIONS.map((pos, index) => {
          const drawn = drawnCards.find((dc) => dc.positionId === pos.id);
          const cardData = drawn ? allCards.find((c) => c.id === drawn.cardId) : null;
          const isRevealed = index < revealedCount;

          return (
            <div key={pos.id} className="flex flex-col items-center gap-2">
              <AnimatePresence mode="wait">
                {isRevealed && cardData ? (
                  <motion.div
                    key="revealed"
                    initial={prefersReduced ? false : { rotateY: -90, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    transition={prefersReduced ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
                    style={{ willChange: 'transform' }}
                  >
                    <TarotCard
                      card={cardData}
                      size="sm"
                      reversed={drawn?.reversed ?? false}
                      onClick={() => setSelectedCard(drawn ?? null)}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={prefersReduced ? false : { scale: 0.95 }}
                    animate={{ scale: 1 }}
                    className="w-20 h-32 rounded-lg border border-white/8 flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.02)' }}
                  >
                    <span className="text-lg text-white/15" aria-hidden="true">?</span>
                  </motion.div>
                )}
              </AnimatePresence>
              <span className="text-[10px] text-white/30 uppercase tracking-wider">
                {t(pos.key)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Draw / Interpret buttons */}
      <div className="flex flex-col items-center gap-3">
        {drawnCards.length === 0 && (
          <button
            type="button"
            onClick={handleDraw}
            disabled={isDrawing}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-br from-[#FFD700]/90 to-[#FF8C00]/80 text-black hover:shadow-lg hover:shadow-[#FFD700]/20 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {t('drawCards')}
          </button>
        )}

        {revealedCount === 3 && !interpretation && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleInterpret}
              disabled={isInterpreting}
              className="px-5 py-2 rounded-xl text-sm font-medium bg-[#A78BFA]/20 text-[#A78BFA] hover:bg-[#A78BFA]/30 transition-all disabled:opacity-50"
            >
              {isInterpreting ? t('interpreting') : t('aiInterpretation')}
            </button>
            <button
              type="button"
              onClick={() => { setDrawnCards([]); setRevealedCount(0); setInterpretation(null); }}
              className="px-5 py-2 rounded-xl text-sm text-white/40 border border-white/10 hover:border-white/20 transition-colors"
            >
              {t('drawAgain')}
            </button>
          </div>
        )}
      </div>

      {/* Interpret error */}
      {interpretError && (
        <p className="text-xs text-red-400/80 text-center">{interpretError}</p>
      )}

      {/* AI Interpretation */}
      {interpretation && (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-[#A78BFA]/20 p-5 space-y-2"
          style={{ background: 'rgba(167,139,250,0.05)' }}
        >
          <h4 className="text-xs text-[#A78BFA]/70 uppercase tracking-wider font-medium">
            {t('interpretation')}
          </h4>
          <p
            className="text-sm text-white/70 leading-relaxed whitespace-pre-line"
            style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}
          >
            {interpretation}
          </p>
        </motion.div>
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
                      {position ? t(position.key) : null}
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
                  <p
                    className="text-sm text-white/60 leading-relaxed"
                    style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}
                  >
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
    </div>
  );
}
