'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ChartResult, PlanetPosition } from '@/shared/types';
import { Planet } from '@/shared/types';
import type { FrameState } from './ZodiacFrameToggle';

// Zodiac sign Unicode glyphs
const SIGN_GLYPHS: Record<string, string> = {
  Aries: '♈',
  Taurus: '♉',
  Gemini: '♊',
  Cancer: '♋',
  Leo: '♌',
  Virgo: '♍',
  Libra: '♎',
  Scorpio: '♏',
  Sagittarius: '♐',
  Capricorn: '♑',
  Aquarius: '♒',
  Pisces: '♓',
};

type SortColumn = 'planet' | 'sign' | 'degree' | 'house';
type SortDir = 'asc' | 'desc';

// Canonical planet order for default sort.
// Ascendant and Midheaven are chart angles displayed at the bottom of the table.
const PLANET_ORDER: Record<Planet, number> = {
  [Planet.Sun]: 0,
  [Planet.Moon]: 1,
  [Planet.Mercury]: 2,
  [Planet.Venus]: 3,
  [Planet.Mars]: 4,
  [Planet.Jupiter]: 5,
  [Planet.Saturn]: 6,
  [Planet.Uranus]: 7,
  [Planet.Neptune]: 8,
  [Planet.Pluto]: 9,
  [Planet.NorthNode]: 10,
  [Planet.Chiron]: 11,
  [Planet.Ascendant]: 12,
  [Planet.Midheaven]: 13,
};

function formatDegree(pos: PlanetPosition): string {
  const wholeDeg = Math.floor(pos.absoluteDegree % 30);
  return `${wholeDeg}°${pos.minutes.toString().padStart(2, '0')}'`;
}

interface PositionTableProps {
  /** Already projected into the active frame by ChartDisplay. */
  chart: ChartResult;
  frame?: FrameState;
  /**
   * Only needed in `both`. Supplied by ChartDisplay so the projection is
   * computed once rather than on every render of this table.
   */
  tropicalChart?: ChartResult | null;
}

export function PositionTable({
  chart,
  frame = 'sidereal',
  tropicalChart = null,
}: PositionTableProps) {
  const t = useTranslations('chart.zodiacFrame');
  const showBoth = frame === 'both' && tropicalChart !== null;

  // Keyed by planet so the second column survives sorting.
  const tropicalSignByPlanet = useMemo(() => {
    const map = new Map<Planet, string>();
    if (!tropicalChart) return map;
    for (const p of tropicalChart.planets) map.set(p.planet, p.sign);
    if (tropicalChart.ascendant) map.set(Planet.Ascendant, tropicalChart.ascendant.sign);
    if (tropicalChart.midheaven) map.set(Planet.Midheaven, tropicalChart.midheaven.sign);
    return map;
  }, [tropicalChart]);

  const [sortCol, setSortCol] = useState<SortColumn>('planet');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = useCallback(
    (col: SortColumn) => {
      if (sortCol === col) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortCol(col);
        setSortDir('asc');
      }
    },
    [sortCol]
  );

  // Combine planets + ascendant + midheaven
  const allPositions = useMemo(() => {
    const rows: PlanetPosition[] = [...chart.planets];
    if (chart.ascendant) rows.push(chart.ascendant);
    if (chart.midheaven) rows.push(chart.midheaven);
    return rows;
  }, [chart.planets, chart.ascendant, chart.midheaven]);

  const sorted = useMemo(() => {
    const copy = [...allPositions];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'planet') {
        const ao = PLANET_ORDER[a.planet] ?? 99;
        const bo = PLANET_ORDER[b.planet] ?? 99;
        cmp = ao - bo;
      } else if (sortCol === 'sign') {
        cmp = a.sign.localeCompare(b.sign);
      } else if (sortCol === 'degree') {
        cmp = a.absoluteDegree - b.absoluteDegree;
      } else if (sortCol === 'house') {
        cmp = (a.house ?? 99) - (b.house ?? 99);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [allPositions, sortCol, sortDir]);

  const SortIndicator = ({ col }: { col: SortColumn }) => {
    if (sortCol !== col) {
      return <span className="ml-1 text-white/20" aria-hidden="true">⇅</span>;
    }
    return (
      <span className="ml-1 text-[#FFD700]" aria-hidden="true">
        {sortDir === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  const thClass =
    'px-3 py-2 text-left text-xs font-medium text-white/50 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-white/80 transition-colors';

  return (
    <div className="w-full">
      {/*
        The tropical toggle that used to live here was deleted in SP-0: it
        switched only the degree number while the sign and minutes stayed
        sidereal, so "Tropical" showed a tropical degree beside a sidereal
        sign — usually a different sign entirely. SP-A replaces it with a
        correct three-state control.
      */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-white/60 uppercase tracking-widest">
          {t('positionsHeading')}
        </h2>
      </div>

      {/* Table wrapper with scroll */}
      <div className="overflow-x-auto rounded-lg border border-white/8">
        <table
          className="w-full text-sm"
          aria-label="Planetary positions table"
          aria-describedby="position-table-desc"
        >
          <caption id="position-table-desc" className="sr-only">
            {t('tableCaption')}
          </caption>
          <thead>
            <tr className="border-b border-white/8 bg-white/3">
              <th
                scope="col"
                className={thClass}
                onClick={() => handleSort('planet')}
                aria-sort={
                  sortCol === 'planet'
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                {t('colPlanet')} <SortIndicator col="planet" />
              </th>
              <th
                scope="col"
                className={thClass}
                onClick={() => handleSort('sign')}
                aria-sort={
                  sortCol === 'sign'
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                {showBoth ? t('tableSidereal') : t('colSign')} <SortIndicator col="sign" />
              </th>
              {showBoth && (
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-medium text-white/50 uppercase tracking-wider whitespace-nowrap"
                >
                  {t('tableTropical')}
                </th>
              )}
              <th
                scope="col"
                className={thClass}
                onClick={() => handleSort('degree')}
                aria-sort={
                  sortCol === 'degree'
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                {t('colDegree')} <SortIndicator col="degree" />
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-white/50 uppercase tracking-wider whitespace-nowrap">
                R
              </th>
              <th
                scope="col"
                className={thClass}
                onClick={() => handleSort('house')}
                aria-sort={
                  sortCol === 'house'
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                {t('colHouse')} <SortIndicator col="house" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((pos, idx) => (
              <tr
                key={pos.planet}
                className={`border-b border-white/5 transition-colors hover:bg-white/4 ${
                  idx % 2 === 0 ? 'bg-transparent' : 'bg-white/2'
                }`}
              >
                <td className="px-3 py-2 font-medium text-white/90 whitespace-nowrap">
                  {pos.planet}
                </td>
                <td className="px-3 py-2 text-white/70 whitespace-nowrap">
                  <span aria-hidden="true" className="mr-1">
                    {SIGN_GLYPHS[pos.sign]}
                  </span>
                  {pos.sign}
                </td>
                {showBoth && (
                  <td className="px-3 py-2 text-white/70 whitespace-nowrap">
                    {tropicalSignByPlanet.get(pos.planet) ?? '—'}
                  </td>
                )}
                <td className="px-3 py-2 text-white/80 whitespace-nowrap font-mono tabular-nums" style={{ fontFamily: 'var(--font-geist-mono, monospace)' }}>
                  {formatDegree(pos)}
                </td>
                <td className="px-3 py-2 text-center">
                  {pos.isRetrograde ? (
                    <span
                      className="text-amber-400 text-xs font-mono"
                      title="Retrograde"
                      aria-label="Retrograde"
                    >
                      ℞
                    </span>
                  ) : (
                    <span className="sr-only">Direct</span>
                  )}
                </td>
                <td className="px-3 py-2 text-white/50 tabular-nums font-mono" style={{ fontFamily: 'var(--font-geist-mono, monospace)' }}>
                  {pos.house !== null ? pos.house : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-white/30">
        {frame === 'both'
          ? t('footerBoth', { ayanamsa: chart.ayanamsa.toFixed(4) })
          : frame === 'tropical'
            ? t('footerTropical')
            : t('footerSidereal', { ayanamsa: chart.ayanamsa.toFixed(4) })}
        {/* Suppress the house-system mention on no-houses charts — houseSystem
            persists as 'Placidus' in ChartResult even without computed houses. */}
        {/* Was ` · ${chart.houseSystem} houses` — the word "houses" stayed
            English on /es. The house-system NAME (Placidus) is a proper noun
            and is deliberately not translated. */}
        {chart.houses ? ` · ${t('houseSuffix', { system: chart.houseSystem })}` : ''}
      </p>
    </div>
  );
}
