import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { headers, cookies } from 'next/headers';
import { unstable_cache } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { cosmicPassports } from '@/shared/lib/schema';
import { createMetadata } from '@/shared/seo';
import { trackServerEvent, AnalyticsEvent } from '@/shared/lib/analytics';
import { getRarityTier } from '@/shared/lib/rarity';
import { PassportCard } from '@/modules/astro-engine/components/PassportCard';
import { ShareButton } from '@/modules/astro-engine/components/ShareButton';
import { ReferralTracker } from '@/modules/astro-engine/components/ReferralTracker';
import { PassportCta } from './PassportCta';
import type { PassportResponse } from '@/shared/types/api';

interface Props {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Fetch passport data from DB — server-side, no PII exposed to client
// ---------------------------------------------------------------------------
//
// R10 CWV win: passport rows are immutable in practice (cosmic placements don't
// change once calculated), so we cache the DB lookup aggressively for 24h.
// Cache Components (`'use cache'`) would be cleaner but require the
// `experimental.cacheComponents` flag which R3 owns — `unstable_cache` is the
// production-safe drop-in that ships today. The page itself stays dynamic so
// `headers()` + `cookies()` + `trackServerEvent('passport_viewed')` still fire
// on every visit. Expected TTFB: cold-click 600ms → 80ms on repeat-ID hits.
//
// Invalidation: passports are never edited in MVP. If that ever changes, call
// `revalidateTag('passport-' + id)` from the mutation route.
async function fetchPassport(id: string): Promise<PassportResponse | null> {
  const cached = unstable_cache(
    async (passportId: string): Promise<PassportResponse | null> => {
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
          .where(eq(cosmicPassports.id, passportId))
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
    },
    ['passport', id],
    {
      revalidate: 86400,
      tags: [`passport-${id}`],
    },
  );

  return cached(id);
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

  // V08-3: Track passport view server-side with a stable session-scoped distinctId.
  // Reading ph_device_id (PostHog's own cookie) gives us the anonymous ID that
  // posthog-js already set on a previous visit, enabling cross-page funnel stitching.
  // If absent (first visit, no JS yet), we generate a UUID and set the cookie so
  // subsequent events on this visit use the same ID.
  const headersList = await headers();
  const cookieStore = await cookies();
  const referer = headersList.get('referer') ?? undefined;

  let deviceId = cookieStore.get('ph_device_id')?.value ?? null;
  const isNewDeviceId = !deviceId;
  if (!deviceId) {
    // crypto.randomUUID() is available in Node 14.17+ and all modern runtimes.
    deviceId = crypto.randomUUID();
  }

  // Fire the event before setting the cookie response header (cookie is set client-side
  // by ReferralTracker for new visits — server cannot set it here in a Server Component
  // without a Response wrapper, so we pass it as a prop instead).
  trackServerEvent(deviceId, AnalyticsEvent.PASSPORT_VIEWED, {
    passport_id: id,
    source: 'share_page',
    referer,
    is_new_device: isNewDeviceId,
  });

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative"
      style={{ background: '#0A0A0F' }}
    >
      {/* Referral tracking — sets cookie for attribution + V08-3: syncs deviceId cookie */}
      <ReferralTracker passportId={id} deviceId={deviceId} />

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
          <PassportCard passport={passport} passportId={id} />
        </div>

        {/* Rarity callout — qualitative tier, not a statistical frequency claim */}
        <p
          className="text-xs text-center text-white/35"
          style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
        >
          Rarity tier:{' '}
          <span className="text-white/70 font-medium">
            {getRarityTier(passport.rarityPercent)}
          </span>
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

        {/* Primary CTA — fires passport_converted then navigates */}
        <PassportCta passportId={id} />

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
