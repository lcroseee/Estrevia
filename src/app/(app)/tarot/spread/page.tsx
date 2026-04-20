import type { Metadata } from 'next';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getTranslations } from 'next-intl/server';
import { createMetadata, JsonLdScript, breadcrumbSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { SpreadTabs } from './SpreadTabs';
import type { TarotCardData } from '@/modules/esoteric/components/TarotCard';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: 'Tarot Spreads — Three Card & Celtic Cross',
    description:
      'Draw a Three-Card or Celtic Cross spread from the 78-card Thoth deck. AI interpretation available with Pro.',
    path: '/tarot/spread',
    keywords: [
      'tarot spread',
      'three card tarot',
      'celtic cross spread',
      'thoth tarot reading',
      'free tarot reading',
    ],
  });
}

async function loadCards(): Promise<TarotCardData[]> {
  const filePath = join(process.cwd(), 'content/tarot/cards.json');
  const raw = await readFile(filePath, 'utf-8');
  const data = JSON.parse(raw) as { cards: TarotCardData[] };
  return data.cards;
}

export default async function TarotSpreadPage() {
  const t = await getTranslations('tarot');
  const cards = await loadCards();

  const breadcrumb = breadcrumbSchema([
    { name: 'Estrevia', url: SITE_URL },
    { name: 'Thoth Tarot', url: `${SITE_URL}/tarot` },
    { name: 'Spreads', url: `${SITE_URL}/tarot/spread` },
  ]);

  return (
    <>
      <JsonLdScript schema={breadcrumb} />
      <div className="min-h-[calc(100vh-4rem)] px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="space-y-2">
            <h1
              className="text-2xl font-semibold text-white/90 tracking-tight"
              style={{ fontFamily: 'var(--font-geist-sans)' }}
            >
              {t('spreadsTitle')}
            </h1>
            <p className="text-sm text-white/40">{t('spreadsSubtitle')}</p>
          </header>

          <SpreadTabs cards={cards} />
        </div>
      </div>
    </>
  );
}
