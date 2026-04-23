'use client';

interface MoonPhaseSVGProps {
  illumination: number; // 0 to 1
  phaseAngle: number;   // 0 to 360
  size?: number;        // px, default 48
}

/**
 * Physically-motivated SVG moon.
 *
 * - Ivory surface gradient (warm, not cool) with off-center highlight.
 * - Fixed crater pattern clipped to the visible lit portion.
 * - Soft terminator: a narrow gradient band replaces the hard edge.
 * - Rim light along the outer lit edge for depth.
 *
 * Public API (illumination, phaseAngle, size) is preserved.
 */
export function MoonPhaseSVG({
  illumination,
  phaseAngle,
  size = 48,
}: MoonPhaseSVGProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

  const isWaxing = phaseAngle < 180;
  const absIllum = Math.max(0, Math.min(1, illumination));
  const terminatorRx = r * Math.abs(2 * absIllum - 1);
  const isGibbous = absIllum > 0.5;

  // Unique-per-instance IDs to avoid collisions when multiple moons render
  const uid = `moon-${size}-${Math.round(phaseAngle)}-${Math.round(absIllum * 100)}`;

  let litPath: string;
  if (absIllum < 0.01) {
    litPath = '';
  } else if (absIllum > 0.99) {
    litPath = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  } else {
    const top = { x: cx, y: cy - r };
    const bot = { x: cx, y: cy + r };
    const litSweep = isWaxing ? 1 : 0;
    const terminatorSweep = isGibbous
      ? (isWaxing ? 0 : 1)
      : (isWaxing ? 1 : 0);
    litPath = [
      `M ${top.x} ${top.y}`,
      `A ${r} ${r} 0 0 ${litSweep} ${bot.x} ${bot.y}`,
      `A ${terminatorRx} ${r} 0 0 ${terminatorSweep} ${top.x} ${top.y}`,
      'Z',
    ].join(' ');
  }

  // Crater positions in unit coords (-1..+1 across the moon disc).
  // Chosen once so the pattern is recognizable but not uniform.
  const craters: Array<{ ux: number; uy: number; ur: number }> = [
    { ux: -0.35, uy: -0.25, ur: 0.14 },
    { ux:  0.15, uy: -0.40, ur: 0.07 },
    { ux:  0.40, uy:  0.10, ur: 0.11 },
    { ux: -0.10, uy:  0.30, ur: 0.09 },
    { ux: -0.45, uy:  0.20, ur: 0.06 },
    { ux:  0.05, uy:  0.05, ur: 0.08 },
    { ux:  0.25, uy:  0.45, ur: 0.05 },
  ];

  const craterCircles = craters.map((c, i) => (
    <circle
      key={i}
      cx={cx + c.ux * r}
      cy={cy + c.uy * r}
      r={c.ur * r}
      fill={`url(#${uid}-crater)`}
      opacity={0.55}
    />
  ));

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Moon phase: ${Math.round(absIllum * 100)}% illuminated`}
    >
      <defs>
        {/* Outer soft glow */}
        <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="60%">
          <stop offset="50%" stopColor={absIllum > 0.3 ? 'rgba(245,240,232,0.18)' : 'rgba(245,240,232,0.07)'} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        {/* Warm ivory surface, off-center highlight */}
        <radialGradient id={`${uid}-surface`} cx="38%" cy="34%" r="72%">
          <stop offset="0%"   stopColor="#FBF3E3" />
          <stop offset="55%"  stopColor="#EEDFC5" />
          <stop offset="100%" stopColor="#C9BBA3" />
        </radialGradient>
        {/* Crater tint: darker warm gray, semi-transparent so surface shows through */}
        <radialGradient id={`${uid}-crater`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(80, 70, 60, 0.75)" />
          <stop offset="100%" stopColor="rgba(80, 70, 60, 0.20)" />
        </radialGradient>
        {/* Rim light along the lit edge */}
        <radialGradient id={`${uid}-rim`} cx={isWaxing ? '85%' : '15%'} cy="50%" r="60%">
          <stop offset="70%" stopColor="transparent" />
          <stop offset="95%" stopColor="rgba(255,245,220,0.40)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        {/* Clip the crater pattern to the illuminated path */}
        <clipPath id={`${uid}-clip`}>
          {litPath ? <path d={litPath} /> : <circle cx={cx} cy={cy} r={0} />}
        </clipPath>
        {/* Soft-terminator gradient band */}
        <linearGradient
          id={`${uid}-terminator`}
          x1={isWaxing ? `${50 - 4}%` : `${50 + 4}%`}
          x2={isWaxing ? `${50 + 4}%` : `${50 - 4}%`}
          y1="0%"
          y2="0%"
        >
          <stop offset="0%"  stopColor="rgba(42,42,53,0)" />
          <stop offset="50%" stopColor="rgba(42,42,53,0.55)" />
          <stop offset="100%" stopColor="rgba(42,42,53,0)" />
        </linearGradient>
      </defs>

      {/* Outer glow */}
      <circle cx={cx} cy={cy} r={r + 2} fill={`url(#${uid}-glow)`} />

      {/* Shadow base */}
      <circle cx={cx} cy={cy} r={r} fill="#1E1E28" />

      {/* Illuminated disc */}
      {litPath && <path d={litPath} fill={`url(#${uid}-surface)`} />}

      {/* Craters, clipped to lit area */}
      {litPath && (
        <g clipPath={`url(#${uid}-clip)`}>
          {craterCircles}
        </g>
      )}

      {/* Rim light */}
      {litPath && absIllum > 0.15 && absIllum < 0.98 && (
        <path d={litPath} fill={`url(#${uid}-rim)`} />
      )}

      {/* Soft terminator strip only when part lit / part dark */}
      {absIllum > 0.05 && absIllum < 0.95 && size >= 28 && (
        <ellipse
          cx={cx}
          cy={cy}
          rx={Math.max(1, terminatorRx)}
          ry={r}
          fill={`url(#${uid}-terminator)`}
          opacity={0.6}
        />
      )}

      {/* Thin rim definition */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.10)"
        strokeWidth={0.5}
      />
    </svg>
  );
}
