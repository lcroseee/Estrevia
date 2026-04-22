import type { Metadata } from 'next';
import { readFile } from 'fs/promises';
import { join } from 'path';
import Link from 'next/link';
import { createMetadata, JsonLdScript, breadcrumbSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { TarotCatalogClient } from '@/modules/esoteric/components/TarotCatalogClient';

// ISR: rebuild the tarot catalog daily. R10 CWV win.
export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: 'Thoth Tarot — 78 Card Catalog & Daily Draw',
    description:
      'Explore the 78 cards of the Thoth Tarot deck. Draw your daily card, explore Major Arcana and four suits, and discover Kabbalistic correspondences.',
    path: '/tarot',
    keywords: [
      'thoth tarot',
      'tarot deck',
      'daily tarot card',
      'major arcana',
      'tarot correspondences',
    ],
  });
}

async function loadCards() {
  const filePath = join(process.cwd(), 'content/tarot/cards.json');
  const raw = await readFile(filePath, 'utf-8');
  const data = JSON.parse(raw) as {
    cards: Array<{
      id: string;
      number: number;
      name: { en: string; es?: string };
      suit: string;
      keywords?: {
        upright?: { en: string[] };
        reversed?: { en: string[] };
      };
      description?: { en: string };
      hebrewLetter?: string;
      treeOfLifePath?: number;
    }>;
  };
  return data.cards;
}

const tarotBreadcrumb = breadcrumbSchema([
  { name: 'Estrevia', url: SITE_URL },
  { name: 'Thoth Tarot', url: `${SITE_URL}/tarot` },
]);

export default async function TarotPage() {
  const cards = await loadCards();

  return (
    <>
      <JsonLdScript schema={tarotBreadcrumb} />
      <div className="min-h-[calc(100vh-4rem)] px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1
                className="text-2xl font-semibold text-white/90 tracking-tight"
                style={{ fontFamily: 'var(--font-geist-sans)' }}
              >
                Thoth Tarot
              </h1>
              <p className="text-sm text-white/40">
                78 cards of the Thoth deck with Kabbalistic correspondences
              </p>
            </div>
            <Link
              href="/tarot/spread"
              className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-medium bg-gradient-to-br from-[#FFD700]/90 to-[#FF8C00]/80 text-black hover:shadow-lg hover:shadow-[#FFD700]/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]"
            >
              Open Spreads
            </Link>
          </div>

          <TarotCatalogClient cards={cards} />
        </div>
      </div>
    </>
  );
}
