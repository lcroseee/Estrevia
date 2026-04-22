import { useTranslations } from 'next-intl';

export function Disclaimer() {
  const t = useTranslations('disclaimer');
  return (
    <p
      className="text-[11px] text-white/25 mt-10 pt-6 border-t border-white/6 leading-relaxed"
      role="note"
      aria-label={t('ariaLabel')}
    >
      {t('text')}
    </p>
  );
}
