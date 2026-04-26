import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CheckoutStartClient } from './CheckoutStartClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pricingPage');
  return {
    title: t('checkout.metaTitle'),
    robots: { index: false, follow: false },
  };
}

// Force dynamic rendering because the client reads ?plan and ?return from
// the URL at request time; static rendering would bake in the wrong values.
export const dynamic = 'force-dynamic';

export default function CheckoutStartPage() {
  return (
    <Suspense fallback={<StartFallback />}>
      <CheckoutStartClient />
    </Suspense>
  );
}

function StartFallback() {
  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 border-[#FFD700]/30 border-t-[#FFD700] rounded-full animate-spin" />
      </div>
    </div>
  );
}
