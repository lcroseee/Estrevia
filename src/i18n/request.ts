import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export default getRequestConfig(async () => {
  // 1. Check cookie
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;

  if (cookieLocale && locales.includes(cookieLocale as Locale)) {
    return {
      locale: cookieLocale,
      messages: (await import(`../../messages/${cookieLocale}.json`)).default,
    };
  }

  // 2. Check Accept-Language header (parse primary language tag)
  const headersList = await headers();
  const acceptLang = headersList.get('accept-language') ?? '';
  const primaryLang = acceptLang.split(',')[0]?.split(';')[0]?.split('-')[0]?.toLowerCase().trim();
  const detectedLocale: Locale = primaryLang === 'es' ? 'es' : 'en';

  return {
    locale: detectedLocale,
    messages: (await import(`../../messages/${detectedLocale}.json`)).default,
  };
});
