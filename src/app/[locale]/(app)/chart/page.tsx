import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { createMetadata, JsonLdScript, softwareAppSchema, breadcrumbSchema } from '@/shared/seo';
import { SITE_URL } from '@/shared/seo/constants';
import { ChartDisplay } from '@/modules/astro-engine/components/ChartDisplay';
import { Disclaimer } from '@/shared/components/Disclaimer';
import { fetchTempChart } from '@/shared/lib/temp-chart';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const tMeta = await getTranslations('pageMeta.chart');
  return createMetadata({
    title: tMeta('title'),
    description: tMeta('description'),
    path: '/chart',
    locale: locale as 'en' | 'es',
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

export default async function ChartPage({
  searchParams,
}: {
  searchParams: Promise<{ chartId?: string }>;
}) {
  const { chartId } = await searchParams;
  // P0-3: drip emails + the hero CTA deep-link to /chart?chartId=… — fetch the
  // stored temp chart server-side so ad-driven links render the result view
  // instead of dead-ending on the empty form. No PII in the URL: the nanoid
  // resolves only to computed positions. Missing/expired id (cleanup cron
  // deletes temp charts after 7d) → null → graceful empty-form fallback.
  const initialChart = chartId ? await fetchTempChart(chartId) : null;

  const t = await getTranslations('chart');
  const schema = softwareAppSchema();

  // Breadcrumb is built inside the function so the page-name crumb stays in
  // sync with the active locale ('Estrevia' is a proper noun — no translation).
  const chartBreadcrumb = breadcrumbSchema([
    { name: 'Estrevia', url: SITE_URL },
    { name: t('breadcrumbCurrent'), url: `${SITE_URL}/chart` },
  ]);

  return (
    <>
      <JsonLdScript schema={schema} />
      <JsonLdScript schema={chartBreadcrumb} />
      <Suspense fallback={await ChartSkeleton()}>
        <ChartDisplay
          initialChart={initialChart ?? undefined}
          initialChartId={initialChart && chartId ? chartId : undefined}
        />
      </Suspense>
      <div className="px-4 pb-10 max-w-2xl mx-auto">
        <Disclaimer />
      </div>
    </>
  );
}
