import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { createMetadata, JsonLdScript, breadcrumbSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { SynastryClient } from '@/modules/astro-engine/components/SynastryClient';
import { Disclaimer } from '@/shared/components/Disclaimer';

export async function generateMetadata(): Promise<Metadata> {
  const tMeta = await getTranslations('pageMeta.synastry');
  return createMetadata({
    title: tMeta('title'),
    description: tMeta('description'),
    path: '/synastry',
    keywords: [
      'synastry calculator',
      'astrological compatibility',
      'sidereal synastry',
      'relationship astrology',
      'chart comparison',
    ],
  });
}

function SynastrySkeleton() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-10"
      aria-busy="true"
      aria-label="Loading synastry calculator..."
    >
      <div className="space-y-4 w-full max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <div className="h-6 w-24 rounded bg-white/4 animate-pulse" />
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-10 rounded-lg bg-white/4 animate-pulse" />
              ))}
            </div>
          ))}
        </div>
        <div className="h-12 rounded-xl bg-white/6 animate-pulse" />
      </div>
    </div>
  );
}

const synastryBreadcrumb = breadcrumbSchema([
  { name: 'Estrevia', url: SITE_URL },
  { name: 'Synastry Calculator', url: `${SITE_URL}/synastry` },
]);

export default function SynastryPage() {
  return (
    <>
      <JsonLdScript schema={synastryBreadcrumb} />
      <Suspense fallback={<SynastrySkeleton />}>
        <SynastryClient />
      </Suspense>
      <div className="px-4 pb-10 max-w-2xl mx-auto">
        <Disclaimer />
      </div>
    </>
  );
}
