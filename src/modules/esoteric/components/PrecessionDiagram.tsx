'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// SVG coordinate system: 400×340 viewport, scales via viewBox
const CX = 200; // center x
const CY = 175; // center y (slightly above mid — earth + labels below)

// Orbit radii
const PRECESSION_R = 110; // radius of the precession circle
const EARTH_R = 18;       // earth body radius
const AXIS_LEN = 52;      // half-length of earth's rotation axis line

// Earth tilt (degrees from vertical, ~23.4°)
const TILT_DEG = 23.4;
const TILT_RAD = (TILT_DEG * Math.PI) / 180;

// Current ayanamsa position on the precession circle (24° from the reference point)
// Reference epoch (tropical = sidereal) at ~0° on circle
const REFERENCE_ANGLE = -Math.PI / 2; // top of circle
const AYANAMSA_DEG = 24;
const CURRENT_ANGLE = REFERENCE_ANGLE + (AYANAMSA_DEG * Math.PI) / 180;

// Color tokens matching design system
const COLOR_EARTH = '#1A2A4A';
const COLOR_EARTH_BORDER = '#3A5A8A';
const COLOR_AXIS_LINE = '#C0C0E0'; // silver — Moon color
const COLOR_PRECESSION_ORBIT = 'rgba(192,192,224,0.18)';
const COLOR_PRECESSION_STROKE = 'rgba(192,192,224,0.4)';
const COLOR_CURRENT_MARKER = '#FFD700'; // gold — Sun color
const COLOR_REFERENCE_MARKER = 'rgba(255,215,0,0.38)';
const COLOR_DRIFT_ARC = 'rgba(255,215,0,0.55)';
const COLOR_TEXT_PRIMARY = '#F0F0F5';
const COLOR_TEXT_MUTED = '#8888A0';
const COLOR_STAR = 'rgba(255,255,255,0.55)';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function polarToXY(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

/** Build SVG arc path between two angles on a circle (always short arc when delta <= π) */
function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToXY(cx, cy, r, startAngle);
  const end = polarToXY(cx, cy, r, endAngle);
  const delta = ((endAngle - startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const largeArc = delta > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

// ---------------------------------------------------------------------------
// Static star field (seeded positions — same every render, no hydration drift)
// ---------------------------------------------------------------------------
const STARS = [
  { x: 30,  y: 20,  r: 0.9 },
  { x: 355, y: 15,  r: 1.1 },
  { x: 15,  y: 80,  r: 0.7 },
  { x: 372, y: 60,  r: 0.8 },
  { x: 50,  y: 270, r: 1.0 },
  { x: 360, y: 285, r: 0.9 },
  { x: 20,  y: 310, r: 0.7 },
  { x: 385, y: 320, r: 1.1 },
  { x: 95,  y: 305, r: 0.6 },
  { x: 300, y: 310, r: 0.7 },
  { x: 340, y: 155, r: 0.8 },
  { x: 18,  y: 190, r: 0.9 },
  { x: 110, y: 22,  r: 0.7 },
  { x: 285, y: 18,  r: 1.0 },
  { x: 380, y: 200, r: 0.6 },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Dotted ring representing the precession orbit path */
function PrecessionOrbit() {
  return (
    <ellipse
      cx={CX}
      cy={CY}
      rx={PRECESSION_R}
      ry={PRECESSION_R * 0.28} // flattened to give perspective
      fill={COLOR_PRECESSION_ORBIT}
      stroke={COLOR_PRECESSION_STROKE}
      strokeWidth={1}
      strokeDasharray="3 5"
    />
  );
}

/** Earth body with tilted rotation axis */
function EarthBody() {
  // Axis endpoints at TILT_DEG from vertical
  const ax = Math.sin(TILT_RAD) * AXIS_LEN;
  const ay = Math.cos(TILT_RAD) * AXIS_LEN;

  return (
    <g>
      {/* Subtle glow behind earth */}
      <circle
        cx={CX}
        cy={CY}
        r={EARTH_R + 8}
        fill="rgba(58,90,138,0.18)"
      />
      {/* Earth body */}
      <circle
        cx={CX}
        cy={CY}
        r={EARTH_R}
        fill={COLOR_EARTH}
        stroke={COLOR_EARTH_BORDER}
        strokeWidth={1.5}
      />
      {/* Equatorial band */}
      <ellipse
        cx={CX}
        cy={CY}
        rx={EARTH_R}
        ry={EARTH_R * 0.3}
        fill="none"
        stroke={COLOR_EARTH_BORDER}
        strokeWidth={0.8}
        opacity={0.6}
      />
      {/* Rotation axis line */}
      <line
        x1={CX - ax}
        y1={CY + ay}
        x2={CX + ax}
        y2={CY - ay}
        stroke={COLOR_AXIS_LINE}
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.85}
      />
      {/* North pole arrow tip */}
      <circle
        cx={CX + ax}
        cy={CY - ay}
        r={2.5}
        fill={COLOR_AXIS_LINE}
        opacity={0.9}
      />
    </g>
  );
}

/** Marker dot on the precession orbit */
function OrbitMarker({
  angle,
  color,
  r = 5,
  glow = false,
}: {
  angle: number;
  color: string;
  r?: number;
  glow?: boolean;
}) {
  // Use flattened ellipse mapping for perspective: y scaled by 0.28
  const x = CX + PRECESSION_R * Math.cos(angle);
  const y = CY + PRECESSION_R * 0.28 * Math.sin(angle);

  return (
    <g>
      {glow && (
        <circle cx={x} cy={y} r={r + 5} fill={color} opacity={0.15} />
      )}
      <circle cx={x} cy={y} r={r} fill={color} />
    </g>
  );
}

/** Arc between reference and current epoch on the precession orbit */
function DriftArc() {
  // Build a series of points along the flattened ellipse arc for SVG polyline
  const steps = 32;
  const startAngle = REFERENCE_ANGLE;
  const endAngle = CURRENT_ANGLE;
  const points: string[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = startAngle + t * (endAngle - startAngle);
    const x = CX + PRECESSION_R * Math.cos(angle);
    const y = CY + PRECESSION_R * 0.28 * Math.sin(angle);
    points.push(`${x},${y}`);
  }

  return (
    <polyline
      points={points.join(' ')}
      fill="none"
      stroke={COLOR_DRIFT_ARC}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

// ---------------------------------------------------------------------------
// Label positions
// ---------------------------------------------------------------------------

// Current epoch marker position
const currentPos = {
  x: CX + PRECESSION_R * Math.cos(CURRENT_ANGLE),
  y: CY + PRECESSION_R * 0.28 * Math.sin(CURRENT_ANGLE),
};

// Reference epoch marker (tropical = sidereal, ~2000 years ago)
const referencePos = {
  x: CX + PRECESSION_R * Math.cos(REFERENCE_ANGLE),
  y: CY + PRECESSION_R * 0.28 * Math.sin(REFERENCE_ANGLE),
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PrecessionDiagram() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const prefersReducedMotion = useReducedMotion();
  const t = useTranslations('whySiderealPage');

  const shouldAnimate = isInView && !prefersReducedMotion;

  // Slow rotation of the precession orbit (subtle — 360° in 40 seconds)
  const orbitRotation = shouldAnimate
    ? { rotate: [0, 360] }
    : { rotate: 0 };

  const orbitTransition = {
    duration: 40,
    repeat: Infinity,
    ease: 'linear' as const,
  };

  return (
    <div ref={ref} className="my-8 select-none" aria-hidden="false">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Outer card with subtle texture */}
        <div
          className="rounded-2xl overflow-hidden border"
          style={{
            background: 'linear-gradient(160deg, #0E0E18 0%, #0A0A0F 60%, #0D0A16 100%)',
            borderColor: 'rgba(192,192,224,0.12)',
            boxShadow: '0 0 48px rgba(10,10,30,0.8), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {/* Header bar */}
          <div
            className="px-5 py-3 border-b flex items-center justify-between"
            style={{ borderColor: 'rgba(192,192,224,0.08)' }}
          >
            <span
              className="text-[11px] uppercase tracking-[0.18em] font-medium"
              style={{ color: COLOR_TEXT_MUTED, fontFamily: 'var(--font-geist-sans)' }}
            >
              {t('diagramHeaderTitle')}
            </span>
            <span
              className="text-[11px] tracking-wide tabular-nums"
              style={{ color: 'rgba(255,215,0,0.5)', fontFamily: 'var(--font-geist-mono)' }}
            >
              {t('diagramHeaderCycle')}
            </span>
          </div>

          {/* SVG diagram */}
          <svg
            viewBox="0 0 400 340"
            role="img"
            aria-label={t('diagramSvgAriaLabel')}
            className="w-full"
            style={{ maxHeight: '340px' }}
          >
            {/* Background stars */}
            {STARS.map((star, i) => (
              <circle
                key={i}
                cx={star.x}
                cy={star.y}
                r={star.r}
                fill={COLOR_STAR}
              />
            ))}

            {/* Subtle radial gradient — depth behind Earth */}
            <defs>
              <radialGradient id="depthGrad" cx="50%" cy="51%" r="38%">
                <stop offset="0%" stopColor="#1A1A3A" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#0A0A0F" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse cx={CX} cy={CY} rx={160} ry={60} fill="url(#depthGrad)" />

            {/* Precession orbit ring — slowly rotates when animated */}
            <motion.g
              style={{ originX: `${CX}px`, originY: `${CY}px` }}
              animate={prefersReducedMotion ? {} : (isInView ? orbitRotation : { rotate: 0 })}
              transition={orbitTransition}
            >
              <PrecessionOrbit />
            </motion.g>

            {/* Drift arc — staggered entry */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.6, delay: prefersReducedMotion ? 0 : 0.55 }}
            >
              <DriftArc />
            </motion.g>

            {/* Reference epoch marker */}
            <motion.g
              initial={{ opacity: 0, scale: 0 }}
              animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
              transition={{ duration: 0.4, delay: prefersReducedMotion ? 0 : 0.3 }}
              style={{
                originX: `${referencePos.x}px`,
                originY: `${referencePos.y}px`,
              }}
            >
              <OrbitMarker angle={REFERENCE_ANGLE} color={COLOR_REFERENCE_MARKER} r={4.5} />
            </motion.g>

            {/* Current epoch marker */}
            <motion.g
              initial={{ opacity: 0, scale: 0 }}
              animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
              transition={{ duration: 0.45, delay: prefersReducedMotion ? 0 : 0.65 }}
              style={{
                originX: `${currentPos.x}px`,
                originY: `${currentPos.y}px`,
              }}
            >
              <OrbitMarker angle={CURRENT_ANGLE} color={COLOR_CURRENT_MARKER} r={5.5} glow />
            </motion.g>

            {/* Earth (drawn on top of orbit ring) */}
            <motion.g
              initial={{ opacity: 0, scale: 0.7 }}
              animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.55, delay: prefersReducedMotion ? 0 : 0.1, ease: [0.22, 1, 0.36, 1] }}
              style={{ originX: `${CX}px`, originY: `${CY}px` }}
            >
              <EarthBody />
            </motion.g>

            {/* ── Labels ─────────────────────────────────────────── */}

            {/* "Earth" label */}
            <motion.text
              x={CX + 26}
              y={CY + 6}
              textAnchor="start"
              fontSize="11"
              fill={COLOR_TEXT_MUTED}
              fontFamily="var(--font-geist-sans)"
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.4, delay: prefersReducedMotion ? 0 : 0.2 }}
            >
              {t('diagramLabelEarth')}
            </motion.text>

            {/* Axis label */}
            <motion.text
              x={CX + Math.sin(TILT_RAD) * AXIS_LEN + 6}
              y={CY - Math.cos(TILT_RAD) * AXIS_LEN + 4}
              textAnchor="start"
              fontSize="9.5"
              fill={COLOR_AXIS_LINE}
              fillOpacity={0.65}
              fontFamily="var(--font-geist-sans)"
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.4, delay: prefersReducedMotion ? 0 : 0.25 }}
            >
              {t('diagramLabelAxis')}
            </motion.text>

            {/* Reference epoch label */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.5, delay: prefersReducedMotion ? 0 : 0.4 }}
            >
              <line
                x1={referencePos.x}
                y1={referencePos.y - 4}
                x2={referencePos.x}
                y2={referencePos.y - 18}
                stroke={COLOR_REFERENCE_MARKER}
                strokeWidth={0.8}
                strokeDasharray="2 2"
                opacity={0.6}
              />
              <text
                x={referencePos.x}
                y={referencePos.y - 22}
                textAnchor="middle"
                fontSize="9.5"
                fill={COLOR_TEXT_MUTED}
                fontFamily="var(--font-geist-sans)"
              >
                {t('diagramLabelReference')}
              </text>
            </motion.g>

            {/* Current epoch label */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.5, delay: prefersReducedMotion ? 0 : 0.75 }}
            >
              {/* Leader line from marker up-right */}
              <line
                x1={currentPos.x}
                y1={currentPos.y - 5}
                x2={currentPos.x + 14}
                y2={currentPos.y - 26}
                stroke={COLOR_CURRENT_MARKER}
                strokeWidth={0.8}
                opacity={0.55}
              />
              <text
                x={currentPos.x + 17}
                y={currentPos.y - 27}
                textAnchor="start"
                fontSize="10"
                fontWeight="600"
                fill={COLOR_CURRENT_MARKER}
                fontFamily="var(--font-geist-sans)"
              >
                {t('diagramLabelToday')}
              </text>
              <text
                x={currentPos.x + 17}
                y={currentPos.y - 15}
                textAnchor="start"
                fontSize="9"
                fill={COLOR_TEXT_MUTED}
                fontFamily="var(--font-geist-sans)"
              >
                {t('diagramLabelAyanamsa')}
              </text>
            </motion.g>

            {/* Drift arc label — midpoint of arc */}
            <motion.g
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.5, delay: prefersReducedMotion ? 0 : 0.85 }}
            >
              {(() => {
                const midAngle = (REFERENCE_ANGLE + CURRENT_ANGLE) / 2;
                const mx = CX + (PRECESSION_R + 22) * Math.cos(midAngle);
                const my = CY + (PRECESSION_R + 22) * 0.28 * Math.sin(midAngle);
                return (
                  <text
                    x={mx}
                    y={my}
                    textAnchor="middle"
                    fontSize="9"
                    fill={COLOR_DRIFT_ARC}
                    fontFamily="var(--font-geist-mono)"
                  >
                    {t('diagramLabelDrift')}
                  </text>
                );
              })()}
            </motion.g>

            {/* Full cycle label — bottom of diagram */}
            <motion.text
              x={CX}
              y={328}
              textAnchor="middle"
              fontSize="10"
              fill={COLOR_TEXT_MUTED}
              fillOpacity={0.6}
              fontFamily="var(--font-geist-sans)"
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.5, delay: prefersReducedMotion ? 0 : 0.9 }}
            >
              {t('diagramLabelFullCycle')}
            </motion.text>
          </svg>

          {/* Caption below diagram */}
          <motion.p
            className="px-5 pb-4 text-center text-[12px] leading-relaxed"
            style={{ color: COLOR_TEXT_MUTED, fontFamily: 'var(--font-geist-sans)' }}
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.5, delay: prefersReducedMotion ? 0 : 1.0 }}
          >
            {t('diagramCaption')}
          </motion.p>
        </div>
      </motion.div>
    </div>
  );
}
