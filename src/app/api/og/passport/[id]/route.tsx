import { ImageResponse } from '@vercel/og';
import { eq } from 'drizzle-orm';
import { promises as fs } from 'fs';
import path from 'path';
import { getDb } from '@/shared/lib/db';
import { cosmicPassports } from '@/shared/lib/schema';
import { getRateLimiter } from '@/shared/lib/rate-limit';
import { getRarityTier } from '@/shared/lib/rarity';
import { getTranslations } from 'next-intl/server';
import { captureException } from '@sentry/nextjs';

// nodejs runtime required: Neon HTTP driver uses Node.js net/tls APIs
// not available in the Edge runtime.
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Font buffer — loaded once per cold start and reused across invocations.
// AstroSymbols-subset.ttf is a pyftsubset of Noto Sans Symbols 2 (SIL OFL),
// containing only the astro glyph ranges we render plus basic ASCII.
// ---------------------------------------------------------------------------
let astroFontBuffer: ArrayBuffer | null = null;

async function getAstroFont(): Promise<ArrayBuffer> {
  if (astroFontBuffer) return astroFontBuffer;
  const fontPath = path.join(process.cwd(), 'public', 'fonts', 'AstroSymbols-subset.ttf');
  const buf = await fs.readFile(fontPath);
  astroFontBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return astroFontBuffer;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
const NO_STORE = 'no-store, no-cache, must-revalidate, max-age=0';
const IMMUTABLE_1Y =
  'public, max-age=31536000, s-maxage=31536000, immutable, stale-while-revalidate=86400';

// Unicode Variation Selector-15 — forces text (non-emoji) rendering for any
// Unicode character that has an emoji presentation variant. Without this,
// Satori falls back to the OS emoji font for ♈–♓ and planet glyphs, ignoring
// CSS color and producing purple/yellow colored emoji boxes.
const TV = '︎';

// Sign → Unicode glyph. Always append TV at render site.
const SIGN_GLYPH: Record<string, string> = {
  Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋',
  Leo: '♌', Virgo: '♍', Libra: '♎', Scorpio: '♏',
  Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓',
};

// Luminary label → display color per design.md planetary color tokens
const LUMINARY_COLOR = {
  sun: '#FFD700',   // Gold
  moon: '#C0C0E0',  // Silver
  asc: '#A78BFA',   // Violet
} as const;

// Element → color + symbol
const ELEMENT_STYLE: Record<string, { color: string; symbol: string }> = {
  Fire:  { color: '#FF6B35', symbol: '△' },
  Earth: { color: '#8B7355', symbol: '▽' },
  Air:   { color: '#87CEEB', symbol: '△' },
  Water: { color: '#4169E1', symbol: '▽' },
};

// Planet → display color per design.md
const PLANET_COLOR: Record<string, string> = {
  Sun: '#FFD700', Moon: '#C0C0E0', Mercury: '#B8D430',
  Venus: '#50C878', Mars: '#E04040', Jupiter: '#4169E1',
  Saturn: '#708090', Uranus: '#00CED1', Neptune: '#9370DB', Pluto: '#8B0000',
};

// Planet → symbol. Append TV at render site.
const PLANET_SYMBOL: Record<string, string> = {
  Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀',
  Mars: '♂', Jupiter: '♃', Saturn: '♄',
  Uranus: '♅', Neptune: '♆', Pluto: '♇',
};

// Format → dimensions
const FORMAT_DIMS: Record<string, { width: number; height: number }> = {
  og:      { width: 1200, height: 630 },
  square:  { width: 1080, height: 1080 },
  stories: { width: 1080, height: 1920 },
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // -------------------------------------------------------------------------
  // Rate limiting — 60 req/min per IP
  // -------------------------------------------------------------------------
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
  const { success, limit, remaining, reset } = await getRateLimiter('passport/view').limit(ip);
  if (!success) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(remaining),
        'Cache-Control': NO_STORE,
      },
    });
  }

  const { id } = await params;

  const url = new URL(request.url);
  const format = url.searchParams.get('format') ?? 'og';
  const dims = FORMAT_DIMS[format] ?? FORMAT_DIMS.og;

  // -------------------------------------------------------------------------
  // DB lookup
  // -------------------------------------------------------------------------
  let passport: typeof cosmicPassports.$inferSelect | undefined;
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(cosmicPassports)
      .where(eq(cosmicPassports.id, id))
      .limit(1);
    passport = rows[0];
  } catch (err) {
    try {
      const { captureException } = await import('@sentry/nextjs');
      captureException(err);
    } catch {
      console.error('[og/passport] db select error:', { id, error: String(err) });
    }
    return new Response('Internal Server Error', {
      status: 500,
      headers: { 'Cache-Control': NO_STORE },
    });
  }

  if (!passport) {
    console.warn('[og/passport] passport not found', { id });
    return new Response('Passport not found', {
      status: 404,
      headers: { 'Cache-Control': NO_STORE },
    });
  }

  // -------------------------------------------------------------------------
  // T4: Resolve locale from DB row + load translations
  // -------------------------------------------------------------------------
  const rawLocale = passport.locale;
  const safeLocale: 'en' | 'es' = rawLocale === 'es' ? 'es' : 'en';
  // Skip Sentry for undefined (pre-migration transient state — every row would page).
  // Fire only for unexpected non-undefined values (true row corruption).
  if (rawLocale !== undefined && rawLocale !== 'en' && rawLocale !== 'es') {
    captureException(new Error('og_locale_invalid'), {
      tags: { og_error: 'locale_invalid' },
      extra: { rawLocale, passportId: id },
    });
  }

  let t: Awaited<ReturnType<typeof getTranslations>>;
  let tTier: Awaited<ReturnType<typeof getTranslations>>;
  try {
    [t, tTier] = await Promise.all([
      getTranslations({ locale: safeLocale, namespace: 'share.passport.og' }),
      getTranslations({ locale: safeLocale, namespace: 'astro.rarityTier' }),
    ]);
  } catch (err) {
    // Fallback to EN: better an EN preview than a 500 in the viral path.
    captureException(new Error('og_i18n_load_failed'), {
      tags: { og_error: 'i18n_load_failed' },
      extra: { safeLocale, originalError: String(err) },
    });
    [t, tTier] = await Promise.all([
      getTranslations({ locale: 'en', namespace: 'share.passport.og' }),
      getTranslations({ locale: 'en', namespace: 'astro.rarityTier' }),
    ]);
  }

  // -------------------------------------------------------------------------
  // Font load
  // -------------------------------------------------------------------------
  let fontBuffer: ArrayBuffer;
  try {
    fontBuffer = await getAstroFont();
  } catch (err) {
    console.error('[og/passport] font load error:', String(err));
    return new Response('Internal Server Error', {
      status: 500,
      headers: { 'Cache-Control': NO_STORE },
    });
  }

  // -------------------------------------------------------------------------
  // Derived display values
  // -------------------------------------------------------------------------
  const sunGlyph  = (SIGN_GLYPH[passport.sunSign]  ?? '?') + TV;
  const moonGlyph = (SIGN_GLYPH[passport.moonSign] ?? '?') + TV;
  const ascGlyph  = passport.ascendantSign
    ? (SIGN_GLYPH[passport.ascendantSign] ?? '?') + TV
    : null;

  const elementStyle    = ELEMENT_STYLE[passport.element]      ?? { color: '#888', symbol: '◇' };
  const rulingColor     = PLANET_COLOR[passport.rulingPlanet]  ?? '#E2C97E';
  const rulingSymbol    = (PLANET_SYMBOL[passport.rulingPlanet] ?? '★') + TV;
  const rarityDisplay   = tTier(getRarityTier(passport.rarityPercent));
  const rarityPct       = passport.rarityPercent.toFixed(1);

  // Capture for closures
  const el         = passport.element;
  const rulingName = passport.rulingPlanet;

  // -------------------------------------------------------------------------
  // Shared style helpers
  // -------------------------------------------------------------------------

  // Deep navy background with multi-layer starfield radial gradients.
  // Opacity raised to 20-22% so the gradients read against the dark base.
  const starfield = (
    <div
      style={{
        position: 'absolute', inset: 0, display: 'flex',
        background:
          `radial-gradient(ellipse at 14% 55%, rgba(139,92,246,0.22) 0%, transparent 50%),` +
          `radial-gradient(ellipse at 86% 22%, rgba(59,130,246,0.19) 0%, transparent 50%),` +
          `radial-gradient(ellipse at 50% 95%, rgba(16,185,129,0.11) 0%, transparent 40%),` +
          `radial-gradient(ellipse at 50% -5%, ${elementStyle.color}1A 0%, transparent 45%)`,
      }}
    />
  );

  // Subtle inset border frame
  const borderFrame = (inset: string) => (
    <div
      style={{
        position: 'absolute', inset,
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '16px', display: 'flex',
      }}
    />
  );

  // Rarity stamp: circular, hatched diagonal stripes, rotated 8°.
  // The stamp is the visual hero of the OG image — sized prominently.
  const RarityStamp = ({
    size, top, right, labelPx, tierPx, pctPx,
  }: {
    size: number; top: number; right: number;
    labelPx: number; tierPx: number; pctPx: number;
  }) => (
    <div
      style={{
        position: 'absolute', top: `${top}px`, right: `${right}px`,
        width: `${size}px`, height: `${size}px`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '50%',
        // Hatched background — diagonal stripe pattern via CSS gradient
        background:
          'repeating-linear-gradient(-45deg,' +
          '  rgba(139,92,246,0.18), rgba(139,92,246,0.18) 1.5px,' +
          '  transparent 1.5px, transparent 9px)',
        border: '2.5px solid rgba(139,92,246,0.78)',
        // Satori supports transform:rotate on explicit-sized elements
        transform: 'rotate(8deg)',
      }}
    >
      <div
        style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '2px',
        }}
      >
        <div style={{
          fontSize: `${labelPx}px`, letterSpacing: '2px',
          color: 'rgba(167,139,250,0.60)', display: 'flex',
          textTransform: 'uppercase',
        }}>
          {t('rarityLabel')}
        </div>
        <div style={{
          fontSize: `${tierPx}px`, fontWeight: 700,
          color: '#A78BFA', display: 'flex',
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          {rarityDisplay}
        </div>
        <div style={{
          fontSize: `${pctPx}px`, fontWeight: 800,
          color: '#FFFFFF', display: 'flex',
        }}>
          {rarityPct}%
        </div>
      </div>
    </div>
  );

  // Sign column: label → glyph (large, planetary color) → sign name
  const SignCol = ({
    label, glyph, signName, color, glyphPx, labelPx, namePx,
  }: {
    label: string; glyph: string; signName: string; color: string;
    glyphPx: number; labelPx: number; namePx: number;
  }) => (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '10px',
      }}
    >
      <div style={{ fontSize: `${labelPx}px`, letterSpacing: '3px', color: 'rgba(255,255,255,0.32)', display: 'flex' }}>
        {label}
      </div>
      <div style={{ fontSize: `${glyphPx}px`, color, display: 'flex', lineHeight: 1 }}>
        {glyph}
      </div>
      <div style={{ fontSize: `${namePx}px`, fontWeight: 600, color, display: 'flex' }}>
        {signName}
      </div>
    </div>
  );

  // Vertical divider between sign columns
  const VDivider = ({ h }: { h: number }) => (
    <div style={{ width: '1px', height: `${h}px`, background: 'rgba(255,255,255,0.10)', display: 'flex' }} />
  );

  // Element + ruling planet badge row
  const BadgeRow = ({ px, iconPx, pad }: { px: number; iconPx: number; pad: string }) => (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px' }}>
      {/* Element */}
      <div style={{
        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '7px',
        background: `${elementStyle.color}14`,
        border: `1px solid ${elementStyle.color}3A`,
        borderRadius: '32px', padding: pad,
      }}>
        <span style={{ fontSize: `${iconPx}px`, color: elementStyle.color, display: 'flex' }}>{elementStyle.symbol}</span>
        <span style={{ fontSize: `${px}px`, color: elementStyle.color, fontWeight: 600, display: 'flex' }}>{el}</span>
      </div>
      {/* Ruling planet */}
      <div style={{
        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '7px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: '32px', padding: pad,
      }}>
        <span style={{ fontSize: `${iconPx}px`, color: rulingColor, display: 'flex' }}>{rulingSymbol}</span>
        <span style={{ fontSize: `${px}px`, color: 'rgba(255,255,255,0.45)', display: 'flex' }}>{t('ruledBy')}</span>
        <span style={{ fontSize: `${px}px`, color: '#FFFFFF', fontWeight: 600, display: 'flex' }}>{rulingName}</span>
      </div>
    </div>
  );

  // Brand line — estrevia.app with ornament flanks
  const Brand = ({ px }: { px: number }) => (
    <div style={{
      display: 'flex', flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: '10px',
    }}>
      <div style={{ fontSize: `${Math.round(px * 0.6)}px`, color: 'rgba(255,255,255,0.18)', display: 'flex' }}>✦</div>
      <div style={{ fontSize: `${px}px`, color: 'rgba(255,255,255,0.52)', letterSpacing: '2px', display: 'flex' }}>
        estrevia.app
      </div>
      <div style={{ fontSize: `${Math.round(px * 0.6)}px`, color: 'rgba(255,255,255,0.18)', display: 'flex' }}>✦</div>
    </div>
  );

  // -------------------------------------------------------------------------
  // Layout JSX — branched on format
  // -------------------------------------------------------------------------
  let layoutJsx: React.ReactElement;

  // ── OG 1200×630 ──────────────────────────────────────────────────────────
  if (format === 'og') {
    // Band heights: hero 40% + center 40% + footer 20% = 252 + 252 + 126
    layoutJsx = (
      <div
        style={{
          width: '1200px', height: '630px',
          background: '#0A0A0F',
          display: 'flex', flexDirection: 'column',
          position: 'relative', overflow: 'hidden',
          fontFamily: 'AstroSymbols, sans-serif',
        }}
      >
        {starfield}
        {borderFrame('20px')}

        {/* Rarity stamp — absolute hero element, top-right, rotated 8° */}
        <RarityStamp size={148} top={32} right={40} labelPx={10} tierPx={14} pctPx={26} />

        {/* Hero band — top 252px */}
        <div
          style={{
            height: '252px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '10px', zIndex: 1,
          }}
        >
          <div style={{
            fontSize: '13px', letterSpacing: '5px',
            color: 'rgba(255,255,255,0.32)', display: 'flex',
            textTransform: 'uppercase',
          }}>
            {t('eyebrow')}
          </div>
          <div style={{
            fontSize: '62px', fontWeight: 700, color: '#FFFFFF',
            letterSpacing: '6px', display: 'flex',
            textTransform: 'uppercase',
          }}>
            {t('title')}
          </div>
          <div style={{
            width: '200px', height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
            display: 'flex', marginTop: '2px',
          }} />
        </div>

        {/* Center band — three signs row */}
        <div
          style={{
            height: '252px', display: 'flex', flexDirection: 'row',
            alignItems: 'center', justifyContent: 'center',
            gap: '0px', zIndex: 1,
          }}
        >
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <SignCol label={t('label.sun')} glyph={sunGlyph} signName={passport.sunSign}
              color={LUMINARY_COLOR.sun} glyphPx={68} labelPx={16} namePx={22} />
          </div>
          <VDivider h={110} />
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <SignCol label={t('label.moon')} glyph={moonGlyph} signName={passport.moonSign}
              color={LUMINARY_COLOR.moon} glyphPx={68} labelPx={16} namePx={22} />
          </div>
          <VDivider h={110} />
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <SignCol
              label={t('label.rising')}
              glyph={ascGlyph ?? '–'}
              signName={passport.ascendantSign ?? t('unknown')}
              color={ascGlyph ? LUMINARY_COLOR.asc : 'rgba(255,255,255,0.18)'}
              glyphPx={68} labelPx={16} namePx={22}
            />
          </div>
        </div>

        {/* Footer band — bottom 126px */}
        <div
          style={{
            height: '126px', display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center',
            gap: '14px', zIndex: 1,
          }}
        >
          <BadgeRow px={15} iconPx={17} pad="7px 18px" />
          <Brand px={18} />
        </div>
      </div>
    );

  // ── Stories 1080×1920 ─────────────────────────────────────────────────────
  } else if (format === 'stories') {
    // Hero 35% (672px) + Signs 45% (864px) + Footer 20% (384px)
    layoutJsx = (
      <div
        style={{
          width: '1080px', height: '1920px',
          background: '#0A0A0F',
          display: 'flex', flexDirection: 'column',
          position: 'relative', overflow: 'hidden',
          fontFamily: 'AstroSymbols, sans-serif',
        }}
      >
        {starfield}
        {borderFrame('32px')}

        {/* Rarity stamp — absolute, overlaps hero/signs junction on right */}
        <RarityStamp size={180} top={600} right={48} labelPx={12} tierPx={17} pctPx={32} />

        {/* Hero band — top 35% = 672px */}
        <div
          style={{
            height: '672px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '14px', zIndex: 1,
          }}
        >
          <div style={{
            fontSize: '16px', letterSpacing: '5px',
            color: 'rgba(255,255,255,0.32)', display: 'flex',
            textTransform: 'uppercase',
          }}>
            {t('eyebrow')}
          </div>
          <div style={{
            fontSize: '72px', fontWeight: 700, color: '#FFFFFF',
            letterSpacing: '5px', display: 'flex',
            textTransform: 'uppercase',
          }}>
            {t('titleLine1')}
          </div>
          <div style={{
            fontSize: '72px', fontWeight: 700, color: '#FFFFFF',
            letterSpacing: '5px', display: 'flex',
            textTransform: 'uppercase',
          }}>
            {t('titleLine2')}
          </div>
          <div style={{
            width: '180px', height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
            display: 'flex', marginTop: '4px',
          }} />
        </div>

        {/* Signs band — middle 45% = 864px, vertical stack */}
        <div
          style={{
            height: '864px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '0px', zIndex: 1,
          }}
        >
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SignCol label={t('label.sun')} glyph={sunGlyph} signName={passport.sunSign}
              color={LUMINARY_COLOR.sun} glyphPx={96} labelPx={22} namePx={30} />
          </div>
          <div style={{ width: '120px', height: '1px', background: 'rgba(255,255,255,0.10)', display: 'flex' }} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SignCol label={t('label.moon')} glyph={moonGlyph} signName={passport.moonSign}
              color={LUMINARY_COLOR.moon} glyphPx={96} labelPx={22} namePx={30} />
          </div>
          <div style={{ width: '120px', height: '1px', background: 'rgba(255,255,255,0.10)', display: 'flex' }} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SignCol
              label={t('label.rising')}
              glyph={ascGlyph ?? '–'}
              signName={passport.ascendantSign ?? t('unknown')}
              color={ascGlyph ? LUMINARY_COLOR.asc : 'rgba(255,255,255,0.18)'}
              glyphPx={96} labelPx={22} namePx={30}
            />
          </div>
        </div>

        {/* Footer band — bottom 20% = 384px */}
        <div
          style={{
            height: '384px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: '22px', zIndex: 1,
          }}
        >
          <BadgeRow px={20} iconPx={24} pad="12px 28px" />
          <Brand px={22} />
        </div>
      </div>
    );

  // ── Square 1080×1080 ──────────────────────────────────────────────────────
  } else {
    // Square: top heading + signs vertical + badges + brand
    layoutJsx = (
      <div
        style={{
          width: '1080px', height: '1080px',
          background: '#0A0A0F',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'space-between',
          padding: '64px 72px',
          position: 'relative', overflow: 'hidden',
          fontFamily: 'AstroSymbols, sans-serif',
        }}
      >
        {starfield}
        {borderFrame('24px')}

        {/* Rarity stamp top-right */}
        <RarityStamp size={144} top={40} right={56} labelPx={11} tierPx={15} pctPx={27} />

        {/* Heading */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', zIndex: 1 }}>
          <div style={{ fontSize: '12px', letterSpacing: '4px', color: 'rgba(255,255,255,0.32)', display: 'flex', textTransform: 'uppercase' }}>
            {t('eyebrow')}
          </div>
          <div style={{ fontSize: '38px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '5px', display: 'flex', textTransform: 'uppercase' }}>
            {t('title')}
          </div>
          <div style={{ width: '140px', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)', display: 'flex' }} />
        </div>

        {/* Signs vertical stack */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px', zIndex: 1 }}>
          <SignCol label={t('label.sun')} glyph={sunGlyph} signName={passport.sunSign}
            color={LUMINARY_COLOR.sun} glyphPx={80} labelPx={20} namePx={26} />
          <div style={{ width: '100px', height: '1px', background: 'rgba(255,255,255,0.10)', display: 'flex' }} />
          <SignCol label={t('label.moon')} glyph={moonGlyph} signName={passport.moonSign}
            color={LUMINARY_COLOR.moon} glyphPx={80} labelPx={20} namePx={26} />
          <div style={{ width: '100px', height: '1px', background: 'rgba(255,255,255,0.10)', display: 'flex' }} />
          <SignCol
            label={t('label.rising')}
            glyph={ascGlyph ?? '–'}
            signName={passport.ascendantSign ?? t('unknown')}
            color={ascGlyph ? LUMINARY_COLOR.asc : 'rgba(255,255,255,0.18)'}
            glyphPx={80} labelPx={20} namePx={26}
          />
        </div>

        {/* Badges + brand */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', zIndex: 1 }}>
          <BadgeRow px={18} iconPx={20} pad="10px 22px" />
          <Brand px={16} />
        </div>
      </div>
    );
  }

  return new ImageResponse(layoutJsx, {
    width: dims.width,
    height: dims.height,
    fonts: [
      {
        name: 'AstroSymbols',
        data: fontBuffer,
        weight: 400,
        style: 'normal',
      },
    ],
    headers: {
      'Cache-Control': IMMUTABLE_1Y,
    },
  });
}
