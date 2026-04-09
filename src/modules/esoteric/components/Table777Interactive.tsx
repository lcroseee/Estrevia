'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useSubscription } from '@/shared/hooks/useSubscription';
import Link from 'next/link';

interface Correspondence {
  path: number;
  name?: string;
  meaning: string;
  hebrewLetter?: string;
  hebrewSymbol?: string;
  tarotTrump?: string;
  tarotNumber?: number;
  element?: string | null;
  zodiacOrPlanet?: string | null;
  planet?: string | null;
  color: {
    king: string;
    queen: string;
    prince: string;
    princess: string;
  };
  stone: string;
  perfume: string;
  plant: string;
  animal: string;
  astrologicalAttribution: string;
}

interface Table777InteractiveProps {
  sephiroth: Correspondence[];
  paths: Correspondence[];
  onPathSelect?: (pathNumber: number) => void;
}

const FREE_ROWS = 10;

export function Table777Interactive({
  sephiroth,
  paths,
  onPathSelect,
}: Table777InteractiveProps) {
  const t = useTranslations('treeOfLife');
  const { isPro, isLoading: subLoading } = useSubscription();
  const [search, setSearch] = useState('');

  const allRows = useMemo(
    () => [...sephiroth, ...paths].sort((a, b) => a.path - b.path),
    [sephiroth, paths],
  );

  const filteredRows = useMemo(() => {
    if (!search.trim()) return allRows;
    const q = search.toLowerCase();
    return allRows.filter(
      (row) =>
        (row.name?.toLowerCase().includes(q)) ||
        row.meaning.toLowerCase().includes(q) ||
        (row.hebrewLetter?.toLowerCase().includes(q)) ||
        (row.tarotTrump?.toLowerCase().includes(q)) ||
        row.stone.toLowerCase().includes(q) ||
        row.plant.toLowerCase().includes(q) ||
        row.animal.toLowerCase().includes(q) ||
        (row.zodiacOrPlanet?.toLowerCase().includes(q)) ||
        row.astrologicalAttribution.toLowerCase().includes(q) ||
        String(row.path) === q,
    );
  }, [allRows, search]);

  const visibleRows = isPro ? filteredRows : filteredRows.slice(0, FREE_ROWS);
  const isGated = !isPro && filteredRows.length > FREE_ROWS;

  if (subLoading) {
    return <div className="h-32 rounded-xl bg-white/4 animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchCorrespondences')}
          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-white/12 bg-white/5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-colors"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/8" style={{ background: 'rgba(255,255,255,0.025)' }}>
        <table className="w-full text-sm" aria-label="777 Correspondences Table">
          <thead>
            <tr className="border-b border-white/8">
              {['Key', 'Name', 'Letter', 'Sign/Planet', 'Tarot', 'Color (Queen)', 'Stone', 'Perfume', 'Plant', 'Animal'].map(
                (header) => (
                  <th
                    key={header}
                    className="px-3 py-2 text-left text-[10px] text-white/40 uppercase tracking-wider font-medium whitespace-nowrap"
                  >
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {visibleRows.map((row) => (
              <tr
                key={row.path}
                className="hover:bg-white/3 transition-colors cursor-pointer"
                onClick={() => onPathSelect?.(row.path)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onPathSelect?.(row.path);
                }}
              >
                <td className="px-3 py-2 font-mono text-white/50 text-xs">{row.path}</td>
                <td className="px-3 py-2 text-white/80 whitespace-nowrap">{row.name ?? row.hebrewLetter ?? '-'}</td>
                <td className="px-3 py-2 text-white/60">{row.hebrewSymbol ?? '-'}</td>
                <td className="px-3 py-2 text-white/60 whitespace-nowrap">{row.zodiacOrPlanet ?? row.element ?? '-'}</td>
                <td className="px-3 py-2 text-white/60 whitespace-nowrap">{row.tarotTrump ?? '-'}</td>
                <td className="px-3 py-2 text-white/60 whitespace-nowrap">{row.color.queen}</td>
                <td className="px-3 py-2 text-white/60 whitespace-nowrap">{row.stone}</td>
                <td className="px-3 py-2 text-white/60 whitespace-nowrap">{row.perfume}</td>
                <td className="px-3 py-2 text-white/60 whitespace-nowrap">{row.plant}</td>
                <td className="px-3 py-2 text-white/60 whitespace-nowrap">{row.animal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pro gate */}
      {isGated && (
        <div className="text-center space-y-2 py-4">
          <p className="text-sm text-white/40">
            {filteredRows.length - FREE_ROWS} more rows available with Pro
          </p>
          <Link
            href="/settings"
            className="inline-block px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-br from-[#FFD700]/90 to-[#FF8C00]/80 text-black hover:shadow-lg hover:shadow-[#FFD700]/20 transition-all"
          >
            {t('upgradeToPro')}
          </Link>
        </div>
      )}

      {visibleRows.length === 0 && (
        <p className="text-sm text-white/30 text-center py-4">
          No matches found
        </p>
      )}

      <p className="text-[11px] text-white/20">
        Source: Crowley, <em>777 and Other Qabalistic Writings</em> (pre-1929, public domain).
      </p>
    </div>
  );
}
