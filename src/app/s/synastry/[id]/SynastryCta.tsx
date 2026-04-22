'use client';

import { useRouter } from 'next/navigation';
import { trackEvent, AnalyticsEvent } from '@/shared/lib/analytics';

interface SynastryCtaProps {
  synastryId: string;
}

/**
 * CTA button on the synastry share page.
 * Fires passport_converted (reusing the same conversion event) so the
 * viral coefficient is captured for synastry shares too.
 * Passes ?ref= so PostHog can attribute the session to the synastry result.
 */
export function SynastryCta({ synastryId }: SynastryCtaProps) {
  const router = useRouter();

  function handleClick() {
    trackEvent(AnalyticsEvent.PASSPORT_CONVERTED, {
      synastry_id: synastryId,
      source: 'synastry_share_page',
    });
    router.push(
      `/synastry?utm_source=synastry_share&utm_medium=social&utm_campaign=viral&ref=${synastryId}`,
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
      aria-label="Check your compatibility"
    >
      Check Your Compatibility
    </button>
  );
}
