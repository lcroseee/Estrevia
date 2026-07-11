// @vitest-environment jsdom

/**
 * Smoke test for LocaleLayout — Meta Pixel gate wiring.
 *
 * The layout is an async Server Component, so we invoke it as a function and
 * pass the resulting JSX through `renderToString`. The Pixel is now loaded by
 * MetaPixelGate (consent-gated, tested separately); here we only assert the
 * gate is mounted when NEXT_PUBLIC_META_PIXEL_ID is set and omitted otherwise.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import type React from 'react';

vi.mock('next-intl/server', () => ({
  getMessages: async () => ({}),
  setRequestLocale: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('notFound() called unexpectedly in test');
  }),
}));

vi.mock('@/shared/components/MetaPixelGate', () => ({
  MetaPixelGate: ({ pixelId }: { pixelId: string }) => (
    <div data-testid="pixel-gate" data-pixel={pixelId} />
  ),
}));

import LocaleLayout from '../layout';

describe('LocaleLayout — Meta Pixel gate wiring', () => {
  const ORIGINAL_PIXEL = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
  });

  afterEach(() => {
    if (ORIGINAL_PIXEL === undefined) {
      delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    } else {
      process.env.NEXT_PUBLIC_META_PIXEL_ID = ORIGINAL_PIXEL;
    }
  });

  it('mounts MetaPixelGate when NEXT_PUBLIC_META_PIXEL_ID is set', async () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = 'PIX_TEST';
    const element = await LocaleLayout({
      children: 'CHILDREN',
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).toContain('data-testid="pixel-gate"');
    expect(html).toContain('data-pixel="PIX_TEST"');
  });

  it('does NOT mount the Pixel when NEXT_PUBLIC_META_PIXEL_ID is unset', async () => {
    const element = await LocaleLayout({
      children: 'CHILDREN',
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).not.toContain('pixel-gate');
    expect(html).not.toContain('connect.facebook.net');
  });
});
