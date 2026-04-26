/**
 * MoonPhaseSVG path-geometry regression test.
 *
 * Locks in the SVG sweep flags that produce the correct lit area for each
 * quadrant of the lunar cycle. Before this fix, the terminator arc bulged
 * the wrong direction and a 70%-illuminated gibbous rendered as a 30%
 * crescent (and vice versa).
 *
 * Sweep semantics (verified against the SVG renderer):
 *   - outer arc top→bottom: sweep=1 → right semicircle (waxing hemisphere),
 *                            sweep=0 → left semicircle (waning hemisphere)
 *   - inner arc bottom→top: sweep=1 → bulges LEFT,
 *                            sweep=0 → bulges RIGHT
 *
 * Correct rendering (terminator must bulge into the dark side for gibbous,
 * into the lit side for crescent):
 *   waxing crescent  → terminatorSweep=0  (bulges right, into lit hemisphere)
 *   waxing gibbous   → terminatorSweep=1  (bulges left, into dark hemisphere)
 *   waning crescent  → terminatorSweep=1  (bulges left, into lit hemisphere)
 *   waning gibbous   → terminatorSweep=0  (bulges right, into dark hemisphere)
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { MoonPhaseSVG } from '@/modules/astro-engine/components/MoonPhaseSVG';

interface MoonProps {
  illumination: number;
  phaseAngle: number;
  size?: number;
}

function render(props: MoonProps): React.ReactElement | null {
  return MoonPhaseSVG(props) as React.ReactElement | null;
}

/** Walk the React element tree and collect every <path> with a `d` prop. */
function collectPaths(el: React.ReactElement | null, acc: string[] = []): string[] {
  if (!el || typeof el !== 'object') return acc;
  const props = (el as React.ReactElement<Record<string, unknown>>).props ?? {};
  if (el.type === 'path' && typeof props['d'] === 'string') {
    acc.push(props['d'] as string);
  }
  const children = props['children'];
  if (Array.isArray(children)) {
    for (const child of children) collectPaths(child as React.ReactElement, acc);
  } else if (children) {
    collectPaths(children as React.ReactElement, acc);
  }
  return acc;
}

/** Find the lit path: must contain TWO arc commands (outer + terminator). */
function findLitPath(el: React.ReactElement | null): string | null {
  const paths = collectPaths(el);
  return paths.find((d) => (d.match(/A /g) ?? []).length === 2) ?? null;
}

/**
 * Parse the lit path produced by MoonPhaseSVG and return the sweep flags.
 * Format: "M cx,y A r,r 0 0 litSweep cx,y A rx,r 0 0 termSweep cx,y Z"
 */
function parseSweepFlags(d: string): { litSweep: number; termSweep: number } {
  const arcs = Array.from(d.matchAll(/A\s+([\d.]+)\s+([\d.]+)\s+(\d)\s+(\d)\s+(\d)\s+/g));
  if (arcs.length !== 2) {
    throw new Error(`Expected 2 arc commands, got ${arcs.length} in: ${d}`);
  }
  return {
    litSweep: parseInt(arcs[0]![5]!, 10),
    termSweep: parseInt(arcs[1]![5]!, 10),
  };
}

describe('MoonPhaseSVG: lit path sweep flags', () => {
  // -------------------------------------------------------------------------
  // Outer arc (litSweep) follows the lit hemisphere
  // -------------------------------------------------------------------------

  it('waxing → outer arc traces RIGHT semicircle (litSweep=1)', () => {
    const el = render({ illumination: 0.30, phaseAngle: 60 });
    const d = findLitPath(el);
    expect(d).not.toBeNull();
    expect(parseSweepFlags(d!).litSweep).toBe(1);
  });

  it('waning → outer arc traces LEFT semicircle (litSweep=0)', () => {
    const el = render({ illumination: 0.30, phaseAngle: 300 });
    const d = findLitPath(el);
    expect(d).not.toBeNull();
    expect(parseSweepFlags(d!).litSweep).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Terminator (termSweep) — the regression we just fixed
  // -------------------------------------------------------------------------

  it('waxing crescent → terminator bulges into LIT side (termSweep=0)', () => {
    // 30% lit, sun-moon angle ≈ 67° (between new and first quarter)
    const el = render({ illumination: 0.30, phaseAngle: 67 });
    expect(parseSweepFlags(findLitPath(el)!).termSweep).toBe(0);
  });

  it('waxing gibbous → terminator bulges into DARK side (termSweep=1)', () => {
    // 70% lit, sun-moon angle ≈ 134° (between first quarter and full)
    const el = render({ illumination: 0.70, phaseAngle: 134 });
    expect(parseSweepFlags(findLitPath(el)!).termSweep).toBe(1);
  });

  it('waning gibbous → terminator bulges into DARK side (termSweep=0)', () => {
    // 70% lit, sun-moon angle ≈ 226° (between full and last quarter)
    const el = render({ illumination: 0.70, phaseAngle: 226 });
    expect(parseSweepFlags(findLitPath(el)!).termSweep).toBe(0);
  });

  it('waning crescent → terminator bulges into LIT side (termSweep=1)', () => {
    // 30% lit, sun-moon angle ≈ 293° (between last quarter and new)
    const el = render({ illumination: 0.30, phaseAngle: 293 });
    expect(parseSweepFlags(findLitPath(el)!).termSweep).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Boundary: First/Last Quarter (50%) — terminator collapses to a vertical line
  // -------------------------------------------------------------------------

  it('First Quarter (50% waxing) → terminator rx is 0', () => {
    const d = findLitPath(render({ illumination: 0.50, phaseAngle: 90 }))!;
    const arcs = Array.from(d.matchAll(/A\s+([\d.]+)\s+([\d.]+)/g));
    expect(parseFloat(arcs[1]![1]!)).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Special branches: Full Moon and New Moon
  // -------------------------------------------------------------------------

  it('Full Moon (≥99%) → renders the closed full-circle path', () => {
    const paths = collectPaths(render({ illumination: 1.0, phaseAngle: 180 }));
    const fullCircle = paths.find((d) => (d.match(/A /g) ?? []).length === 2);
    expect(fullCircle).toBeDefined();
    // Full-circle uses large-arc-flag=1 on both arcs; partial phases use 0
    expect(fullCircle!).toMatch(/A\s+[\d.]+\s+[\d.]+\s+0\s+1\s+1/);
  });

  it('New Moon (<1%) → no lit path is rendered', () => {
    const paths = collectPaths(render({ illumination: 0, phaseAngle: 0 }));
    const litPath = paths.find((d) => (d.match(/A /g) ?? []).length === 2);
    expect(litPath).toBeUndefined();
  });
});
