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

// Format → dimensions map for multi-format OG images
const FORMAT_DIMS: Record<string, { width: number; height: number }> = {
  og:      { width: 1200, height: 630 },
  square:  { width: 1080, height: 1080 },
  stories: { width: 1080, height: 1920 },
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Parse format from query string
  const url = new URL(_request.url);
  const format = url.searchParams.get('format') ?? 'og';
  const dims = FORMAT_DIMS[format] ?? FORMAT_DIMS.og;

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

  // Capture for use in nested helper functions (TS narrowing doesn't cross function boundaries)
  const passportElement = passport.element;
  const passportRulingPlanet = passport.rulingPlanet;

  // -------------------------------------------------------------------------
  // Shared Satori fragments — inline styles only, no Tailwind
  // -------------------------------------------------------------------------

  // Starfield background (shared across all formats)
  const starfieldBg = (
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
  );

  // Border frame (shared, inset scales with format)
  const borderInset = format === 'stories' ? '32px' : '24px';
  const borderFrame = (
    <div
      style={{
        position: 'absolute',
        inset: borderInset,
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        display: 'flex',
      }}
    />
  );

  // Heading section
  function HeadingSection({ subtitleSize, titleSize, lineWidth }: { subtitleSize: string; titleSize: string; lineWidth: string }) {
    return (
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
            fontSize: subtitleSize,
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
            fontSize: titleSize,
            fontWeight: 700,
            color: '#FFFFFF',
            letterSpacing: '8px',
            textTransform: 'uppercase',
            display: 'flex',
          }}
        >
          COSMIC PASSPORT
        </div>
        <div
          style={{
            width: lineWidth,
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
            marginTop: '4px',
            display: 'flex',
          }}
        />
      </div>
    );
  }

  // Single sign column (Sun / Moon / ASC)
  function SignColumn({ label, glyph, signName, glyphColor, glyphSize, labelSize, nameSize }: {
    label: string; glyph: string; signName: string; glyphColor: string;
    glyphSize: string; labelSize: string; nameSize: string;
  }) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <div style={{ fontSize: labelSize, color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
          {label}
        </div>
        <div style={{ fontSize: glyphSize, color: glyphColor, display: 'flex' }}>
          {glyph}
        </div>
        <div style={{ fontSize: nameSize, color: '#FFFFFF', fontWeight: 600, display: 'flex' }}>
          {signName}
        </div>
      </div>
    );
  }

  // Vertical divider
  function Divider({ height }: { height: string }) {
    return (
      <div
        style={{
          width: '1px',
          height,
          background: 'rgba(255,255,255,0.12)',
          display: 'flex',
        }}
      />
    );
  }

  // Element badge
  function ElementBadge({ fontSize, iconSize, padding }: { fontSize: string; iconSize: string; padding: string }) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(255,255,255,0.05)',
          border: `1px solid ${elementStyle.color}40`,
          borderRadius: '32px',
          padding,
        }}
      >
        <span style={{ fontSize: iconSize, color: elementStyle.color, display: 'flex' }}>
          {elementStyle.symbol}
        </span>
        <span style={{ fontSize, color: elementStyle.color, fontWeight: 600, display: 'flex' }}>
          {passportElement}
        </span>
      </div>
    );
  }

  // Ruling planet badge
  function RulerBadge({ fontSize, iconSize, padding }: { fontSize: string; iconSize: string; padding: string }) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '32px',
          padding,
        }}
      >
        <span style={{ fontSize: iconSize, color: '#E2C97E', display: 'flex' }}>
          {planetSymbol}
        </span>
        <span style={{ fontSize, color: 'rgba(255,255,255,0.7)', display: 'flex' }}>
          Ruled by{' '}
        </span>
        <span style={{ fontSize, color: '#FFFFFF', fontWeight: 600, display: 'flex' }}>
          {passportRulingPlanet}
        </span>
      </div>
    );
  }

  // Rarity badge
  function RarityBadge({ fontSize, valueSize, padding }: { fontSize: string; valueSize: string; padding: string }) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(139,92,246,0.12)',
          border: '1px solid rgba(139,92,246,0.3)',
          borderRadius: '32px',
          padding,
        }}
      >
        <span style={{ fontSize, color: 'rgba(255,255,255,0.6)', display: 'flex' }}>
          1 of{' '}
        </span>
        <span style={{ fontSize: valueSize, color: '#A78BFA', fontWeight: 700, display: 'flex' }}>
          {rarityDisplay}%
        </span>
      </div>
    );
  }

  // Branding line
  function Branding({ fontSize }: { fontSize: string }) {
    return (
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
        <div style={{ fontSize, color: 'rgba(255,255,255,0.25)', letterSpacing: '2px', display: 'flex' }}>
          estrevia.app
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Layout JSX — conditional on format
  // -------------------------------------------------------------------------
  let layoutJsx: React.ReactElement;

  if (format === 'square') {
    // 1080x1080 — vertical stack, centered, large glyphs
    layoutJsx = (
      <div
        style={{
          width: `${dims.width}px`,
          height: `${dims.height}px`,
          background: '#0A0A0F',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '64px 72px',
          fontFamily: 'serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {starfieldBg}
        {borderFrame}

        <HeadingSection subtitleSize="14px" titleSize="38px" lineWidth="140px" />

        {/* Signs — vertical stack */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '32px',
            zIndex: 1,
          }}
        >
          <SignColumn label="☉ SUN" glyph={sunGlyph} signName={passport.sunSign} glyphColor="#F5C842" glyphSize="72px" labelSize="22px" nameSize="24px" />
          <div style={{ width: '100px', height: '1px', background: 'rgba(255,255,255,0.12)', display: 'flex' }} />
          <SignColumn label="☽ MOON" glyph={moonGlyph} signName={passport.moonSign} glyphColor="#C0C0C0" glyphSize="72px" labelSize="22px" nameSize="24px" />
          <div style={{ width: '100px', height: '1px', background: 'rgba(255,255,255,0.12)', display: 'flex' }} />
          <SignColumn label="↑ ASC" glyph={ascGlyph ?? '–'} signName={passport.ascendantSign ?? 'Unknown'} glyphColor={ascGlyph ? '#A78BFA' : 'rgba(255,255,255,0.2)'} glyphSize="72px" labelSize="22px" nameSize="24px" />
        </div>

        {/* Badges — vertical stack */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            zIndex: 1,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'row', gap: '16px' }}>
            <ElementBadge fontSize="18px" iconSize="20px" padding="10px 24px" />
            <RulerBadge fontSize="18px" iconSize="20px" padding="10px 24px" />
          </div>
          <RarityBadge fontSize="18px" valueSize="22px" padding="10px 24px" />
        </div>

        <Branding fontSize="14px" />
      </div>
    );
  } else if (format === 'stories') {
    // 1080x1920 — full 9:16 vertical
    // Top 1/3 = heading. Middle 1/3 = huge sign glyphs. Bottom 1/3 = badges + branding.
    layoutJsx = (
      <div
        style={{
          width: `${dims.width}px`,
          height: `${dims.height}px`,
          background: '#0A0A0F',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '80px 64px',
          fontFamily: 'serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {starfieldBg}
        {borderFrame}

        {/* Top 1/3: heading */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            zIndex: 1,
          }}
        >
          <HeadingSection subtitleSize="18px" titleSize="50px" lineWidth="180px" />
        </div>

        {/* Middle 1/3: huge sign glyphs */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '48px',
            zIndex: 1,
          }}
        >
          <SignColumn label="☉ SUN" glyph={sunGlyph} signName={passport.sunSign} glyphColor="#F5C842" glyphSize="96px" labelSize="28px" nameSize="32px" />
          <div style={{ width: '120px', height: '1px', background: 'rgba(255,255,255,0.12)', display: 'flex' }} />
          <SignColumn label="☽ MOON" glyph={moonGlyph} signName={passport.moonSign} glyphColor="#C0C0C0" glyphSize="96px" labelSize="28px" nameSize="32px" />
          <div style={{ width: '120px', height: '1px', background: 'rgba(255,255,255,0.12)', display: 'flex' }} />
          <SignColumn label="↑ ASC" glyph={ascGlyph ?? '–'} signName={passport.ascendantSign ?? 'Unknown'} glyphColor={ascGlyph ? '#A78BFA' : 'rgba(255,255,255,0.2)'} glyphSize="96px" labelSize="28px" nameSize="32px" />
        </div>

        {/* Bottom 1/3: badges + branding */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            zIndex: 1,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <ElementBadge fontSize="24px" iconSize="28px" padding="14px 32px" />
            <RulerBadge fontSize="24px" iconSize="28px" padding="14px 32px" />
            <RarityBadge fontSize="24px" valueSize="30px" padding="14px 32px" />
          </div>
          <Branding fontSize="18px" />
        </div>
      </div>
    );
  } else {
    // Default: og (1200x630) — original layout
    layoutJsx = (
      <div
        style={{
          width: `${dims.width}px`,
          height: `${dims.height}px`,
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
        {starfieldBg}
        {borderFrame}

        <HeadingSection subtitleSize="13px" titleSize="36px" lineWidth="120px" />

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
          <SignColumn label="☉ SUN" glyph={sunGlyph} signName={passport.sunSign} glyphColor="#F5C842" glyphSize="56px" labelSize="20px" nameSize="22px" />
          <Divider height="100px" />
          <SignColumn label="☽ MOON" glyph={moonGlyph} signName={passport.moonSign} glyphColor="#C0C0C0" glyphSize="56px" labelSize="20px" nameSize="22px" />
          <Divider height="100px" />
          <SignColumn label="↑ ASC" glyph={ascGlyph ?? '–'} signName={passport.ascendantSign ?? 'Unknown'} glyphColor={ascGlyph ? '#A78BFA' : 'rgba(255,255,255,0.2)'} glyphSize="56px" labelSize="20px" nameSize="22px" />
        </div>

        {/* Lower badges row */}
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
          <ElementBadge fontSize="18px" iconSize="20px" padding="10px 24px" />
          <RulerBadge fontSize="18px" iconSize="20px" padding="10px 24px" />
          <RarityBadge fontSize="18px" valueSize="22px" padding="10px 24px" />
        </div>

        <Branding fontSize="14px" />
      </div>
    );
  }

  return new ImageResponse(layoutJsx, {
    width: dims.width,
    height: dims.height,
    headers: {
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=3600',
    },
  });
}
