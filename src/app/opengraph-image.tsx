import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Estrevia — Sidereal Astrology';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0A0A0F',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Decorative circles */}
        <div
          style={{
            position: 'absolute',
            width: 400,
            height: 400,
            borderRadius: '50%',
            border: '2px solid rgba(200,168,75,0.2)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 280,
            height: 280,
            borderRadius: '50%',
            border: '1px solid rgba(200,168,75,0.12)',
          }}
        />

        {/* Logo text */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '0.12em',
              textTransform: 'uppercase' as const,
            }}
          >
            Estrevia
          </div>
          <div
            style={{
              fontSize: 24,
              color: '#C8A84B',
              letterSpacing: '0.05em',
            }}
          >
            Sidereal Astrology
          </div>
          <div
            style={{
              fontSize: 18,
              color: 'rgba(255,255,255,0.5)',
              marginTop: 8,
            }}
          >
            Calculate your true natal chart with Swiss Ephemeris precision
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
