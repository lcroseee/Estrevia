import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  // Validate the segment locale; fall back to default if unknown or undefined.
  const locale =
    requested !== undefined &&
    (routing.locales as readonly string[]).includes(requested)
      ? requested
      : routing.defaultLocale;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
