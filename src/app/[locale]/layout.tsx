import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';

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

  return (
    <NextIntlClientProvider messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
