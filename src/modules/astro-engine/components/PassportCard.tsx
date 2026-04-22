/**
 * PassportCard — the primary viral sharing artifact. Physical ID card
 * aspect ratio (3:2), no PII, only sign results + element + rarity.
 *
 * This is a SHARED component: it carries no `'use client'` directive
 * and uses no client-only APIs, so it renders as a Server Component
 * when imported from a server tree (`/s/[id]/page.tsx`) and as a
 * client component when imported from a client tree (`ChartDisplay`,
 * which is `'use client'`).
 *
 * The interactive QR code piece lives in `PassportCardQR` — a tiny
 * client leaf that lazy-loads the `qrcode` library only when the
 * card is actually rendered. Splitting it out of this component
 * eliminates the hydration cost of the static visual on the viral
 * share page (the single most important journey for growth).
 */

import { SITE_URL } from '@/shared/seo/constants';
import type { PassportResponse } from '@/shared/types/api';
import { getRarityTier } from '@/modules/astro-engine/rarity';
import { PassportCardQR } from './PassportCardQR';

// Planetary colors matching the design system
const PLANET_COLORS: Record<string, string> = {
  Sun: '#FFD700',
  Moon: '#C0C0C0',
  Mercury: '#9B59B6',
  Venus: '#2ECC71',
  Mars: '#E74C3C',
  Jupiter: '#3498DB',
  Saturn: '#8B7355',
  Uranus: '#00CED1',
  Neptune: '#1E90FF',
  Pluto: '#2C2C2C',
};

// Sign-to-planet color mapping for sign labels
const SIGN_PLANET_COLOR: Record<string, string> = {
  Aries: '#E74C3C',     // Mars
  Taurus: '#2ECC71',   // Venus
  Gemini: '#9B59B6',   // Mercury
  Cancer: '#C0C0C0',   // Moon
  Leo: '#FFD700',      // Sun
  Virgo: '#9B59B6',    // Mercury
  Libra: '#2ECC71',    // Venus
  Scorpio: '#E74C3C',  // Mars
  Sagittarius: '#3498DB', // Jupiter
  Capricorn: '#8B7355', // Saturn
  Aquarius: '#8B7355', // Saturn
  Pisces: '#3498DB',   // Jupiter
};

// Unicode planet glyphs
const PLANET_GLYPHS: Record<string, string> = {
  Sun: '☉',
  Moon: '☽',
  Mercury: '☿',
  Venus: '♀',
  Mars: '♂',
  Jupiter: '♃',
  Saturn: '♄',
  Uranus: '♅',
  Neptune: '♆',
  Pluto: '♇',
};

// Element configuration — no emoji as design elements per anti-AI-slop rules,
// but brief symbol markers are acceptable for data labels
const ELEMENT_CONFIG: Record<string, { label: string; color: string; symbol: string }> = {
  Fire: { label: 'Fire', color: '#E74C3C', symbol: '△' },
  Earth: { label: 'Earth', color: '#8B7355', symbol: '▽' },
  Air: { label: 'Air', color: '#9B59B6', symbol: '△' },
  Water: { label: 'Water', color: '#3498DB', symbol: '▽' },
};

// Sign symbol glyphs
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

interface SignRowProps {
  glyph: string;
  label: string;
  signName: string;
  color: string;
}

function SignRow({ glyph, label, signName, color }: SignRowProps) {
  const signGlyph = SIGN_GLYPHS[signName] ?? '';
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="text-base leading-none flex-shrink-0 w-5 text-center"
          style={{ color, fontFamily: 'serif' }}
          aria-hidden="true"
        >
          {glyph}
        </span>
        <span className="text-xs text-white/40 tracking-widest uppercase font-[var(--font-geist-sans)]">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="text-sm font-medium"
          style={{ color, fontFamily: 'var(--font-geist-sans, sans-serif)' }}
        >
          {signName}
        </span>
        <span
          className="text-sm leading-none opacity-60"
          style={{ color, fontFamily: 'serif' }}
          aria-hidden="true"
        >
          {signGlyph}
        </span>
      </div>
    </div>
  );
}

interface PassportCardProps {
  passport: PassportResponse;
  passportId?: string;
}

/**
 * Cosmic Passport card — the primary viral sharing artifact.
 * Aspect ratio ~3:2 (physical ID card feel).
 * No PII — only sign results, element, rarity.
 */
export function PassportCard({ passport, passportId }: PassportCardProps) {
  const {
    sunSign,
    moonSign,
    ascendantSign,
    element,
    rulingPlanet,
    rarityPercent,
  } = passport;

  const elementConfig = ELEMENT_CONFIG[element] ?? ELEMENT_CONFIG.Fire;
  const rulingPlanetColor = PLANET_COLORS[rulingPlanet] ?? '#ffffff';
  const rulingPlanetGlyph = PLANET_GLYPHS[rulingPlanet] ?? '';

  const sunColor = SIGN_PLANET_COLOR[sunSign] ?? '#FFD700';
  const moonColor = SIGN_PLANET_COLOR[moonSign] ?? '#C0C0C0';
  const ascColor = ascendantSign ? (SIGN_PLANET_COLOR[ascendantSign] ?? '#ffffff') : '#ffffff';

  return (
    <article
      className="relative w-full max-w-sm mx-auto rounded-2xl overflow-hidden select-none"
      style={{
        // Physical ID card aspect ratio: 85.6mm × 53.98mm ≈ 1.586
        aspectRatio: '1.586',
        background: 'linear-gradient(135deg, #13131A 0%, #0D0D14 50%, #0A0A0F 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 0 0 1px rgba(255,215,0,0.06), 0 24px 48px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
      aria-label={`Cosmic Passport: Sun in ${sunSign}, Moon in ${moonSign}, ${ascendantSign ? `Ascendant in ${ascendantSign}` : 'Ascendant unknown'}, Element ${element}, Ruling planet ${rulingPlanet}, Rarity ${getRarityTier(rarityPercent)}`}
    >
      {/* Subtle noise texture overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.03\'/%3E%3C/svg%3E")',
          backgroundSize: '200px 200px',
          opacity: 0.4,
        }}
        aria-hidden="true"
      />

      {/* Radial glow — centered on ruling planet color */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 60% 60% at 85% 15%, ${rulingPlanetColor}10 0%, transparent 70%)`,
        }}
        aria-hidden="true"
      />

      {/* Card content */}
      <div className="relative h-full flex flex-col justify-between p-5">

        {/* Top row: issuer + rarity badge */}
        <div className="flex items-start justify-between">
          <div>
            <p
              className="text-[10px] tracking-[0.2em] uppercase text-white/30 font-[var(--font-geist-sans)]"
            >
              Cosmic Passport
            </p>
            <p
              className="text-[10px] tracking-[0.15em] uppercase mt-0.5"
              style={{ color: rulingPlanetColor, opacity: 0.7, fontFamily: 'var(--font-geist-mono, monospace)' }}
            >
              Estrevia · Sidereal
            </p>
          </div>

          {/* Rarity badge — qualitative tier, not a frequency claim */}
          <div
            className="flex flex-col items-end gap-0.5"
            aria-label={`Rarity tier: ${getRarityTier(rarityPercent)}`}
          >
            <span
              className="text-[9px] tracking-[0.15em] uppercase text-white/30"
              style={{ fontFamily: 'var(--font-geist-mono, monospace)' }}
            >
              Rarity
            </span>
            <span
              className="text-xs font-bold leading-none tracking-wide"
              style={{
                color:
                  rarityPercent < 5
                    ? '#FFD700'
                    : rarityPercent < 6
                    ? '#C0C0C0'
                    : 'rgba(255,255,255,0.7)',
                fontFamily: 'var(--font-geist-mono, monospace)',
              }}
            >
              {getRarityTier(rarityPercent)}
            </span>
          </div>
        </div>

        {/* Middle: sign data */}
        <div className="space-y-2.5">
          <SignRow
            glyph="☉"
            label="Sun"
            signName={sunSign}
            color={sunColor}
          />
          <SignRow
            glyph="☽"
            label="Moon"
            signName={moonSign}
            color={moonColor}
          />
          <SignRow
            glyph="↑"
            label="ASC"
            signName={ascendantSign ?? 'Unknown'}
            color={ascendantSign ? ascColor : 'rgba(255,255,255,0.25)'}
          />
        </div>

        {/* Bottom row: element + ruling planet */}
        <div className="flex items-center justify-between">
          {/* Element */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{
              background: `${elementConfig.color}14`,
              border: `1px solid ${elementConfig.color}30`,
            }}
            aria-label={`Element: ${element}`}
          >
            <span
              className="text-xs leading-none"
              style={{ color: elementConfig.color, fontFamily: 'serif' }}
              aria-hidden="true"
            >
              {elementConfig.symbol}
            </span>
            <span
              className="text-xs font-medium tracking-wide"
              style={{ color: elementConfig.color, fontFamily: 'var(--font-geist-sans, sans-serif)' }}
            >
              {elementConfig.label}
            </span>
          </div>

          {/* Ruling planet */}
          <div
            className="flex items-center gap-1.5"
            aria-label={`Ruling planet: ${rulingPlanet}`}
          >
            <span
              className="text-xs text-white/30 tracking-widest uppercase"
              style={{ fontFamily: 'var(--font-geist-sans, sans-serif)' }}
            >
              Ruler
            </span>
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={{
                background: `${rulingPlanetColor}14`,
                border: `1px solid ${rulingPlanetColor}30`,
              }}
            >
              <span
                className="text-sm leading-none"
                style={{ color: rulingPlanetColor, fontFamily: 'serif' }}
                aria-hidden="true"
              >
                {rulingPlanetGlyph}
              </span>
              <span
                className="text-xs font-medium"
                style={{ color: rulingPlanetColor, fontFamily: 'var(--font-geist-sans, sans-serif)' }}
              >
                {rulingPlanet}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Subtle bottom edge glow */}
      <div
        className="absolute bottom-0 inset-x-0 h-px pointer-events-none"
        style={{
          background: `linear-gradient(90deg, transparent, ${rulingPlanetColor}40, transparent)`,
        }}
        aria-hidden="true"
      />

      {/* QR code — bottom-right corner. Rendered by a tiny client leaf
          that lazy-loads the `qrcode` library only when needed. */}
      {passportId && <PassportCardQR passportId={passportId} siteUrl={SITE_URL} />}
    </article>
  );
}
