import type { Metadata } from 'next';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { Link } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { createMetadata, JsonLdScript, breadcrumbSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { TarotCatalogClient } from '@/modules/esoteric/components/TarotCatalogClient';
import { groupTarotCards } from '@/modules/esoteric/lib/tarotCards';

// ISR: rebuild the tarot catalog daily. R10 CWV win.
export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const tMeta = await getTranslations('pageMeta.tarot');
  return createMetadata({
    title: tMeta('title'),
    description: tMeta('description'),
    path: '/tarot',
    locale: locale as 'en' | 'es',
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
  const t = await getTranslations('tarotPage');
  const locale = await getLocale();
  const groups = groupTarotCards(cards, locale);

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
                {t('h1')}
              </h1>
              <p className="text-sm text-white/40">
                {t('subtitle')}
              </p>
            </div>
            <Link
              href="/tarot/spread"
              className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-medium bg-gradient-to-br from-[#FFD700]/90 to-[#FF8C00]/80 text-black hover:shadow-lg hover:shadow-[#FFD700]/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0F]"
            >
              {t('openSpreads')}
            </Link>
          </div>

          <TarotCatalogClient cards={cards} />

          {/* Server-rendered crawlable index — guarantees all 78 card anchors
              exist in the initial HTML (not only the client gallery). SEO §2b. */}
          <nav aria-label={t('browseAllHeading')} className="space-y-6 pt-4">
            <h2 className="text-xs uppercase tracking-wider text-white/40 font-medium">
              {t('browseAllHeading')}
            </h2>
            {groups.map((group) => (
              <section key={group.suit} className="space-y-2">
                <h3 className="text-[11px] uppercase tracking-wider text-white/30">
                  {t(`suits.${group.suit}` as 'suits.major' | 'suits.wands' | 'suits.cups' | 'suits.swords' | 'suits.disks')}
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {group.cards.map((card) => (
                    <li key={card.id}>
                      <Link
                        href={`/tarot/${card.id}`}
                        className="inline-block px-2.5 py-1 rounded-md text-xs bg-white/5 text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors"
                      >
                        {card.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
