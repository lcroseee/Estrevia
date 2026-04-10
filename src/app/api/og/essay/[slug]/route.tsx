import { ImageResponse } from '@vercel/og';
import { getEssayBySlug } from '@/modules/esoteric/lib/essays';

export const runtime = 'nodejs';

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
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const essay = getEssayBySlug(slug);
  if (!essay) {
    return new Response('Not found', { status: 404 });
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
          fontFamily: 'serif',
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
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=3600',
      },
    },
  );
}
