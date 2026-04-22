'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
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
  const [dailyCard, setDailyCard] = useState<DailyCardState | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);

  // Check if user already drew today
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch('/api/v1/tarot/daily');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data) {
            if (!cancelled) {
              setDailyCard({ cardId: data.data.cardId, reversed: data.data.reversed });
              setIsFlipped(true);
            }
          }
        }
      } catch {
        // Not logged in or no card — show draw button
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, []);

  const handleDraw = useCallback(async () => {
    setIsDrawing(true);

    // Client-side random selection
    const randomBytes = new Uint32Array(2);
    crypto.getRandomValues(randomBytes);
    const cardIndex = randomBytes[0] % allCards.length;
    const reversed = (randomBytes[1] % 2) === 0;
    const selectedCard = allCards[cardIndex];

    // Save to server
    try {
      const res = await fetch('/api/v1/tarot/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: selectedCard.id,
          reversed,
        }),
      });

      if (res.ok) {
        setDailyCard({ cardId: selectedCard.id, reversed });
        // Trigger flip animation
        setTimeout(() => {
          setIsFlipped(true);
          setIsDrawing(false);
        }, 300);
      } else {
        // Still show the card even if save fails (user might not be logged in)
        setDailyCard({ cardId: selectedCard.id, reversed });
        setTimeout(() => {
          setIsFlipped(true);
          setIsDrawing(false);
        }, 300);
      }
    } catch {
      setDailyCard({ cardId: selectedCard.id, reversed });
      setTimeout(() => {
        setIsFlipped(true);
        setIsDrawing(false);
      }, 300);
    }
  }, [allCards]);

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

      {!isFlipped && !isDrawing && (
        <p className="text-xs text-white/30">Tap the card to draw</p>
      )}
    </div>
  );
}
