'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useSubscription } from '@/shared/hooks/useSubscription';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SephirahData {
  number: number;
  name: { hebrew: string; en: string };
  meaning: { en: string };
  planet: string;
  colorQueenScale: string;
  divineName: string;
  archangel: string;
  description: { en: string };
  position: { x: number; y: number };
}

export interface PathData {
  number: number;
  connects: [number, number];
  hebrewLetter: string;
  hebrewSymbol: string;
  tarotCard: string;
  astrology: string;
  color: string;
  description: { en: string };
}

interface ChartPlanetData {
  planet: string;
  sign: string;
}

interface TreeOfLifeClientProps {
  sephiroth: SephirahData[];
  paths: PathData[];
  chartData?: ChartPlanetData[];
}

// ── Planet-to-Sephira mapping (G4) ──────────────────────────────────────────

const PLANET_SEPHIRA_MAP: Record<string, number> = {
  Sun: 6,      // Tiphareth
  Moon: 9,     // Yesod
  Mercury: 8,  // Hod
  Venus: 7,    // Netzach
  Mars: 5,     // Geburah
  Jupiter: 4,  // Chesed
  Saturn: 3,   // Binah
};

const PLANET_GLYPHS: Record<string, string> = {
  Sun: '\u2609',
  Moon: '\u263D',
  Mercury: '\u263F',
  Venus: '\u2640',
  Mars: '\u2642',
  Jupiter: '\u2643',
  Saturn: '\u2644',
};

// ── Component ────────────────────────────────────────────────────────────────

export function TreeOfLifeClient({
  sephiroth,
  paths,
  chartData,
}: TreeOfLifeClientProps) {
  const t = useTranslations('treeOfLife');
  const prefersReduced = useReducedMotion();
  const { isPro } = useSubscription();

  const [selectedSephira, setSelectedSephira] = useState<SephirahData | null>(null);
  const [selectedPath, setSelectedPath] = useState<PathData | null>(null);
  const [showPersonal, setShowPersonal] = useState(false);

  // Build sephira position lookup
  const sephiraPositions = useMemo(() => {
    const map = new Map<number, { x: number; y: number }>();
    for (const s of sephiroth) {
      map.set(s.number, s.position);
    }
    return map;
  }, [sephiroth]);

  // Planet placements on the tree
  const planetPlacements = useMemo(() => {
    if (!chartData || !showPersonal) return [];
    return chartData
      .filter((p) => PLANET_SEPHIRA_MAP[p.planet] !== undefined)
      .map((p) => ({
        planet: p.planet,
        glyph: PLANET_GLYPHS[p.planet] ?? '?',
        sephira: PLANET_SEPHIRA_MAP[p.planet],
        sign: p.sign,
      }));
  }, [chartData, showPersonal]);

  const handleSephiraClick = useCallback((s: SephirahData) => {
    setSelectedPath(null);
    setSelectedSephira((prev) => (prev?.number === s.number ? null : s));
  }, []);

  const handlePathClick = useCallback((p: PathData) => {
    setSelectedSephira(null);
    setSelectedPath((prev) => (prev?.number === p.number ? null : p));
  }, []);

  const closePanel = useCallback(() => {
    setSelectedSephira(null);
    setSelectedPath(null);
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Your Tree toggle (G4) */}
      {chartData && isPro && (
        <div className="flex justify-center lg:hidden">
          <button
            type="button"
            onClick={() => setShowPersonal((p) => !p)}
            className={[
              'px-4 py-1.5 rounded-lg text-xs font-medium transition-all',
              showPersonal
                ? 'bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/30'
                : 'bg-white/5 text-white/40 border border-white/10 hover:border-white/20',
            ].join(' ')}
          >
            {showPersonal ? t('hideYourTree') : t('showYourTree')}
          </button>
        </div>
      )}

      {/* SVG Tree */}
      <div className="flex-1 flex justify-center">
        <svg
          viewBox="0 0 100 100"
          className="w-full max-w-md"
          style={{ aspectRatio: '1 / 1' }}
          role="img"
          aria-label="Tree of Life — Kabbalistic diagram with 10 Sephiroth and 22 paths"
        >
          <title>Tree of Life</title>

          {/* Background */}
          <rect x="0" y="0" width="100" height="100" fill="transparent" />

          {/* Paths (lines between sephiroth) */}
          <g aria-label="Paths">
            {paths.map((path) => {
              const from = sephiraPositions.get(path.connects[0]);
              const to = sephiraPositions.get(path.connects[1]);
              if (!from || !to) return null;

              const isSelected = selectedPath?.number === path.number;
              const isHighlighted =
                selectedSephira &&
                path.connects.includes(selectedSephira.number);

              return (
                <line
                  key={path.number}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={isSelected || isHighlighted ? path.color : 'rgba(255,255,255,0.12)'}
                  strokeWidth={isSelected ? 0.8 : 0.4}
                  className="cursor-pointer transition-all duration-300"
                  onClick={() => handlePathClick(path)}
                  role="button"
                  aria-label={`Path ${path.number}: ${path.hebrewLetter}`}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handlePathClick(path);
                  }}
                />
              );
            })}
          </g>

          {/* Path hebrew letters at midpoint */}
          <g aria-hidden="true">
            {paths.map((path) => {
              const from = sephiraPositions.get(path.connects[0]);
              const to = sephiraPositions.get(path.connects[1]);
              if (!from || !to) return null;

              const mx = (from.x + to.x) / 2;
              const my = (from.y + to.y) / 2;
              const isSelected = selectedPath?.number === path.number;

              return (
                <text
                  key={`ltr-${path.number}`}
                  x={mx}
                  y={my}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="2"
                  fill={isSelected ? path.color : 'rgba(255,255,255,0.2)'}
                  className="pointer-events-none transition-all duration-300"
                >
                  {path.hebrewSymbol}
                </text>
              );
            })}
          </g>

          {/* Sephiroth (circles) */}
          <g aria-label="Sephiroth">
            {sephiroth.map((s) => {
              const isSelected = selectedSephira?.number === s.number;
              const radius = isSelected ? 4.5 : 3.5;

              return (
                <g
                  key={s.number}
                  className="cursor-pointer"
                  onClick={() => handleSephiraClick(s)}
                  role="button"
                  aria-label={`${s.name.en} — ${s.meaning.en}`}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleSephiraClick(s);
                  }}
                >
                  {/* Glow for selected */}
                  {isSelected && (
                    <circle
                      cx={s.position.x}
                      cy={s.position.y}
                      r={radius + 2}
                      fill="none"
                      stroke={s.colorQueenScale}
                      strokeWidth="0.5"
                      opacity="0.4"
                    >
                      <animate
                        attributeName="r"
                        values={`${radius + 1};${radius + 3};${radius + 1}`}
                        dur="2s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values="0.4;0.15;0.4"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}

                  {/* Main circle */}
                  <circle
                    cx={s.position.x}
                    cy={s.position.y}
                    r={radius}
                    fill={`${s.colorQueenScale}20`}
                    stroke={s.colorQueenScale}
                    strokeWidth={isSelected ? 0.6 : 0.3}
                    className="transition-all duration-300"
                  />

                  {/* Name */}
                  <text
                    x={s.position.x}
                    y={s.position.y - 0.3}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="2.2"
                    fill="rgba(255,255,255,0.8)"
                    className="pointer-events-none"
                    style={{ fontFamily: 'sans-serif' }}
                  >
                    {s.name.en}
                  </text>

                  {/* Number below */}
                  <text
                    x={s.position.x}
                    y={s.position.y + 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="1.6"
                    fill="rgba(255,255,255,0.3)"
                    className="pointer-events-none"
                    style={{ fontFamily: 'monospace' }}
                  >
                    {s.number}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Planet glyphs overlay (G4) */}
          {planetPlacements.length > 0 && (
            <g aria-label="Your natal planets on the Tree">
              {planetPlacements.map((pp) => {
                const sPos = sephiraPositions.get(pp.sephira);
                if (!sPos) return null;

                return (
                  <g key={pp.planet}>
                    <circle
                      cx={sPos.x + 5}
                      cy={sPos.y - 2}
                      r="1.8"
                      fill="#FFD700"
                      fillOpacity="0.15"
                      stroke="#FFD700"
                      strokeWidth="0.2"
                    />
                    <text
                      x={sPos.x + 5}
                      y={sPos.y - 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="2"
                      fill="#FFD700"
                      className="pointer-events-none"
                    >
                      {pp.glyph}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>

      {/* Info panel */}
      <AnimatePresence mode="wait">
        {(selectedSephira || selectedPath) && (
          <motion.div
            key={selectedSephira ? `s-${selectedSephira.number}` : `p-${selectedPath?.number}`}
            initial={prefersReduced ? false : { opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={prefersReduced ? {} : { opacity: 0, x: 20 }}
            transition={prefersReduced ? { duration: 0 } : { duration: 0.25 }}
            className="w-full lg:w-80 rounded-xl border border-white/8 p-5 space-y-4 max-h-[70vh] overflow-y-auto lg:sticky lg:top-20"
            style={{ background: 'rgba(255,255,255,0.025)' }}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={closePanel}
              className="absolute top-3 right-3 text-white/30 hover:text-white/60 transition-colors lg:block hidden"
              aria-label="Close info panel"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {selectedSephira && (
              <>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: selectedSephira.colorQueenScale }}
                    />
                    <h3 className="text-lg font-semibold text-white/90">
                      {selectedSephira.number}. {selectedSephira.name.en}
                    </h3>
                  </div>
                  <p className="text-sm text-white/50">{selectedSephira.meaning.en}</p>
                  <p className="text-xs text-white/30">{selectedSephira.name.hebrew}</p>
                </div>

                <p
                  className="text-sm text-white/65 leading-relaxed"
                  style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}
                >
                  {selectedSephira.description.en}
                </p>

                <dl className="divide-y divide-white/6 text-sm">
                  {[
                    { label: 'Planet', value: selectedSephira.planet },
                    { label: 'Divine Name', value: selectedSephira.divineName },
                    { label: 'Archangel', value: selectedSephira.archangel },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between py-2">
                      <dt className="text-white/40">{label}</dt>
                      <dd className="text-white/75">{value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}

            {selectedPath && (
              <>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: selectedPath.color }}
                    />
                    <h3 className="text-lg font-semibold text-white/90">
                      Path {selectedPath.number} — {selectedPath.hebrewLetter}
                    </h3>
                  </div>
                  <p className="text-2xl" style={{ color: selectedPath.color }}>
                    {selectedPath.hebrewSymbol}
                  </p>
                </div>

                <p
                  className="text-sm text-white/65 leading-relaxed"
                  style={{ fontFamily: "var(--font-crimson-pro, 'Crimson Pro', serif)" }}
                >
                  {selectedPath.description.en}
                </p>

                <dl className="divide-y divide-white/6 text-sm">
                  {[
                    { label: 'Connects', value: `${selectedPath.connects[0]} \u2194 ${selectedPath.connects[1]}` },
                    { label: 'Tarot Card', value: selectedPath.tarotCard.replace(/-/g, ' ') },
                    { label: 'Astrology', value: selectedPath.astrology },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between py-2">
                      <dt className="text-white/40">{label}</dt>
                      <dd className="text-white/75 capitalize">{value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}

            {/* Mobile close */}
            <button
              type="button"
              onClick={closePanel}
              className="w-full py-2 rounded-lg text-sm text-white/40 border border-white/8 hover:border-white/15 transition-colors lg:hidden"
            >
              Close
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
