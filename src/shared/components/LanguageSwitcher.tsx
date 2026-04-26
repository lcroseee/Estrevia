'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';

const LOCALES = [
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
] as const;

/**
 * Language switcher. Sets NEXT_LOCALE cookie and reloads the page.
 * Compact toggle for header / settings page.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('appShell');
  const [isPending, startTransition] = useTransition();

  function handleChange(newLocale: string) {
    if (newLocale === locale) return;

    startTransition(() => {
      // Set cookie and reload to pick up new locale
      document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      window.location.reload();
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
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
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
