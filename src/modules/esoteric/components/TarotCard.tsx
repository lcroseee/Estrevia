'use client';

import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { getCardName } from './tarotLocalize';

// Suit colors matching Thoth tradition
const SUIT_COLORS: Record<string, string> = {
  wands: '#FF6B35',
  cups: '#4169E1',
  swords: '#87CEEB',
  disks: '#8B7355',
  major: '#A78BFA',
};

const SUIT_SYMBOLS: Record<string, string> = {
  wands: '\u2660',   // Using unicode symbols as placeholders
  cups: '\u2665',
  swords: '\u2666',
  disks: '\u2663',
  major: '\u2726',
};

export interface TarotCardData {
  id: string;
  number: number;
  name: { en: string; es?: string };
  suit: string;
  keywords?: {
    upright?: { en: string[]; es?: string[] };
    reversed?: { en: string[]; es?: string[] };
  };
  description?: { en: string; es?: string };
  hebrewLetter?: string;
  treeOfLifePath?: number;
}

interface TarotCardProps {
  card: TarotCardData;
  size?: 'sm' | 'md' | 'lg';
  reversed?: boolean;
  onClick?: () => void;
  interactive?: boolean;
}

const SIZE_CLASSES = {
  sm: 'w-20 h-32',
  md: 'w-28 h-44',
  lg: 'w-36 h-56',
};

const FONT_SIZES = {
  sm: { number: 'text-lg', name: 'text-[8px]', symbol: 'text-2xl' },
  md: { number: 'text-2xl', name: 'text-[10px]', symbol: 'text-3xl' },
  lg: { number: 'text-3xl', name: 'text-xs', symbol: 'text-4xl' },
};

export const TarotCard = memo(function TarotCard({
  card,
  size = 'md',
  reversed = false,
  onClick,
  interactive = true,
}: TarotCardProps) {
  const prefersReduced = useReducedMotion();
  const locale = useLocale();
  const tPage = useTranslations('tarotPage');
  const color = SUIT_COLORS[card.suit] ?? SUIT_COLORS.major;
  const symbol = SUIT_SYMBOLS[card.suit] ?? SUIT_SYMBOLS.major;
  const fonts = FONT_SIZES[size];
  const displayNumber = card.suit === 'major' ? toRoman(card.number) : String(card.number);
  const localizedName = getCardName(card, locale);
  const reversedAria = tPage('reversedAriaShort');
  const reversedLabel = tPage('detail.reversed');

  return (
    <motion.button
      type="button"
      onClick={interactive ? onClick : undefined}
      className={[
        SIZE_CLASSES[size],
        'relative rounded-lg border overflow-hidden flex flex-col items-center justify-between p-2',
        'transition-all duration-200',
        interactive ? 'cursor-pointer hover:scale-105 hover:shadow-lg active:scale-[0.98]' : 'cursor-default',
      ].join(' ')}
      style={{
        borderColor: `${color}40`,
        background: `linear-gradient(135deg, rgba(10,10,15,0.95) 0%, ${color}15 100%)`,
        transform: reversed ? 'rotate(180deg)' : undefined,
      }}
      whileHover={interactive && !prefersReduced ? { y: -4 } : undefined}
      aria-label={`${localizedName}${reversed ? ` (${reversedAria})` : ''}`}
      disabled={!interactive}
    >
      {/* Top number */}
      <span
        className={`${fonts.number} font-bold self-start`}
        style={{ color, fontFamily: 'var(--font-geist-mono, monospace)' }}
      >
        {displayNumber}
      </span>

      {/* Center symbol */}
      <span
        className={`${fonts.symbol} opacity-60`}
        style={{ color }}
        aria-hidden="true"
      >
        {symbol}
      </span>

      {/* Bottom name */}
      <span
        className={`${fonts.name} text-center leading-tight font-medium tracking-wide uppercase`}
        style={{
          color: 'rgba(255,255,255,0.7)',
          fontFamily: 'var(--font-geist-sans, sans-serif)',
        }}
      >
        {localizedName}
      </span>

      {/* Reversed indicator */}
      {reversed && (
        <div
          className="absolute top-1 right-1 w-2 h-2 rounded-full"
          style={{ backgroundColor: '#F87171' }}
          aria-label={reversedLabel}
        />
      )}
    </motion.button>
  );
});

function toRoman(num: number): string {
  if (num === 0) return '0';
  const values = [10, 9, 5, 4, 1];
  const symbols = ['X', 'IX', 'V', 'IV', 'I'];
  let result = '';
  let remaining = num;
  for (let i = 0; i < values.length; i++) {
    while (remaining >= values[i]) {
      result += symbols[i];
      remaining -= values[i];
    }
  }
  return result;
}
