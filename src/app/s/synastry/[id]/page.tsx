import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { synastryResults } from '@/shared/lib/schema';
import { createMetadata } from '@/shared/seo';
import type { CategoryScore } from '@/modules/astro-engine/synastry-scoring';

interface Props {
  params: Promise<{ id: string }>;
}

async function fetchSynastry(id: string) {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: synastryResults.id,
        overallScore: synastryResults.overallScore,
        categoryScores: synastryResults.categoryScores,
      })
      .from(synastryResults)
      .where(eq(synastryResults.id, id))
      .limit(1);

    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchSynastry(id);

  if (!result) {
    return createMetadata({
      title: 'Synastry Result Not Found',
      description: 'This compatibility result no longer exists. Calculate your own at Estrevia.',
      path: `/s/synastry/${id}`,
      noIndex: true,
    });
  }

  return createMetadata({
    title: `${Math.round(result.overallScore)}% Compatibility — Synastry`,
    description: `Astrological compatibility score: ${Math.round(result.overallScore)}%. Check your own sidereal synastry at Estrevia.`,
    path: `/s/synastry/${id}`,
    noIndex: true,
  });
}

const CATEGORY_COLORS: Record<string, string> = {
  emotional: '#E879F9',
  communication: '#60A5FA',
  passion: '#F87171',
  stability: '#34D399',
  growth: '#FBBF24',
};

export default async function SynastrySharePage({ params }: Props) {
  const { id } = await params;
  const result = await fetchSynastry(id);

  if (!result) {
    notFound();
  }

  const categories = result.categoryScores as CategoryScore[];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative"
      style={{ background: '#0A0A0F' }}
    >
      {/* Radial glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 30%, rgba(255,215,0,0.04) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* Minimal header */}
      <header className="w-full max-w-sm mb-8 flex items-center justify-between relative z-10">
        <Link
          href="/"
          className="text-xs tracking-[0.2em] uppercase text-white/30 hover:text-white/60 transition-colors"
          style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
          aria-label="Estrevia — home"
        >
          Estrevia
        </Link>
        <span
          className="text-[10px] tracking-[0.15em] uppercase text-white/20"
          style={{ fontFamily: 'var(--font-geist-mono, monospace)' }}
        >
          Synastry
        </span>
      </header>

      <main className="w-full max-w-sm flex flex-col items-center gap-6 relative z-10">
        {/* Heading */}
        <div className="text-center space-y-1.5">
          <p
            className="text-[11px] tracking-[0.25em] uppercase text-white/30"
            style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
          >
            Compatibility Score
          </p>
          <h1
            className="text-4xl font-bold text-white"
            style={{ fontFamily: 'var(--font-geist-mono, monospace)' }}
          >
            {Math.round(result.overallScore)}%
          </h1>
        </div>

        {/* Category scores */}
        <div className="w-full space-y-3">
          {categories.map((cat) => {
            const color = CATEGORY_COLORS[cat.category] ?? '#94A3B8';
            return (
              <div key={cat.category} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/60">{cat.label}</span>
                  <span
                    className="text-white/80 font-medium"
                    style={{ fontFamily: 'var(--font-geist-mono, monospace)' }}
                  >
                    {Math.round(cat.score)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ backgroundColor: color, width: `${cat.score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA separator */}
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} aria-hidden="true" />
          <span className="text-[10px] tracking-[0.15em] uppercase text-white/20" style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}>
            or
          </span>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} aria-hidden="true" />
        </div>

        {/* Primary CTA */}
        <Link
          href="/synastry"
          className="flex items-center justify-center gap-2 w-full px-6 py-4 rounded-xl text-sm font-semibold transition-all duration-200 hover:shadow-xl active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)',
            color: '#0A0A0F',
            textDecoration: 'none',
            boxShadow: '0 4px 20px rgba(255,215,0,0.25)',
          }}
          aria-label="Check your compatibility"
        >
          Check Your Compatibility
        </Link>

        <p
          className="text-[10px] text-center text-white/20"
          style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
        >
          Free · Sidereal Astrology · Swiss Ephemeris
        </p>
      </main>
    </div>
  );
}
