// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import type React from 'react';

// next/script with afterInteractive emits no synchronous body under RTL; stub it
// to a plain <script> so we can assert the inline snippet content.
vi.mock('next/script', () => ({
  default: ({ children, id }: { children?: React.ReactNode; id?: string }) => (
    <script id={id} data-testid="meta-pixel-script">{children}</script>
  ),
}));

import { MetaPixelGate } from '../MetaPixelGate';
import { COOKIE_CONSENT_KEY } from '../PostHogProvider';

beforeEach(() => {
  window.localStorage.clear();
});

describe('MetaPixelGate', () => {
  it('does not load the Pixel without consent', () => {
    const { queryByTestId } = render(<MetaPixelGate pixelId="PIX_TEST" />);
    expect(queryByTestId('meta-pixel-script')).toBeNull();
  });

  it('does not load the Pixel when consent is declined', () => {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, 'declined');
    const { queryByTestId } = render(<MetaPixelGate pixelId="PIX_TEST" />);
    expect(queryByTestId('meta-pixel-script')).toBeNull();
  });

  it('loads the Pixel when consent is already accepted', async () => {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    const { findByTestId } = render(<MetaPixelGate pixelId="PIX_TEST" />);
    const script = await findByTestId('meta-pixel-script');
    expect(script.textContent).toContain("fbq('init', 'PIX_TEST')");
    expect(script.textContent).toContain("fbq('track', 'PageView')");
  });

  it('loads the Pixel after a later estrevia:consent acceptance', async () => {
    const { queryByTestId, findByTestId } = render(<MetaPixelGate pixelId="PIX_TEST" />);
    expect(queryByTestId('meta-pixel-script')).toBeNull();
    act(() => {
      window.dispatchEvent(
        new CustomEvent('estrevia:consent', { detail: { consent: 'accepted' } }),
      );
    });
    const script = await findByTestId('meta-pixel-script');
    expect(script.textContent).toContain("fbq('init', 'PIX_TEST')");
  });
});
