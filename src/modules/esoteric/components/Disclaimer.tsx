/**
 * Disclaimer component — required on every essay page per content legal rules.
 * Astrology content must not be presented as medical/financial advice.
 */

import { getTranslations } from 'next-intl/server';

export async function Disclaimer() {
  const t = await getTranslations('essayDetail.disclaimer');
  return (
    <aside
      className="mt-12 border border-white/10 rounded-lg px-5 py-4 bg-white/3"
      role="note"
      aria-label={t('label')}
    >
      <p className="text-xs text-white/40 leading-relaxed font-[var(--font-geist-sans)]">
        {t('body')}
      </p>
    </aside>
  );
}
