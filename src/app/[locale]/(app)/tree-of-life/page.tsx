import type { Metadata } from 'next';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getLocale, getTranslations } from 'next-intl/server';
import { createMetadata, JsonLdScript, breadcrumbSchema, faqSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { TreeOfLifeClient } from '@/modules/esoteric/components/TreeOfLife';
import { Disclaimer } from '@/shared/components/Disclaimer';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const tMeta = await getTranslations('pageMeta.treeOfLife');
  return createMetadata({
    title: tMeta('title'),
    description: tMeta('description'),
    path: '/tree-of-life',
    locale: locale as 'en' | 'es',
    keywords: [
      'tree of life',
      'kabbalah',
      'sephiroth',
      'kabbalistic paths',
      '777 correspondences',
      'thoth tarot tree',
    ],
  });
}

interface SephirahData {
  number: number;
  hidden?: boolean;
  name: { hebrew: string; en: string; es: string };
  meaning: { en: string; es: string };
  sphere: string | null;
  planet: string | null;
  colorQueenScale: string;
  divineName: string;
  archangel: string;
  description: { en: string; es: string };
  position: { x: number; y: number };
}

interface PathData {
  number: number;
  connects: [number, number];
  hebrewLetter: string;
  hebrewSymbol: string;
  tarotCard: string;
  astrology: string;
  color: string;
  description: { en: string; es?: string };
}

async function loadTreeData() {
  const [sephirothRaw, pathsRaw] = await Promise.all([
    readFile(join(process.cwd(), 'content/kabbalah/sephiroth.json'), 'utf-8'),
    readFile(join(process.cwd(), 'content/kabbalah/paths.json'), 'utf-8'),
  ]);

  const sephiroth = (JSON.parse(sephirothRaw) as { sephiroth: SephirahData[] }).sephiroth;
  const paths = (JSON.parse(pathsRaw) as { paths: PathData[] }).paths;

  return { sephiroth, paths };
}

export default async function TreeOfLifePage() {
  const { sephiroth, paths } = await loadTreeData();
  const t = await getTranslations('treeOfLifePage');
  const tEdu = await getTranslations('educational.treeOfLife');

  const treeBreadcrumb = breadcrumbSchema([
    { name: 'Estrevia', url: SITE_URL },
    { name: 'Tree of Life', url: `${SITE_URL}/tree-of-life` },
  ]);

  const faqs = [
    { qKey: 'faq1Q', aKey: 'faq1A' },
    { qKey: 'faq2Q', aKey: 'faq2A' },
    { qKey: 'faq3Q', aKey: 'faq3A' },
    { qKey: 'faq4Q', aKey: 'faq4A' },
    { qKey: 'faq5Q', aKey: 'faq5A' },
  ] as const;

  const treeFaq = faqSchema(
    faqs.map(({ qKey, aKey }) => ({
      question: t(qKey),
      answer: t(aKey),
    })),
  );

  return (
    <>
      <JsonLdScript schema={treeBreadcrumb} />
      <JsonLdScript schema={treeFaq} />

      <div className="min-h-[calc(100vh-4rem)] px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="space-y-2">
            <h1
              className="text-2xl font-semibold text-white/90 tracking-tight"
              style={{ fontFamily: 'var(--font-geist-sans)' }}
            >
              {t('h1')}
            </h1>
            <p className="text-sm text-white/40">
              {t('subtitle')}
            </p>
          </div>

          <TreeOfLifeClient sephiroth={sephiroth} paths={paths} />

          {/* Educational sections — below widget for SEO depth */}
          <section aria-label={tEdu('sectionAria')} className="mt-16 space-y-10 max-w-2xl">
            {/* 10 sefirot */}
            <div>
              <h2
                className="text-xl font-light mb-3 leading-snug"
                style={{ color: '#E8E0D0', fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              >
                {tEdu('sefirot.heading')}
              </h2>
              {tEdu('sefirot.body').split('\n\n').map((paragraph, i) => (
                <p
                  key={i}
                  className="leading-relaxed text-white/55 mb-3"
                  style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', fontSize: '0.9375rem' }}
                >
                  {paragraph}
                </p>
              ))}
            </div>

            {/* 22 paths */}
            <div>
              <h2
                className="text-xl font-light mb-3 leading-snug"
                style={{ color: '#E8E0D0', fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              >
                {tEdu('paths.heading')}
              </h2>
              <p
                className="leading-relaxed text-white/55"
                style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', fontSize: '0.9375rem' }}
              >
                {tEdu('paths.body')}
              </p>
            </div>

            {/* How to read */}
            <div>
              <h2
                className="text-xl font-light mb-3 leading-snug"
                style={{ color: '#E8E0D0', fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              >
                {tEdu('howToRead.heading')}
              </h2>
              {tEdu('howToRead.body').split('\n\n').map((paragraph, i) => (
                <p
                  key={i}
                  className="leading-relaxed text-white/55 mb-3"
                  style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', fontSize: '0.9375rem' }}
                >
                  {paragraph}
                </p>
              ))}
            </div>

            {/* Tree and Tarot */}
            <div>
              <h2
                className="text-xl font-light mb-3 leading-snug"
                style={{ color: '#E8E0D0', fontFamily: 'var(--font-crimson-pro, Georgia, serif)' }}
              >
                {tEdu('treeAndTarot.heading')}
              </h2>
              {tEdu('treeAndTarot.body').split('\n\n').map((paragraph, i) => (
                <p
                  key={i}
                  className="leading-relaxed text-white/55 mb-3"
                  style={{ fontFamily: 'var(--font-crimson-pro, Georgia, serif)', fontSize: '0.9375rem' }}
                >
                  {paragraph}
                </p>
              ))}
            </div>

            {/* FAQ */}
            <section aria-label={t('aboutAria')} className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-[0.18em] mb-5 text-white/30" style={{ fontFamily: 'var(--font-geist-sans)' }}>
                {t('aboutHeading')}
              </h2>
              {faqs.map(({ qKey, aKey }) => (
                <details
                  key={qKey}
                  className="group rounded-xl overflow-hidden transition-all"
                  style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.015)' }}
                >
                  <summary className="px-5 py-3.5 text-sm text-white/58 cursor-pointer select-none hover:bg-white/[0.025] transition-colors list-none flex items-center justify-between">
                    {t(qKey)}
                    <span className="text-white/22 text-[10px] ml-3 flex-shrink-0 group-open:rotate-180 transition-transform duration-200" aria-hidden="true">▾</span>
                  </summary>
                  <p
                    className="px-5 pb-5 pt-1 leading-relaxed"
                    style={{ color: 'rgba(255,255,255,0.42)', fontFamily: 'var(--font-crimson-pro, Georgia, serif)', fontSize: '0.9375rem' }}
                  >
                    {t(aKey)}
                  </p>
                </details>
              ))}
            </section>
          </section>

          <Disclaimer />
        </div>
      </div>
    </>
  );
}
