import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { routing } from '@/i18n/routing';
import { MetaPixelLeadEmitter } from '@/shared/components/MetaPixelLeadEmitter';
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
 *  4. Inject the Meta Pixel base snippet (PageView + fbq init) once per
 *     locale-routed page when NEXT_PUBLIC_META_PIXEL_ID is configured —
 *     companion to the server-side CAPI client. If the env var is unset
 *     (dev / staging without Meta Ads), the Pixel quietly no-ops.
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
      {pixelId ? (
        <>
          <Script id="meta-pixel-base" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');`}
          </Script>
          <noscript>
            {/* next/image requires JS — pointless inside <noscript>. The
                Meta-recommended Pixel fallback is a 1x1 tracking <img>. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      ) : null}
      <UtmCapture />
      <MetaPixelLeadEmitter />
      {children}
    </NextIntlClientProvider>
  );
}
