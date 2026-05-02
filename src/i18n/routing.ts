import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'es'] as const,
  defaultLocale: 'en',
  // EN paths stay at root (/chart, /essays/sun-in-aries).
  // ES paths get an /es prefix (/es/chart, /es/essays/sun-in-aries).
  localePrefix: 'as-needed',
});

export type Locale = (typeof routing.locales)[number];
