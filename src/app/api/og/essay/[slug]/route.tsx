import { ImageResponse } from '@vercel/og';
import { promises as fs } from 'fs';
import path from 'path';
import { getEssayBySlug } from '@/modules/esoteric/lib/essays';
import { getRateLimiter } from '@/shared/lib/rate-limit';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Font buffer — loaded once per cold start and reused across invocations.
// AstroSymbols-subset.ttf is a pyftsubset of Noto Sans Symbols 2 (SIL OFL),
// containing astro glyph ranges + basic ASCII used in the essay OG layout.
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

const PLANET_COLOR: Record<string, string> = {
  Sun:     '#FFD700',
  Moon:    '#C0C0E0',
  Mercury: '#B8D430',
  Venus:   '#50C878',
  Mars:    '#E04040',
  Jupiter: '#4169E1',
  Saturn:  '#708090',
  Uranus:  '#00CED1',
  Neptune: '#9370DB',
  Pluto:   '#8B0000',
};

const SIGN_GLYPH: Record<string, string> = {
  Aries:       '♈',
  Taurus:      '♉',
  Gemini:      '♊',
  Cancer:      '♋',
  Leo:         '♌',
  Virgo:       '♍',
  Libra:       '♎',
  Scorpio:     '♏',
  Sagittarius: '♐',
  Capricorn:   '♑',
  Aquarius:    '♒',
  Pisces:      '♓',
};

const ELEMENT_COLOR: Record<string, string> = {
  Fire:  '#FF6B35',
  Earth: '#8B7355',
  Air:   '#87CEEB',
  Water: '#4169E1',
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  // -------------------------------------------------------------------------
  // Rate limiting — 60 req/min per IP (P1 fix: audit 10 High-2)
  // -------------------------------------------------------------------------
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
  const { success, limit, remaining, reset } = await getRateLimiter('essay/view').limit(ip);
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

  const { slug } = await params;

  const essay = getEssayBySlug(slug);
  if (!essay) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': NO_STORE },
    });
  }

  // -------------------------------------------------------------------------
  // Load astro symbols font buffer (P0 fix: audit 05 B-3)
  // -------------------------------------------------------------------------
  let fontBuffer: ArrayBuffer;
  try {
    fontBuffer = await getAstroFont();
  } catch (err) {
    console.error('[og/essay] font load error:', String(err));
    return new Response('Internal Server Error', {
      status: 500,
      headers: { 'Cache-Control': NO_STORE },
    });
  }

  const { planet, sign, element, title } = essay.meta;

  const planetColor  = PLANET_COLOR[planet]  ?? '#AAAAAA';
  const signGlyph    = SIGN_GLYPH[sign]      ?? '✦';
  const elementColor = ELEMENT_COLOR[element] ?? '#888888';

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
          padding: '56px 72px',
          fontFamily: 'AstroSymbols, serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Radial gradient using planet color */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              `radial-gradient(ellipse at 50% 40%, ${planetColor}18 0%, transparent 65%),` +
              'radial-gradient(ellipse at 15% 80%, rgba(139,92,246,0.08) 0%, transparent 50%)',
            display: 'flex',
          }}
        />

        {/* Subtle border frame */}
        <div
          style={{
            position: 'absolute',
            inset: '24px',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '16px',
            display: 'flex',
          }}
        />

        {/* Top: "SIDEREAL ASTROLOGY" */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: '13px',
              letterSpacing: '5px',
              color: 'rgba(255,255,255,0.35)',
              textTransform: 'uppercase',
              display: 'flex',
              fontFamily: 'AstroSymbols, serif',
            }}
          >
            SIDEREAL ASTROLOGY
          </div>
          <div
            style={{
              width: '80px',
              height: '1px',
              background: `linear-gradient(90deg, transparent, ${planetColor}60, transparent)`,
              display: 'flex',
            }}
          />
        </div>

        {/* Center: glyph + title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: '96px',
              color: planetColor,
              lineHeight: 1,
              display: 'flex',
              fontFamily: 'AstroSymbols, serif',
            }}
          >
            {signGlyph}
          </div>
          <div
            style={{
              fontSize: '40px',
              fontWeight: 700,
              color: '#FFFFFF',
              textAlign: 'center',
              letterSpacing: '1px',
              display: 'flex',
              fontFamily: 'AstroSymbols, serif',
            }}
          >
            {title}
          </div>
        </div>

        {/* Bottom: element badge (left) + branding (right) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
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
              border: `1px solid ${elementColor}50`,
              borderRadius: '32px',
              padding: '8px 20px',
              fontFamily: 'AstroSymbols, serif',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: elementColor,
                display: 'flex',
              }}
            />
            <span
              style={{
                fontSize: '16px',
                color: elementColor,
                fontWeight: 600,
                display: 'flex',
              }}
            >
              {element}
            </span>
          </div>

          {/* Branding */}
          <div
            style={{
              fontSize: '14px',
              color: 'rgba(255,255,255,0.22)',
              letterSpacing: '2px',
              display: 'flex',
              fontFamily: 'AstroSymbols, serif',
            }}
          >
            estrevia.app
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      // P0 fix: pass astro font buffer so Satori renders Unicode glyphs correctly
      fonts: [
        {
          name: 'AstroSymbols',
          data: fontBuffer,
          weight: 400,
          style: 'normal',
        },
      ],
      headers: {
        // P2 fix: immutable cache headers for successful 200 responses
        'Cache-Control': IMMUTABLE_1Y,
      },
    },
  );
}
