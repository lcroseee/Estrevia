import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { MetaPixelLoader } from '@/shared/components/MetaPixelLoader';
import { UtmCapture } from '@/shared/components/UtmCapture';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Locale layout — sits between root layout and all locale-dependent routes.
 *
 * Responsibilities:
 *  1. Validate the [locale] URL segment — 404 on unknown values (prevents
 *     /xyz/chart from rendering with a garbage locale).
 *  2. Call setRequestLocale() so next-intl's static analysis (ISR) knows
 *     which locale is being rendered without relying on request headers.
 *  3. Provide NextIntlClientProvider so client components can call
 *     useTranslations() / useLocale() anywhere in the subtree.
 *  4. Mount the consent-gated Meta Pixel loader — companion to the
 *     server-side CAPI client. The base snippet lives in MetaPixelLoader
 *     and only runs after cookie-consent 'accepted' (LIVE-7). Without
 *     NEXT_PUBLIC_META_PIXEL_ID the Pixel quietly no-ops.
 *
 * Pages NOT under [locale] (s/[id], admin/, api/) intentionally skip this
 * layout — they are English-only and excluded from intl middleware rewrites.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Reject unknown locale segments before rendering any child.
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  // Required for static generation — tells next-intl which locale this is.
  setRequestLocale(locale);

  // getMessages() reads from i18n/request.ts getRequestConfig() using the
  // locale already set via setRequestLocale / request headers.
  const messages = await getMessages();

  // Browser-readable mirror of META_PIXEL_ID. When unset the Pixel is omitted
  // entirely so dev / staging without Meta Ads stays silent (no broken fbq()).
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {/* Consent-gated Meta Pixel (LIVE-7). Mounted even without a pixelId so
          the loader can expire leftover `_fbp`/`_fbc` cookies for declined
          visitors; the snippet itself renders only with BOTH a pixelId and
          consent === 'accepted'. The old <noscript> tracking img is gone —
          it could never be consent-gated (noscript users cannot consent). */}
      <MetaPixelLoader pixelId={pixelId ?? ''} />
      <UtmCapture />
      {children}
    </NextIntlClientProvider>
  );
}
