'use client';

import { useTranslations } from 'next-intl';
import { AvatarGenerator } from '@/modules/astro-engine/components/AvatarGenerator';
import type { PassportData } from '@/modules/astro-engine/passport';

interface AvatarSectionProps {
  passport: PassportData;
}

export function AvatarSection({ passport }: AvatarSectionProps) {
  const t = useTranslations('avatar');
  const { sunSign, moonSign, ascendantSign, element } = passport;

  return (
    <section
      aria-labelledby="avatar-section-heading"
      className="space-y-4"
    >
      <h2
        id="avatar-section-heading"
        className="text-lg font-semibold text-white/90"
      >
        {t('title')}
      </h2>
      <AvatarGenerator
        sunSign={sunSign}
        moonSign={moonSign}
        ascendantSign={ascendantSign ?? undefined}
        element={element}
      />
    </section>
  );
}
