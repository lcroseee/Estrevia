import { NextResponse } from 'next/server';
import { getAllEssays } from '@/modules/esoteric/lib/essays';
import { SITE_URL } from '@/shared/seo/constants';
import { buildAtomFeed, type AtomEntry } from '@/shared/seo/atom';
import { routing } from '@/i18n/routing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_HEADERS = {
  'Content-Type': 'application/atom+xml; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
};

const FEED_META: Record<'es', { title: string; subtitle: string }> = {
  es: {
    title: 'Estrevia — Ensayos de Astrología Sideral',
    subtitle: 'Interpretaciones planeta en signo usando el ayanamsa Lahiri.',
  },
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ locale: string }> },
): Promise<Response> {
  const { locale } = await context.params;

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // EN root feed lives at /feed.xml — redirect /en/feed.xml to it to avoid duplicate canonical.
  if (locale === 'en') {
    return NextResponse.redirect(`${SITE_URL}/feed.xml`, 308);
  }

  const essays = getAllEssays(locale);

  const entries: AtomEntry[] = essays.map((e) => ({
    title: e.title,
    summary: e.description,
    link: `${SITE_URL}/${locale}/essays/${e.slug}`,
    published: e.publishedAt,
    updated: e.updatedAt,
  }));

  const feedUpdated =
    entries.length > 0
      ? new Date(
          Math.max(
            ...entries.map((e) =>
              new Date(
                e.updated.length === 10 ? `${e.updated}T00:00:00Z` : e.updated,
              ).getTime(),
            ),
          ),
        )
      : new Date();

  const meta = FEED_META[locale as 'es'] ?? FEED_META.es;

  const xml = buildAtomFeed({
    feedUrl: `${SITE_URL}/${locale}/feed.xml`,
    siteUrl: `${SITE_URL}/${locale}`,
    title: meta.title,
    subtitle: meta.subtitle,
    locale: locale as 'en' | 'es',
    updated: feedUpdated,
    entries,
  });

  return new NextResponse(xml, { status: 200, headers: CACHE_HEADERS });
}
