'use client';

import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AvatarGenerator } from '@/modules/astro-engine/components/AvatarGenerator';
import { PortraitGenerator } from '@/modules/astro-engine/components/PortraitGenerator';
import { useSubscription } from '@/shared/hooks/useSubscription';
import type { PassportData } from '@/modules/astro-engine/passport';

interface AvatarSectionProps {
  passport: PassportData;
  /** Needed by the Portrait tab to scope generation to this chart. Optional
   *  because the pre-existing passport-only call sites (and tests) predate
   *  Cosmic Portrait — the Portrait tab simply stays empty without it. */
  chartId?: string;
}

export function AvatarSection({ passport, chartId }: AvatarSectionProps) {
  const t = useTranslations('avatar');
  const { sunSign, moonSign, ascendantSign, element } = passport;

  return (
    <section
      aria-labelledby="avatar-section-heading"
      className="space-y-4"
    >
      <h2
        id="avatar-section-heading"
        className="text-lg font-semibold text-white/90"
      >
        {t('title')}
      </h2>
      <AvatarTabs chartId={chartId} sunSign={sunSign} moonSign={moonSign}>
        <AvatarGenerator
          sunSign={sunSign}
          moonSign={moonSign}
          ascendantSign={ascendantSign ?? undefined}
          element={element}
        />
      </AvatarTabs>
    </section>
  );
}

type AvatarMode = 'abstract' | 'portrait';

interface AvatarTabsProps {
  chartId?: string;
  sunSign: string;
  moonSign: string;
  /** The already-built <AvatarGenerator /> element, authored by the parent
   *  so it stays a direct, unevaluated child of <AvatarSection>'s own JSX —
   *  load-bearing for AvatarSection.test.tsx, which walks the element tree
   *  returned by calling AvatarSection() directly (no render()). */
  children: ReactNode;
}

/**
 * Two-tab switch — Abstract (existing AvatarGenerator, passed as `children`)
 * and Portrait (new, selfie-referenced). Lives as an internal component so
 * `useSubscription()` and the tab's `useState` only ever run inside a real
 * React render — AvatarSection itself stays hook-free (besides the mocked
 * `useTranslations`) so its own test can keep calling it as a plain function.
 */
function AvatarTabs({ chartId, sunSign, moonSign, children }: AvatarTabsProps) {
  const t = useTranslations('avatar');
  const { isPro } = useSubscription();
  const [mode, setMode] = useState<AvatarMode>('abstract');

  const abstractTabId = useId();
  const portraitTabId = useId();
  const abstractRef = useRef<HTMLButtonElement>(null);
  const portraitRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setMode((current) => {
      const next: AvatarMode = current === 'abstract' ? 'portrait' : 'abstract';
      (next === 'abstract' ? abstractRef : portraitRef).current?.focus();
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-labelledby="avatar-section-heading"
        className="flex gap-2 border-b border-white/10"
        onKeyDown={handleKeyDown}
      >
        <button
          ref={abstractRef}
          type="button"
          role="tab"
          id={abstractTabId}
          aria-selected={mode === 'abstract'}
          aria-controls={`${abstractTabId}-panel`}
          tabIndex={mode === 'abstract' ? 0 : -1}
          onClick={() => setMode('abstract')}
          className="px-3 py-2 text-xs font-medium transition-colors"
          style={{
            color: mode === 'abstract' ? '#FFD700' : 'rgba(255,255,255,0.5)',
            borderBottom: mode === 'abstract' ? '2px solid #FFD700' : '2px solid transparent',
          }}
        >
          {t('portrait.abstractTab')}
        </button>
        <button
          ref={portraitRef}
          type="button"
          role="tab"
          id={portraitTabId}
          aria-selected={mode === 'portrait'}
          aria-controls={`${portraitTabId}-panel`}
          tabIndex={mode === 'portrait' ? 0 : -1}
          onClick={() => setMode('portrait')}
          className="px-3 py-2 text-xs font-medium transition-colors"
          style={{
            color: mode === 'portrait' ? '#FFD700' : 'rgba(255,255,255,0.5)',
            borderBottom: mode === 'portrait' ? '2px solid #FFD700' : '2px solid transparent',
          }}
        >
          {t('portrait.tab')}
        </button>
      </div>

      <div
        role="tabpanel"
        id={`${abstractTabId}-panel`}
        aria-labelledby={abstractTabId}
        hidden={mode !== 'abstract'}
      >
        {children}
      </div>
      <div
        role="tabpanel"
        id={`${portraitTabId}-panel`}
        aria-labelledby={portraitTabId}
        hidden={mode !== 'portrait'}
      >
        {chartId && (
          <PortraitGenerator chartId={chartId} sunSign={sunSign} moonSign={moonSign} isPro={isPro} />
        )}
      </div>
    </div>
  );
}
