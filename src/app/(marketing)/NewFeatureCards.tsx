'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Heart, Layers, GitBranch } from 'lucide-react';

const NEW_FEATURES = [
  {
    icon: Heart,
    color: '#E74C3C',
    titleKey: 'synastryTitle',
    descKey: 'synastryDesc',
    ctaKey: 'synastryButton',
    href: '/synastry',
  },
  {
    icon: Layers,
    color: '#9B8EC4',
    titleKey: 'tarotTitle',
    descKey: 'tarotDesc',
    ctaKey: 'tarotButton',
    href: '/tarot',
  },
  {
    icon: GitBranch,
    color: '#3498DB',
    titleKey: 'treeTitle',
    descKey: 'treeDesc',
    ctaKey: 'treeButton',
    href: '/tree-of-life',
  },
] as const;

export function NewFeatureCards() {
  const t = useTranslations('landing');

  return (
    <section
      className="relative px-4 sm:px-6 py-20"
      aria-labelledby="new-features-heading"
      data-section="new-features"
    >
      <div
        className="absolute top-0 inset-x-0 h-px"
        style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent)' }}
        aria-hidden="true"
      />

      <div className="max-w-5xl mx-auto">
        <ul
          className="grid grid-cols-1 sm:grid-cols-3 gap-5 list-none"
          aria-label="New features"
        >
          {NEW_FEATURES.map(({ icon: Icon, color, titleKey, descKey, ctaKey, href }, i) => (
            <li
              key={href}
              data-animate={`fade-up-${i}`}
              className="flex flex-col gap-4 rounded-2xl border border-white/6 p-6 group transition-all duration-300 hover:border-white/15 hover:shadow-lg"
              style={{
                background: 'rgba(255,255,255,0.02)',
                '--planet-color': color,
              } as React.CSSProperties}
            >
              <span
                className="transition-transform duration-200 group-hover:scale-110 origin-left"
                style={{ color }}
                aria-hidden="true"
              >
                <Icon size={28} strokeWidth={1.5} />
              </span>
              <h3 className="text-base font-semibold text-white/90 tracking-wide">
                {t(titleKey)}
              </h3>
              <p className="text-sm text-white/45 leading-relaxed flex-1">
                {t(descKey)}
              </p>
              <Link
                href={href}
                className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                style={{ color }}
              >
                {t(ctaKey)}
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
