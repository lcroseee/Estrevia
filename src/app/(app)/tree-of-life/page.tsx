import type { Metadata } from 'next';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createMetadata, JsonLdScript, breadcrumbSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { TreeOfLifeClient } from '@/modules/esoteric/components/TreeOfLife';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: 'Tree of Life — Kabbalistic Diagram',
    description:
      'Explore the interactive Tree of Life with 10 Sephiroth, 22 paths, and Thoth Tarot correspondences. Overlay your natal chart planets on the Kabbalistic Tree.',
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
  name: { hebrew: string; en: string };
  meaning: { en: string };
  planet: string;
  colorQueenScale: string;
  divineName: string;
  archangel: string;
  description: { en: string };
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
  description: { en: string };
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
              Tree of Life
            </h1>
            <p className="text-sm text-white/40">
              Interactive Kabbalistic diagram with Sephiroth, paths, and 777 correspondences
            </p>
          </div>

          <TreeOfLifeClient sephiroth={sephiroth} paths={paths} />
        </div>
      </div>
    </>
  );
}
