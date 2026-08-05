'use client';

import { useTranslations } from 'next-intl';

/**
 * Three display states.
 *
 * `both` is not a ZodiacFrame — it is a presentation mode that draws two
 * frames at once, which is why it lives here rather than in zodiac-frame.ts.
 * projectChart never receives it.
 */
export type FrameState = 'sidereal' | 'tropical' | 'both';

const CYCLE: Record<FrameState, FrameState> = {
  sidereal: 'tropical',
  tropical: 'both',
  both: 'sidereal',
};

/** Next state in the cycle. Three presses return to the start. */
export function nextFrame(state: FrameState): FrameState {
  return CYCLE[state];
}

const DOT_CLASS: Record<FrameState, string> = {
  sidereal: 'bg-sky-400',
  tropical: 'bg-amber-400',
  both: 'bg-gradient-to-r from-sky-400 to-amber-400',
};

interface ZodiacFrameToggleProps {
  value: FrameState;
  onChange: (next: FrameState) => void;
}

export function ZodiacFrameToggle({ value, onChange }: ZodiacFrameToggleProps) {
  const t = useTranslations('chart.zodiacFrame');

  const upcoming = nextFrame(value);
  const currentLabel = t(value);
  const nextLabel = t(upcoming);
  const caption = t(`${value}Caption` as 'siderealCaption');

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => onChange(upcoming)}
        // aria-pressed is binary and would misdescribe a tri-state control.
        // The label carries the current state and the next one instead, and
        // the live region below announces each change.
        aria-label={t('cycleHint', { current: currentLabel, next: nextLabel })}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-all hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD700]"
      >
        <span className={`inline-block h-2 w-2 rounded-full ${DOT_CLASS[value]}`} aria-hidden="true" />
        <span className="text-white/40">{t('label')}</span>
        {currentLabel}
      </button>

      <span className="text-[11px] leading-tight text-white/40">{caption}</span>

      <span role="status" aria-live="polite" className="sr-only">
        {t('announce', { current: currentLabel })}
      </span>
    </div>
  );
}
