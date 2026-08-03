'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';

interface AvatarCtaProps {
  avatarId: string;
}

/**
 * CTA on the Cosmic Portrait share page — mirrors PassportCta / SynastryCta
 * (see src/app/s/[id]/PassportCta.tsx, src/app/s/synastry/[id]/SynastryCta.tsx).
 *
 * Reuses PASSPORT_CONVERTED rather than adding a new analytics event — the
 * synastry share page already established that this event tracks "share
 * page drove someone into the funnel" generically, not literally passports.
 *
 * Uses next-intl's <Link> (not next/navigation's router) because this page
 * lives under [locale] and must keep the visitor's locale on navigation —
 * unlike the EN-only passport/synastry share pages this one is modelled on.
 */
export function AvatarCta({ avatarId }: AvatarCtaProps) {
  const t = useTranslations('avatar');

  function handleClick() {
    trackEvent(AnalyticsEvent.PASSPORT_CONVERTED, {
      avatar_id: avatarId,
      source: 'avatar_share_page',
    });
  }

  return (
    <Link
      href={`/chart?utm_source=avatar_share&utm_medium=social&utm_campaign=viral&ref=${avatarId}`}
      onClick={handleClick}
      className="flex items-center justify-center gap-2 w-full px-6 py-4 rounded-xl text-sm font-semibold transition-all duration-200 hover:shadow-xl active:scale-[0.98]"
      style={{
        background: 'linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)',
        color: '#0A0A0F',
        boxShadow: '0 4px 20px rgba(255,215,0,0.25)',
        border: 'none',
      }}
      aria-label={t('portrait.generate')}
    >
      <span aria-hidden="true" style={{ fontFamily: 'serif', fontSize: '1rem' }}>
        ☉
      </span>
      {t('portrait.generate')}
    </Link>
  );
}
