/**
 * ZodiacGlyph unit tests.
 *
 * Environment: Vitest (node, no jsdom). Tests verify component logic by inspecting
 * exported constants and the JSX element structure returned by the component function.
 * React's createElement output is a plain object — no DOM renderer needed.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import {
  ZodiacGlyph,
  SIGN_TO_GLYPH,
  SYMBOL_FONT_STACK,
} from '@/shared/components/ZodiacGlyph';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Drill into a React element tree to find the first node with role="img". */
function findImgNode(el: React.ReactElement | null): React.ReactElement | null {
  if (!el || typeof el !== 'object') return null;
  const props = (el as React.ReactElement<Record<string, unknown>>).props ?? {};
  if (props['role'] === 'img') return el as React.ReactElement;
  const children = props['children'];
  if (!children) return null;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findImgNode(child as React.ReactElement);
      if (found) return found;
    }
  }
  return findImgNode(children as React.ReactElement);
}

function renderGlyph(props: Parameters<typeof ZodiacGlyph>[0]) {
  const result = ZodiacGlyph(props);
  return result as React.ReactElement | null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ZodiacGlyph', () => {
  it('renders Cancer as ♋ with aria-label "Cancer"', () => {
    const el = renderGlyph({ sign: 'Cancer' });
    const imgNode = findImgNode(el!);
    expect(imgNode).not.toBeNull();
    // Text content: the glyph is the children prop
    const props = (imgNode as React.ReactElement<Record<string, unknown>>).props;
    expect(props['children']).toBe('♋');
    expect(props['aria-label']).toBe('Cancer');
  });

  it('renders all 12 signs with the correct glyph', () => {
    const expected: Record<string, string> = {
      Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋',
      Leo: '♌', Virgo: '♍', Libra: '♎', Scorpio: '♏',
      Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓',
    };
    for (const [sign, glyph] of Object.entries(expected)) {
      const el = renderGlyph({ sign });
      const imgNode = findImgNode(el!);
      expect(imgNode).not.toBeNull();
      const props = (imgNode as React.ReactElement<Record<string, unknown>>).props;
      expect(props['children']).toBe(glyph);
    }
  });

  it('renders null when sign is null, undefined or unknown', () => {
    for (const s of [null, undefined, '', 'NotASign']) {
      const el = renderGlyph({ sign: s as string });
      expect(el).toBeNull();
    }
  });

  it('honors size prop via inline font-size', () => {
    const el = renderGlyph({ sign: 'Leo', size: 22 });
    const imgNode = findImgNode(el!);
    const props = (imgNode as React.ReactElement<Record<string, unknown>>).props as {
      style?: { fontSize?: unknown };
    };
    expect(props.style?.fontSize).toBe(22);
  });

  it('merges className', () => {
    const el = renderGlyph({ sign: 'Leo', className: 'gold' });
    const imgNode = findImgNode(el!);
    const props = (imgNode as React.ReactElement<Record<string, unknown>>).props;
    expect(props['className']).toContain('gold');
  });

  it('declares a font-family stack so symbols do not render as emoji boxes', () => {
    // SYMBOL_FONT_STACK must be exported and non-empty.
    // This test FAILS against the stub (stub has no export + no font-family on the element).
    expect(SYMBOL_FONT_STACK).toBeTruthy();
    expect(SYMBOL_FONT_STACK).toContain('Apple Symbols');

    const el = renderGlyph({ sign: 'Leo' });
    const imgNode = findImgNode(el!);
    const props = (imgNode as React.ReactElement<Record<string, unknown>>).props as {
      style?: { fontFamily?: unknown };
    };
    expect(props.style?.fontFamily).toBeTruthy();
  });

  it('SIGN_TO_GLYPH covers all 12 signs', () => {
    const signs = [
      'Aries', 'Taurus', 'Gemini', 'Cancer',
      'Leo', 'Virgo', 'Libra', 'Scorpio',
      'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
    ];
    for (const sign of signs) {
      expect(SIGN_TO_GLYPH[sign]).toBeTruthy();
    }
    expect(Object.keys(SIGN_TO_GLYPH)).toHaveLength(12);
  });
});
