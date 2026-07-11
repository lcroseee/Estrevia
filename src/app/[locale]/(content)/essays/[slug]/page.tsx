/**
 * /essays/[slug] — individual essay page.
 *
 * Server Component. Statically generated for all 120 planet-in-sign essays.
 * Loads MDX from content/essays/, injects JSON-LD, renders EssayPage layout.
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  createMetadata,
  JsonLdScript,
  articleSchema,
  faqSchema,
  breadcrumbSchema,
  getAllEssaySlugs,
  parseEssaySlug,
  relatedEssaySlugs,
  essayLocaleUrls,
} from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { getEssayBySlug } from '@/modules/esoteric/lib/essays';
import { extractFaqItems } from '@/modules/esoteric/lib/faq';
import { esEssaySignPhrase } from '@/shared/lib/astro-i18n';
import { EssayPage } from '@/modules/esoteric/components/EssayPage';
import { EssayPageClient } from '@/modules/esoteric/components/EssayPageClient';
import { RelatedPlacements } from '@/shared/components/RelatedPlacements';

// ---------------------------------------------------------------------------
// Static params — all 120 essays pre-rendered at build time
// ---------------------------------------------------------------------------

// ISR: rebuild each essay page at most once per day in the background.
// R10 CWV win — serves from CDN edge cache, TTFB ~500ms → ~50ms.
export const revalidate = 86400;

// Only the 120 enumerated slugs render; any other slug is a real 404 (not a
// soft-404 200+noindex shell). generateStaticParams below is the allowlist.
export const dynamicParams = false;

export function generateStaticParams(): Array<{ slug: string }> {
  return getAllEssaySlugs().map((slug) => ({ slug }));
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const locale = await getLocale();
  const essay = getEssayBySlug(slug, locale);

  if (!essay) {
    return createMetadata({
      title: 'Essay not found',
      description: 'The requested essay could not be found.',
      path: `/essays/${slug}`,
      locale: locale as 'en' | 'es',
      noIndex: true,
    });
  }

  const esPhrase = locale === 'es' ? esEssaySignPhrase(slug) : null;
  const baseKeywords = essay.meta.keywords;
  const keywords =
    esPhrase && !baseKeywords.includes(esPhrase)
      ? [...baseKeywords, esPhrase]
      : baseKeywords;

  return createMetadata({
    title: essay.meta.title,
    description: essay.meta.description,
    path: `/essays/${slug}`,
    type: 'article',
    locale: locale as 'en' | 'es',
    publishedTime: essay.meta.publishedAt,
    modifiedTime: essay.meta.updatedAt,
    keywords,
    ogImage: `${SITE_URL}/api/og/essay/${slug}`,
  });
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function EssaySlugPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const locale = await getLocale();
  const essay = getEssayBySlug(slug, locale);

  if (!essay) {
    notFound();
  }

  const { meta, content } = essay;
  const parsed = parseEssaySlug(slug);

  // ── JSON-LD schemas ──────────────────────────────────────────────────────
  const { canonicalUrl, homeUrl, signUrl } = essayLocaleUrls(
    slug,
    locale as 'en' | 'es',
    parsed?.sign ?? null,
  );

  const articleLd = articleSchema({
    title: meta.title,
    description: meta.description,
    url: canonicalUrl,
    datePublished: meta.publishedAt,
    dateModified: meta.updatedAt,
    imageUrl: `${SITE_URL}/api/og/essay/${slug}`,
  });

  const faqItems = extractFaqItems(content);
  const faqLd = faqItems.length > 0 ? faqSchema(faqItems) : null;

  const signDisplay = parsed
    ? parsed.sign.charAt(0).toUpperCase() + parsed.sign.slice(1)
    : null;

  const breadcrumbLd = breadcrumbSchema([
    { name: 'Home', url: homeUrl },
    ...(parsed && signDisplay && signUrl
      ? [{ name: signDisplay, url: signUrl }]
      : []),
    { name: meta.title, url: canonicalUrl },
  ]);

  const tRelated = await getTranslations('essayDetail.related');

  return (
    <>
      {/* JSON-LD structured data */}
      <JsonLdScript schema={articleLd} />
      {faqLd && <JsonLdScript schema={faqLd} />}
      <JsonLdScript schema={breadcrumbLd} />

      {/* Essay content — wrapped with paywall for free users */}
      <EssayPageClient>
        <EssayPage meta={meta} content={content} />
      </EssayPageClient>

      {/* Related placements mesh — rendered OUTSIDE the paywall so the 6-8
          sibling anchors are always present in SSR HTML (crawlable) and visible
          to anon/free users below the paywall CTA (T9, audit finding #4). */}
      <RelatedPlacements slugs={relatedEssaySlugs(slug)} heading={tRelated('placementsHeading')} />
    </>
  );
}
