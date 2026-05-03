'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';

const LOCALES = [
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
] as const;

/**
 * Language switcher. Navigates to the locale-correct URL via next-intl's
 * router (handles the as-needed prefix: EN at root, ES under /es/...).
 * The persisted NEXT_LOCALE cookie is what next-intl middleware reads on
 * future root-path visits to remember the choice.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('appShell');
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function handleChange(newLocale: Locale) {
    if (newLocale === locale) return;

    startTransition(() => {
      document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      router.replace(pathname, { locale: newLocale });
    });
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg p-0.5"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
      role="radiogroup"
      aria-label={t('languageAriaLabel')}
    >
      {LOCALES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          role="radio"
          aria-checked={locale === code}
          onClick={() => handleChange(code)}
          disabled={isPending}
          className={`px-2.5 py-3 sm:py-1 rounded-md text-xs font-medium transition-all duration-150 min-h-[44px] sm:min-h-0 flex items-center justify-center ${
            locale === code
              ? 'bg-white/10 text-white'
              : 'text-white/40 hover:text-white/60'
          } ${isPending ? 'opacity-50' : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
