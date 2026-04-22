'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { apiFetch, postJson } from '@/shared/lib/apiFetch';
import { TarotCard } from './TarotCard';
import type { TarotCardData } from './TarotCard';

interface DailyCardProps {
  allCards: TarotCardData[];
}

interface DailyCardState {
  cardId: string;
  reversed: boolean;
}

export function DailyCard({ allCards }: DailyCardProps) {
  const prefersReduced = useReducedMotion();
  const t = useTranslations('tarot');
  const [dailyCard, setDailyCard] = useState<DailyCardState | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [saveHint, setSaveHint] = useState<string | null>(null);

  // Check if user already drew today
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const result = await apiFetch<{ success: boolean; data?: { cardId: string; reversed: boolean } }>('/api/v1/tarot/daily');
      switch (result.kind) {
        case 'ok':
          if (result.data.success && result.data.data && !cancelled) {
            setDailyCard({ cardId: result.data.data.cardId, reversed: result.data.data.reversed });
            setIsFlipped(true);
          }
          break;
        case 'auth-required':
          // Anonymous user — no saved card, show draw UI
          break;
        case 'error':
        case 'network-error':
          console.debug('[DailyCard] GET /api/v1/tarot/daily:', result);
          break;
      }
      if (!cancelled) setIsLoading(false);
    }
    check();
    return () => { cancelled = true; };
  }, []);

  const handleDraw = useCallback(async () => {
    setIsDrawing(true);
    setSaveHint(null);

    // Client-side random selection
    const randomBytes = new Uint32Array(2);
    crypto.getRandomValues(randomBytes);
    const cardIndex = randomBytes[0] % allCards.length;
    const reversed = (randomBytes[1] % 2) === 0;
    const selectedCard = allCards[cardIndex];

    // Save to server — non-blocking, card is shown regardless
    const result = await postJson<{ success: boolean }>('/api/v1/tarot/daily', {
      cardId: selectedCard.id,
      reversed,
    });

    switch (result.kind) {
      case 'ok':
        break;
      case 'auth-required':
        setSaveHint(t('signInToSave'));
        break;
      case 'error':
      case 'network-error':
        console.debug('[DailyCard] POST /api/v1/tarot/daily:', result);
        break;
    }

    setDailyCard({ cardId: selectedCard.id, reversed });
    setTimeout(() => {
      setIsFlipped(true);
      setIsDrawing(false);
    }, 300);
  }, [allCards, t]);

  const cardData = dailyCard
    ? allCards.find((c) => c.id === dailyCard.cardId)
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-52">
        <div className="w-28 h-44 rounded-lg bg-white/4 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ perspective: '800px' }}>
        <AnimatePresence mode="wait">
          {!isFlipped ? (
            <motion.div
              key="back"
              initial={prefersReduced ? false : { rotateY: 0 }}
              exit={prefersReduced ? {} : { rotateY: 90 }}
              transition={prefersReduced ? { duration: 0 } : { duration: 0.3, ease: 'easeIn' }}
              style={{ backfaceVisibility: 'hidden' }}
            >
              {/* Card back */}
              <button
                type="button"
                onClick={handleDraw}
                disabled={isDrawing}
                className="w-28 h-44 rounded-lg border border-[#A78BFA]/30 flex items-center justify-center transition-all hover:border-[#A78BFA]/60 hover:shadow-lg hover:shadow-[#A78BFA]/10 active:scale-[0.97]"
                style={{
                  background: 'linear-gradient(135deg, #1A1030 0%, #0A0A1F 50%, #1A0A30 100%)',
                }}
                aria-label="Draw your daily card"
              >
                <span className="text-4xl text-[#A78BFA]/40" aria-hidden="true">
                  &#x2726;
                </span>
              </button>
            </motion.div>
          ) : cardData ? (
            <motion.div
              key="front"
              initial={prefersReduced ? false : { rotateY: -90 }}
              animate={{ rotateY: 0 }}
              transition={prefersReduced ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
              style={{ backfaceVisibility: 'hidden' }}
            >
              <TarotCard
                card={cardData}
                size="md"
                reversed={dailyCard?.reversed ?? false}
                interactive={false}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Card info */}
      {isFlipped && cardData && (
        <motion.div
          className="text-center space-y-1.5 max-w-xs"
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReduced ? { duration: 0 } : { delay: 0.3, duration: 0.4 }}
        >
          <p className="text-sm font-medium text-white/80">
            {cardData.name.en}
            {dailyCard?.reversed && (
              <span className="ml-1.5 text-xs text-red-400/70">(Reversed)</span>
            )}
          </p>
          {cardData.keywords && (
            <p className="text-xs text-white/40">
              {dailyCard?.reversed
                ? cardData.keywords.reversed?.en.join(' \u00B7 ')
                : cardData.keywords.upright?.en.join(' \u00B7 ')}
            </p>
          )}
        </motion.div>
      )}

      {saveHint && (
        <p className="text-xs text-[#A78BFA]/60">{saveHint}</p>
      )}

      {!isFlipped && !isDrawing && (
        <p className="text-xs text-white/30">Tap the card to draw</p>
      )}
    </div>
  );
}
