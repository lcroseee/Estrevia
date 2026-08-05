'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { SynastryScores, CategoryScore } from '@/modules/astro-engine/synastry-scoring';
import type { SynastryAspect } from '@/modules/astro-engine/synastry';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import { buildShareUrl } from '@/shared/lib/share';
import type { SynastryPersonSummary } from '@/shared/types/synastry';
import { ZodiacFrameToggle, type FrameState } from './ZodiacFrameToggle';

// Same key ChartDisplay writes, so a frame chosen on /chart carries over here.
const FRAME_STORAGE_KEY = 'estrevia.zodiacFrame';

/**
 * Sign labels for one person in the active frame.
 *
 * In `both` the pair is shown together — `Gemini / Cancer` — matching the
 * delta-column presentation in SP-A's PositionTable rather than inventing a
 * third treatment. Falls back to the sidereal label when a payload predates
 * SP-B and carries no tropical fields.
 */
function frameLabels(s: SynastryPersonSummary, frame: FrameState) {
  if (frame === 'tropical') {
    return { sun: s.tropicalSunSign ?? s.sunSign, moon: s.tropicalMoonSign ?? s.moonSign };
  }
  if (frame === 'both') {
    return {
      sun: s.sunSign && s.tropicalSunSign ? `${s.sunSign} / ${s.tropicalSunSign}` : s.sunSign,
      moon: s.moonSign && s.tropicalMoonSign ? `${s.moonSign} / ${s.tropicalMoonSign}` : s.moonSign,
    };
  }
  return { sun: s.sunSign, moon: s.moonSign };
}



interface SynastryResultProps {
  id: string;
  scores: SynastryScores;
  aspects: SynastryAspect[];
  chart1Summary: SynastryPersonSummary;
  chart2Summary: SynastryPersonSummary;
  onReset: () => void;
}

// Category colors for the score bars
const CATEGORY_COLORS: Record<string, string> = {
  emotional: '#E879F9',
  communication: '#60A5FA',
  passion: '#F87171',
  stability: '#34D399',
  growth: '#FBBF24',
};

// Aspect type display styling
const ASPECT_STYLES: Record<string, { color: string; symbol: string }> = {
  Conjunction: { color: '#FFD700', symbol: '\u260C' },
  Trine: { color: '#34D399', symbol: '\u25B3' },
  Sextile: { color: '#60A5FA', symbol: '\u2731' },
  Square: { color: '#F87171', symbol: '\u25A1' },
  Opposition: { color: '#F59E0B', symbol: '\u260D' },
  Quincunx: { color: '#A78BFA', symbol: 'Qx' },
  SemiSextile: { color: '#94A3B8', symbol: 'Ss' },
};

function ScoreCircle({ score }: { score: number }) {
  const prefersReduced = useReducedMotion();
  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    // data-testid so the frame tests can prove the score does not move when
    // the zodiac toggle does — the invariant SP-B rests on.
    <div className="relative w-36 h-36 mx-auto" data-testid="overall-score">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        {/* Background circle */}
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="6"
        />
        {/* Score arc */}
        <motion.circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke="#FFD700"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: prefersReduced ? dashOffset : circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={prefersReduced ? { duration: 0 } : { duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-3xl font-bold text-white"
          style={{ fontFamily: 'var(--font-geist-mono, monospace)' }}
          initial={prefersReduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={prefersReduced ? { duration: 0 } : { delay: 0.5, duration: 0.5 }}
        >
          {Math.round(score)}%
        </motion.span>
        <span className="text-[10px] text-white/40 uppercase tracking-wider">
          overall
        </span>
      </div>
    </div>
  );
}

function CategoryBar({ category, index }: { category: CategoryScore; index: number }) {
  const prefersReduced = useReducedMotion();
  const color = CATEGORY_COLORS[category.category] ?? '#94A3B8';

  return (
    <motion.div
      className="space-y-1.5"
      initial={prefersReduced ? false : { opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={prefersReduced ? { duration: 0 } : { delay: 0.3 + index * 0.1, duration: 0.4 }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/70">{category.label}</span>
        <span
          className="text-sm font-medium text-white/90"
          style={{ fontFamily: 'var(--font-geist-mono, monospace)' }}
        >
          {Math.round(category.score)}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/6 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: prefersReduced ? `${category.score}%` : 0 }}
          animate={{ width: `${category.score}%` }}
          transition={prefersReduced ? { duration: 0 } : { delay: 0.5 + index * 0.1, duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </motion.div>
  );
}

export function SynastryResult({
  id,
  scores,
  aspects,
  chart1Summary,
  chart2Summary,
  onReset,
}: SynastryResultProps) {
  const t = useTranslations('synastry');
  const tFrame = useTranslations('synastry.zodiacFrame');
  const prefersReduced = useReducedMotion();
  const [showAspects, setShowAspects] = useState(false);

  // Hydrate from the same ?z / localStorage convention SP-A established, so a
  // frame chosen on /chart is already in effect when this page opens.
  const [frame, setFrame] = useState<FrameState>(() => {
    if (typeof window === 'undefined') return 'sidereal';
    const fromUrl = { sid: 'sidereal', trop: 'tropical', both: 'both' }[
      new URLSearchParams(window.location.search).get('z') ?? ''
    ];
    if (fromUrl) return fromUrl as FrameState;
    const stored = window.localStorage.getItem(FRAME_STORAGE_KEY);
    return stored === 'tropical' || stored === 'both' ? stored : 'sidereal';
  });

  const handleFrameChange = useCallback((next: FrameState) => {
    setFrame((prev) => {
      // surface distinguishes this from SP-A's 'chart', which is what makes
      // the event answer whether anyone uses the toggle outside /chart.
      trackEvent(AnalyticsEvent.ZODIAC_FRAME_CHANGED, {
        from: prev,
        to: next,
        surface: 'synastry',
      });
      return next;
    });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FRAME_STORAGE_KEY, next);
    }
  }, []);

  const labels1 = useMemo(() => frameLabels(chart1Summary, frame), [chart1Summary, frame]);
  const labels2 = useMemo(() => frameLabels(chart2Summary, frame), [chart2Summary, frame]);

  const sortedAspects = useMemo(
    () => [...aspects].sort((a, b) => a.orb - b.orb),
    [aspects],
  );

  const person1Label = chart1Summary.name || chart1Summary.sunSign || t('person1');
  const person2Label = chart2Summary.name || chart2Summary.sunSign || t('person2');

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/s/synastry/${id}`
    : `/s/synastry/${id}`;

  const handleShare = async () => {
    const text = `${person1Label} & ${person2Label}: ${Math.round(scores.overall)}% compatibility`;
    const taggedUrl = buildShareUrl(shareUrl, 'native');
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: text, url: taggedUrl });
        trackEvent(AnalyticsEvent.PASSPORT_RESHARED, { platform: 'native', passport_id: id });
      } catch {
        // User dismissed — not an error
      }
    } else {
      await navigator.clipboard.writeText(taggedUrl);
      trackEvent(AnalyticsEvent.PASSPORT_RESHARED, { platform: 'copy_link', passport_id: id });
    }
  };

  return (
    <div className="space-y-8">
      {/* Header with names */}
      <div className="text-center space-y-2">
        <p className="text-[11px] tracking-[0.25em] uppercase text-white/30">
          {t('resultsTitle')}
        </p>
        <h1 className="text-xl font-semibold text-white/90 tracking-tight">
          {person1Label}
          <span className="text-white/30 mx-2">&</span>
          {person2Label}
        </h1>
        {/* Sun/Moon summaries */}
        <div className="flex items-center justify-center gap-6 text-xs text-white/40">
          <span>
            {labels1.sun && `\u2609 ${labels1.sun}`}
            {labels1.moon && ` \u00B7 \u263D ${labels1.moon}`}
          </span>
          <span className="text-white/15">|</span>
          <span>
            {labels2.sun && `\u2609 ${labels2.sun}`}
            {labels2.moon && ` \u00B7 \u263D ${labels2.moon}`}
          </span>
        </div>

        <div className="flex justify-center pt-1">
          <ZodiacFrameToggle value={frame} onChange={handleFrameChange} />
        </div>
      </div>

      {/* Overall score circle */}
      <ScoreCircle score={scores.overall} />

      {/* Category bars */}
      <div className="space-y-4">
        {scores.categories.map((cat, i) => (
          <CategoryBar key={cat.category} category={cat} index={i} />
        ))}
      </div>

      {/* Aspects (collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setShowAspects((prev) => !prev)}
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white/70 transition-colors"
          aria-expanded={showAspects}
        >
          <svg
            className={`w-4 h-4 transition-transform ${showAspects ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          {t('aspectsLabel')} ({aspects.length})
        </button>

        <AnimatePresence>
          {showAspects && (
            <motion.div
              initial={prefersReduced ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={prefersReduced ? {} : { height: 0, opacity: 0 }}
              transition={prefersReduced ? { duration: 0 } : { duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-1 max-h-80 overflow-y-auto">
                {sortedAspects.map((aspect, i) => {
                  const style = ASPECT_STYLES[aspect.aspect] ?? { color: '#94A3B8', symbol: '?' };
                  return (
                    <div
                      key={`${aspect.planet1}-${aspect.planet2}-${aspect.aspect}-${i}`}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/3 transition-colors text-sm"
                    >
                      <span
                        className="w-5 text-center font-mono text-xs"
                        style={{ color: style.color }}
                      >
                        {style.symbol}
                      </span>
                      <span className="text-white/80 flex-1">
                        {aspect.planet1}
                        <span className="text-white/30 mx-1.5">{aspect.aspect}</span>
                        {aspect.planet2}
                      </span>
                      <span
                        className="text-xs text-white/35"
                        style={{ fontFamily: 'var(--font-geist-mono, monospace)' }}
                      >
                        {aspect.orb.toFixed(1)}&deg;
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* A user who sees the sign labels change while the score holds still
            reads that as a bug. This is the cheapest possible defence of a
            correct-but-surprising result. */}
        {frame === 'both' && (
          <p className="mt-4 text-xs leading-relaxed text-white/45">
            {tFrame('invariantNote')}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleShare}
          className="w-full rounded-xl px-6 py-3.5 text-sm font-semibold transition-all duration-200 bg-gradient-to-br from-[#FFD700]/90 to-[#FF8C00]/80 text-black hover:from-[#FFD700] hover:to-[#FF8C00] hover:shadow-lg hover:shadow-[#FFD700]/20 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#FFD700]/40 focus:ring-offset-2 focus:ring-offset-[#0A0A0F]"
        >
          {t('shareButton')}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="w-full rounded-xl px-6 py-3 text-sm text-white/50 hover:text-white/70 border border-white/10 hover:border-white/20 transition-colors"
        >
          {t('newComparison')}
        </button>
      </div>
    </div>
  );
}
