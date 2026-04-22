'use client';

import { useRouter } from 'next/navigation';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';

interface PassportCtaProps {
  passportId: string;
}

/**
 * CTA button on the share page — "Calculate Your Cosmic Passport".
 * Fires passport_converted before navigating so the viral coefficient
 * can be measured in PostHog.
 */
export function PassportCta({ passportId }: PassportCtaProps) {
  const router = useRouter();

  function handleClick() {
    trackEvent(AnalyticsEvent.PASSPORT_CONVERTED, {
      passport_id: passportId,
      source: 'share_page',
    });
    router.push(
      `/chart?utm_source=passport_share&utm_medium=social&utm_campaign=viral&ref=${passportId}`,
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center justify-center gap-2 w-full px-6 py-4 rounded-xl text-sm font-semibold transition-all duration-200 hover:shadow-xl active:scale-[0.98] cursor-pointer"
      style={{
        background: 'linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)',
        color: '#0A0A0F',
        boxShadow: '0 4px 20px rgba(255,215,0,0.25)',
        border: 'none',
      }}
      aria-label="Calculate your own Cosmic Passport"
    >
      <span aria-hidden="true" style={{ fontFamily: 'serif', fontSize: '1rem' }}>
        ☉
      </span>
      Calculate Your Cosmic Passport
    </button>
  );
}
