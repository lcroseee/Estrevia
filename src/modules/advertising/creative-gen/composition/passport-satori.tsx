/**
 * passport-satori.tsx
 *
 * Renders a Cosmic Passport card as a PNG buffer using Satori + Sharp.
 *
 * Fonts: AstroSymbols-subset.ttf (public/fonts/) for sign glyphs,
 *        Geist-Regular.ttf (@vercel/og/dist/) for all other text.
 *        Geist-Bold.ttf and CrimsonPro are NOT present in public/fonts/ —
 *        Geist-Regular (weight 400, rendered bold by fontWeight:700 in Satori)
 *        is used as the sole Latin font.
 *
 * Usage (server-side only — Satori requires Node.js runtime):
 *   const png = await renderPassportCard({ sun_sign: 'Pisces', ... });
 */

import satori from 'satori';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join } from 'path';
import React, { createElement } from 'react';

// ---------------------------------------------------------------------------
// Brand constants (from CLAUDE.md design rules)
// ---------------------------------------------------------------------------
const BG_COLOR = '#0A0A0F';
const SUN_COLOR = '#F5B945';
const MOON_COLOR = '#D8D8E0';
const RISING_COLOR = '#9B7EBC';
const RARITY_COLOR = '#A78BFA';
const RARITY_BG = 'rgba(139,92,246,0.12)';
const RARITY_BORDER = 'rgba(139,92,246,0.30)';
const DIM_TEXT = 'rgba(255,255,255,0.40)';

// Sign → Unicode glyph (matches existing OG passport route)
const SIGN_GLYPH: Record<string, string> = {
  Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋',
  Leo: '♌', Virgo: '♍', Libra: '♎', Scorpio: '♏',
  Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓',
};

// ---------------------------------------------------------------------------
// Bilingual labels
// ---------------------------------------------------------------------------
const LABELS = {
  en: {
    title: 'COSMIC PASSPORT',
    subtitle: 'SIDEREAL ASTROLOGY',
    sun: 'SUN',
    moon: 'MOON',
    rising: 'RISING',
    rarity: 'Rarity',
    unknown: 'Unknown',
    branding: 'estrevia.app',
  },
  es: {
    title: 'PASAPORTE CÓSMICO',
    subtitle: 'ASTROLOGÍA SIDÉREA',
    sun: 'SOL',
    moon: 'LUNA',
    rising: 'ASC.',
    rarity: 'Rareza',
    unknown: 'Desconocido',
    branding: 'estrevia.app',
  },
} as const;

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface PassportCardProps {
  sun_sign: string;
  moon_sign: string;
  /** Rising sign, or null if birth time unknown */
  rising_sign: string | null;
  rarity_label: string;
  rarity_pct: number;
  locale: 'en' | 'es';
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Font cache — loaded once per process lifetime
// ---------------------------------------------------------------------------

let geistFontData: Buffer | null = null;
let astroFontData: Buffer | null = null;

function loadFonts(): { geist: Buffer; astro: Buffer } {
  if (!geistFontData) {
    // @vercel/og ships Geist-Regular.ttf in its dist/ — always available
    const geistPath = join(
      process.cwd(),
      'node_modules',
      '@vercel',
      'og',
      'dist',
      'Geist-Regular.ttf',
    );
    geistFontData = readFileSync(geistPath);
  }
  if (!astroFontData) {
    const astroPath = join(process.cwd(), 'public', 'fonts', 'AstroSymbols-subset.ttf');
    astroFontData = readFileSync(astroPath);
  }
  return { geist: geistFontData, astro: astroFontData };
}

// ---------------------------------------------------------------------------
// JSX layout builder (no JSX transform needed — uses createElement directly
// so this works in both Node.js test environments and Next.js server contexts)
// ---------------------------------------------------------------------------

// Helper to create React elements without JSX syntax (Satori requires plain objects).
// Using import type to keep this file usable in non-JSX-transform environments.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function el(type: string, props: Record<string, unknown>, ...children: any[]): any {
  return createElement(type, props as React.HTMLAttributes<HTMLElement>, ...children);
}

function buildLayout(props: Required<PassportCardProps> & { rising_sign: string | null }) {
  const { sun_sign, moon_sign, rising_sign, rarity_label, locale, width, height } = props;
  const L = LABELS[locale];

  const sunGlyph = SIGN_GLYPH[sun_sign] ?? '?';
  const moonGlyph = SIGN_GLYPH[moon_sign] ?? '?';
  const ascGlyph = rising_sign ? (SIGN_GLYPH[rising_sign] ?? '?') : null;

  const isStories = height > width;
  const borderInset = isStories ? '32px' : '24px';

  // Shared sub-components (inline styles only — Satori requirement)
  const starfieldBg = el('div', {
    style: {
      position: 'absolute',
      inset: 0,
      background:
        'radial-gradient(ellipse at 20% 30%, rgba(139,92,246,0.12) 0%, transparent 60%),' +
        'radial-gradient(ellipse at 80% 70%, rgba(59,130,246,0.10) 0%, transparent 60%)',
      display: 'flex',
    },
  });

  const borderFrame = el('div', {
    style: {
      position: 'absolute',
      inset: borderInset,
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '16px',
      display: 'flex',
    },
  });

  const titleSize = isStories ? '50px' : '36px';
  const subtitleSize = isStories ? '18px' : '13px';

  const heading = el(
    'div',
    { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', zIndex: 1 } },
    el('div', { style: { fontSize: subtitleSize, letterSpacing: '4px', color: DIM_TEXT, textTransform: 'uppercase', display: 'flex', fontFamily: 'Geist, sans-serif' } }, L.subtitle),
    el('div', { style: { fontSize: titleSize, fontWeight: 700, color: '#FFFFFF', letterSpacing: '8px', textTransform: 'uppercase', display: 'flex', fontFamily: 'Geist, sans-serif' } }, L.title),
    el('div', { style: { width: '180px', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)', marginTop: '4px', display: 'flex' } }),
  );

  const glyphSize = isStories ? '96px' : '72px';
  const labelSize = isStories ? '28px' : '22px';
  const nameSize = isStories ? '32px' : '24px';

  function signColumn(label: string, glyph: string, signName: string, color: string) {
    return el(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', fontFamily: 'AstroSymbols, Geist, sans-serif' } },
      el('div', { style: { fontSize: labelSize, color: DIM_TEXT, display: 'flex', fontFamily: 'Geist, sans-serif' } }, label),
      el('div', { style: { fontSize: glyphSize, color, display: 'flex', fontFamily: 'AstroSymbols, Geist, sans-serif' } }, glyph),
      el('div', { style: { fontSize: nameSize, color: '#FFFFFF', fontWeight: 600, display: 'flex', fontFamily: 'Geist, sans-serif' } }, signName),
    );
  }

  const dividerHeight = isStories ? '1px' : '100px';
  function hDivider() {
    return el('div', { style: { width: isStories ? '120px' : '100px', height: '1px', background: 'rgba(255,255,255,0.12)', display: 'flex' } });
  }
  function vDivider() {
    return el('div', { style: { width: '1px', height: dividerHeight, background: 'rgba(255,255,255,0.12)', display: 'flex' } });
  }

  const rarityBadgeFontSize = isStories ? '24px' : '18px';
  const rarityBadgePadding = isStories ? '14px 32px' : '10px 24px';

  const rarityBadge = el(
    'div',
    {
      style: {
        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px',
        background: RARITY_BG, border: `1px solid ${RARITY_BORDER}`,
        borderRadius: '32px', padding: rarityBadgePadding, fontFamily: 'Geist, sans-serif',
      },
    },
    el('span', { style: { fontSize: rarityBadgeFontSize, color: RARITY_COLOR, fontWeight: 700, display: 'flex' } }, rarity_label),
  );

  const branding = el(
    'div',
    { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '8px', zIndex: 1 } },
    el('div', { style: { fontSize: isStories ? '18px' : '14px', color: 'rgba(255,255,255,0.25)', letterSpacing: '2px', display: 'flex', fontFamily: 'Geist, sans-serif' } }, L.branding),
  );

  const ascLabel = `↑ ${L.rising}`;
  const ascColor = ascGlyph ? RISING_COLOR : 'rgba(255,255,255,0.2)';
  const ascGlyphDisplay = ascGlyph ?? '–';
  const ascSignName = rising_sign ?? L.unknown;

  const signsStack = el(
    'div',
    { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isStories ? '48px' : '32px', zIndex: 1 } },
    signColumn(`☉ ${L.sun}`, sunGlyph, sun_sign, SUN_COLOR),
    hDivider(),
    signColumn(`☽ ${L.moon}`, moonGlyph, moon_sign, MOON_COLOR),
    hDivider(),
    signColumn(ascLabel, ascGlyphDisplay, ascSignName, ascColor),
  );

  const signsRow = el(
    'div',
    { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '40px', zIndex: 1 } },
    signColumn(`☉ ${L.sun}`, sunGlyph, sun_sign, SUN_COLOR),
    vDivider(),
    signColumn(`☽ ${L.moon}`, moonGlyph, moon_sign, MOON_COLOR),
    vDivider(),
    signColumn(ascLabel, ascGlyphDisplay, ascSignName, ascColor),
  );

  return el(
    'div',
    {
      style: {
        width: `${width}px`,
        height: `${height}px`,
        background: BG_COLOR,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isStories ? '80px 64px' : '48px 64px',
        fontFamily: 'Geist, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      },
    },
    starfieldBg,
    borderFrame,
    heading,
    isStories ? signsStack : signsRow,
    el(
      'div',
      { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', zIndex: 1 } },
      rarityBadge,
      branding,
    ),
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function renderPassportCard(props: PassportCardProps): Promise<Buffer> {
  const { geist, astro } = loadFonts();

  const width = props.width ?? 1080;
  const height = props.height ?? 1920;

  const layout = buildLayout({
    sun_sign: props.sun_sign,
    moon_sign: props.moon_sign,
    rising_sign: props.rising_sign,
    rarity_label: props.rarity_label,
    rarity_pct: props.rarity_pct,
    locale: props.locale,
    width,
    height,
  });

  const svg = await satori(layout, {
    width,
    height,
    fonts: [
      { name: 'Geist', data: geist, weight: 400, style: 'normal' },
      { name: 'AstroSymbols', data: astro, weight: 400, style: 'normal' },
    ],
  });

  return sharp(Buffer.from(svg)).png().toBuffer();
}
