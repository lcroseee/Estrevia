/**
 * AvatarSection unit tests.
 *
 * Environment: Vitest (node, no jsdom). We inspect the React element tree
 * returned by calling the component function directly. Child function
 * components (e.g. <AvatarGenerator />) are NOT evaluated — they stay as
 * `{ type: ComponentFn, props: {...} }`. So we locate them by comparing
 * element.type to the mocked function identity, then read .props.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));

vi.mock('@/modules/astro-engine/components/AvatarGenerator', () => ({
  AvatarGenerator: vi.fn(),
}));

import { AvatarSection } from '@/modules/astro-engine/components/AvatarSection';
import { AvatarGenerator } from '@/modules/astro-engine/components/AvatarGenerator';
import type { PassportData } from '@/modules/astro-engine/passport';

const fixture: PassportData = {
  sunSign: 'Leo',
  moonSign: 'Cancer',
  ascendantSign: 'Scorpio',
  element: 'Fire',
  rulingPlanet: 'Sun',
  rarityPercent: 4.2,
};

function childrenOf(el: React.ReactElement): React.ReactElement[] {
  const props = el.props as { children?: React.ReactNode };
  const c = props.children;
  if (!c) return [];
  return (Array.isArray(c) ? c : [c]).filter(
    (x): x is React.ReactElement => typeof x === 'object' && x !== null,
  );
}

function findChildByType(
  el: React.ReactElement,
  type: unknown,
): React.ReactElement | null {
  for (const child of childrenOf(el)) {
    if (child.type === type) return child;
    const nested = findChildByType(child, type);
    if (nested) return nested;
  }
  return null;
}

describe('AvatarSection', () => {
  it('renders a section with the avatar.title heading', () => {
    const tree = AvatarSection({ passport: fixture }) as React.ReactElement;
    expect(tree.type).toBe('section');
    const heading = childrenOf(tree).find((c) => c.type === 'h2');
    expect(heading).toBeDefined();
    expect((heading!.props as { children: string }).children).toBe('avatar.title');
  });

  it('passes sunSign, moonSign, element through to AvatarGenerator', () => {
    const tree = AvatarSection({ passport: fixture }) as React.ReactElement;
    const generator = findChildByType(tree, AvatarGenerator);
    expect(generator).not.toBeNull();
    const p = generator!.props as Record<string, unknown>;
    expect(p.sunSign).toBe('Leo');
    expect(p.moonSign).toBe('Cancer');
    expect(p.element).toBe('Fire');
  });

  it('coerces null ascendantSign to undefined for AvatarGenerator', () => {
    const noAsc: PassportData = { ...fixture, ascendantSign: null };
    const tree = AvatarSection({ passport: noAsc }) as React.ReactElement;
    const generator = findChildByType(tree, AvatarGenerator);
    expect(generator).not.toBeNull();
    expect((generator!.props as Record<string, unknown>).ascendantSign).toBeUndefined();
  });

  it('forwards a non-null ascendantSign as a string', () => {
    const tree = AvatarSection({ passport: fixture }) as React.ReactElement;
    const generator = findChildByType(tree, AvatarGenerator);
    expect((generator!.props as Record<string, unknown>).ascendantSign).toBe('Scorpio');
  });
});
