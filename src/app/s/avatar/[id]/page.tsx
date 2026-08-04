import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { avatars } from '@/shared/lib/schema';
import { createMetadata } from '@/shared/seo';
import { Link } from '@/i18n/navigation';
import { AvatarCta } from './AvatarCta';

interface Props {
  params: Promise<{ id: string }>;
}

interface AvatarRow {
  id: string;
  scale: string | null;
  palette: { lead: string; accent: string };
  isShared: boolean;
}

// ---------------------------------------------------------------------------
// Fetch avatar data from DB — server-side. Never selects blobPathname (the
// image bytes are only ever read through /api/v1/avatar/[id]/image, per
// that route's own doc comment) and never selects userId (not needed here;
// this page is public and gated purely on isShared, not on ownership).
// ---------------------------------------------------------------------------
async function fetchAvatar(id: string): Promise<AvatarRow | null> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: avatars.id,
        scale: avatars.scale,
        palette: avatars.palette,
        isShared: avatars.isShared,
      })
      .from(avatars)
      .where(eq(avatars.id, id))
      .limit(1);

    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Metadata — noIndex (share pages aren't indexed, matching /s/[id] and
// /s/synastry/[id]) + the portrait as the OG image via the T10 read route,
// which already serves a shared portrait to anonymous callers.
// ---------------------------------------------------------------------------
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const avatar = await fetchAvatar(id);
  const t = await getTranslations({ locale: 'en', namespace: 'avatar.portrait' });

  return createMetadata({
    title: t('title'),
    description: t('intro'),
    path: `/s/avatar/${id}`,
    locale: 'en',
    noIndex: true,
    ogImage: avatar?.isShared ? `/api/v1/avatar/${id}/image` : undefined,
  });
}

// ---------------------------------------------------------------------------
// Page — Server Component, EN-only (matches /s/[id] and /s/synastry/[id]:
// share pages live OUTSIDE [locale] — see src/app/s/layout.tsx). Public:
// gated purely on isShared, not on ownership, so the owner's own unshared
// portrait 404s here too (matching the brief's spec — the owner-facing
// generator UI is a different page).
//
// This page previously lived under [locale] so the share flow could speak
// Spanish to ES visitors, but src/middleware.ts skips next-intl rewriting
// for any pathname starting with '/s/' (see middleware.ts's '/s/' comment) —
// so the default-locale (EN, no-prefix) URL `/s/avatar/:id` was never
// rewritten to the `[locale]` segment the old file location required, and
// 404'd. Matching the established EN-only pattern is what actually resolves.
// ---------------------------------------------------------------------------
export default async function AvatarSharePage({ params }: Props) {
  const { id } = await params;

  const avatar = await fetchAvatar(id);
  if (!avatar || !avatar.isShared) {
    notFound();
  }

  const t = await getTranslations({ locale: 'en', namespace: 'avatar.portrait' });

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative"
      style={{ background: '#0A0A0F' }}
    >
      {/* Radial glow — same treatment as the passport/synastry share pages */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 30%, rgba(255,215,0,0.04) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* Minimal branding header — no app nav, this is a landing page */}
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

      <main className="w-full max-w-sm flex flex-col items-center gap-6 relative z-10">
        <div className="text-center space-y-1.5">
          <p
            className="text-[11px] tracking-[0.25em] uppercase text-white/30"
            style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
          >
            {t('title')}
          </p>
        </div>

        {/* Unified portrait section — image, why-panel, and CTA as one
            visual unit, matching the passport share page's golden-glow
            container idiom. */}
        <section
          className="w-full flex flex-col items-center rounded-2xl overflow-hidden"
          style={{
            gap: '12px',
            paddingBottom: '16px',
            boxShadow:
              '0 0 0 1px rgba(255,215,0,0.08),' +
              '0 0 56px -10px rgba(255,215,0,0.18)',
          }}
          aria-label={t('title')}
        >
          <div
            className="relative w-full aspect-square overflow-hidden"
            style={{ border: '1px solid rgba(255,215,0,0.2)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/v1/avatar/${id}/image`}
              alt={t('title')}
              className="w-full h-full object-cover"
            />
          </div>

          {avatar.scale && (
            <div className="text-xs text-white/60 text-center space-y-1 px-4">
              <p className="font-medium text-white/80">{t('whyTitle')}</p>
              <p>{t('whyScale', { scale: avatar.scale })}</p>
              <p>{t('whyPalette', { lead: avatar.palette.lead, accent: avatar.palette.accent })}</p>
            </div>
          )}

          <div className="w-full px-4">
            <AvatarCta avatarId={id} />
          </div>
        </section>

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
