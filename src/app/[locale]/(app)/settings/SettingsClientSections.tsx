'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/shared/components/LanguageSwitcher';
import { NotificationSettings } from '@/modules/astro-engine/components/NotificationSettings';

interface SettingsClientSectionsProps {
  initialMarketingEmailOptIn: boolean;
}

export function SettingsClientSections({ initialMarketingEmailOptIn }: SettingsClientSectionsProps) {
  const t = useTranslations('settings');
  const tEmail = useTranslations('settings.email');

  const [marketingOptIn, setMarketingOptIn] = useState(initialMarketingEmailOptIn);
  const [isSaving, setIsSaving] = useState(false);

  const handleMarketingToggle = useCallback(async () => {
    const prev = marketingOptIn;
    const next = !prev;

    // Optimistic update
    setMarketingOptIn(next);
    setIsSaving(true);

    try {
      const res = await fetch('/api/v1/user/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketingEmailOptIn: next }),
      });

      if (!res.ok) {
        // Revert on failure
        setMarketingOptIn(prev);
      }
    } catch {
      // Network error — revert
      setMarketingOptIn(prev);
    } finally {
      setIsSaving(false);
    }
  }, [marketingOptIn]);

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

      {/* Email preferences section */}
      <section aria-labelledby="email-preferences-heading" className="mb-8">
        <h2
          id="email-preferences-heading"
          className="text-xs tracking-[0.2em] uppercase text-white/35 mb-4"
        >
          {tEmail('title')}
        </h2>
        <div
          className="rounded-2xl border border-white/6 p-5"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <label className="flex items-start justify-between gap-3 cursor-pointer">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>
                {tEmail('marketingOptInLabel')}
              </span>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {tEmail('marketingOptInDesc')}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={marketingOptIn}
              aria-label={tEmail('marketingOptInLabel')}
              disabled={isSaving}
              onClick={handleMarketingToggle}
              className="relative shrink-0 w-10 h-6 rounded-full transition-colors duration-200"
              style={{
                background: marketingOptIn
                  ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                  : 'rgba(255,255,255,0.12)',
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform duration-200"
                style={{
                  background: marketingOptIn ? '#0A0A0F' : 'rgba(255,255,255,0.5)',
                  transform: marketingOptIn ? 'translateX(16px)' : 'translateX(0)',
                }}
              />
            </button>
          </label>
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
