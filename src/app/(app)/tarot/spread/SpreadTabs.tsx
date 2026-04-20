'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ThreeCardSpread } from '@/modules/esoteric/components/ThreeCardSpread';
import { CelticCross } from '@/modules/esoteric/components/CelticCross';
import type { TarotCardData } from '@/modules/esoteric/components/TarotCard';

type SpreadId = 'three' | 'celtic';

interface SpreadTabsProps {
  cards: TarotCardData[];
}

export function SpreadTabs({ cards }: SpreadTabsProps) {
  const t = useTranslations('tarot');
  const [active, setActive] = useState<SpreadId>('three');

  const tabs: { id: SpreadId; label: string; description: string }[] = [
    { id: 'three', label: t('threeCardTab'), description: t('threeCardDescription') },
    { id: 'celtic', label: t('celticCrossTab'), description: t('celticCrossDescription') },
  ];

  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label={t('spreadsTitle')}
        className="flex gap-2 p-1 rounded-xl border border-white/8"
        style={{ background: 'rgba(255,255,255,0.02)' }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            aria-controls={`spread-panel-${tab.id}`}
            id={`spread-tab-${tab.id}`}
            type="button"
            onClick={() => setActive(tab.id)}
            className={[
              'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              active === tab.id
                ? 'bg-white/10 text-white'
                : 'text-white/45 hover:text-white/70 hover:bg-white/5',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-white/40 text-center">{activeTab.description}</p>

      <div
        role="tabpanel"
        id={`spread-panel-${active}`}
        aria-labelledby={`spread-tab-${active}`}
      >
        {active === 'three' ? (
          <ThreeCardSpread allCards={cards} />
        ) : (
          <CelticCross allCards={cards} />
        )}
      </div>
    </div>
  );
}
