'use client';

interface MoonPhaseSVGProps {
  illumination: number; // 0 to 1
  phaseAngle: number; // 0 to 360
  size?: number; // px, default 48
}

/**
 * Renders a realistic moon phase using SVG.
 *
 * - Circle for the moon (light gray on dark background)
 * - Arc/ellipse technique to show illuminated portion
 * - phaseAngle 0-180 = waxing (right side lit)
 * - phaseAngle 180-360 = waning (left side lit)
 * - Subtle radial glow behind the moon
 */
export function MoonPhaseSVG({
  illumination,
  phaseAngle,
  size = 48,
}: MoonPhaseSVGProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2; // Leave 2px padding for glow

  // Determine if waxing (right lit) or waning (left lit)
  const isWaxing = phaseAngle < 180;

  // The terminator ellipse x-radius is based on illumination.
  // At 0% illumination: full shadow (new moon)
  // At 50%: half lit (quarter)
  // At 100%: full lit (full moon)
  //
  // The "curvature" of the terminator line:
  // terminatorX = r * |2 * illumination - 1|
  // When illumination < 0.5, the shadow side's arc curves inward
  // When illumination > 0.5, the lit side's arc curves outward

  const absIllum = Math.max(0, Math.min(1, illumination));

  // Build the illuminated path using two arcs:
  // 1. The outer edge (always a semicircle on the lit side)
  // 2. The terminator (an elliptical curve)
  const terminatorRx = r * Math.abs(2 * absIllum - 1);

  // Determine sweep direction based on illumination level
  // < 0.5: terminator curves into the lit side (crescent)
  // > 0.5: terminator curves into the shadow side (gibbous)
  const isGibbous = absIllum > 0.5;

  // Build SVG path for the illuminated area
  // We draw from top to bottom along one arc, then back along another
  let litPath: string;

  if (absIllum < 0.01) {
    // New moon — no visible illumination
    litPath = '';
  } else if (absIllum > 0.99) {
    // Full moon — entire circle lit
    litPath = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  } else {
    // Top and bottom points
    const top = { x: cx, y: cy - r };
    const bot = { x: cx, y: cy + r };

    // The lit semicircle arc (always from top to bottom)
    // For waxing: right side = sweep 1
    // For waning: left side = sweep 0
    const litSweep = isWaxing ? 1 : 0;

    // The terminator arc (elliptical)
    // For crescent (illum < 0.5): curves toward the lit side
    // For gibbous (illum > 0.5): curves away from the lit side
    const terminatorSweep = isGibbous
      ? (isWaxing ? 0 : 1)
      : (isWaxing ? 1 : 0);

    litPath = [
      `M ${top.x} ${top.y}`,
      // Outer semicircle (lit edge)
      `A ${r} ${r} 0 0 ${litSweep} ${bot.x} ${bot.y}`,
      // Terminator (elliptical arc back to top)
      `A ${terminatorRx} ${r} 0 0 ${terminatorSweep} ${top.x} ${top.y}`,
      'Z',
    ].join(' ');
  }

  // Moon surface color
  const moonFill = '#E8E4DC';
  const litColor = '#F5F0E8';
  const shadowColor = '#2A2A35';
  const glowColor = absIllum > 0.3 ? 'rgba(245,240,232,0.15)' : 'rgba(245,240,232,0.06)';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Moon phase: ${Math.round(absIllum * 100)}% illuminated`}
    >
      <defs>
        {/* Subtle glow */}
        <radialGradient id={`moon-glow-${size}`} cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor={glowColor} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        {/* Surface texture gradient */}
        <radialGradient id={`moon-surface-${size}`} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor={moonFill} />
          <stop offset="100%" stopColor="#C8C4BC" />
        </radialGradient>
      </defs>

      {/* Glow behind moon */}
      <circle cx={cx} cy={cy} r={r + 2} fill={`url(#moon-glow-${size})`} />

      {/* Moon base (shadow/dark side) */}
      <circle cx={cx} cy={cy} r={r} fill={shadowColor} />

      {/* Illuminated portion */}
      {litPath && (
        <path
          d={litPath}
          fill={`url(#moon-surface-${size})`}
        />
      )}

      {/* Subtle rim for definition */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={0.5}
      />
    </svg>
  );
}
