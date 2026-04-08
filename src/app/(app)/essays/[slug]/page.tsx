/**
 * /essays/[slug] — individual essay page.
 *
 * Server Component. Statically generated for all 120 planet-in-sign essays.
 * Loads MDX from content/essays/, injects JSON-LD, renders EssayPage layout.
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  createMetadata,
  JsonLdScript,
  articleSchema,
  faqSchema,
  breadcrumbSchema,
  getAllEssaySlugs,
  parseEssaySlug,
} from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { getEssayBySlug } from '@/modules/esoteric/lib/essays';
import { EssayPage } from '@/modules/esoteric/components/EssayPage';

// ---------------------------------------------------------------------------
// Static params — all 120 essays pre-rendered at build time
// ---------------------------------------------------------------------------

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
  const essay = getEssayBySlug(slug);

  if (!essay) {
    return createMetadata({
      title: 'Essay not found',
      description: 'The requested essay could not be found.',
      path: `/essays/${slug}`,
      noIndex: true,
    });
  }

  return createMetadata({
    title: essay.meta.title,
    description: essay.meta.description,
    path: `/essays/${slug}`,
    type: 'article',
    publishedTime: essay.meta.publishedAt,
    modifiedTime: essay.meta.updatedAt,
    keywords: essay.meta.keywords,
  });
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function EssaySlugPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const essay = getEssayBySlug(slug);

  if (!essay) {
    notFound();
  }

  const { meta, content } = essay;
  const parsed = parseEssaySlug(slug);

  // ── JSON-LD schemas ──────────────────────────────────────────────────────
  const canonicalUrl = `${SITE_URL}/essays/${slug}`;

  const articleLd = articleSchema({
    title: meta.title,
    description: meta.description,
    url: canonicalUrl,
    datePublished: meta.publishedAt,
    dateModified: meta.updatedAt,
  });

  const faqItems = extractFaqItems(content);
  const faqLd = faqItems.length > 0 ? faqSchema(faqItems) : null;

  const breadcrumbLd = breadcrumbSchema([
    { name: 'Home', url: SITE_URL },
    { name: 'Essays', url: `${SITE_URL}/essays` },
    ...(parsed
      ? [{ name: parsed.sign, url: `${SITE_URL}/signs/${parsed.sign}` }]
      : []),
    { name: meta.title, url: canonicalUrl },
  ]);

  return (
    <>
      {/* JSON-LD structured data */}
      <JsonLdScript schema={articleLd} />
      {faqLd && <JsonLdScript schema={faqLd} />}
      <JsonLdScript schema={breadcrumbLd} />

      {/* Essay content */}
      <EssayPage meta={meta} content={content} />
    </>
  );
}

// ---------------------------------------------------------------------------
// FAQ extraction helper
// ---------------------------------------------------------------------------

/**
 * Extracts FAQ Q&A pairs from the markdown body.
 *
 * Looks for the pattern used in all 120 essays:
 *   **Question text?**
 *   Answer text on the next non-empty line(s).
 *
 * Only pairs found after "## FAQ" heading are extracted.
 */
function extractFaqItems(markdown: string): Array<{ question: string; answer: string }> {
  const faqStart = markdown.search(/^##\s+FAQ/im);
  if (faqStart === -1) return [];

  const faqSection = markdown.slice(faqStart);

  const items: Array<{ question: string; answer: string }> = [];
  const questionRegex = /\*\*([^*]+\?)\*\*\s*\n([\s\S]*?)(?=\n\*\*[^*]+\?\*\*|\n##\s|$)/g;

  let match: RegExpExecArray | null;
  while ((match = questionRegex.exec(faqSection)) !== null) {
    const question = match[1]?.trim();
    const answer = match[2]?.trim().replace(/\n+/g, ' ');
    if (question && answer) {
      items.push({ question, answer });
    }
  }

  return items.slice(0, 8);
}
