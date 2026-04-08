import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { cosmicPassports } from '@/shared/lib/schema';
import { createMetadata } from '@/shared/seo';
import { PassportCard } from '@/modules/astro-engine/components/PassportCard';
import { ShareButton } from '@/modules/astro-engine/components/ShareButton';
import type { PassportResponse } from '@/shared/types/api';

interface Props {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Fetch passport data from DB — server-side, no PII exposed to client
// ---------------------------------------------------------------------------
async function fetchPassport(id: string): Promise<PassportResponse | null> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: cosmicPassports.id,
        sunSign: cosmicPassports.sunSign,
        moonSign: cosmicPassports.moonSign,
        ascendantSign: cosmicPassports.ascendantSign,
        element: cosmicPassports.element,
        rulingPlanet: cosmicPassports.rulingPlanet,
        rarityPercent: cosmicPassports.rarityPercent,
      })
      .from(cosmicPassports)
      .where(eq(cosmicPassports.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      sunSign: row.sunSign,
      moonSign: row.moonSign,
      ascendantSign: row.ascendantSign ?? null,
      element: row.element,
      rulingPlanet: row.rulingPlanet,
      rarityPercent: row.rarityPercent,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Metadata — noIndex (share pages not indexed) + passport OG image
// ---------------------------------------------------------------------------
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const passport = await fetchPassport(id);

  if (!passport) {
    return createMetadata({
      title: 'Passport Not Found',
      description: 'This Cosmic Passport no longer exists. Calculate your own at Estrevia.',
      path: `/s/${id}`,
      noIndex: true,
    });
  }

  const asc = passport.ascendantSign ? ` · ↑ ${passport.ascendantSign}` : '';
  const title = `☉ ${passport.sunSign} · ☽ ${passport.moonSign}${asc}`;
  const description = `Cosmic Passport: Sun in ${passport.sunSign}, Moon in ${passport.moonSign}${passport.ascendantSign ? `, Ascendant in ${passport.ascendantSign}` : ''} — 1 of ${passport.rarityPercent}%. Get your own sidereal astrology passport.`;

  return createMetadata({
    title,
    description,
    path: `/s/${id}`,
    noIndex: true,
    ogImage: `/api/og/passport/${id}`,
  });
}

// ---------------------------------------------------------------------------
// Page — Server Component, no auth required (public viral share page)
// This page lives OUTSIDE (app)/ group — no app header or bottom nav.
// ---------------------------------------------------------------------------
export default async function SharePage({ params }: Props) {
  const { id } = await params;
  const passport = await fetchPassport(id);

  if (!passport) {
    notFound();
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative"
      style={{ background: '#0A0A0F' }}
    >
      {/* Radial glow — matches PassportCard ruling planet color */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 30%, rgba(255,215,0,0.04) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* Minimal branding header — no navigation, this is a landing page */}
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
          Sidereal Astrology
        </span>
      </header>

      {/* Main content */}
      <main className="w-full max-w-sm flex flex-col items-center gap-6 relative z-10">

        {/* Heading */}
        <div className="text-center space-y-1.5">
          <p
            className="text-[11px] tracking-[0.25em] uppercase text-white/30"
            style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
          >
            Cosmic Passport
          </p>
          <h1
            className="text-xl font-semibold text-white/90 tracking-tight"
            style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
          >
            {passport.sunSign} · {passport.moonSign}
            {passport.ascendantSign && (
              <span className="text-white/50"> · {passport.ascendantSign}</span>
            )}
          </h1>
        </div>

        {/* Passport card — the shareable visual artifact */}
        <div className="w-full">
          <PassportCard passport={passport} />
        </div>

        {/* Rarity callout */}
        <p
          className="text-xs text-center text-white/35"
          style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
        >
          This combination appears in only{' '}
          <span className="text-white/70 font-medium">{passport.rarityPercent}%</span>
          {' '}of all birth charts
        </p>

        {/* Share buttons */}
        <div className="w-full">
          <ShareButton passportId={passport.id} passport={passport} />
        </div>

        {/* CTA separator */}
        <div className="flex items-center gap-3 w-full">
          <div
            className="flex-1 h-px"
            style={{ background: 'rgba(255,255,255,0.06)' }}
            aria-hidden="true"
          />
          <span
            className="text-[10px] tracking-[0.15em] uppercase text-white/20"
            style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
          >
            or
          </span>
          <div
            className="flex-1 h-px"
            style={{ background: 'rgba(255,255,255,0.06)' }}
            aria-hidden="true"
          />
        </div>

        {/* Primary CTA — the viral loop entry point */}
        <Link
          href="/chart"
          className="flex items-center justify-center gap-2 w-full px-6 py-4 rounded-xl text-sm font-semibold transition-all duration-200 hover:shadow-xl active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)',
            color: '#0A0A0F',
            textDecoration: 'none',
            boxShadow: '0 4px 20px rgba(255,215,0,0.25)',
          }}
          aria-label="Calculate your own Cosmic Passport"
        >
          <span aria-hidden="true" style={{ fontFamily: 'serif', fontSize: '1rem' }}>☉</span>
          Calculate Your Cosmic Passport
        </Link>

        <p
          className="text-[10px] text-center text-white/20"
          style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
        >
          Free · Sidereal · Swiss Ephemeris · Accurate to 0.01°
        </p>
      </main>
    </div>
  );
}
