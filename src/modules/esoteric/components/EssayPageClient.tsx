'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSubscription } from '@/shared/hooks/useSubscription';
import { PaywallModal } from '@/shared/components/PaywallModal';

interface EssayPageClientProps {
  children: React.ReactNode;
}

export function EssayPageClient({ children }: EssayPageClientProps) {
  const t = useTranslations('essays');
  const { isPro, isLoading } = useSubscription();
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Pro users see full content
  if (isPro) {
    return <>{children}</>;
  }

  // While loading: show truncated view (safe default — don't expose full content)
  // This prevents a flash of full content on slow connections

  // Free user: show truncated content with gradient fade and paywall trigger
  return (
    <>
      <div className="relative">
        {/* Content with overflow hidden to truncate */}
        <div className="max-h-[60vh] overflow-hidden">
          {children}
        </div>

        {/* Gradient fade overlay */}
        <div
          className="absolute bottom-0 inset-x-0 h-48 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, #0A0A0F 0%, #0A0A0F 20%, transparent 100%)',
          }}
          aria-hidden="true"
        />

        {/* Read more button positioned over the fade */}
        <div className="absolute bottom-0 inset-x-0 flex justify-center pb-4">
          <button
            onClick={() => setPaywallOpen(true)}
            className="px-8 py-3 rounded-xl text-sm font-semibold tracking-wide transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #FFD700, #FFE033)',
              color: '#0A0A0F',
            }}
          >
            {t('readMore')}
          </button>
        </div>
      </div>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        returnUrl={typeof window !== 'undefined' ? window.location.pathname : undefined}
      />
    </>
  );
}
