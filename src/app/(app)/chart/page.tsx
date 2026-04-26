import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { createMetadata, JsonLdScript, softwareAppSchema, breadcrumbSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { ChartDisplay } from '@/modules/astro-engine/components/ChartDisplay';
import { Disclaimer } from '@/shared/components/Disclaimer';

export async function generateMetadata(): Promise<Metadata> {
  const tMeta = await getTranslations('pageMeta.chart');
  return createMetadata({
    title: tMeta('title'),
    description: tMeta('description'),
    path: '/chart',
    keywords: [
      'sidereal natal chart',
      'birth chart calculator',
      'sidereal astrology',
      'Lahiri ayanamsa',
      'Swiss Ephemeris',
    ],
  });
}

async function ChartSkeleton() {
  const t = await getTranslations('chartDisplay');
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-10"
      aria-busy="true"
      aria-label={t('loadingAria')}
    >
      <div className="space-y-4 w-full max-w-md">
        {/* Wheel skeleton */}
        <div className="aspect-square w-full max-w-[360px] mx-auto rounded-full bg-white/4 animate-pulse" />
        {/* Form skeleton */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-white/4 animate-pulse" />
          ))}
          <div className="h-12 rounded-xl bg-white/6 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

const chartBreadcrumb = breadcrumbSchema([
  { name: 'Estrevia', url: SITE_URL },
  { name: 'Natal Chart Calculator', url: `${SITE_URL}/chart` },
]);

export default async function ChartPage() {
  const schema = softwareAppSchema();

  return (
    <>
      <JsonLdScript schema={schema} />
      <JsonLdScript schema={chartBreadcrumb} />
      <Suspense fallback={await ChartSkeleton()}>
        <ChartDisplay />
      </Suspense>
      <div className="px-4 pb-10 max-w-2xl mx-auto">
        <Disclaimer />
      </div>
    </>
  );
}
