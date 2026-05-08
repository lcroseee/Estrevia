// @vitest-environment jsdom

/**
 * Smoke test for LocaleLayout — Meta Pixel injection.
 *
 * The layout is an async Server Component, so we invoke it as a function
 * and pass the resulting JSX through `renderToString` to assert the inline
 * `next/script` body. The Pixel must only render when
 * NEXT_PUBLIC_META_PIXEL_ID is set (graceful degradation in dev/staging
 * without the env var).
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

// MetaPixelLeadEmitter calls useUser() from @clerk/nextjs. In SSR unit tests
// there is no ClerkProvider, so we stub the hook to return a safe default
// (not loaded, not signed in). The component renders null — this is sufficient
// to confirm it mounts without throwing.
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: false, isSignedIn: false, user: null }),
}));

// next/script with strategy="afterInteractive" defers injection to the client
// and emits no body during SSR. For this smoke test we only care that the
// inline body the layout passes contains the Pixel init / PageView calls, so
// we replace it with a plain <script> tag that renders synchronously.
vi.mock('next/script', () => ({
  default: ({
    children,
    id,
  }: {
    children?: React.ReactNode;
    id?: string;
  }) => (
    <script id={id} data-testid="meta-pixel-script">
      {children}
    </script>
  ),
}));

import LocaleLayout from '../layout';

describe('LocaleLayout — Meta Pixel injection', () => {
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

  it('renders Pixel script when NEXT_PUBLIC_META_PIXEL_ID is set', async () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = 'PIX_TEST';
    const element = await LocaleLayout({
      children: 'CHILDREN',
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).toContain("fbq('init', 'PIX_TEST')");
    expect(html).toContain("fbq('track', 'PageView')");
    // noscript fallback img with the same pixel id
    expect(html).toContain('id=PIX_TEST&amp;ev=PageView&amp;noscript=1');
  });

  it('does NOT render Pixel script when NEXT_PUBLIC_META_PIXEL_ID is unset', async () => {
    const element = await LocaleLayout({
      children: 'CHILDREN',
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToString(element as React.ReactElement);
    expect(html).not.toContain('fbq(');
    expect(html).not.toContain('connect.facebook.net');
  });
});
