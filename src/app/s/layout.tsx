import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';

/**
 * Layout for /s/[id] share pages.
 *
 * /s/ is outside the [locale]/ directory because share pages are EN-only
 * (noindex per spec §2.3 #14, never localized — viral share URLs go directly
 * to passport snapshot, language toggle would only confuse users sharing).
 *
 * However, ShareButton.tsx and other client components inside this subtree
 * call useTranslations(), which requires NextIntlClientProvider.
 * Without this layout, those calls throw "There is no intl context available"
 * and the page renders the global error boundary (HTTP 500).
 *
 * setRequestLocale('en') tells next-intl this branch is statically
 * generated as EN, avoiding header-based locale detection.
 */
export default async function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  setRequestLocale('en');
  const messages = await getMessages();
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
