// src/app/[locale]/__tests__/layout.test.tsx
// @vitest-environment jsdom

/**
 * Smoke test for LocaleLayout — Meta Pixel mounting (consent-gated, SP-F).
 *
 * The layout no longer inlines the pixel snippet; it renders the client
 * component <MetaPixelLoader pixelId=…> which gates the snippet on cookie
 * consent. The layout-level contract is: pass the env pixel id through
 * (empty string when unset, so decline-cleanup still runs), and never emit
 * the inline fbq snippet or the un-gateable <noscript> tracking img in
 * server HTML.
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

vi.mock('@/shared/components/MetaPixelLoader', () => ({
  MetaPixelLoader: ({ pixelId }: { pixelId: string }) => (
    <div data-testid="meta-pixel-loader" data-pixel-id={pixelId} />
  ),
}));

import LocaleLayout from '../layout';

describe('LocaleLayout — consent-gated Meta Pixel mounting', () => {
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

  it('passes the env pixel id through to MetaPixelLoader', async () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = 'PIX_TEST';
    const element = await LocaleLayout({
      children: 'CHILDREN',
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).toContain('data-pixel-id="PIX_TEST"');
  });

  it('mounts the loader with an empty pixelId when the env var is unset (decline cleanup still runs)', async () => {
    const element = await LocaleLayout({
      children: 'CHILDREN',
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).toContain('data-pixel-id=""');
  });

  it('never emits the inline fbq snippet or the noscript tracking img (LIVE-7)', async () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = 'PIX_TEST';
    const element = await LocaleLayout({
      children: 'CHILDREN',
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).not.toContain('fbq(');
    expect(html).not.toContain('connect.facebook.net');
    expect(html).not.toContain('facebook.com/tr');
    expect(html).not.toContain('<noscript>');
  });
});
