'use client';

import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/shared/components/LanguageSwitcher';
import { NotificationSettings } from '@/modules/astro-engine/components/NotificationSettings';

export function SettingsClientSections() {
  const t = useTranslations('settings');

  return (
    <>
      {/* Language section */}
      <section aria-labelledby="language-heading" className="mb-8">
        <h2
          id="language-heading"
          className="text-xs tracking-[0.2em] uppercase text-white/35 mb-4"
        >
          {t('language')}
        </h2>
        <div
          className="rounded-2xl border border-white/6 p-5"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white/80">{t('language')}</p>
              <p className="text-xs text-white/35 mt-0.5">
                Choose your preferred language for the interface.
              </p>
            </div>
            <LanguageSwitcher />
          </div>
        </div>
      </section>

      {/* Notifications section */}
      <section aria-labelledby="notifications-heading" className="mb-8">
        <h2
          id="notifications-heading"
          className="text-xs tracking-[0.2em] uppercase text-white/35 mb-4"
        >
          {t('notifications')}
        </h2>
        <div
          className="rounded-2xl border border-white/6 p-5"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <NotificationSettings />
        </div>
      </section>
    </>
  );
}
