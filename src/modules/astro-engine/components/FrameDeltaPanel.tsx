'use client';

import { useTranslations } from 'next-intl';
import { Planet } from '@/shared/types/astrology';
import type { FrameDelta } from '../frame-delta';

const BODY_KEY: Partial<Record<Planet, 'bodySun' | 'bodyMoon' | 'bodyAscendant'>> = {
  [Planet.Sun]: 'bodySun',
  [Planet.Moon]: 'bodyMoon',
  [Planet.Ascendant]: 'bodyAscendant',
};

/** Bodies computeFrameDeltas considers. Used to detect the partial case. */
const REPORTED_COUNT = 3;

interface FrameDeltaPanelProps {
  deltas: FrameDelta[];
}

/**
 * The free, deterministic payoff for pressing the toggle.
 *
 * No LLM: no tokens, no latency, no hallucination surface. Every visitor who
 * engages the control gets an explanation, which is what keeps the toggle from
 * reading as a curiosity rather than a feature.
 */
export function FrameDeltaPanel({ deltas }: FrameDeltaPanelProps) {
  const t = useTranslations('chart.frameDelta');
  const complete = deltas.length === REPORTED_COUNT;

  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-sm font-medium text-white/80">{t('title')}</h3>
      <p className="mt-1 text-xs leading-relaxed text-white/50">{t('intro')}</p>

      {deltas.length === 0 ? (
        // Not an error state. A chart where both frames agree is a fact about
        // that chart, and saying so is more interesting than showing nothing.
        <p className="mt-3 text-sm leading-relaxed text-white/70">{t('identical')}</p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {deltas.map((d) => (
              <li key={d.planet} className="text-sm leading-relaxed text-white/70">
                {t('line', {
                  body: t(BODY_KEY[d.planet] ?? 'bodySun'),
                  // Sign names stay untranslated per CLAUDE.md.
                  tropical: d.tropicalSign,
                  sidereal: d.siderealSign,
                })}
              </li>
            ))}
          </ul>
          {!complete && <p className="mt-2 text-xs text-white/40">{t('partial')}</p>}
        </>
      )}
    </section>
  );
}
