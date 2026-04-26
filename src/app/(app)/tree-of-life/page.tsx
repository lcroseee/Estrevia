import type { Metadata } from 'next';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getTranslations } from 'next-intl/server';
import { createMetadata, JsonLdScript, breadcrumbSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { TreeOfLifeClient } from '@/modules/esoteric/components/TreeOfLife';
import { Disclaimer } from '@/shared/components/Disclaimer';

export async function generateMetadata(): Promise<Metadata> {
  const tMeta = await getTranslations('pageMeta.treeOfLife');
  return createMetadata({
    title: tMeta('title'),
    description: tMeta('description'),
    path: '/tree-of-life',
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

const treeBreadcrumb = breadcrumbSchema([
  { name: 'Estrevia', url: SITE_URL },
  { name: 'Tree of Life', url: `${SITE_URL}/tree-of-life` },
]);

export default async function TreeOfLifePage() {
  const { sephiroth, paths } = await loadTreeData();
  const t = await getTranslations('treeOfLifePage');

  return (
    <>
      <JsonLdScript schema={treeBreadcrumb} />
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

          <Disclaimer />
        </div>
      </div>
    </>
  );
}
