import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

// EN + ES (neutral LATAM Spanish) both live at launch.
// No URL-based locale segments (/en/... or /es/...) — single canonical URL per page.
// Locale preference order: 1) NEXT_LOCALE cookie, 2) Accept-Language header, 3) 'en' default.
export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

/**
 * Parses the Accept-Language header and returns the best matching locale.
 * Returns null if no match found.
 */
function detectLocaleFromHeader(acceptLanguage: string | null): Locale | null {
  if (!acceptLanguage) return null;

  // Parse "es-MX,es;q=0.9,en;q=0.8" style headers
  const parts = acceptLanguage
    .split(',')
    .map((part) => {
      const [lang, q] = part.trim().split(';q=');
      return { lang: lang.trim().toLowerCase(), q: q ? parseFloat(q) : 1.0 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of parts) {
    // Match exact locale first
    if (lang === 'es' || lang.startsWith('es-')) return 'es';
    if (lang === 'en' || lang.startsWith('en-')) return 'en';
  }
  return null;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;

  // 1. Explicit cookie takes highest priority
  if (cookieLocale && locales.includes(cookieLocale as Locale)) {
    return {
      locale: cookieLocale,
      messages: (await import(`../../messages/${cookieLocale}.json`)).default,
    };
  }

  // 2. Fall back to Accept-Language header detection
  const headerStore = await headers();
  const acceptLanguage = headerStore.get('accept-language');
  const detectedLocale = detectLocaleFromHeader(acceptLanguage);

  if (detectedLocale) {
    return {
      locale: detectedLocale,
      messages: (await import(`../../messages/${detectedLocale}.json`)).default,
    };
  }

  // 3. Default to English
  return {
    locale: 'en',
    messages: (await import('../../messages/en.json')).default,
  };
});
