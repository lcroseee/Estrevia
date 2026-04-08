import { ImageResponse } from '@vercel/og';
import { eq } from 'drizzle-orm';
import { getDb } from '@/shared/lib/db';
import { cosmicPassports } from '@/shared/lib/schema';

// nodejs runtime required: Neon HTTP driver uses Node.js net/tls APIs
// not available in the Edge runtime.
export const runtime = 'nodejs';

// Sign → Unicode glyph mapping
const SIGN_GLYPH: Record<string, string> = {
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

// Element → color + symbol
const ELEMENT_STYLE: Record<string, { color: string; symbol: string }> = {
  Fire: { color: '#FF6B35', symbol: '△' },
  Earth: { color: '#8B7355', symbol: '▽' },
  Air:   { color: '#87CEEB', symbol: '△' },
  Water: { color: '#4169E1', symbol: '▽' },
};

// Planet → symbol
const PLANET_SYMBOL: Record<string, string> = {
  Sun:     '☉',
  Moon:    '☽',
  Mercury: '☿',
  Venus:   '♀',
  Mars:    '♂',
  Jupiter: '♃',
  Saturn:  '♄',
  Uranus:  '♅',
  Neptune: '♆',
  Pluto:   '♇',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // -------------------------------------------------------------------------
  // Look up passport from DB
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
    return new Response('Internal Server Error', { status: 500 });
  }

  if (!passport) {
    console.warn('[og/passport] passport not found', { id });
    return new Response('Passport not found', { status: 404 });
  }

  const sunGlyph  = SIGN_GLYPH[passport.sunSign]  ?? '?';
  const moonGlyph = SIGN_GLYPH[passport.moonSign] ?? '?';
  const ascGlyph  = passport.ascendantSign ? (SIGN_GLYPH[passport.ascendantSign] ?? '?') : null;

  const elementStyle = ELEMENT_STYLE[passport.element] ?? { color: '#888', symbol: '◇' };
  const planetSymbol = PLANET_SYMBOL[passport.rulingPlanet] ?? '★';

  const rarityDisplay = passport.rarityPercent.toFixed(1);

  // -------------------------------------------------------------------------
  // Satori JSX — inline styles only, no Tailwind
  // Size: 1200×630 standard OG
  // -------------------------------------------------------------------------
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#0A0A0F',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '48px 64px',
          fontFamily: 'serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Starfield dots — decorative background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse at 20% 30%, rgba(139,92,246,0.12) 0%, transparent 60%),' +
              'radial-gradient(ellipse at 80% 70%, rgba(59,130,246,0.10) 0%, transparent 60%)',
            display: 'flex',
          }}
        />

        {/* Border frame */}
        <div
          style={{
            position: 'absolute',
            inset: '24px',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            display: 'flex',
          }}
        />

        {/* Top section: heading + subtitle */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: '13px',
              letterSpacing: '4px',
              color: 'rgba(255,255,255,0.4)',
              textTransform: 'uppercase',
              display: 'flex',
            }}
          >
            SIDEREAL ASTROLOGY
          </div>
          <div
            style={{
              fontSize: '36px',
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: '8px',
              textTransform: 'uppercase',
              display: 'flex',
            }}
          >
            COSMIC PASSPORT
          </div>
          {/* Decorative line */}
          <div
            style={{
              width: '120px',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
              marginTop: '4px',
              display: 'flex',
            }}
          />
        </div>

        {/* Center: Sun / Moon / ASC row */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '40px',
            zIndex: 1,
          }}
        >
          {/* Sun */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '20px', color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
              ☉ SUN
            </div>
            <div style={{ fontSize: '56px', color: '#F5C842', display: 'flex' }}>
              {sunGlyph}
            </div>
            <div style={{ fontSize: '22px', color: '#FFFFFF', fontWeight: 600, display: 'flex' }}>
              {passport.sunSign}
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              width: '1px',
              height: '100px',
              background: 'rgba(255,255,255,0.12)',
              display: 'flex',
            }}
          />

          {/* Moon */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '20px', color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
              ☽ MOON
            </div>
            <div style={{ fontSize: '56px', color: '#C0C0C0', display: 'flex' }}>
              {moonGlyph}
            </div>
            <div style={{ fontSize: '22px', color: '#FFFFFF', fontWeight: 600, display: 'flex' }}>
              {passport.moonSign}
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              width: '1px',
              height: '100px',
              background: 'rgba(255,255,255,0.12)',
              display: 'flex',
            }}
          />

          {/* ASC */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '20px', color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
              ↑ ASC
            </div>
            <div
              style={{
                fontSize: '56px',
                color: ascGlyph ? '#A78BFA' : 'rgba(255,255,255,0.2)',
                display: 'flex',
              }}
            >
              {ascGlyph ?? '–'}
            </div>
            <div
              style={{
                fontSize: '22px',
                color: ascGlyph ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
                fontWeight: 600,
                display: 'flex',
              }}
            >
              {passport.ascendantSign ?? 'Unknown'}
            </div>
          </div>
        </div>

        {/* Lower badges row: Element + Ruling planet + Rarity */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
            zIndex: 1,
          }}
        >
          {/* Element badge */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${elementStyle.color}40`,
              borderRadius: '32px',
              padding: '10px 24px',
            }}
          >
            <span style={{ fontSize: '20px', color: elementStyle.color, display: 'flex' }}>
              {elementStyle.symbol}
            </span>
            <span style={{ fontSize: '18px', color: elementStyle.color, fontWeight: 600, display: 'flex' }}>
              {passport.element}
            </span>
          </div>

          {/* Ruling planet badge */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '32px',
              padding: '10px 24px',
            }}
          >
            <span style={{ fontSize: '20px', color: '#E2C97E', display: 'flex' }}>
              {planetSymbol}
            </span>
            <span style={{ fontSize: '18px', color: 'rgba(255,255,255,0.7)', display: 'flex' }}>
              Ruled by{' '}
            </span>
            <span style={{ fontSize: '18px', color: '#FFFFFF', fontWeight: 600, display: 'flex' }}>
              {passport.rulingPlanet}
            </span>
          </div>

          {/* Rarity badge */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(139,92,246,0.12)',
              border: '1px solid rgba(139,92,246,0.3)',
              borderRadius: '32px',
              padding: '10px 24px',
            }}
          >
            <span style={{ fontSize: '18px', color: 'rgba(255,255,255,0.6)', display: 'flex' }}>
              1 of{' '}
            </span>
            <span style={{ fontSize: '22px', color: '#A78BFA', fontWeight: 700, display: 'flex' }}>
              {rarityDisplay}%
            </span>
          </div>
        </div>

        {/* Bottom: branding */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            zIndex: 1,
          }}
        >
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.25)', letterSpacing: '2px', display: 'flex' }}>
            estrevia.app
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=3600',
      },
    },
  );
}
