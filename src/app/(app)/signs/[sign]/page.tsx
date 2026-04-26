import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  createMetadata,
  JsonLdScript,
  articleSchema,
  breadcrumbSchema,
  getAllSignSlugs,
  getAllEssaySlugsBySign,
  SIGNS,
} from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { Disclaimer } from '@/shared/components/Disclaimer';
import descriptionsEn from '../../../../../content/signs/descriptions.json';
import descriptionsEs from '../../../../../content/signs/descriptions.es.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SignDescription {
  sign: string;
  slug: string;
  siderealDates: string;
  element: string;
  modality: string;
  ruler: string;
  symbol: string;
  traits: string[];
  overview: string;
}

// ---------------------------------------------------------------------------
// Static params — generate all 12 sign routes at build time
// ---------------------------------------------------------------------------

// ISR: rebuild each sign page at most once per day in the background.
// R10 CWV win — serves from CDN edge cache, TTFB ~500ms → ~50ms.
export const revalidate = 86400;

export function generateStaticParams(): { sign: string }[] {
  return getAllSignSlugs().map((sign) => ({ sign }));
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sign: string }>;
}): Promise<Metadata> {
  const { sign } = await params;
  const locale = await getLocale();
  const data = getSignData(sign, locale);
  if (!data) return {};

  const tMeta = await getTranslations('pageMeta.signsDetail');
  const tDetail = await getTranslations('signDetail');
  const elementLabel = tDetail(`elements.${data.element}` as 'elements.Fire');
  const modalityLabel = tDetail(`modalities.${data.modality}` as 'modalities.Cardinal');
  const traitsPreview = data.traits.slice(0, 3).join(', ');

  return createMetadata({
    title: tMeta('title', { sign: data.sign }),
    description: tMeta('description', {
      sign: data.sign,
      dates: data.siderealDates,
      traits: traitsPreview,
      element: elementLabel,
      modality: modalityLabel,
      ruler: data.ruler,
    }),
    path: `/signs/${sign}`,
    type: 'article',
    keywords: [
      `sidereal ${data.sign.toLowerCase()}`,
      `${data.sign.toLowerCase()} sidereal astrology`,
      `sidereal ${data.sign.toLowerCase()} dates`,
      `sidereal ${data.sign.toLowerCase()} traits`,
    ],
  });
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

function getSignData(slug: string, locale: string): SignDescription | null {
  const descriptions = (locale === 'es' ? descriptionsEs : descriptionsEn) as SignDescription[];
  return descriptions.find((d) => d.slug === slug) ?? null;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// 777 / Kabbalistic correspondences per sign (public domain — Crowley pre-1929)
const SIGN_CORRESPONDENCES: Record<string, { hebrew: string; tarot: string; path: string }> = {
  aries:       { hebrew: 'Heh (ה)', tarot: 'The Emperor (IV)',         path: 'Path 15 — Chokmah to Tiphareth' },
  taurus:      { hebrew: 'Vav (ו)', tarot: 'The Hierophant (V)',       path: 'Path 16 — Chokmah to Chesed' },
  gemini:      { hebrew: 'Zayin (ז)', tarot: 'The Lovers (VI)',        path: 'Path 17 — Binah to Tiphareth' },
  cancer:      { hebrew: 'Cheth (ח)', tarot: 'The Chariot (VII)',      path: 'Path 18 — Binah to Geburah' },
  leo:         { hebrew: 'Teth (ט)', tarot: 'Lust / Strength (XI)',    path: 'Path 19 — Chesed to Geburah' },
  virgo:       { hebrew: 'Yod (י)', tarot: 'The Hermit (IX)',          path: 'Path 20 — Chesed to Tiphareth' },
  libra:       { hebrew: 'Lamed (ל)', tarot: 'Adjustment / Justice (VIII)', path: 'Path 22 — Geburah to Tiphareth' },
  scorpio:     { hebrew: 'Nun (נ)', tarot: 'Death (XIII)',             path: 'Path 24 — Netzach to Tiphareth' },
  sagittarius: { hebrew: 'Samekh (ס)', tarot: 'Art / Temperance (XIV)', path: 'Path 25 — Yesod to Tiphareth' },
  capricorn:   { hebrew: 'Ayin (ע)', tarot: 'The Devil (XV)',          path: 'Path 26 — Hod to Tiphareth' },
  aquarius:    { hebrew: 'Tzaddi (צ)', tarot: 'The Star (XVII)',       path: 'Path 28 — Netzach to Yesod' },
  pisces:      { hebrew: 'Qoph (ק)', tarot: 'The Moon (XVIII)',        path: 'Path 29 — Netzach to Malkuth' },
};

// Element badge colours
const ELEMENT_COLOUR: Record<string, string> = {
  Fire:  'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  Earth: 'bg-green-500/20 text-green-300 border border-green-500/30',
  Air:   'bg-sky-500/20 text-sky-300 border border-sky-500/30',
  Water: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function SignPage({
  params,
}: {
  params: Promise<{ sign: string }>;
}) {
  const { sign } = await params;
  const locale = await getLocale();
  const data = getSignData(sign, locale);
  if (!data) notFound();

  const t = await getTranslations('signDetail');

  const essaySlugs = getAllEssaySlugsBySign(sign as (typeof SIGNS)[number]);
  const correspondences = SIGN_CORRESPONDENCES[sign];

  const pageUrl = `${SITE_URL}/signs/${sign}`;
  const today = new Date().toISOString().split('T')[0];

  const elementLabel = t(`elements.${data.element}` as 'elements.Fire');
  const modalityLabel = t(`modalities.${data.modality}` as 'modalities.Cardinal');

  // JSON-LD schemas — kept English-canonical for SEO consistency across locales.
  const articleLd = articleSchema({
    title: `Sidereal ${data.sign} — Traits, Dates & Meaning`,
    description: `Sidereal ${data.sign} (${data.siderealDates}): ${data.element} ${data.modality} ruled by ${data.ruler}. Complete guide to all 10 planetary placements in sidereal ${data.sign}.`,
    url: pageUrl,
    datePublished: '2024-01-01',
    dateModified: today,
  });

  const breadcrumbLd = breadcrumbSchema([
    { name: t('breadcrumbHome'), url: SITE_URL },
    { name: t('breadcrumbSigns'), url: `${SITE_URL}/signs` },
    { name: data.sign, url: pageUrl },
  ]);

  const elementColour = ELEMENT_COLOUR[data.element] ?? 'bg-white/10 text-white/70';

  return (
    <>
      <JsonLdScript schema={articleLd} />
      <JsonLdScript schema={breadcrumbLd} />

      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">

        {/* ── Breadcrumb ─────────────────────────────────────────────── */}
        <nav aria-label={t('breadcrumbAria')} className="mb-6 text-sm text-white/40">
          <ol className="flex items-center gap-2">
            <li><Link href="/" className="hover:text-white/70 transition-colors">{t('breadcrumbHome')}</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href="/signs" className="hover:text-white/70 transition-colors">{t('breadcrumbSigns')}</Link></li>
            <li aria-hidden="true">/</li>
            <li className="text-white/60" aria-current="page">{data.sign}</li>
          </ol>
        </nav>

        {/* ── Hero ───────────────────────────────────────────────────── */}
        <header className="mb-8">
          <div className="flex items-center gap-5 mb-4">
            <span
              className="text-5xl leading-none"
              role="img"
              aria-label={t('glyphAria', { sign: data.sign })}
              style={{
                filter: 'drop-shadow(0 0 12px rgba(255,215,0,0.15))',
              }}
            >
              {data.symbol}
            </span>
            <div>
              <h1
                className="text-3xl md:text-4xl font-light leading-tight"
                style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#F0EAD6' }}
              >
                {t('h1', { sign: data.sign })}
              </h1>
              <p
                className="text-white/45 text-xs mt-1.5 tracking-widest"
                style={{ fontFamily: 'var(--font-geist-mono, monospace)' }}
              >
                {data.siderealDates}
              </p>
            </div>
          </div>

          {/* Attribute badges */}
          <div className="flex flex-wrap gap-2 mt-4">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${elementColour}`}>
              {elementLabel}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-white/70 border border-white/10">
              {modalityLabel}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {t('ruledBy', { ruler: data.ruler })}
            </span>
          </div>
        </header>

        {/* ── Trait badges ───────────────────────────────────────────── */}
        <section aria-labelledby="traits-heading" className="mb-8">
          <h2
            id="traits-heading"
            className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3"
          >
            {t('keyTraits')}
          </h2>
          <ul className="flex flex-wrap gap-2" role="list">
            {data.traits.map((trait) => (
              <li
                key={trait}
                className="px-3 py-1 rounded-full text-sm bg-white/5 text-white/80 border border-white/10"
              >
                {trait}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Overview text ──────────────────────────────────────────── */}
        <section aria-labelledby="overview-heading" className="mb-10">
          <h2
            id="overview-heading"
            className="text-xl font-light mb-4"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}
          >
            {t('overview')}
          </h2>
          <div className="prose prose-invert prose-sm max-w-none text-white/75 leading-relaxed font-[var(--font-crimson-pro),var(--font-geist-sans)] space-y-4">
            {data.overview.split('\n\n').map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </section>

        {/* ── 777 Correspondences ────────────────────────────────────── */}
        {correspondences && (
          <section
            aria-labelledby="correspondences-heading"
            className="mb-10 rounded-xl border border-white/10 bg-white/3 p-5"
          >
            <h2
              id="correspondences-heading"
              className="text-lg font-light mb-4"
              style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}
            >
              {t('correspondencesHeading')}
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-white/40 text-xs uppercase tracking-widest mb-1">{t('hebrewLetter')}</dt>
                <dd className="text-white/85 font-[var(--font-geist-mono)]">{correspondences.hebrew}</dd>
              </div>
              <div>
                <dt className="text-white/40 text-xs uppercase tracking-widest mb-1">{t('tarotCard')}</dt>
                <dd className="text-white/85">{correspondences.tarot}</dd>
              </div>
              <div>
                <dt className="text-white/40 text-xs uppercase tracking-widest mb-1">{t('treeOfLife')}</dt>
                <dd className="text-white/85">{correspondences.path}</dd>
              </div>
            </dl>
          </section>
        )}

        {/* ── All planetary essays for this sign ─────────────────────── */}
        <section aria-labelledby="essays-heading" className="mb-10">
          <h2
            id="essays-heading"
            className="text-xl font-light mb-4"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#E8E0D0' }}
          >
            {t('essaysHeading', { sign: data.sign })}
          </h2>
          <p className="text-white/50 text-sm mb-5">
            {t('essaysIntro', { sign: data.sign, dates: data.siderealDates })}
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="list">
            {essaySlugs.map((slug) => {
              const planetSlug = slug.split('-in-')[0];
              const planetName = t(`planets.${planetSlug}` as 'planets.sun') || capitalise(planetSlug);
              return (
                <li key={slug}>
                  <Link
                    href={`/essays/${slug}`}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 hover:border-white/20 transition-all group"
                    aria-label={t('essayCardAria', { planet: planetName, sign: data.sign })}
                  >
                    <span className="text-white/40 text-xs font-[var(--font-geist-mono)] w-16 shrink-0">
                      {planetSlug.toUpperCase()}
                    </span>
                    <span className="text-white/85 text-sm group-hover:text-white transition-colors">
                      {t('essayLink', { planet: planetName, sign: data.sign })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Chart CTA ──────────────────────────────────────────────── */}
        <section
          aria-labelledby="cta-heading"
          className="rounded-2xl p-7 text-center relative overflow-hidden"
          style={{
            border: '1px solid rgba(255,215,0,0.18)',
            background: 'linear-gradient(135deg, rgba(255,215,0,0.04) 0%, rgba(255,140,0,0.02) 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,215,0,0.08)',
          }}
        >
          {/* Top highlight line */}
          <div
            className="absolute top-0 inset-x-0 h-px pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,215,0,0.3), transparent)' }}
            aria-hidden="true"
          />
          <h2
            id="cta-heading"
            className="text-xl font-light mb-2"
            style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', color: '#F0EAD6' }}
          >
            {t('ctaHeading', { sign: data.sign })}
          </h2>
          <p className="text-white/55 text-sm mb-5 leading-relaxed">
            {t('ctaText')}
          </p>
          <Link
            href="/chart"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)',
              color: '#0A0A0F',
              boxShadow: '0 4px 16px rgba(255,215,0,0.2)',
            }}
          >
            <span aria-hidden="true">☉</span>
            {t('ctaButton')}
          </Link>
        </section>

        {/* ── Internal links ─────────────────────────────────────────── */}
        <nav aria-label={t('relatedAria')} className="mt-10 pt-8 border-t border-white/10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-4">
            {t('related')}
          </h2>
          <ul className="flex flex-wrap gap-3 text-sm" role="list">
            <li>
              <Link
                href="/why-sidereal"
                className="text-white/50 hover:text-white/80 transition-colors underline underline-offset-4"
              >
                {t('linkWhySidereal')}
              </Link>
            </li>
            <li>
              <Link
                href="/chart"
                className="text-white/50 hover:text-white/80 transition-colors underline underline-offset-4"
              >
                {t('linkChart')}
              </Link>
            </li>
            <li>
              <Link
                href="/moon"
                className="text-white/50 hover:text-white/80 transition-colors underline underline-offset-4"
              >
                {t('linkMoon')}
              </Link>
            </li>
          </ul>
        </nav>

        <Disclaimer />

      </div>
    </>
  );
}
