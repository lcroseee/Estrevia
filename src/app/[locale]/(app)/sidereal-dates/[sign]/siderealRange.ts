/**
 * Localized "Sun in sidereal <Sign>: <start> – <end>" phrase for the meta
 * description. Sign name stays untranslated (project rule); month names localized.
 */
export function formatSiderealDateRange(
  start: Date,
  end: Date,
  signDisplay: string,
  locale: 'en' | 'es',
): string {
  const intlLocale = locale === 'es' ? 'es-419' : 'en-US';
  const fmt = new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const range = `${fmt.format(start)} – ${fmt.format(end)}`;
  return locale === 'es'
    ? `Sol sideral en ${signDisplay}: ${range}.`
    : `Sun in sidereal ${signDisplay}: ${range}.`;
}
