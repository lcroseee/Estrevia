'use client';

import { useTranslations } from 'next-intl';

interface YearRow {
  year: number;
  start: string; // ISO string
  end: string;   // ISO string
}

interface YearTableAccordionProps {
  years: YearRow[];
  /** Intl.DateTimeFormat locale string passed from server (e.g. "en-US" or "es-419"). */
  localeStr: string;
  title: string;
}

/**
 * YearTableAccordion — collapsed by default.
 * Shows Sun's entry and exit dates for ±3 years around the current year.
 * Each date is formatted with the visitor's locale.
 */
export function YearTableAccordion({ years, localeStr, title }: YearTableAccordionProps) {
  const t = useTranslations('siderealDates.common');
  const fmt = new Intl.DateTimeFormat(localeStr, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <details className="my-6 rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <summary className="cursor-pointer font-semibold text-white/80 hover:text-white transition-colors">
        {title}
      </summary>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/50">
              <th className="py-2 pr-4 text-left font-medium">{t('tableYear')}</th>
              <th className="py-2 pr-4 text-left font-medium">{t('tableStart')}</th>
              <th className="py-2 text-left font-medium">{t('tableEnd')}</th>
            </tr>
          </thead>
          <tbody>
            {years.map((row) => (
              <tr key={row.year} className="border-b border-white/5 text-white/70">
                <td className="py-2 pr-4 font-mono tabular-nums">{row.year}</td>
                <td className="py-2 pr-4">{fmt.format(new Date(row.start))}</td>
                <td className="py-2">{fmt.format(new Date(row.end))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
