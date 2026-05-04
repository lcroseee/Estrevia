import { NextResponse } from 'next/server';
import { getAllEssays } from '@/modules/esoteric/lib/essays';
import { SITE_URL } from '@/shared/seo/constants';
import { buildAtomFeed, type AtomEntry } from '@/shared/seo/atom';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_HEADERS = {
  'Content-Type': 'application/atom+xml; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
};

export async function GET(): Promise<Response> {
  const essays = getAllEssays('en');

  const entries: AtomEntry[] = essays.map((e) => ({
    title: e.title,
    summary: e.description,
    link: `${SITE_URL}/essays/${e.slug}`,
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

  const xml = buildAtomFeed({
    feedUrl: `${SITE_URL}/feed.xml`,
    siteUrl: SITE_URL,
    title: 'Estrevia — Sidereal Astrology Essays',
    subtitle: 'Planet-in-sign interpretations using Lahiri ayanamsa.',
    locale: 'en',
    updated: feedUpdated,
    entries,
  });

  return new NextResponse(xml, { status: 200, headers: CACHE_HEADERS });
}
