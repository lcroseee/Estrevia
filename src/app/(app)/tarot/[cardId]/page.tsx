import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createMetadata, JsonLdScript, breadcrumbSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';

interface CardData {
  id: string;
  number: number;
  name: { en: string; es?: string };
  suit: string;
  keywords: {
    upright: { en: string[] };
    reversed: { en: string[] };
  };
  astrology: string;
  hebrewLetter: string;
  treeOfLifePath: number;
  treeOfLifeConnects: number[];
  liber777Column: string;
  description: { en: string };
}

async function loadCard(cardId: string): Promise<CardData | null> {
  const filePath = join(process.cwd(), 'content/tarot/cards.json');
  const raw = await readFile(filePath, 'utf-8');
  const data = JSON.parse(raw) as { cards: CardData[] };
  return data.cards.find((c) => c.id === cardId) ?? null;
}

interface Props {
  params: Promise<{ cardId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cardId } = await params;
  const card = await loadCard(cardId);

  if (!card) {
    return createMetadata({
      title: 'Card Not Found',
      description: 'This tarot card was not found.',
      path: `/tarot/${cardId}`,
    });
  }

  return createMetadata({
    title: `${card.name.en} — Thoth Tarot`,
    description: card.description.en.slice(0, 155),
    path: `/tarot/${cardId}`,
    keywords: [card.name.en, 'thoth tarot', card.suit, card.astrology, card.hebrewLetter],
  });
}

const SUIT_COLORS: Record<string, string> = {
  wands: '#FF6B35',
  cups: '#4169E1',
  swords: '#87CEEB',
  disks: '#8B7355',
  major: '#A78BFA',
};

export default async function CardDetailPage({ params }: Props) {
  const { cardId } = await params;
  const card = await loadCard(cardId);

  if (!card) {
    notFound();
  }

  const color = SUIT_COLORS[card.suit] ?? SUIT_COLORS.major;

  const cardBreadcrumb = breadcrumbSchema([
    { name: 'Estrevia', url: SITE_URL },
    { name: 'Thoth Tarot', url: `${SITE_URL}/tarot` },
    { name: card.name.en, url: `${SITE_URL}/tarot/${cardId}` },
  ]);

  return (
    <>
      <JsonLdScript schema={cardBreadcrumb} />
      <div className="min-h-[calc(100vh-4rem)] px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Back link */}
          <Link
            href="/tarot"
            className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/60 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            All cards
          </Link>

          {/* Card header */}
          <div className="flex items-start gap-6">
            {/* Card visual */}
            <div
              className="w-28 h-44 rounded-lg border flex flex-col items-center justify-between p-3 flex-shrink-0"
              style={{
                borderColor: `${color}40`,
                background: `linear-gradient(135deg, rgba(10,10,15,0.95) 0%, ${color}15 100%)`,
              }}
            >
              <span
                className="text-2xl font-bold self-start"
                style={{ color, fontFamily: 'var(--font-geist-mono, monospace)' }}
              >
                {card.number}
              </span>
              <span className="text-3xl opacity-60" style={{ color }} aria-hidden="true">
                {card.suit === 'major' ? '\u2726' : '\u2665'}
              </span>
              <span
                className="text-[10px] text-center leading-tight font-medium tracking-wide uppercase text-white/70"
                style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
              >
                {card.name.en}
              </span>
            </div>

            {/* Card info */}
            <div className="space-y-2 flex-1 min-w-0">
              <h1
                className="text-2xl font-semibold text-white/90 tracking-tight"
                style={{ fontFamily: 'var(--font-geist-sans)' }}
              >
                {card.name.en}
              </h1>
              <div className="flex flex-wrap gap-2">
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  {card.suit === 'major' ? 'Major Arcana' : card.suit.charAt(0).toUpperCase() + card.suit.slice(1)}
                </span>
                <span className="px-2 py-0.5 rounded text-xs bg-white/5 text-white/50">
                  {card.astrology}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          <p
            className="text-base text-white/75 leading-relaxed"
            style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}
          >
            {card.description.en}
          </p>

          {/* Keywords */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/8 p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.025)' }}>
              <h3 className="text-xs text-white/40 uppercase tracking-wider font-medium">Upright</h3>
              <div className="flex flex-wrap gap-1.5">
                {card.keywords.upright.en.map((kw) => (
                  <span
                    key={kw}
                    className="px-2 py-0.5 rounded-md text-xs bg-green-500/10 text-green-300/80"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-white/8 p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.025)' }}>
              <h3 className="text-xs text-white/40 uppercase tracking-wider font-medium">Reversed</h3>
              <div className="flex flex-wrap gap-1.5">
                {card.keywords.reversed.en.map((kw) => (
                  <span
                    key={kw}
                    className="px-2 py-0.5 rounded-md text-xs bg-red-500/10 text-red-300/80"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 777 Correspondences */}
          <div className="rounded-xl border border-white/8 overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)' }}>
            <h3 className="px-5 py-3 text-xs text-white/40 uppercase tracking-wider font-medium border-b border-white/6">
              777 Correspondences
            </h3>
            <dl className="divide-y divide-white/6">
              {[
                { label: 'Hebrew Letter', value: card.hebrewLetter },
                { label: 'Tree of Life Path', value: String(card.treeOfLifePath) },
                { label: 'Connects', value: card.treeOfLifeConnects.join(' \u2194 ') },
                { label: 'Astrological', value: card.astrology },
                { label: 'Liber 777 Column', value: card.liber777Column },
              ].map(({ label, value }) => (
                <div key={label} className="grid grid-cols-[140px_1fr] px-5 py-2.5 hover:bg-white/3 transition-colors">
                  <dt className="text-xs text-white/40 uppercase tracking-wider self-center">{label}</dt>
                  <dd className="text-sm text-white/80" style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Disclaimer */}
          <p className="text-[11px] text-white/20">
            Astrology is not medical, financial, or professional advice. For entertainment and self-reflection purposes only.
          </p>
        </div>
      </div>
    </>
  );
}
